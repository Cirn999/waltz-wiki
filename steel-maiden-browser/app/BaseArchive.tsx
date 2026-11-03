"use client";
/* eslint-disable @next/next/no-img-element -- original client map and sprites */
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { baseDuration, baseGoodsOffers, type BaseBuilding, type BaseCatalog, type BaseGoods, type BaseResource } from "./baseTypes";
import "./base.css";

let request: Promise<BaseCatalog> | undefined;
function loadBase() {
  if (!request) request = fetch("/data/base-catalog.json").then(async r => {
    if (!r.ok) throw new Error("根据地资料加载失败，请重试。");
    const d = await r.json() as BaseCatalog;
    if (d.schemaVersion !== 2 || d.buildings?.length !== 8 || !Array.isArray(d.military) || !Array.isArray(d.port?.goods) || !d.port.ui?.tile || d.port.goods.some(g => !g.shop?.image)) throw new Error("根据地资料不完整，请重试。");
    return d;
  }).catch((e: unknown) => { request = undefined; throw e; });
  return request;
}
type Section = "upgrades" | "effects" | "military";
const sectionName = (s: Section, id: number) => s === "upgrades" ? "建造／升级条件" : s === "military" ? "军旅明细" : id === 18505 ? "等级效果与物资" : "等级效果";
const sections = (b: BaseBuilding): Section[] => b.id === 18506 ? ["upgrades", "effects", "military"] : ["upgrades", "effects"];
const num = (n: number) => n.toLocaleString("zh-CN");
const match = (text: string, q: string) => q.trim().toLocaleLowerCase().split(/\s+/).every(w => text.toLocaleLowerCase().includes(w));

function Resource({ value }: { value: BaseResource }) {
  return <span className="base-resource">{value.image && <img src={value.image} alt="" loading="lazy" />}<span>{value.name}{value.amount !== undefined && <b> ×{num(value.amount)}</b>}{value.description && <small>{value.description}</small>}</span></span>;
}

function Upgrades({ building: b }: { building: BaseBuilding }) {
  const [from, setFrom] = useState(0), [to, setTo] = useState(b.maxLevel);
  const chosen = b.upgrades.filter(u => u.from >= from && u.to <= to);
  const costs = new Map<string, BaseResource>();
  for (const u of chosen) for (const c of u.costs) {
    const old = costs.get(c.name); costs.set(c.name, { ...c, amount: (old?.amount ?? 0) + (c.amount ?? 0) });
  }
  return <>
    <div className="base-range"><label>起始等级<select value={from} onChange={e => { const n = +e.target.value; setFrom(n); setTo(v => Math.max(v, n + 1)); }}>{Array.from({ length: b.maxLevel }, (_, n) => <option key={n} value={n}>{n === 0 ? "未建造" : n + "级"}</option>)}</select></label><span aria-hidden="true">→</span><label>目标等级<select value={to} onChange={e => setTo(+e.target.value)}>{Array.from({ length: b.maxLevel - from }, (_, n) => n + from + 1).map(n => <option key={n} value={n}>{n}级</option>)}</select></label>
      <div className="base-total"><span>区间合计</span>{[...costs.values()].map(c => <Resource key={c.name} value={c} />)}<strong>{baseDuration(chosen.reduce((s, u) => s + u.seconds, 0))}</strong></div>
    </div>
    <p className="base-note">高亮行为所选升级区间。耗时为配置基础耗时，所有前置需同时满足。</p>
    <div className="base-table-wrap" tabIndex={0} role="region" aria-label={b.name + "建造升级表"}>
      <table className="base-table base-upgrade-table"><thead><tr><th>等级变化</th><th>前置要求</th><th>资源消耗</th><th>基础耗时</th></tr></thead><tbody>{b.upgrades.map(u => <tr key={u.id} data-upgrade-level={u.to} className={u.from >= from && u.to <= to ? "base-range-row" : ""}><th scope="row">{u.from === 0 ? "建造" : u.from + "级"} <span>→</span> {u.to}级</th><td>{u.requirements.length ? <ul>{u.requirements.map(r => <li key={r}>{r}</li>)}</ul> : <span className="base-muted">无额外前置</span>}</td><td>{u.costs.length ? u.costs.map((c, i) => <Resource key={i} value={c} />) : "免费"}</td><td className="base-time">{baseDuration(u.seconds)}</td></tr>)}</tbody></table>
    </div>
  </>;
}

