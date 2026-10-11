"use client";
/* eslint-disable @next/next/no-img-element -- Original locally exported game sprites. */
import { useEffect, useMemo, useState } from "react";
import ItemExchangeDialog, { type ExchangeMaiden, type ItemExchange } from "./ItemExchangeDialog";
import "./items.css";

type Reward = { key: string; name: string; image: string; amount: number; equipmentLevel?: number };
type Item = { id: number; name: string; image: string; category: number; kind: string; description: string; uses: string[]; fixedRewards: Reward[]; possibleRewards: Reward[]; sale?: { quantity: number; rewards: Reward[]; conditions: string[] } | null; exchangeIds: number[] };
type Catalog = { schemaVersion: number; items: Item[]; exchanges: ItemExchange[] };

function Rewards({ rows }: { rows: Reward[] }) {
  return <div className="item-rewards">{rows.map((r, i) => <span key={`${r.key}:${i}`} title={r.name}>{r.image && <img src={r.image} alt="" loading="lazy" />}<span>{r.name}{r.equipmentLevel && <b> S{r.equipmentLevel}</b>} <strong>×{r.amount.toLocaleString("zh-CN")}</strong></span></span>)}</div>;
}

export default function ItemArchive({ maidens, onOpenMaiden }: { maidens: ExchangeMaiden[]; onOpenMaiden: (id: number) => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(0);
  const [kind, setKind] = useState("");
  const [limit, setLimit] = useState(36);
  const [exchangeItem, setExchangeItem] = useState<Item | null>(null);
  const exchangeMap = useMemo(() => new Map((catalog?.exchanges ?? []).map((e) => [e.id, e])), [catalog]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/item-catalog.json", { signal: controller.signal }).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as Catalog;
      if (data.schemaVersion !== 1 || !Array.isArray(data.items)) throw new Error("道具数据格式不正确");
      setCatalog(data);
    }).catch((e: Error) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [attempt]);
  const rows = useMemo(() => {
    const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return (catalog?.items ?? []).filter((r) => (!category || r.category === category) && (!kind || r.kind === kind)
      && words.every((w) => [r.name, String(r.id), r.description, ...r.uses, ...r.fixedRewards.map((v) => v.name), ...r.possibleRewards.map((v) => v.name), ...(r.sale?.rewards.map((v) => v.name) ?? []), ...(r.sale?.conditions ?? [])].join(" ").toLocaleLowerCase().includes(w)));
  }, [catalog, category, kind, query]);
  const reset = () => { setQuery(""); setCategory(0); setKind(""); setLimit(36); };
  if (error) return <section className="item-archive" role="alert"><h1>道具加载失败</h1><p>{error}</p><button onClick={() => { setError(""); setAttempt((n) => n + 1); }}>重试加载</button></section>;
  if (!catalog) return <section className="item-archive" role="status">正在装载道具档案…</section>;
  return <section className="item-archive" aria-label="道具手册">
    <header className="item-heading"><div><small>ITEM ARCHIVE</small><h1>道具 <span>{catalog.items.length} 种</span></h1><p>原版仓库的资材与活动道具 · 包含历史活动记录，不代表当前开放。</p></div></header>
    <div className="item-controls">
      <div role="group" aria-label="道具分类" className="item-tabs">{[[0, "全部"], [82, "资材"], [99, "活动道具"]].map(([id, name]) => <button key={id} aria-pressed={category === id} onClick={() => { setCategory(Number(id)); setLimit(36); }}>{name}<span>{catalog.items.filter((r) => !id || r.category === id).length}</span></button>)}</div>
      <label className="item-search"><span className="sr-only">搜索道具</span><input type="search" aria-label="搜索道具" placeholder="搜索名称、用途、奖励或道具编号…" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(36); }} /></label>
      <select aria-label="筛选道具用途" value={kind} onChange={(e) => { setKind(e.target.value); setLimit(36); }}><option value="">全部用途</option>{[...new Set(catalog.items.map((r) => r.kind))].map((k) => <option key={k}>{k}</option>)}</select>
      <button onClick={reset}>重置筛选</button>
    </div>
    <div className="item-results" role="status">找到 <b>{rows.length}</b> 种道具</div>
    <div className="item-grid">{rows.slice(0, limit).map((r) => <article key={r.id} className="item-card" data-item-id={r.id}>
      <header><div className="item-icon">{r.image ? <img src={r.image} alt={r.name} loading="lazy" /> : <small title="原版配置使用透明占位图 tm-001">原版无图</small>}</div><div><h2>{r.name}</h2><p>{r.category === 82 ? "资材" : "活动道具"} · {r.kind}</p><small>#{r.id}</small></div></header>
      <div className="item-card-body" tabIndex={0} role="region" aria-label={`${r.name}的用途与奖励`}>
      <div className="item-purpose"><h3>用途</h3>{r.uses.map((u, i) => u.length > 180 ? <details key={i}><summary>查看完整兑换用途</summary><p>{u}</p></details> : <p key={i}>{u}</p>)}</div>
      {r.fixedRewards.length > 0 && <section><h3>使用后获得</h3><Rewards rows={r.fixedRewards} /></section>}
      {r.possibleRewards.length > 0 && <details className="item-random"><summary>随机／条件奖励池 · {r.possibleRewards.length} 项</summary><p>以下为可能结果，不是全部必得；实际结果还受原版奖池及已获得记录等条件影响。</p><Rewards rows={r.possibleRewards} /></details>}
      {r.sale && <section className="item-sale" aria-label="出售所得"><h3>出售{r.sale.quantity}个可获得</h3><Rewards rows={r.sale.rewards} />{r.sale.conditions.map((c) => <p key={c}>出售条件：{c}</p>)}</section>}
      {r.description && !r.uses.includes(r.description) && <details className="item-description"><summary>游戏原文说明</summary><p>{r.description}</p></details>}
      </div>
      {r.exchangeIds?.length > 0 && <button type="button" className="item-exchange-trigger" onClick={() => setExchangeItem(r)}>查看兑换 <span>{r.exchangeIds.length} 项</span><span aria-hidden="true">↗</span></button>}
    </article>)}</div>
    {!rows.length && <div className="item-empty"><p>没有找到符合条件的道具</p><button onClick={reset}>重置筛选</button></div>}
    {rows.length > limit && <div className="item-more"><button onClick={() => setLimit((n) => n + 36)}>继续载入（已显示 {Math.min(limit, rows.length)} / {rows.length}）</button><button onClick={() => setLimit(rows.length)}>显示全部</button></div>}
    {exchangeItem && <ItemExchangeDialog item={exchangeItem} offers={exchangeItem.exchangeIds.map((id) => exchangeMap.get(id)).filter((e): e is ItemExchange => !!e)} maidens={maidens} onClose={() => setExchangeItem(null)} onOpenMaiden={onOpenMaiden} />}
  </section>;
}
