"use client";

import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { isGrowthCurveRow, loadGrowthCurves, type GrowthCurveRow, type GrowthStatKey } from "./growthCurveData";

type MaidenIdentity = { id: number; tank: string };
type ComparedRows = { left: GrowthCurveRow; right: GrowthCurveRow };

const stats: { key: GrowthStatKey; label: string }[] = [
  { key: "power", label: "火力" },
  { key: "durability", label: "耐久" },
  { key: "armor", label: "装甲" },
  { key: "piercing", label: "穿甲" },
];
const chart = { width: 960, height: 440, left: 80, right: 80, top: 26, bottom: 42 };
const plotWidth = chart.width - chart.left - chart.right;
const plotHeight = chart.height - chart.top - chart.bottom;
const gentleRise = plotWidth * Math.tan((10 * Math.PI) / 180);
const steepRise = plotWidth * Math.tan((22 * Math.PI) / 180);
const format = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });

function clampLevel(level: number) {
  return Math.max(1, Math.min(99, Math.round(level)));
}

export default function CompareGrowthCurve({ left, right, detailLevel }: { left: MaidenIdentity; right: MaidenIdentity; detailLevel: number }) {
  const [stat, setStat] = useState<GrowthStatKey>("power");
  const [chosenLevel, setChosenLevel] = useState<number | null>(null);
  const selectedLevel = chosenLevel ?? clampLevel(detailLevel);
  const [rows, setRows] = useState<ComparedRows | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    loadGrowthCurves().then((data) => {
      const leftRow = data.rows[String(left.id)];
      const rightRow = data.rows[String(right.id)];
      if (!isGrowthCurveRow(leftRow) || !isGrowthCurveRow(rightRow)) {
        throw new Error("缺少当前钢舞姬的逐级成长数据");
      }
      if (active) { setRows({ left: leftRow, right: rightRow }); setError(""); }
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "成长数据加载失败");
    });
    return () => { active = false; };
  }, [left.id, right.id, retry]);

  const drawing = useMemo(() => {
    if (!rows) return null;
    const series = [rows.left[stat], rows.right[stat]];
    const pairedValues = series[0].flatMap((leftValue, index) => {
      const rightValue = series[1][index];
      return leftValue === null || rightValue === null ? [] : [{ level: index + 1, leftValue, rightValue }];
    });
    if (pairedValues.length < 2) return null;
    const first = pairedValues[0];
    const last = pairedValues[pairedValues.length - 1];
    const leftGrowth = last.leftValue - first.leftValue;
    const rightGrowth = last.rightValue - first.rightValue;
    const fasterSide = rightGrowth >= leftGrowth ? 1 : 0;
    const startDifference = first.leftValue - first.rightValue;
    const endDifference = last.leftValue - last.rightValue;
    const crosses = startDifference * endDifference < 0;
    const startY = [0, 0];
    const endY = [0, 0];
    if (crosses) {
      // Both lines rise sharply; their equally sized openings form a wide X.
      const gentleStart = chart.top + plotHeight * 0.68;
      const opening = (steepRise - gentleRise) / 2;
      startY[fasterSide] = gentleStart + opening;
      endY[fasterSide] = startY[fasterSide] - steepRise;
      startY[1 - fasterSide] = gentleStart;
      endY[1 - fasterSide] = gentleStart - gentleRise;
    } else {
      const higherSide = (startDifference || endDifference) >= 0 ? 0 : 1;
      const lowerSide = 1 - higherSide;
      if (fasterSide === higherSide) {
        // The leader pulls away without either line crossing the other.
        endY[higherSide] = chart.top + 4;
        startY[higherSide] = endY[higherSide] + steepRise;
        startY[lowerSide] = chart.top + plotHeight - 2;
        endY[lowerSide] = startY[lowerSide] - gentleRise;
      } else {
        // The trailing maiden closes the gap, but remains below throughout.
        endY[higherSide] = chart.top + 4;
        startY[higherSide] = endY[higherSide] + gentleRise;
        startY[lowerSide] = chart.top + plotHeight - 2;
        endY[lowerSide] = startY[lowerSide] - steepRise;
      }
    }
    const x = (level: number) => chart.left + ((level - 1) / 98) * plotWidth;
    const pointY = (side: number, level: number) => startY[side] + ((level - first.level) / (last.level - first.level)) * (endY[side] - startY[side]);
    const paths = [0, 1].map((side) => `M${x(first.level).toFixed(2)} ${startY[side].toFixed(2)} L${x(last.level).toFixed(2)} ${endY[side].toFixed(2)}`);
    return { x, paths, pointY };
  }, [rows, stat]);

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
  const statLabel = stats.find((item) => item.key === stat)!.label;
  const leftValue = rows?.left[stat][selectedLevel - 1] ?? null;
  const rightValue = rows?.right[stat][selectedLevel - 1] ?? null;

  return <section className="compare-growth" aria-label="双车等级成长曲线">
    <div className="compare-growth-heading">
      <div className="compare-growth-options" aria-label="成长属性">
        {stats.map((item) => <button key={item.key} type="button" className={stat === item.key ? "active" : ""} aria-pressed={stat === item.key} onClick={() => setStat(item.key)}>{item.label}</button>)}
      </div>
      <span className="compare-growth-current">当前定位 <strong>{selectedLevel}级</strong></span>
    </div>
    <div className="compare-growth-legend" aria-live="polite">
      <div className="compare-growth-legend-item left"><i aria-hidden="true" /><span title={left.tank}>{left.tank}</span><strong>{leftValue === null ? "—" : format.format(leftValue)}</strong></div>
      <div className="compare-growth-legend-item right"><i aria-hidden="true" /><span title={right.tank}>{right.tank}</span><strong>{rightValue === null ? "—" : format.format(rightValue)}</strong></div>
    </div>
    {error ? <div className="growth-curve-message" role="alert">{error}<button type="button" onClick={() => { setError(""); setRetry((value) => value + 1); }}>重试</button></div>
      : !rows ? <div className="growth-curve-message">正在加载逐级成长数据…</div>
        : !drawing ? <div className="growth-curve-message">没有可比较的逐级成长数值。</div>
          : <div className="compare-growth-overflow"><div className="compare-growth-interactive" role="slider" tabIndex={0} aria-label={`${statLabel}成长曲线，拖动或使用方向键选择等级`} aria-valuemin={1} aria-valuemax={99} aria-valuenow={selectedLevel} aria-valuetext={`${selectedLevel}级，${left.tank}${leftValue === null ? "无数据" : format.format(leftValue)}，${right.tank}${rightValue === null ? "无数据" : format.format(rightValue)}`} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); setChosenLevel(clampLevel(selectedLevel - 1)); }
            if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); setChosenLevel(clampLevel(selectedLevel + 1)); }
            if (event.key === "Home") { event.preventDefault(); setChosenLevel(1); }
            if (event.key === "End") { event.preventDefault(); setChosenLevel(99); }
          }}>
            <svg viewBox={`0 0 ${chart.width} ${chart.height}`} aria-hidden="true">
              {[0, 1, 2, 3, 4].map((index) => {
                const y = chart.top + (index / 4) * plotHeight;
                return <line className="growth-grid-line" key={index} x1={chart.left} y1={y} x2={chart.width - chart.right} y2={y} />;
              })}
              {[1, 20, 40, 60, 80, 99].map((level) => <g key={level}><line className="growth-grid-line growth-grid-vertical" x1={drawing.x(level)} y1={chart.top} x2={drawing.x(level)} y2={chart.top + plotHeight} /><text className="growth-axis-label" x={drawing.x(level)} y={chart.height - 13} textAnchor="middle">{level}级</text></g>)}
              <path className="compare-growth-line left" d={drawing.paths[0]} fill="none" stroke="#75970e" strokeWidth="3" />
              <path className="compare-growth-line right" d={drawing.paths[1]} fill="none" stroke="#247f79" strokeWidth="3" />
              <line className="growth-selected-line" x1={drawing.x(selectedLevel)} y1={chart.top} x2={drawing.x(selectedLevel)} y2={chart.top + plotHeight} />
              {leftValue !== null && <circle className="growth-selected-point" cx={drawing.x(selectedLevel)} cy={drawing.pointY(0, selectedLevel)} r={6} fill="#75970e" />}
              {rightValue !== null && <circle className="growth-selected-point" cx={drawing.x(selectedLevel)} cy={drawing.pointY(1, selectedLevel)} r={4} fill="#247f79" />}
            </svg>
          </div></div>}
    <p className="compare-growth-note">按首末等级的强弱关系区分交叉与始终领先；直线倾角仅示意整体成长趋势，不是数值坐标图。各等级准确属性以上方读数为准。</p>
  </section>;
}
