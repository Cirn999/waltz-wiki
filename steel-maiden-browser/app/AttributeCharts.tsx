"use client";
/* eslint-disable @next/next/no-img-element -- original client avatars and attribute sprites */
import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { barChartWidth, calculateChart, chartAttributes, chartDomain, chartNumber, chartTicks, formulaError, formulaLabel, MAX_FORMULA_TOKENS, median, tokenLabel, validNumber, type ChartKind, type ChartMaiden, type ChartPoint, type ChartSnapshot, type FormulaToken } from "./attributeChartMath";
import { attributeChartPng } from "./attributeChartExport";
import { deliverPng, useAndroidGalleryBridge } from "./imageDelivery";
import "./attribute-charts.css";

function AxisEditor({ axis, tokens, onChange, icons }: { axis: "X" | "Y"; tokens: FormulaToken[]; onChange: (value: FormulaToken[]) => void; icons: Record<string, string> }) {
  const [custom, setCustom] = useState(tokens.length !== 1 || tokens[0].type !== "stat");
  const [cursor, setCursor] = useState(tokens.length);
  const [constant, setConstant] = useState("");
  const error = formulaError(tokens);
  const position = Math.min(cursor, tokens.length);
  const insert = (token: FormulaToken) => {
    if (tokens.length >= MAX_FORMULA_TOKENS) return;
    onChange([...tokens.slice(0, position), token, ...tokens.slice(position)]); setCursor(position + 1);
  };
  const addNumber = () => { if (validNumber(constant)) { insert({ type: "number", value: constant }); setConstant(""); } };
  return <section className="ac-axis-editor" aria-label={`${axis}轴定义`}>
    <header><strong>{axis} 轴</strong><div><button type="button" aria-pressed={!custom} onClick={() => { setCustom(false); const first = tokens.find((token) => token.type === "stat"); onChange([first ?? { type: "stat", key: "power" }]); setCursor(1); }}>单项属性</button><button type="button" aria-pressed={custom} onClick={() => setCustom(true)}>计算公式</button></div></header>
    <div className="ac-attribute-palette">{chartAttributes.map((attribute) => <button type="button" key={attribute.key} aria-label={`${custom ? "插入" : "选择"}${attribute.label}`} aria-pressed={!custom && tokens[0]?.type === "stat" && tokens[0].key === attribute.key} onClick={() => custom ? insert({ type: "stat", key: attribute.key }) : onChange([{ type: "stat", key: attribute.key }])}>{icons[attribute.label] && <img src={icons[attribute.label]} alt="" />}{attribute.label}</button>)}</div>
    {custom && <>
      <div className="ac-token-editor" aria-label={`${axis}轴公式`}>
        {Array.from({ length: tokens.length + 1 }, (_, index) => <Fragment key={index}><button className={`ac-cursor ${position === index ? "active" : ""}`} type="button" aria-label={`在第${index + 1}个位置插入`} onClick={() => setCursor(index)}>│</button>{tokens[index] && <button type="button" className={`ac-token ac-token-${tokens[index].type}`} onClick={() => setCursor(index + 1)} title="点击后在此块后插入">{tokenLabel(tokens[index])}</button>}</Fragment>)}
        {!tokens.length && <small>点击上方属性块开始</small>}
      </div>
      <div className="ac-operators">{(["+", "-", "*", "/", "(", ")"] as const).map((value) => <button type="button" key={value} aria-label={`插入${tokenLabel({ type: "operator", value })}`} onClick={() => insert({ type: "operator", value })}>{tokenLabel({ type: "operator", value })}</button>)}<button type="button" disabled={position === 0} onClick={() => { onChange(tokens.filter((_, index) => index !== position - 1)); setCursor(position - 1); }}>退格</button><button type="button" disabled={!tokens.length} onClick={() => { onChange([]); setCursor(0); }}>清空</button></div>
      <div className="ac-constant"><input aria-label={`${axis}轴数字常量`} inputMode="decimal" placeholder="数字常量，如 2 或 0.5" value={constant} onChange={(event) => setConstant(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addNumber(); }} /><button type="button" disabled={!validNumber(constant) || tokens.length >= MAX_FORMULA_TOKENS} onClick={addNumber}>插入数字</button></div>
      <small className="ac-formula-help">点击块间竖线选择插入位置 · 最多 {MAX_FORMULA_TOKENS} 块</small>
    </>}
    <p className={error ? "ac-formula-error" : "ac-formula-preview"} role={error ? "status" : undefined}>{error || `${axis} = ${formulaLabel(tokens)}`}</p>
  </section>;
}