function Effects({ building: b, data }: { building: BaseBuilding; data: BaseCatalog }) {
  if (b.id === 18505) return <Port data={data} />;
  return <>
    <div className="base-notes">{b.notes.map(n => <p key={n}>{n}</p>)}</div>
    {b.columns.length > 0 && <div className="base-table-wrap" tabIndex={0} role="region" aria-label={b.name + "逐级效果表"}><table className="base-table base-effects-table"><thead><tr><th>等级</th>{b.columns.map(c => <th key={c.key}>{c.label}{c.unit && <small>{c.unit}</small>}</th>)}{b.id === 18506 && <><th>开放军旅组数</th><th>活动候选累计</th></>}</tr></thead><tbody>{b.effects.map(l => { const military = data.militaryLevels.find(m => m.level === l.level); return <tr key={l.level}><th scope="row">{l.level}级</th>{b.columns.map(c => <td key={c.key}>{l.values[c.key] === undefined ? "—" : num(l.values[c.key])}</td>)}{b.id === 18506 && <><td>{military?.groups}</td><td>{military?.activities}</td></>}</tr>; })}</tbody></table></div>}
    {b.id === 18509 && <div className="base-table-wrap"><table className="base-table"><thead><tr><th>等级</th><th>已确认效果</th></tr></thead><tbody><tr><th scope="row">1级</th><td>开放航空相关黑科技入口；相关规则另需指挥官30级。</td></tr><tr><th scope="row">2级</th><td>当前配置未列出新增效果。</td></tr><tr><th scope="row">3级</th><td>当前配置未列出新增效果。</td></tr></tbody></table></div>}
    {b.unlocks.length > 0 && <section className="base-unlocks"><h3>建筑解锁与升级前置</h3><p className="base-note">达到以下等级后放宽对应建筑的前置，建造与升级仍需满足各自的其他要求和消耗。</p><div className="base-table-wrap" tabIndex={0}><table className="base-table"><thead><tr><th>{b.name}等级</th><th>允许建造／升级至</th></tr></thead><tbody>{Array.from({ length: b.maxLevel }, (_, i) => i + 1).flatMap(l => { const rows = b.unlocks.filter(u => u.level === l); return rows.length ? [<tr key={l}><th scope="row">{l}级</th><td><div className="base-unlock-tags">{rows.map((u, i) => <span key={i}>{u.building} <b>{u.targetLevel}级</b></span>)}</div></td></tr>] : []; })}</tbody></table></div></section>}
  </>;
}

