"use client";

import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { isGrowthCurveRow, loadGrowthCurves, type GrowthCurveRow, type GrowthStatKey } from "./growthCurveData";

const stats: { key: GrowthStatKey; label: string; color: string }[] = [
  { key: "power", label: "火力", color: "#b65e1d" },
  { key: "durability", label: "耐久", color: "#197b8a" },
  { key: "piercing", label: "穿甲", color: "#8053a2" },
  { key: "armor", label: "装甲", color: "#647e1d" },
];

// Half-width detail panel: keep axis labels readable instead of scaling the
// original wide chart (and its text) down to half size.
const chart = { width: 560, height: 280, left: 66, right: 24, top: 26, bottom: 42 };
const plotWidth = chart.width - chart.left - chart.right;
const plotHeight = chart.height - chart.top - chart.bottom;
const format = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });

function clampLevel(level: number) {
  return Math.max(1, Math.min(99, Math.round(level)));
}

export default function GrowthCurveSection({ maidenId, detailLevel }: { maidenId: number; detailLevel: number }) {
  const [chosenLevel, setChosenLevel] = useState<number | null>(null);
  const selectedLevel = chosenLevel ?? clampLevel(detailLevel);
  const [row, setRow] = useState<GrowthCurveRow | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    loadGrowthCurves().then((data) => {
      const result = data.rows[String(maidenId)];
      if (!isGrowthCurveRow(result)) {
        throw new Error(`缺少钢舞姬 #${maidenId} 的逐级成长数据`);
      }
      if (active) { setRow(result); setError(""); }
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "成长数据加载失败");
    });
    return () => { active = false; };
  }, [maidenId, retry]);

  const drawing = useMemo(() => {
    if (!row) return null;
    const values = stats.flatMap(({ key }) => row[key].filter((value): value is number => value !== null && Number.isFinite(value)));
    if (!values.length) return null;
    const maximum = Math.max(...values);
    const axisMin = Math.min(0, Math.floor(Math.min(...values)));
    const axisMax = Math.max(1, Math.ceil(maximum * 1.08));
    const x = (level: number) => chart.left + ((level - 1) / 98) * plotWidth;
    const y = (value: number) => chart.top + ((axisMax - value) / (axisMax - axisMin)) * plotHeight;
    const paths = stats.map((stat) => {
      let continuing = false;
      const segments: string[] = [];
      row[stat.key].forEach((value, index) => {
        if (value === null || !Number.isFinite(value)) { continuing = false; return; }
        segments.push(`${continuing ? "L" : "M"}${x(index + 1).toFixed(2)} ${y(value).toFixed(2)}`);
        continuing = true;
      });
      return { ...stat, path: segments.join(" ") };
    });
    return { axisMin, axisMax, x, y, paths };
  }, [row]);

  const selectAt = (clientX: number, element: HTMLDivElement) => {
    const rectangle = element.getBoundingClientRect();
    const svgX = ((clientX - rectangle.left) / rectangle.width) * chart.width;
    setChosenLevel(clampLevel(1 + ((svgX - chart.left) / plotWidth) * 98));
  };
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    selectAt(event.clientX, event.currentTarget);
  };
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) selectAt(event.clientX, event.currentTarget);
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    selectAt(event.clientX, event.currentTarget);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <section className="detail-section growth-curve-section" aria-label="等级成长曲线">
    <div className="growth-curve-heading">
      <div><h3>等级成长曲线</h3><p>客户端成长模板逐级计算 · 按住图表可拖动定位线，查看 1–99 级基础数值</p></div>
      <div className="growth-curve-level">当前定位 <strong>{selectedLevel}级</strong></div>
    </div>
    <div className="growth-curve-legend" aria-live="polite">
      {stats.map((stat) => {
        const value = row?.[stat.key]?.[selectedLevel - 1] ?? null;
        return <div key={stat.key} className="growth-curve-legend-item"><i style={{ backgroundColor: stat.color }} aria-hidden="true" /><span>{stat.label}</span><strong style={{ color: stat.color }}>{value === null ? "—" : format.format(value)}</strong></div>;
      })}
    </div>
    {error ? <div className="growth-curve-message" role="alert">{error}<button type="button" onClick={() => { setError(""); setRetry((value) => value + 1); }}>重试</button></div>
      : !row ? <div className="growth-curve-message">正在加载逐级成长数据…</div>
        : !drawing ? <div className="growth-curve-message">没有可计算的逐级成长数值。</div>
          : <div className="growth-curve-overflow"><div className="growth-curve-interactive" role="slider" tabIndex={0} aria-label="成长曲线，拖动或使用方向键选择等级" aria-valuemin={1} aria-valuemax={99} aria-valuenow={selectedLevel} aria-valuetext={`${selectedLevel}级，${stats.map((stat) => `${stat.label}${row[stat.key][selectedLevel - 1] === null ? "无数据" : format.format(row[stat.key][selectedLevel - 1]!)}`).join("，")}`} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); setChosenLevel(clampLevel(selectedLevel - 1)); }
            if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); setChosenLevel(clampLevel(selectedLevel + 1)); }
            if (event.key === "Home") { event.preventDefault(); setChosenLevel(1); }
            if (event.key === "End") { event.preventDefault(); setChosenLevel(99); }
          }}>
            <svg viewBox={`0 0 ${chart.width} ${chart.height}`} aria-hidden="true">
              {[0, 1, 2, 3, 4].map((index) => {
                const y = chart.top + (index / 4) * plotHeight;
                const value = drawing.axisMax - (index / 4) * (drawing.axisMax - drawing.axisMin);
                return <g key={index}><line className="growth-grid-line" x1={chart.left} y1={y} x2={chart.width - chart.right} y2={y} /><text className="growth-axis-label" x={chart.left - 12} y={y + 4} textAnchor="end">{format.format(Math.round(value))}</text></g>;
              })}
              {[1, 20, 40, 60, 80, 99].map((level) => <g key={level}><line className="growth-grid-line growth-grid-vertical" x1={drawing.x(level)} y1={chart.top} x2={drawing.x(level)} y2={chart.top + plotHeight} /><text className="growth-axis-label" x={drawing.x(level)} y={chart.height - 13} textAnchor="middle">{level}级</text></g>)}
              {drawing.paths.map((series) => <path key={series.key} className="growth-curve-line" d={series.path} stroke={series.color} />)}
              <line className="growth-selected-line" x1={drawing.x(selectedLevel)} y1={chart.top} x2={drawing.x(selectedLevel)} y2={chart.top + plotHeight} />
              {stats.map((stat) => { const value = row[stat.key][selectedLevel - 1]; return value === null ? null : <circle key={stat.key} className="growth-selected-point" cx={drawing.x(selectedLevel)} cy={drawing.y(value)} r={5} fill={stat.color} />; })}
            </svg>
          </div></div>}
    <p className="growth-curve-note">四条曲线共用从 0 开始的数值轴；仅含基础属性，不含装备、科技、强殖等额外加成。</p>
  </section>;
}
