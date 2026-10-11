"use client";
/* eslint-disable @next/next/no-img-element -- original game atlas sprites */
import { useEffect, useMemo, useRef, useState } from "react";
import { calculateNodeIncome, DEFAULT_INCOME_SETTINGS, dropGradeLabels, fixedCurrencyDrops, incomeAssessments, INCOME_STORAGE_KEY, mergeScoreRanges, normalizeIncomeSettings, readIncomeSettings, scoreAllows, sumIncome, visibleIncomeIndices } from "./stageIncome";
import type { IncomeCatalog, IncomeResult, IncomeSettings, ScoreRange } from "./stageIncome";
import type { EntryRequirement, Reward, StageCatalog, StageMap, StageNode } from "./stageTypes";
import StageYieldOverview from "./StageYieldOverview";
import { loadStageCatalog } from "./stageCatalogData";
import "./stages.css";

function IncomeControls({ catalog, settings, onChange, saved, showProgress = true }: { catalog: IncomeCatalog; settings: IncomeSettings; onChange: (value: IncomeSettings) => void; saved: boolean; showProgress?: boolean }) {
  return <div className="stage-income-controls">
    {showProgress && <label>主线通关进度<select aria-label="收益通关进度" value={settings.progress} onChange={(e) => onChange({ ...settings, progress: Number(e.target.value) })}>{catalog.progress.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>}
    <label>结算评价<select aria-label="收益结算评价" value={settings.score} onChange={(e) => onChange({ ...settings, score: Number(e.target.value) })}>{incomeAssessments(catalog).map((a) => <option key={a.score} value={a.score}>{a.grade}</option>)}</select></label>
    <span>{saved ? "全局生效 · 自动保存" : "本次已生效 · 浏览器未允许保存"}</span>
  </div>;
}

function IncomeValues({ result, catalog, compact = false, hideZeroExperience = false }: { result: IncomeResult; catalog: IncomeCatalog; compact?: boolean; hideZeroExperience?: boolean }) {
  const indices = visibleIncomeIndices(result, false, hideZeroExperience);
  if (!indices.length) return null;
  return <span className={`stage-income-values${compact ? " is-compact" : ""}`} data-count={indices.length}>{indices.map((i) => {
    const resource = catalog.resources[i];
    const value = result.amount[i].toLocaleString();
    return <span key={resource.key} title={`${resource.name}：${value}`} data-resource={resource.key}>
      <img src={resource.image} alt={compact ? resource.name : ""} /><span>{!compact && <small>{resource.name}</small>}<b>{value}</b></span>
    </span>;
  })}</span>;
}

function IncomeCaveat({ result }: { result: IncomeResult }) {
  if (!result.variable && !result.dynamic) return null;
  return <span className="stage-income-caveat">另有{result.variable ? "随机 / 活动条件奖励" : "特殊结算项"}，未计入固定收益。</span>;
}

function mapTitle(map: StageMap) {
  return map.mode === "VOL_SPECIAL" || map.mode === "VOL_FARM" ? `${map.code} · ${map.name}` : map.name;
}

function currenciesInLoot(map: StageMap) { return map.category === "assault" || map.category === "air"; }
function mapSubgroup(map: StageMap) { return map.outputGroup ?? map.challengeGroup ?? ""; }

function EntryCosts({ map, compact = false }: { map: StageMap; compact?: boolean }) {
  if (map.id === -1 || (compact && !map.entryCosts.length)) return null;
  return <span className={`stage-entry-costs${compact ? " is-overlay" : ""}`} aria-label="进图消耗">{!compact && <small>进图消耗</small>}{map.entryCosts.length ? map.entryCosts.map((cost) => <span key={cost.fundId} title={`${cost.name} × ${cost.amount.toLocaleString()}`}><img loading="lazy" src={cost.image} alt={compact ? cost.name : ""} /><span>{!compact && `${cost.name} `}<b>{compact ? "" : "×"}{cost.amount.toLocaleString()}</b></span></span>) : <span className="stage-no-cost">无额外物资消耗</span>}</span>;
}

type DisplayDrop = Reward & { ranges: ScoreRange[]; amount?: number };
function displayDrops(nodes: StageNode[], catalog: StageCatalog, settings: IncomeSettings, mergeCurrencies: boolean): DisplayDrop[] {
  const ids = [...new Set(nodes.flatMap((node) => node.drops))];
  const items: DisplayDrop[] = ids.map((id) => ({ ...catalog.rewards[id], ranges: mergeScoreRanges(nodes.flatMap((node) => node.dropScores[id] ?? [])) }));
  if (mergeCurrencies) for (const drop of fixedCurrencyDrops(nodes.map((n) => n.income), catalog.income, settings)) {
    const resource = catalog.income.resources[drop.index];
    items.push({ ...resource, id: `income:${resource.key}`, kind: "固定资源奖励", slotName: "", slotIcon: "", amount: drop.amount, ranges: drop.ranges });
  }
  return items;
}

function MapDropPreview({ map, catalog, settings }: { map: StageMap; catalog: StageCatalog; settings: IncomeSettings }) {
  if (!currenciesInLoot(map)) return null;
  const drops = displayDrops(map.nodes.map((id) => catalog.nodes[id]), catalog, settings, true);
  return <span className="stage-map-drops"><small>可能掉落 · 受评价及活动条件限制</small><span className="stage-map-drop-grid">{drops.map((reward) => {
    const grades = dropGradeLabels(reward.ranges, catalog.income).join(" / ");
    const label = `${reward.name}${reward.amount !== undefined ? ` ×${reward.amount.toLocaleString()}` : ""}`;
    return <span key={reward.id} data-reward={reward.id} data-eligible={scoreAllows(reward.ranges, settings.score)} title={`${label} · ${grades}`}><RewardIcon reward={reward} /><span>{label}</span></span>;
  })}</span>{!drops.length && <span className="stage-no-cost">客户端未配置可预览道具</span>}</span>;
}

function MapIncome({ map, catalog, nodeIncome }: { map: StageMap; catalog: IncomeCatalog; nodeIncome: Record<string, IncomeResult> }) {
  const result = sumIncome(map.nodes.map((id) => nodeIncome[id]));
  if (!visibleIncomeIndices(result, currenciesInLoot(map), map.category === "event").length) return null;
  return <span className="stage-map-income"><small>总收益 · 固定部分</small><IncomeValues result={result} catalog={catalog} compact hideZeroExperience={map.category === "event"} /><IncomeCaveat result={result} /></span>;
}

function RewardIcon({ reward }: { reward: Reward }) {
  if (!reward.image) return <span className="stage-item-fallback" aria-hidden="true">物</span>;
  if (!reward.outfit) return <img loading="lazy" src={reward.image} alt="" />;
  const { headImage, baseSize: [width, height], headSize: [headWidth, headHeight] } = reward.outfit;
  // Native center anchor, +13/-4 game units, 25% scale and skewY(25deg).
  // SVG's Y axis points down, unlike the client's, so flip the Y offset/skew.
  return <svg className="stage-outfit-icon" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false" data-capsule-id={reward.outfit.capsuleId}>
    <image href={reward.image} width={width} height={height} />
    <g transform={`translate(${width / 2 + 13} ${height / 2 + 4}) skewY(-25) scale(0.25)`}>
      <image className="stage-outfit-portrait" href={headImage} x={-headWidth / 2} y={-headHeight / 2} width={headWidth} height={headHeight} />
    </g>
  </svg>;
}

function RequirementText({ requirement }: { requirement: EntryRequirement }) {
  return <>{requirement.image && <img src={requirement.image} alt="" />}{requirement.parts ? requirement.parts.map((part, i) => part.image ? <img key={i} src={part.image} alt={part.text} title={part.text || undefined} /> : <span key={i}>{part.text}</span>) : requirement.text}</>;
}

function EntryRequirements({ map }: { map: StageMap }) {
  const entry = map.requirements ?? [];
  const order: Record<string, number> = { level: 0, medal: 1, item: 2, formation: 3, prerequisite: 4 };
  const primary = entry.filter((r) => r.kind !== "availability").sort((a, b) => (order[a.kind] ?? 5) - (order[b.kind] ?? 5));
  const timing = entry.filter((r) => r.kind === "availability");
  function rows(items: EntryRequirement[]) {
    return items.map((r) => <li key={r.key} data-kind={r.kind} title={r.refs?.map((ref) => ref.name).join("；")}><RequirementText requirement={r} /></li>);
  }
  return <section className="stage-entry-requirements" aria-label="进入条件">
    <div className="stage-requirements-heading"><h4>地图进入条件</h4><span>以下条件需同时满足 · 不读取账号进度</span></div>
    <EntryCosts map={map} />
    {primary.length > 0 ? <ul className="stage-requirement-list">{rows(primary)}</ul> : <p className="stage-requirements-empty">客户端未配置额外等级或阵容门槛。</p>}
    {timing.length > 0 && <div className="stage-requirement-status"><span>开图状态</span><ul>{rows(timing)}</ul></div>}
    {map.formationReward && <section className="stage-formation-reward" aria-label="队形 S 奖励要求">
      <div className="stage-requirements-heading"><h4>队形 S 奖励要求</h4><span>额外奖励条件，非进图限制</span></div>
      <p className="stage-formation-grade">本场战斗取得 {map.formationReward.grade} 评价，并同时满足：</p>
      <ul className="stage-requirement-list">{rows(map.formationReward.requirements)}</ul>
      <div className="stage-formation-loot"><span>奖励内容</span><ul>{map.formationReward.rewards.map((reward) => <li key={reward.fundId}><img loading="lazy" src={reward.image} alt="" /><span>{reward.name}</span><b>×{reward.amount.toLocaleString("zh-CN")}</b></li>)}</ul></div>
    </section>}
  </section>;
}

function MapDetail({ map, catalog, onClose, settings, onSettingsChange, saved, nodeIncome }: { map: StageMap; catalog: StageCatalog; onClose: () => void; settings: IncomeSettings; onSettingsChange: (value: IncomeSettings) => void; saved: boolean; nodeIncome: Record<string, IncomeResult> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nodeNav = useRef<HTMLElement>(null);
  const [index, setIndex] = useState(0);
  const [dropQuery, setDropQuery] = useState("");
  const node = catalog.nodes[map.nodes[index]];
  const terrain = catalog.terrains[node.fieldId];
  const totalIncome = sumIncome(map.nodes.map((id) => nodeIncome[id]));
  const mergeCurrencies = currenciesInLoot(map);
  const hideZeroExperience = map.category === "event";
  const showProgress = !["assault", "air", "messenger", "event"].includes(map.category);
  const hasTotalIncome = visibleIncomeIndices(totalIncome, mergeCurrencies, hideZeroExperience).length > 0;
  const hasNodeIncome = visibleIncomeIndices(nodeIncome[node.id], mergeCurrencies, hideZeroExperience).length > 0;
  const allDrops = displayDrops([node], catalog, settings, mergeCurrencies);
  const drops = allDrops.filter((d) => `${d.name} ${d.slotName}`.toLowerCase().includes(dropQuery.trim().toLowerCase()));
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);
  useEffect(() => {
    const nav = nodeNav.current;
    const selected = nav?.querySelector('[aria-pressed="true"]');
    if (!nav || !selected) return;
    const bounds = nav.getBoundingClientRect();
    const button = selected.getBoundingClientRect();
    // Keep the active tab visible without scrolling the whole dialog vertically.
    if (button.left < bounds.left) nav.scrollLeft += button.left - bounds.left;
    else if (button.right > bounds.right) nav.scrollLeft += button.right - bounds.right;
  }, [index]);
  function selectNode(next: number) { setIndex(next); setDropQuery(""); }
  return <dialog className="stage-dialog" ref={dialog} aria-labelledby="stage-detail-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}>
    <header className="stage-dialog-header">
      {map.image && <img src={map.image} alt="" data-kind={map.imageKind} />}
      <div><p>{catalog.categories.find((c) => c.id === map.category)?.name ?? "客户端附录"} / {map.volume ? `第 ${map.volume} 卷 · ` : ""}{map.group}{mapSubgroup(map) && ` / ${mapSubgroup(map)}`}</p><h2 id="stage-detail-title">{mapTitle(map)}</h2><small>{map.nodes.length} 个战斗节点 · 敌方等级 {map.levels[0]}{map.levels[1] !== map.levels[0] ? `—${map.levels[1]}` : ""}</small></div>
      <button type="button" className="stage-close" onClick={onClose} aria-label="关闭地图详情">×</button>
    </header>
    <div className="stage-dialog-content">
      <div className={`stage-admission-grid${hasTotalIncome ? "" : " is-controls-only"}`}>
        {!hasTotalIncome ? <div className="stage-detail-income-controls"><IncomeControls catalog={catalog.income} settings={settings} onChange={onSettingsChange} saved={saved} showProgress={showProgress} />{!mergeCurrencies && <IncomeCaveat result={totalIncome} />}</div> : <section className="stage-income-panel" aria-label="地图总收益">
          <div className="stage-income-heading"><h4>地图总收益</h4><span>各节点各结算一次 · 固定收益</span></div>
          <IncomeControls catalog={catalog.income} settings={settings} onChange={onSettingsChange} saved={saved} showProgress={showProgress} />
          <IncomeValues result={totalIncome} catalog={catalog.income} hideZeroExperience={hideZeroExperience} />
          <IncomeCaveat result={totalIncome} />
          <p className="stage-note">按所选{showProgress ? "进度和评价" : "评价"}汇总，不扣除入场消耗，不含随机道具折价或临时加成。</p>
        </section>}
        <EntryRequirements map={map} />
      </div>
      <div className="stage-battle-grid">
        <div className="stage-enemy-column">
          {hasNodeIncome && map.nodes.length > 1 && <section className="stage-node-income" aria-label="当前节点收益"><h4>本节点收益</h4><IncomeValues result={nodeIncome[node.id]} catalog={catalog.income} hideZeroExperience={hideZeroExperience} /><IncomeCaveat result={nodeIncome[node.id]} /></section>}
          <section className="stage-panel stage-enemy-panel" aria-label="敌人配置">
            <div className="stage-panel-title"><h4>敌人配置</h4><span>{node.enemies.length} 个单位</span></div>
            <div className="stage-node-heading">
              <div><h3>{node.name === "战斗节点" ? `第 ${index + 1} 战` : node.name}</h3></div>
              <nav ref={nodeNav} className="stage-node-nav" aria-label="战斗节点">
                {map.nodes.map((id, i) => <button type="button" key={id} aria-pressed={i === index} onClick={() => selectNode(i)}><b>{String(i + 1).padStart(2, "0")}</b><span>{catalog.nodes[id].name}</span></button>)}
              </nav>
              <div className="stage-node-pager"><button type="button" disabled={index === 0} onClick={() => selectNode(index - 1)} aria-label="上一个战斗节点">←</button><span>{index + 1} / {map.nodes.length}</span><button type="button" disabled={index === map.nodes.length - 1} onClick={() => selectNode(index + 1)} aria-label="下一个战斗节点">→</button></div>
            </div>
            <div className="stage-enemy-grid">{node.enemies.map((placement, i) => {
              const enemy = catalog.enemies[placement.id];
              return <article className="stage-enemy" key={`${placement.id}-${i}`}>
                <div className="stage-enemy-portrait"><img loading="lazy" src={enemy.image} alt={enemy.name} /><b>Lv.{enemy.level}</b></div>
                <div className="stage-enemy-info"><strong>{enemy.name}</strong><span>{enemy.classIcon && <img src={enemy.classIcon} alt="" />}{enemy.className}</span></div>
              </article>;
            })}</div>
          </section>
        </div>
        <section className="stage-panel stage-terrain-panel" aria-label="地形配置">
          <div className="stage-terrain-summary">
            <div className="stage-terrain-name">{terrain.image && <img src={terrain.image} alt="" />}<div><small>作战地形</small><h4>{terrain.name}</h4></div></div>
            <div className="stage-terrain-ranges"><span className="stage-range-phases">炮击 → 接近 → 缠斗</span>
              <div className="stage-range stage-distance"><img src={terrain.distanceIcon} alt="" /><span>作战距离<strong>{terrain.distances.join(" → ")} <small>m</small></strong></span></div>
              <div className="stage-range stage-altitude"><img src={terrain.altitudeIcon} alt="" /><span>作战高度 · 空钢<strong>{terrain.altitudes.join(" → ")} <small>m</small></strong></span></div>
            </div>
          </div>
          <h5>地形效果 / Debuff</h5>
          <div className="stage-effects">{terrain.effects.map((effect, i) => <div key={`${effect.name}-${i}`}><b><img src={effect.image} alt="" />{effect.name}</b><p>{effect.description}</p></div>)}</div>
        </section>
      </div>
      <section className="stage-panel stage-drop-panel" aria-label="掉落列表">
        <div className="stage-panel-title"><h4>可能掉落 <small>{allDrops.length} 种</small></h4>{allDrops.length > 12 && <input aria-label="筛选掉落物品" value={dropQuery} onChange={(e) => setDropQuery(e.target.value)} placeholder="查找物品 / 舞装 / 部位" />}</div>
        <p className="stage-note">保留所有可能掉落，并标注可掉落评价；满足评价不代表必掉，活动等条件仍需满足。经验道具隐藏，{mergeCurrencies ? "非零银币、密码子奖励合并于下方，数量按所选评价计算。" : hasTotalIncome ? "常规结算资源见上方收益。" : "为零的固定收益已隐藏。"}</p>
        {mergeCurrencies && <IncomeCaveat result={nodeIncome[node.id]} />}
        {drops.length ? <div className="stage-drops">{drops.map((drop) => {
          const ranges = drop.ranges;
          const eligible = scoreAllows(ranges, settings.score);
          return <article key={drop.id} data-reward={drop.id} data-kind={drop.kind} title={`${drop.name}${drop.slotName ? `（${drop.slotName}）` : ""}`}><RewardIcon reward={drop} /><div><strong>{drop.name}{drop.amount !== undefined && <b className="stage-drop-amount"> ×{drop.amount.toLocaleString()}</b>}</strong><small>{drop.kind}{drop.slotName && <span className="stage-drop-slot">{drop.slotIcon && <img src={drop.slotIcon} alt="" />}{drop.slotName}</span>}</small><span className="stage-drop-grades" data-eligible={eligible}>评价 {dropGradeLabels(ranges, catalog.income).join(" / ")}</span>{!eligible && <span className="stage-drop-unavailable">当前评价不可掉落</span>}</div></article>;
        })}</div> : <p className="stage-empty">{dropQuery ? "没有匹配的掉落物品" : node.hasRewardConfig ? "该节点没有符合展示条件的掉落（已隐藏经验道具与常规结算资源）。" : "客户端未配置该节点的物品掉落。"}</p>}
      </section>
      <p className="stage-source-note">节点 #{node.id} · 地形 #{terrain.id} · 本地客户端静态配置，活动开放状态以游戏内为准。</p>
    </div>
  </dialog>;
}

export default function StageArchive({ section = "maps" }: { section?: "maps" | "yield" }) {
  const [catalog, setCatalog] = useState<StageCatalog | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  const [group, setGroup] = useState("全部");
  const [subgroup, setSubgroup] = useState("");
  const [volume, setVolume] = useState(0);
  const [query, setQuery] = useState("");
  const [simulation, setSimulation] = useState(false);
  const [selectedMap, setSelectedMap] = useState<StageMap | null>(null);
  const [limit, setLimit] = useState(48);
  const [incomeSettings, setIncomeSettings] = useState<IncomeSettings>(DEFAULT_INCOME_SETTINGS);
  const [incomeSaved, setIncomeSaved] = useState(true);
  useEffect(() => {
    let cancelled = false;
    loadStageCatalog().then((data) => { if (!cancelled) { setIncomeSettings(readIncomeSettings(data.income)); setCatalog(data); } }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "关卡数据加载失败"); });
    return () => { cancelled = true; };
  }, [attempt]);
  useEffect(() => {
    if (!catalog) return;
    function updateFromStorage(event: StorageEvent) {
      if (event.key === INCOME_STORAGE_KEY || event.key === null) setIncomeSettings(readIncomeSettings(catalog!.income));
    }
    window.addEventListener("storage", updateFromStorage);
    return () => window.removeEventListener("storage", updateFromStorage);
  }, [catalog]);
  function changeIncomeSettings(value: IncomeSettings) {
    if (!catalog) return;
    const next = normalizeIncomeSettings(value, catalog.income);
    setIncomeSettings(next);
    try { localStorage.setItem(INCOME_STORAGE_KEY, JSON.stringify(next)); setIncomeSaved(true); }
    catch { setIncomeSaved(false); }
  }
  const nodeIncome = useMemo(() => catalog ? Object.fromEntries(Object.values(catalog.nodes).map((node) => [node.id, calculateNodeIncome(node.income, catalog.income, incomeSettings)])) : {}, [catalog, incomeSettings]);
  const category = catalog?.categories.find((c) => c.id === categoryId);
  const maps = useMemo(() => catalog?.maps.filter((m) => m.category === categoryId && !(m.simulation && (categoryId === "assault" || categoryId === "air"))) ?? [], [catalog, categoryId]);
  const groups = useMemo(() => [...new Set(maps.map((m) => m.group))], [maps]);
  const subgroups = useMemo(() => [...new Set(maps.filter((m) => m.group === group).map(mapSubgroup).filter(Boolean))], [maps, group]);
  const filtered = useMemo(() => maps.filter((m) => (group === "全部" || m.group === group) && (!subgroup || mapSubgroup(m) === subgroup) && (!volume || m.volume === volume) && m.simulation === simulation && (!query.trim() || `${m.name} ${m.code} ${mapSubgroup(m)} ${m.nodes.map((id) => catalog?.nodes[id].name).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()))), [maps, group, subgroup, volume, simulation, query, catalog]);
  const sections = useMemo(() => {
    const sections = new Map<string, StageMap[]>();
    for (const map of filtered.slice(0, limit)) {
      const key = categoryId === "event" ? (mapSubgroup(map) || map.group) : "";
      if (!sections.has(key)) sections.set(key, []);
      sections.get(key)!.push(map);
    }
    return [...sections];
  }, [filtered, limit, categoryId]);
  function chooseCategory(id: string) { setCategoryId(id); setGroup(id === "campaign" ? "主线战役" : id === "event" ? "资源行动" : "全部"); setSubgroup(""); setVolume(0); setQuery(""); setSimulation(false); setLimit(48); }
  if (error) return <section className="stage-archive stage-empty" role="alert"><h2>关卡加载失败</h2><p>{error}</p><button type="button" onClick={() => { setError(""); setAttempt((a) => a + 1); }}>重新加载</button></section>;
  if (!catalog) return <section className="stage-archive stage-empty" role="status">正在装载关卡、敌人及地形档案…</section>;
  return <section className="stage-archive" aria-label="关卡档案">
    <div className="stage-archive-heading"><div><p className="stage-kicker">{section === "yield" ? "OPERATIONS YIELD" : "OPERATIONS ARCHIVE"}</p><h1>{section === "yield" ? "收益一览" : <>关卡一览{category && <span> / {category.name}</span>}{categoryId === "appendix" && <span> / 客户端附录</span>}</>}</h1><p>{section === "yield" ? "从捷径 1 到最后一张地图，对照燃油、资源收益与装备掉落。" : categoryId ? "选择地图，查看进入条件及各节点的敌人、地形与掉落。" : "从一次出击开始，查阅每一片战场。"}</p></div>{section === "maps" && (categoryId ? <button type="button" className="stage-back" onClick={() => chooseCategory("")}>← 返回关卡分类</button> : <span className="stage-total">6 类作战 · {catalog.meta.sourceNodes.toLocaleString()} 个节点</span>)}</div>
    <div className="stage-global-income"><IncomeControls catalog={catalog.income} settings={incomeSettings} onChange={changeIncomeSettings} saved={incomeSaved} /></div>
    {section === "yield" ? <StageYieldOverview catalog={catalog} nodeIncome={nodeIncome} settings={incomeSettings} onOpenMap={setSelectedMap} /> : !categoryId ? <>
      <div className="stage-category-grid">{catalog.categories.map((c, i) => <button type="button" key={c.id} className={`stage-category stage-category-${c.id}`} onClick={() => chooseCategory(c.id)} aria-label={`浏览${c.name}`}>
        <span className="stage-category-art"><img src={c.image} alt="" /><img className="stage-category-title" src={c.titleImage} alt="" /></span>
        <span className="stage-category-caption"><span><small>OPERATION {String(i + 1).padStart(2, "0")}</small><strong>{c.name}</strong><em>{c.description}</em></span><b>↗</b></span>
        <span className="stage-category-count">{c.mapCount} 张地图 <i>·</i> {c.nodeCount} 个节点</span>
      </button>)}</div>
      <div className="stage-archive-footnote"><span>包含客户端已收录的关卡及历史活动；不代表所有活动当前开放。</span><button type="button" onClick={() => chooseCategory("appendix")}>查看演示、隐藏及未归类节点 →</button></div>
    </> : <>
      <div className="stage-filters">
        {categoryId === "campaign" ? <div className="stage-pills" aria-label="战役类型">{["主线战役", "特殊任务", "战役捷径"].map((g) => <button type="button" key={g} aria-pressed={group === g} onClick={() => { setGroup(g); setVolume(0); setLimit(48); }}>{g}</button>)}</div> : groups.length > 1 && !maps.some((m) => m.simulation) && <label>行动类型<select value={group} onChange={(e) => { setGroup(e.target.value); setSubgroup(""); setLimit(48); }}><option>全部</option>{groups.map((g) => <option key={g}>{g}</option>)}</select></label>}
        {maps.some((m) => m.simulation) && <div className="stage-pills" aria-label="关卡模式"><button type="button" aria-pressed={!simulation} onClick={() => { setSimulation(false); setLimit(48); }}>普通关卡</button><button type="button" aria-pressed={simulation} onClick={() => { setSimulation(true); setLimit(48); }}>模拟关卡</button></div>}
        <input aria-label="搜索关卡" type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(48); }} placeholder="搜索地图或战斗节点名称…" />
      </div>
      {categoryId === "event" && subgroups.length > 0 && <nav className="stage-output-filters stage-pills" aria-label={group === "资源行动" ? "产出分组" : "挑战分组"}><button type="button" aria-pressed={!subgroup} onClick={() => { setSubgroup(""); setLimit(48); }}>{group === "资源行动" ? "全部产出" : "全部分组"}</button>{subgroups.map((name) => <button type="button" key={name} aria-pressed={subgroup === name} onClick={() => { setSubgroup(name); setLimit(48); }}>{name}</button>)}</nav>}
      {((categoryId === "campaign" && group === "主线战役") || categoryId === "messenger") && <nav className="stage-volumes" aria-label="卷数"><button type="button" aria-pressed={!volume} onClick={() => { setVolume(0); setLimit(48); }}>全部</button>{Array.from({ length: categoryId === "campaign" ? 26 : 18 }, (_, i) => i + 1).map((v) => <button type="button" key={v} aria-pressed={volume === v} onClick={() => { setVolume(v); setLimit(48); }}>第 {v} 卷</button>)}</nav>}
      <div className="stage-list-summary" aria-live="polite"><span>{filtered.length} 张地图 <i> / </i> {filtered.reduce((sum, m) => sum + m.nodes.length, 0)} 个战斗节点</span>{simulation && <small>模拟关卡与普通关卡分别展示</small>}</div>
      {filtered.length ? sections.map(([heading, maps]) => <div className="stage-map-section" key={heading}>{heading && <h2>{heading}</h2>}<div className="stage-map-grid">{maps.map((map) => <button type="button" key={map.id} className="stage-map-card" onClick={() => setSelectedMap(map)} aria-label={`查看地图 ${map.name}`}>
        <span className="stage-map-art" data-kind={map.imageKind}>{map.image ? <img loading="lazy" src={map.image} alt="" /> : <span className="stage-map-placeholder">地图影像未配置</span>}<span className="stage-map-topline"><span className="stage-map-code">{map.volume ? `第 ${map.volume} 卷 · ${map.code}` : map.group}{map.simulation && " · 模拟"}</span><EntryCosts map={map} compact /></span>{map.imageKind === "terrain" && <span className="stage-map-image-kind">地形示意</span>}<span className="stage-map-node-count">{map.nodes.length} 个节点</span></span>
        <span className="stage-map-caption"><strong>{mapTitle(map)}</strong><span>Lv.{map.levels[0]}{map.levels[1] !== map.levels[0] ? `—${map.levels[1]}` : ""}<b>查看 →</b></span></span>
        <MapDropPreview map={map} catalog={catalog} settings={incomeSettings} />
        <MapIncome map={map} catalog={catalog.income} nodeIncome={nodeIncome} />
      </button>)}</div></div>) : <div className="stage-empty"><h3>没有匹配的关卡</h3><p>试试其他名称，或清除当前卷数限制。</p><button type="button" onClick={() => { setQuery(""); setVolume(0); }}>清除搜索及卷数</button></div>}
      {limit < filtered.length && <button type="button" className="stage-more" onClick={() => setLimit((l) => l + 48)}>继续显示 {Math.min(48, filtered.length - limit)} 张地图 ↓</button>}
    </>}
    {selectedMap && <MapDetail key={selectedMap.id} map={selectedMap} catalog={catalog} onClose={() => setSelectedMap(null)} settings={incomeSettings} onSettingsChange={changeIncomeSettings} saved={incomeSaved} nodeIncome={nodeIncome} />}
  </section>;
}