function Port({ data }: { data: BaseCatalog }) {
  const [level, setLevel] = useState(8), [query, setQuery] = useState(""), [kind, setKind] = useState("");
  const stats = data.port.levels.find(l => l.level === level)!;
  const goods = useMemo(() => data.port.goods.filter(g => g.offers.some(o => o.purchaseLevel <= level) && (!kind || g.kind === kind) && match(g.name + " " + g.kind, query)), [data, level, query, kind]);
  return <>
    <div className="base-notes"><p>格数按客户端购买前置核定。购买前置仅表示客户端允许执行购买的条件，不代表该等级能刷出该物资。</p></div>
    <div className="base-table-wrap" tabIndex={0} aria-label="军港逐级开放表"><table className="base-table base-port-levels"><thead><tr><th>军港等级</th><th>开放格数</th><th>银币调配方案数</th><th>购买配置候选</th></tr></thead><tbody>{data.port.levels.map(l => <tr key={l.level} className={level === l.level ? "base-range-row" : ""}><th><button type="button" aria-pressed={level === l.level} onClick={() => setLevel(l.level)}>{l.level}级</button></th><td>{l.slots}</td><td>{l.silverRefreshCosts.length}</td><td>{l.goods}</td></tr>)}</tbody></table></div>
    <div className="base-port-summary"><strong>{level}级军港 · {stats.slots}格</strong><span>免费调配冷却8小时 · 源铁调配60源铁</span><details><summary>查看银币调配消耗</summary><p>每个方案冷却24小时，当前等级开放 {stats.silverRefreshCosts.length} 个方案。</p><div className="base-cost-chips">{stats.silverRefreshCosts.map((n, i) => <span key={i}>方案{i + 1} <b>{num(n)}银币</b></span>)}</div></details></div>
    <div className="base-filters"><label>购买前置筛选<select aria-label="购买前置等级筛选" value={level} onChange={e => setLevel(+e.target.value)}>{data.port.levels.map(l => <option key={l.level} value={l.level}>≤ {l.level}级</option>)}</select></label><label className="base-search">物资检索<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索物资、设备或卡牌…" /></label><label>类别<select value={kind} onChange={e => setKind(e.target.value)}><option value="">全部</option><option>物资</option><option>卡牌</option></select></label></div>
    <p className="base-results" role="status">购买前置 ≤ {level}级 · 找到 <b>{goods.length}</b> 种物资候选 · 相同数量与价格合并</p>
    <div className="base-sale-grid" role="list" aria-label="军港物资售卖图标">{goods.map(g => <PortGood key={g.key} item={g} level={level} tile={data.port.ui.tile} />)}</div>
    {!goods.length && <p className="base-empty">没有符合条件的物资，请调整等级或关键词。</p>}
  </>;
}
function PortGood({ item, level, tile }: { item: BaseGoods; level: number; tile: string }) {
  const offers = baseGoodsOffers(item.offers).filter(o => o.purchaseLevel <= level);
  return <>{offers.map((o, i) => <article key={i} className="base-sale-offer" role="listitem" aria-label={item.name + "，数量" + o.amount}>
    <div className="base-sale-card" style={{ backgroundImage: 'url("' + tile + '")' }}>
      <strong className="base-sale-name" title={item.name}>{item.name}</strong>
      <div className={"base-sale-icon " + (item.kind === "卡牌" ? "base-sale-card-icon" : "") + (item.key.startsWith("0:") ? " base-sale-experience" : "")} style={{ backgroundImage: 'url("' + item.shop.frame + '")' }}>
        {item.shop.backdrop && <img className="base-sale-backdrop" src={item.shop.backdrop} alt="" loading="lazy" />}
        <img className="base-sale-picture" src={item.shop.image} alt="" loading="lazy" />
        {item.shop.grade && <span className="base-sale-grade">{item.shop.grade}</span>}
        {o.amount > 1 && <b className="base-sale-quantity">{num(o.amount)}</b>}
      </div>
      <div className="base-sale-price" aria-label={"价格：" + o.costs.map(c => c.name + (c.amount ?? 0)).join("、")}>{o.costs.map((c, j) => <span key={j}><img src={c.image} alt={c.name} loading="lazy" /><b>{num(c.amount ?? 0)}</b></span>)}</div>
    </div>
  </article>)}</>;
}

function Military({ data }: { data: BaseCatalog }) {
  const [station, setStation] = useState(7), [talent, setTalent] = useState(""), [recommended, setRecommended] = useState(0), [query, setQuery] = useState("");
  const talents = [...new Set(data.military.flatMap(w => w.bonuses.map(b => b.talent)))];
  const rows = useMemo(() => data.military.filter(w => w.stationLevel <= station && (!talent || w.bonuses.some(b => b.talent === talent)) && (!recommended || w.recommendedLevel <= recommended) && match([w.name, ...w.rewards.map(r => r.name), ...w.bonuses.map(b => b.talent + " " + b.reward.name)].join(" "), query)), [data, station, talent, recommended, query]);
  return <>
    <div className="base-notes"><p>推荐等级是建议值。等级影响成功率与基础奖励，才艺用于追加奖励且不影响成功率。奖励数量沿用游戏原文，不换算为固定收益。</p></div>
    <div className="base-filters"><label>服务站等级<select value={station} onChange={e => setStation(+e.target.value)}>{data.militaryLevels.map(l => <option key={l.level} value={l.level}>{l.level}级 · {l.activities}项</option>)}</select></label><label>才艺方向<select value={talent} onChange={e => setTalent(e.target.value)}><option value="">全部才艺</option>{talents.map(t => <option key={t}>{t}</option>)}</select></label><label>推荐等级<select value={recommended} onChange={e => setRecommended(+e.target.value)}><option value={0}>不限</option>{[...new Set(data.military.map(w => w.recommendedLevel))].sort((a, b) => a - b).map(n => <option key={n} value={n}>≤ {n}级</option>)}</select></label><label className="base-search">活动检索<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索军旅、奖励或才艺…" /></label></div>
    <p className="base-results" role="status">找到 <b>{rows.length}</b> 项军旅活动</p>
    {[1, 2, 3, 4, 5, 6].map(group => {
      const activities = rows.filter(w => w.group === group);
      if (!activities.length) return null;
      return <section key={group} className="base-military-group" aria-labelledby={"base-military-group-" + group}>
        <header><h3 id={"base-military-group-" + group}>军旅{group}</h3><span>{activities.length}项活动</span><small>服务站{activities[0].stationLevel}级开放</small></header>
        <div className="base-table-wrap" tabIndex={0} role="region" aria-label={"军旅" + group + "活动明细"}><table className="base-table base-military-table"><thead><tr><th>军旅活动</th><th>开放与推荐</th><th>时长选项</th><th>基础奖励</th><th>才艺追加奖励</th></tr></thead><tbody>{activities.map(w => <tr key={w.id}><th scope="row"><div className="base-activity-name">{w.image && <img src={w.image} alt="" loading="lazy" />}<strong>{w.name}</strong></div>{w.description && <details className="base-original"><summary>游戏原文</summary><p>{w.description}</p></details>}</th><td><span className="base-station-level">服务站{w.stationLevel}级</span><strong className="base-recommend">推荐{w.recommendedLevel}级</strong><small>难度 {w.difficulty}</small></td><td><div className="base-times">{w.times.map(t => <span key={t.seconds}>{t.label}</span>)}</div></td><td><div className="base-reward-list">{w.rewards.map((r, i) => <Resource key={i} value={r} />)}</div></td><td><div className="base-talents">{w.bonuses.map(b => <div key={b.talent}><span className="base-talent-label">{b.image && <img src={b.image} alt="" loading="lazy" />}{b.talent}</span><Resource value={b.reward} /></div>)}</div></td></tr>)}</tbody></table></div>
      </section>;
    })}
    {!rows.length && <p className="base-empty">{station === 1 ? "服务站2级开始开放军旅活动。" : "没有符合条件的军旅活动，请调整筛选。"}</p>}
  </>;
}

