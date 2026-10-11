"use client";
/* eslint-disable @next/next/no-img-element -- original game atlas sprites */
import { useMemo, useState } from "react";
import { dropGradeLabels, scoreAllows } from "./stageIncome";
import type { IncomeResult, IncomeSettings } from "./stageIncome";
import type { Reward, StageCatalog, StageMap } from "./stageTypes";
import { buildStageYieldRows, filterStageYieldRows, sortStageYieldRows } from "./stageYield";
import type { YieldSortKey } from "./stageYield";
import "./stage-yield.css";

const columns: { key: YieldSortKey; label: string }[] = [
  { key: "number", label: "地图" }, { key: "fuel", label: "燃油消耗" },
  { key: "silver", label: "总银币收益" }, { key: "codons", label: "总密码子收益" },
  { key: "silverPerFuel", label: "银币 / 燃油" }, { key: "codonsPerFuel", label: "密码子 / 燃油" },
];
function formatAmount(value: number | null, unit = false) {
  return value === null ? "—" : value.toLocaleString("zh-CN", { minimumFractionDigits: unit ? 2 : 0, maximumFractionDigits: unit ? 2 : 0 });
}
function EquipmentLabel({ item, grades, eligible = true }: { item: Reward; grades?: string; eligible?: boolean }) {
  return <><img className="stage-yield-item-icon" loading="lazy" src={item.image} alt="" /><span className="stage-yield-item-text"><strong>{item.name}</strong><small><span>{item.slotIcon && <img loading="lazy" src={item.slotIcon} alt="" />}{item.slotName || "部位未配置"}</span>{grades && <span className="stage-yield-grade">评价 {grades}</span>}</small>{!eligible && <em className="stage-yield-unavailable">当前不可掉落</em>}</span></>;
}