function Avatar({ point, x, y, radius, prefix }: { point: ChartPoint; x: number; y: number; radius: number; prefix: string }) {
  const id = `${prefix}-${point.maiden.id}`;
  return <><defs><clipPath id={id}><circle cx={x} cy={y} r={radius} /></clipPath></defs><circle cx={x} cy={y} r={radius + 2} fill="#f7faf4" stroke="#436e54" strokeWidth="1.5" />{point.maiden.headImage ? <image href={point.maiden.headImage} x={x - radius} y={y - radius} width={radius * 2} height={radius * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id})`} /> : <text x={x} y={y + 4} textAnchor="middle" fill="#253d2e" fontSize="11">{point.maiden.tank.slice(0, 2)}</text>}</>;
}

const splitLine = (text: string, limit = 60) => Array.from({ length: Math.max(1, Math.ceil([...text].length / limit)) }, (_, index) => [...text].slice(index * limit, (index + 1) * limit).join(""));

function ChartResult({ snapshot, onBack }: { snapshot: ChartSnapshot; onBack: () => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(1040);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => setViewportWidth(Math.floor(viewport.clientWidth)));
    observer.observe(viewport); return () => observer.disconnect();
  }, []);
  const prefix = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [zoom, setZoom] = useState(1);
  const [active, setActive] = useState<ChartPoint[]>([]);
  const [shareState, setShareState] = useState(""), [sharing, setSharing] = useState(false);
  const androidGallery = useAndroidGalleryBridge();
  const { kind, points } = snapshot;
  const center = useMemo(() => ({ x: median(points.map((point) => point.x)), y: median(points.map((point) => point.y)) }), [points]);
  const width = kind === "bar" ? Math.max(viewportWidth, barChartWidth(points.length, Math.max(...points.map((point) => chartNumber(point.y).length)))) : Math.max(1040, viewportWidth) * zoom;
  const formulaLines = splitLine(kind === "bar" ? `Y = ${snapshot.yLabel}` : `X = ${snapshot.xLabel}    Y = ${snapshot.yLabel}`);
  // Reserve one complete avatar above the zero baseline, including negative-only bars.
  const top = 90 + formulaLines.length * 20 + (kind === "scatter" ? 26 : 44), bottom = top + (kind === "scatter" ? 390 * zoom : 350);
  const height = bottom + (kind === "bar" ? 112 : 94);
  const left = 88, right = width - 48;
  const yDomain = chartDomain(points.map((point) => kind === "bar" ? point.y : point.y - center.y), kind === "bar");
  const xDomain = chartDomain(points.map((point) => point.x - center.x));
  const scaleY = (value: number) => bottom - (value - yDomain[0]) / (yDomain[1] - yDomain[0]) * (bottom - top);
  const scaleX = (value: number) => left + (value - xDomain[0]) / (xDomain[1] - xDomain[0]) * (right - left);
  const zeroY = scaleY(0), zeroX = scaleX(0);
  const groups = useMemo(() => {
    const grouped = new Map<string, ChartPoint[]>();
    for (const point of points) { const key = `${point.x}:${point.y}`; const group = grouped.get(key) ?? []; group.push(point); grouped.set(key, group); }
    return [...grouped.values()];
  }, [points]);
  const describe = (point: ChartPoint) => `${point.maiden.tank} · ${snapshot.level}级 · ${kind === "scatter" ? `X ${chartNumber(point.x)} · ` : ""}Y ${chartNumber(point.y)}`;
  const share = async () => {
    if (!svgRef.current || sharing) return;
    setSharing(true); setShareState("");
    try {
      const promise = attributeChartPng(svgRef.current);
      void promise.catch(() => {});
      const destination = await deliverPng(promise, "steel-maiden-attribute-chart");
      setShareState(destination === "gallery" ? "完整图表已保存到系统相册" : "完整图表已复制到剪贴板");
    } catch (error) { setShareState(`${androidGallery ? "保存" : "复制"}失败：${(error as Error).message}`); }
    finally { setSharing(false); }
  };
  return <div className="ac-result">
    <div className="ac-result-toolbar"><button type="button" onClick={onBack}>← 返回设置</button><span>{points.length} 辆 · {snapshot.level} 级{kind === "bar" ? " · 从左到右降序" : " · 中位数居中"}</span>{kind === "scatter" && <label>间距缩放<select aria-label="散点图间距缩放" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>{[1, 2, 3, 4].map((value) => <option value={value} key={value}>{value}×</option>)}</select></label>}<button className="ac-primary" type="button" onClick={share} disabled={sharing}>{sharing ? (androidGallery ? "正在保存…" : "正在复制…") : (androidGallery ? "保存图表到相册" : "复制图表")}</button></div>
    {shareState && <p className="ac-share-status" role="status">{shareState}</p>}
    <div className="ac-svg-scroll" ref={viewportRef} tabIndex={0} aria-label="图表区域，可横向滚动">
      <svg ref={svgRef} className="ac-chart-svg" xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${snapshot.level}级钢舞姬${kind === "bar" ? "柱状图" : "散点图"}`} style={{ fontFamily: "Arial, 'Microsoft YaHei', sans-serif" }}>
        <rect width={width} height={height} fill="#f5f8f0" />
        <text x="30" y="36" fontSize="22" fontWeight="700" fill="#183124">钢舞姬 · {kind === "bar" ? "属性柱状图" : "属性散点图"}</text>
        <text x={width - 30} y="35" textAnchor="end" fontSize="13" fill="#55705c">{snapshot.level}级 / {points.length}辆</text>
        {formulaLines.map((line, index) => <text key={index} x="30" y={62 + index * 20} fontSize="13" fill="#35513d">{line}</text>)}
        {kind === "scatter" && <text x="30" y={68 + formulaLines.length * 20} fontSize="12" fill="#55705c">原点 = 中位数（X：{chartNumber(center.x)}，Y：{chartNumber(center.y)}） · 刻度为相对中位数的差值</text>}
        {chartTicks(yDomain).map((value, index) => {
          const y = scaleY(value);
          return <g key={index}><line x1={left} x2={right} y1={y} y2={y} stroke="#dae4d5" /><text x={left - 12} y={y + 4} textAnchor="end" fontSize="11" fill="#71816f">{chartNumber(value)}</text></g>;
        })}
        {kind === "bar" ? <>
          <line x1={left} x2={right} y1={zeroY} y2={zeroY} stroke="#68836c" />
          {points.map((point, index) => {
            const pitch = (right - left) / points.length, x = left + pitch * (index + .5), y = scaleY(point.y), barWidth = Math.min(38, pitch * .56);
            return <g key={point.maiden.id} className="ac-bar-point" data-id={point.maiden.id} data-value={point.y} tabIndex={0} role="button" aria-label={describe(point)} onMouseEnter={() => setActive([point])} onFocus={() => setActive([point])} onClick={() => setActive([point])} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActive([point]); } }}>
              <title>{describe(point)}</title><rect x={x - barWidth / 2} y={Math.min(zeroY, y)} width={barWidth} height={Math.max(1, Math.abs(zeroY - y))} rx="4" fill={point.y < 0 ? "#bb735a" : "#709143"} />
              <Avatar point={point} x={x} y={Math.min(y, zeroY) - 27} radius={21} prefix={prefix} />
              <text x={x} y={bottom + 26} textAnchor="middle" fontSize="12" fontWeight="700" fill="#284332">{chartNumber(point.y)}</text>
              {splitLine(point.maiden.tank, 5).slice(0, 2).map((line, lineIndex) => <text x={x} y={bottom + 47 + lineIndex * 15} key={lineIndex} textAnchor="middle" fontSize="10" fill="#61755f">{lineIndex === 1 && [...point.maiden.tank].length > 10 ? `${line.slice(0, 4)}…` : line}</text>)}
            </g>;
          })}
        </> : <>
          {chartTicks(xDomain).map((value, index) => { const x = scaleX(value); return <g key={index}><line x1={x} x2={x} y1={top} y2={bottom} stroke="#dae4d5" /><text x={x} y={bottom + 24} textAnchor="middle" fontSize="11" fill="#71816f">{chartNumber(value)}</text></g>; })}
          <line data-axis="x" x1={left} x2={right} y1={zeroY} y2={zeroY} stroke="#365941" strokeWidth="1.5" /><line data-axis="y" x1={zeroX} x2={zeroX} y1={top} y2={bottom} stroke="#365941" strokeWidth="1.5" />
          <circle data-median-x={center.x} data-median-y={center.y} cx={zeroX} cy={zeroY} r="4" fill="#365941" /><text x={zeroX + 8} y={zeroY + 16} fontSize="12" fill="#365941">0</text><text x={right + 10} y={zeroY + 4} fontSize="14" fill="#365941">X</text><text x={zeroX + 10} y={top - 12} fontSize="14" fill="#365941">Y</text>
          {groups.map((group) => { const point = group[0], x = scaleX(point.x - center.x), y = scaleY(point.y - center.y); return <g className="ac-scatter-point" data-ids={group.map((entry) => entry.maiden.id).join(",")} data-x={point.x} data-y={point.y} key={point.maiden.id} tabIndex={0} role="button" aria-label={`${describe(point)}${group.length > 1 ? `，同坐标共${group.length}辆，点击查看` : ""}`} onMouseEnter={() => setActive(group)} onFocus={() => setActive(group)} onClick={() => setActive(group)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActive(group); } }}><title>{group.map(describe).join("\n")}</title><Avatar point={point} x={x} y={y} radius={18} prefix={prefix} />{group.length > 1 && <><circle cx={x + 16} cy={y - 16} r="11" fill="#173c2b" /><text x={x + 16} y={y - 12} fontSize="10" fill="#fff" textAnchor="middle">{group.length}</text></>}</g>; })}
        </>}
        <text x="30" y={height - 20} fontSize="11" fill="#6b7d66">钢舞姬战术档案库 · 属性表基础数值，不含配装加成 · 数值显示最多两位小数，排序与定位使用原始值</text>
      </svg>
    </div>
    <div className="ac-point-readout" aria-live="polite">{active.length ? active.map((point) => <span key={point.maiden.id}>{point.maiden.headImage && <img src={point.maiden.headImage} alt="" />}<b>{point.maiden.tank}</b>{kind === "scatter" && `X：${point.x.toLocaleString("zh-CN", { maximumFractionDigits: 6 })}　`}Y：{point.y.toLocaleString("zh-CN", { maximumFractionDigits: 6 })}</span>) : <span>{kind === "scatter" ? "悬停、点击或用 Tab 选中头像查看实际数值；同坐标的车辆合并标出数量，可展开查看。" : "悬停或点击头像查看完整车名与数值；车辆较多时横向滚动，复制会包含完整图表。"}</span>}</div>
  </div>;
}