function BuildingDialog({ building, initial, data, onClose }: { building: BaseBuilding; initial: Section; data: BaseCatalog; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), body = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState(initial);
  useEffect(() => {
    const d = dialog.current; const overflow = document.body.style.overflow;
    d?.showModal(); document.body.style.overflow = "hidden";
    return () => { d?.close(); document.body.style.overflow = overflow; document.querySelector<HTMLButtonElement>('[data-base-building="' + building.id + '"]')?.focus({ preventScroll: true }); };
  }, [building.id]);
  return createPortal(<dialog ref={dialog} className="base-dialog" aria-labelledby="base-dialog-title" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
    <header className="base-dialog-heading"><img src={building.image} alt="" /><div><small>根据地手册</small><h2 id="base-dialog-title">{building.name}</h2></div><button type="button" className="base-close" onClick={onClose} aria-label="关闭建筑资料">×</button></header>
    <div className="base-dialog-tabs" role="group" aria-label="建筑资料栏目">{sections(building).map(s => <button key={s} type="button" aria-pressed={section === s} onClick={() => { setSection(s); body.current?.scrollTo({ top: 0 }); }}>{sectionName(s, building.id)}</button>)}</div>
    <div className="base-dialog-body" ref={body}>
      {section === "upgrades" && <Upgrades building={building} />}
      {section === "effects" && <Effects building={building} data={data} />}
      {section === "military" && <Military data={data} />}
      <details className="base-description"><summary>建筑说明</summary><p>{building.description}</p></details>
    </div>
  </dialog>, document.body);
}