export default function StageYieldOverview({ catalog, nodeIncome, settings, onOpenMap }: {
  catalog: StageCatalog; nodeIncome: Record<string, IncomeResult>; settings: IncomeSettings; onOpenMap: (map: StageMap) => void;
}) {
  const [query, setQuery] = useState("");
  const [equipmentIds, setEquipmentIds] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [equipmentQuery, setEquipmentQuery] = useState("");
  const [slot, setSlot] = useState("");
  const [sort, setSort] = useState<{ key: YieldSortKey; descending: boolean }>({ key: "number", descending: false });
  const rows = useMemo(() => buildStageYieldRows(catalog, nodeIncome), [catalog, nodeIncome]);
  const equipment = useMemo(() => [...new Map(rows.flatMap((row) => row.equipment).map((item) => [item.id, item])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN") || a.slotName.localeCompare(b.slotName, "zh-CN")), [rows]);
  const slots = useMemo(() => [...new Set(equipment.map((item) => item.slotName))], [equipment]);
  const options = equipment.filter((item) => (!slot || item.slotName === slot) && `${item.name} ${item.slotName}`.includes(equipmentQuery.trim()));
  const filtered = useMemo(() => sortStageYieldRows(filterStageYieldRows(rows, equipmentIds, query), sort.key, sort.descending), [rows, equipmentIds, query, sort]);
  const fuelIcon = rows.flatMap((row) => row.map.entryCosts).find((cost) => cost.fundId === 4)?.image;
  function toggleEquipment(id: string) { setEquipmentIds((ids) => ids.includes(id) ? ids.filter((key) => key !== id) : [...ids, id]); }
  function clearFilters() { setQuery(""); setEquipmentIds([]); setEquipmentQuery(""); setSlot(""); }
  return <div className="stage-yield-overview">
    <div className="stage-yield-toolbar">
      <input type="search" aria-label="搜索收益地图或装备" placeholder="搜索地图、掉落装备或部位…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <button type="button" aria-expanded={filterOpen} aria-controls="stage-yield-equipment-filter" onClick={() => setFilterOpen((open) => !open)}>掉落装备筛选{equipmentIds.length > 0 && ` · ${equipmentIds.length}`} <span aria-hidden="true">{filterOpen ? "▴" : "▾"}</span></button>
      {(query || equipmentIds.length > 0) && <button type="button" className="stage-yield-clear" onClick={clearFilters}>清除筛选</button>}
      <span className="stage-yield-count" aria-live="polite">{filtered.length} / {rows.length} 张捷径地图</span>
    </div>
    {filterOpen && <section id="stage-yield-equipment-filter" className="stage-yield-filter" aria-label="掉落装备筛选">
      <div className="stage-yield-filter-heading"><strong>选择掉落装备</strong><span>可多选，满足任一项即可（或逻辑）；同名不同部位分别筛选。</span><button type="button" onClick={() => setFilterOpen(false)}>收起</button></div>
      <div className="stage-yield-filter-controls"><input type="search" aria-label="查找掉落装备" placeholder="查找装备名称…" value={equipmentQuery} onChange={(e) => setEquipmentQuery(e.target.value)} /><label>部位<select aria-label="筛选装备部位" value={slot} onChange={(e) => setSlot(e.target.value)}><option value="">全部部位</option>{slots.map((name) => <option key={name}>{name}</option>)}</select></label><span>{options.length} 种装备</span></div>
      <div className="stage-yield-filter-options">{options.map((item) => <label key={item.id} data-selected={equipmentIds.includes(item.id)}><input type="checkbox" aria-label={`${item.name}（${item.slotName}）`} checked={equipmentIds.includes(item.id)} onChange={() => toggleEquipment(item.id)} /><EquipmentLabel item={item} /></label>)}{!options.length && <p>没有匹配的装备，试试其他名称或部位。</p>}</div>
    </section>}
    {equipmentIds.length > 0 && <div className="stage-yield-selected" aria-label="已选掉落装备">{equipmentIds.map((id) => { const item = catalog.rewards[id]; return <button type="button" key={id} onClick={() => toggleEquipment(id)} aria-label={`移除筛选 ${item.name}（${item.slotName}）`}>{item.name} · {item.slotName}<span aria-hidden="true">×</span></button>; })}</div>}
    <p className="stage-yield-note">按上方全局进度和评价计算各节点各结算一次的固定收益；每点燃油收益 = 总收益 ÷ 入图燃油，保留两位小数。点击表头可排序，点击地图可查看详情。</p>
    <p className="stage-yield-note">装备按全部可能掉落筛选，明细标注可掉落评价；满足评价不代表必掉。不计装备折价、随机奖励或临时加成。<span className="stage-yield-scroll-hint">窄屏可左右滑动表格查看完整内容。</span></p>
    <div className="stage-yield-table-flow" tabIndex={0} role="region" aria-label="战役捷径收益表（窄屏可横向滚动）">
      <table className="stage-yield-table" aria-label="战役捷径收益一览">
        <colgroup><col className="stage-yield-map-col" /><col className="stage-yield-fuel-col" /><col /><col /><col /><col /><col className="stage-yield-drops-col" /></colgroup>
        <thead><tr>{columns.map(({ key, label }) => <th key={key} scope="col" aria-sort={sort.key === key ? sort.descending ? "descending" : "ascending" : "none"}><button type="button" aria-label={`按${label}排序`} onClick={() => setSort({ key, descending: sort.key === key ? !sort.descending : key !== "number" })}>{key === "fuel" && fuelIcon && <img src={fuelIcon} alt="" />}{(key === "silver" || key === "codons") && <img src={catalog.income.resources[key === "silver" ? 1 : 2].image} alt="" />}<span>{label.replace(/(消耗|收益)$/, "\n$1")}</span><i aria-hidden="true">{sort.key === key ? sort.descending ? "↓" : "↑" : "↕"}</i></button></th>)}<th scope="col">装备掉落明细</th></tr></thead>
        <tbody>{filtered.map((row) => <tr key={row.map.id} data-map-id={row.map.id}>
          <th scope="row"><button className="stage-yield-map" type="button" onClick={() => onOpenMap(row.map)} aria-label={`查看捷径${row.number} ${row.map.name}`}><b>捷径 {row.number}<span aria-hidden="true">↗</span></b><span>{row.map.name.replace(/[（(]捷径[）)]$/, "")}</span></button>{(row.income.variable || row.income.dynamic) && <small className="stage-yield-caveat">另有不计入的条件奖励</small>}</th>
          {(["fuel", "silver", "codons", "silverPerFuel", "codonsPerFuel"] as const).map((key) => <td key={key} data-column={key} className={key.endsWith("PerFuel") ? "stage-yield-unit" : ""}>{formatAmount(row[key], key.endsWith("PerFuel"))}</td>)}
          <td><div className="stage-yield-drops">{row.equipment.map((item) => { const eligible = scoreAllows(item.ranges, settings.score); const grades = dropGradeLabels(item.ranges, catalog.income).join(" / "); return <button type="button" key={item.id} data-reward={item.id} data-eligible={eligible} data-selected={equipmentIds.includes(item.id)} className="stage-yield-drop" aria-pressed={equipmentIds.includes(item.id)} aria-label={`筛选 ${item.name}（${item.slotName}）`} title={`${item.name}（${item.slotName}） · 可掉落评价：${grades}${eligible ? "" : " · 当前评价不可掉落"} · 点击切换筛选`} onClick={() => toggleEquipment(item.id)}><EquipmentLabel item={item} grades={grades} eligible={eligible} /></button>; })}{!row.equipment.length && <span className="stage-yield-none">无装备掉落</span>}</div></td>
        </tr>)}{!filtered.length && <tr><td colSpan={7} className="stage-yield-empty">没有匹配的捷径地图。<button type="button" onClick={clearFilters}>清除筛选</button></td></tr>}</tbody>
      </table>
    </div>
  </div>;
}