export default function AttributeCharts({ allMaidens, candidates, initialQuery, initialLevel, initialKind, icons, filterCount, filterOpen, onOpenFilters, onClose }: {
  allMaidens: ChartMaiden[]; candidates: ChartMaiden[]; initialQuery: string; initialLevel: number; initialKind: ChartKind; icons: Record<string, string>; filterCount: number; filterOpen: boolean; onOpenFilters: () => void; onClose: () => void;
}) {
  const [kind, setKind] = useState(initialKind), [level, setLevel] = useState(initialLevel);
  const [query, setQuery] = useState(initialQuery), [selected, setSelected] = useState<number[]>([]);
  const [selectedQuery, setSelectedQuery] = useState("");
  const [xTokens, setXTokens] = useState<FormulaToken[]>([{ type: "stat", key: "piercing" }]);
  const [yTokens, setYTokens] = useState<FormulaToken[]>([{ type: "stat", key: "power" }]);
  const [snapshot, setSnapshot] = useState<ChartSnapshot | null>(null), [error, setError] = useState("");
  const [mobileColumn, setMobileColumn] = useState("available");
  const dialog = useRef<HTMLElement>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const byId = useMemo(() => new Map(allMaidens.map((row) => [row.id, row])), [allMaidens]);
  const selectedRows = useMemo(() => selected.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []), [byId, selected]);
  const available = useMemo(() => candidates.filter((row) => !selectedSet.has(row.id) && `${row.tank} ${row.person} ${row.id} ${row.nation}`.toLowerCase().includes(query.trim().toLowerCase())), [candidates, query, selectedSet]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; dialog.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (filterOpen) return;
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key === "Tab") {
        const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]') ?? [])].filter((element) => element.getClientRects().length);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", handle); return () => window.removeEventListener("keydown", handle);
  }, [filterOpen, onClose]);
  const generate = () => {
    try {
      const { points, errors } = calculateChart(selectedRows, kind, level, xTokens, yTokens);
      if (errors.length) { setError(`${errors.length} 辆无法计算：${errors.slice(0, 4).join("；")}${errors.length > 4 ? "……" : ""}`); return; }
      if (!points.length) { setError("请至少加入一辆钢舞姬"); return; }
      setError(""); setSnapshot({ kind, level, points, xLabel: formulaLabel(xTokens), yLabel: formulaLabel(yTokens) });
    } catch (caught) { setError((caught as Error).message); }
  };
  const vehicleButton = (row: ChartMaiden, remove = false) => <button type="button" key={row.id} className="ac-vehicle" data-id={row.id} aria-label={`${remove ? "移除" : "加入"} ${row.tank}`} onClick={() => setSelected((current) => remove ? current.filter((id) => id !== row.id) : [...current, row.id])}>{row.headImage && <img className="ac-head" src={row.headImage} alt="" loading="lazy" />}<span><strong>{row.tank}</strong><small>{row.person} · {row.stage}</small></span><i aria-hidden="true">{remove ? "←" : "+"}</i></button>;
  if (typeof document === "undefined") return null;
  return createPortal(<div className="ac-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !filterOpen) onClose(); }}><section className="ac-workspace" role="dialog" aria-modal="true" aria-label="属性图表" ref={dialog} tabIndex={-1}>
    <header className="ac-header"><div><small>ATTRIBUTE CHARTS</small><h2>属性图表</h2></div>{!snapshot && <><div className="ac-type-switch">{(["bar", "scatter"] as const).map((value) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>{value === "bar" ? "柱状图" : "散点图"}</button>)}</div><div className="ac-levels" aria-label="图表等级">{[1, 60, 90, 99].map((value) => <button type="button" key={value} aria-pressed={level === value} onClick={() => setLevel(value)}>{value}级</button>)}</div></>}<button className="ac-close" type="button" aria-label="关闭属性图表" onClick={onClose}>×</button></header>
    {snapshot ? <ChartResult snapshot={snapshot} onBack={() => setSnapshot(null)} /> : <>
      <nav className="ac-mobile-columns" aria-label="图表设置步骤"><button type="button" aria-pressed={mobileColumn === "available"} onClick={() => setMobileColumn("available")}>可选车辆 {available.length}</button><button type="button" aria-pressed={mobileColumn === "selected"} onClick={() => setMobileColumn("selected")}>待比较 {selected.length}</button><button type="button" aria-pressed={mobileColumn === "axes"} onClick={() => setMobileColumn("axes")}>坐标定义</button></nav>
      <div className="ac-setup" data-column={mobileColumn}>
        <section className="ac-column ac-candidates" aria-label="可选车辆"><header><h3>可选车辆 <b>{available.length}</b></h3><button type="button" onClick={onOpenFilters}>筛选{filterCount > 0 ? ` (${filterCount})` : ""}</button></header><input className="ac-search" aria-label="搜索图表车辆" placeholder="车名、人名、国籍或 ID" value={query} onChange={(event) => setQuery(event.target.value)} /><button className="ac-import" type="button" disabled={!available.length} onClick={() => setSelected((current) => [...new Set([...current, ...available.map((row) => row.id)])])}>全部加入 → <small>{available.length} 辆</small></button><div className="ac-vehicle-list">{available.map((row) => vehicleButton(row))}{!available.length && <p className="ac-empty">没有待加入的车辆<br />可调整筛选或搜索条件</p>}</div><p className="ac-column-note">仅显示符合当前筛选的未选车辆</p></section>
        <section className="ac-column ac-selected" aria-label="待比较车辆"><header><h3>待比较车辆 <b>{selectedRows.length}</b></h3><button type="button" disabled={!selected.length} onClick={() => setSelected([])}>全部移回</button></header><input className="ac-search" aria-label="搜索待比较车辆" placeholder="查找已选车名、人名或 ID" value={selectedQuery} onChange={(event) => setSelectedQuery(event.target.value)} /><p className="ac-selected-tip">点击车辆移除 · 查找或筛选不会减少出图车辆</p><div className="ac-vehicle-list">{selectedRows.filter((row) => `${row.tank} ${row.person} ${row.id}`.toLowerCase().includes(selectedQuery.trim().toLowerCase())).map((row) => vehicleButton(row, true))}{!selectedRows.length && <p className="ac-empty">从左侧加入钢舞姬<br />也可以一键加入筛选结果</p>}</div></section>
        <section className="ac-column ac-definitions" aria-label="坐标定义"><header><h3>坐标定义</h3><small>{kind === "bar" ? "只需设置 Y 轴" : "分别设置 X / Y 轴"}</small></header><div className="ac-axis-scroll">{kind === "scatter" && <AxisEditor axis="X" tokens={xTokens} onChange={setXTokens} icons={icons} />}<AxisEditor axis="Y" tokens={yTokens} onChange={setYTokens} icons={icons} /><p className="ac-formula-help">按属性表的 {level} 级基础数值计算，不包含配装模拟加成。{kind === "scatter" ? "原点取已选车辆 X、Y 的中位数。" : "生成后自动按 Y 值从左到右降序排列。"}</p></div></section>
      </div>
      <div className="ac-setup-footer"><span role="status" className={error ? "ac-error" : ""}>{error || `已选 ${selectedRows.length} 辆 · ${level} 级 · ${kind === "bar" ? "柱状图" : "散点图"}`}</span><button className="ac-primary" type="button" onClick={generate} disabled={!selected.length || !!formulaError(yTokens) || (kind === "scatter" && !!formulaError(xTokens))}>生成图表 →</button></div>
    </>}
  </section></div>, document.body);
}