function BaseMap({ data }: { data: BaseCatalog }) {
  const viewport = useRef<HTMLDivElement>(null), menuRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960), [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<BaseBuilding | null>(null);
  const [panel, setPanel] = useState<{ building: BaseBuilding; section: Section } | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  useEffect(() => { const el = viewport.current; if (!el) return; const observer = new ResizeObserver(() => { setWidth(el.clientWidth); setSelected(null); }); observer.observe(el); setWidth(el.clientWidth); return () => observer.disconnect(); }, []);
  useEffect(() => { if (selected) menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus(); }, [selected]);
  const scale = width / data.map.width * zoom;
  function choose(b: BaseBuilding) {
    const el = viewport.current; if (!el) return;
    const x = b.x * scale - el.scrollLeft, y = (540 - b.y) * scale - el.scrollTop;
    setMenuPos({ x: Math.max(8, Math.min(el.clientWidth - 216, x + 24)), y: Math.max(8, Math.min(el.clientHeight - (b.id === 18506 ? 206 : 166), y - 20)) });
    setSelected(b);
  }
  function changeZoom(next: number) {
    const el = viewport.current; if (!el) return;
    const ratio = next / zoom, x = (el.scrollLeft + el.clientWidth / 2) * ratio - el.clientWidth / 2, y = (el.scrollTop + el.clientHeight / 2) * ratio - el.clientHeight / 2;
    setSelected(null); setZoom(next); requestAnimationFrame(() => { el.scrollLeft = x; el.scrollTop = y; });
  }
  function down(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse" || e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    const el = e.currentTarget; drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }; el.setPointerCapture(e.pointerId); setSelected(null);
  }
  return <section className="base-archive" aria-label="根据地手册">
    <div className="base-map-toolbar"><div><small>手册 / 根据地</small><h1>根据地</h1></div><div className="base-map-tools"><span>点击建筑查阅资料</span><button type="button" disabled={zoom <= 1} onClick={() => changeZoom(Math.max(1, zoom - .5))} aria-label="缩小根据地">−</button><output aria-label="地图缩放">{Math.round(zoom * 100)}%</output><button type="button" disabled={zoom >= 3} onClick={() => changeZoom(Math.min(3, zoom + .5))} aria-label="放大根据地">＋</button><button type="button" onClick={() => { changeZoom(1); viewport.current?.scrollTo({ left: 0, top: 0 }); }}>适应窗口</button></div></div>
    <div className="base-map-frame">
      <div className="base-map-viewport" ref={viewport} tabIndex={0} role="region" aria-label="根据地地图，可放大后拖动" onPointerDown={down} onPointerMove={e => { if (!drag.current) return; e.currentTarget.scrollLeft = drag.current.left + drag.current.x - e.clientX; e.currentTarget.scrollTop = drag.current.top + drag.current.y - e.clientY; }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onScroll={() => setSelected(null)}>
        <div className="base-map-stage" style={{ width: data.map.width * scale, height: data.map.height * scale }}>
          <div className="base-map-world" style={{ transform: 'scale(' + scale + ')' }}>
            <img className="base-map-background" src={data.map.background} alt="" draggable={false} onClick={() => setSelected(null)} />
            <div className="base-map-title"><img src={data.map.title} alt="" draggable={false} /><span>根据地</span></div>
            {data.buildings.map(b => <button key={b.id} type="button" className="base-building" data-base-building={b.id} aria-label={b.name} aria-haspopup="menu" aria-expanded={selected?.id === b.id} onClick={() => selected?.id === b.id ? setSelected(null) : choose(b)} style={{ left: b.x, top: 540 - b.y, width: b.width * .55, height: b.height * .55, zIndex: 600 - b.y }}>
              <img className="base-building-image" src={b.image} alt="" draggable={false} width={b.width} height={b.height} />
              <span className="base-building-name" style={{ backgroundImage: 'url("' + data.map.nameplate + '")' }}>{b.name}</span>
            </button>)}
          </div>
        </div>
      </div>
      {selected && <div className="base-building-menu" ref={menuRef} style={{ left: menuPos.x, top: menuPos.y }} role="menu" aria-label={selected.name + "操作菜单"} onKeyDown={e => {
        const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
        if (e.key === "Escape") { e.preventDefault(); const id = selected.id; setSelected(null); document.querySelector<HTMLButtonElement>('[data-base-building="' + id + '"]')?.focus(); }
        else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) { e.preventDefault(); const i = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
      }}><div><strong>{selected.name}</strong><button type="button" onClick={() => setSelected(null)} aria-label="关闭建筑菜单">×</button></div>{sections(selected).map(s => <button type="button" role="menuitem" key={s} onClick={() => { setPanel({ building: selected, section: s }); setSelected(null); }}>{sectionName(s, selected.id)}<span aria-hidden="true">›</span></button>)}</div>}
    </div>
    <p className="base-map-caption">全部建筑按已建成状态展示 · 放大后可拖动地图 · 建筑资料覆盖全部配置等级</p>
    {panel && <BuildingDialog building={panel.building} initial={panel.section} data={data} onClose={() => setPanel(null)} />}
  </section>;
}

export default function BaseArchive() {
  const [data, setData] = useState<BaseCatalog | null>(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  useEffect(() => { let cancelled = false; loadBase().then(d => { if (!cancelled) setData(d); }).catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "根据地加载失败"); }); return () => { cancelled = true; }; }, [attempt]);
  if (error) return <section className="base-archive base-empty" role="alert"><h1>根据地加载失败</h1><p>{error}</p><button type="button" onClick={() => { setError(""); setAttempt(n => n + 1); }}>重试加载根据地</button></section>;
  if (!data) return <section className="base-archive base-empty" role="status">正在加载根据地…</section>;
  return <BaseMap data={data} />;
}
