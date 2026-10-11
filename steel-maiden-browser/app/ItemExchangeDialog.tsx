"use client";
/* eslint-disable @next/next/no-img-element -- Native game icons. */
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import TablePortrait from "./TablePortrait";

export type ExchangeMaiden = ComponentProps<typeof TablePortrait>["maiden"];
export type ItemReward = { key: string; name: string; image: string; amount: number; equipmentLevel?: number; maidenId?: number; outfit?: boolean };
export type ItemExchange = { id: number; name: string; image: string; kind: string; rewards: ItemReward[]; costs: ItemReward[]; notes: string[] };

export default function ItemExchangeDialog({ item, offers, maidens, onClose, onOpenMaiden }: {
  item: { id: number; name: string; image: string }; offers: ItemExchange[];
  maidens: ExchangeMaiden[]; onClose: () => void; onOpenMaiden: (id: number) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const maidenMap = useMemo(() => new Map(maidens.map((m) => [m.id, m])), [maidens]);
  const filtered = useMemo(() => {
    const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return offers.filter((o) => words.every((w) => [o.name, o.kind, ...o.rewards.map((r) => r.name), ...o.costs.map((r) => r.name)].join(" ").toLocaleLowerCase().includes(w)));
  }, [offers, query]);
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close(); document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  const openMaiden = (id: number) => { onClose(); onOpenMaiden(id); };
  return createPortal(<dialog ref={dialogRef} className="item-exchange-dialog" aria-labelledby="item-exchange-title"
    onCancel={(e) => { e.preventDefault(); onClose(); }}
    onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } }}>
    <header className="item-exchange-heading">
      {item.image && <img src={item.image} alt="" />}
      <div><h2 id="item-exchange-title">{item.name} · 兑换去向</h2><p>展示每次兑换的所得与全部道具消耗</p></div>
      <button type="button" className="item-exchange-close" onClick={onClose} aria-label="关闭兑换窗口">×</button>
    </header>
    <div className="item-exchange-tools">
      <input type="search" aria-label="搜索兑换内容" placeholder="搜索车辆、道具或所需材料…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <span role="status">{filtered.length} 项</span>
      <p>包含历史兑换配置，不代表当前开放；开放时间、限购次数及解锁条件以游戏为准。不同价格的方案分别保留。</p>
    </div>
    <div className="item-exchange-body" tabIndex={0} aria-label="兑换列表">
      <div className="item-exchange-grid">{filtered.map((o) => <article className={`item-exchange-offer${o.rewards.length <= 1 ? " is-single" : " is-bundle"}`} key={o.id} data-exchange-id={o.id}>
        <header><h3>{o.name}</h3><small>{o.kind}</small></header>
        <div className="item-exchange-outputs" aria-label="兑换所得">
          {o.rewards.length ? o.rewards.map((r) => {
            const maiden = r.maidenId ? maidenMap.get(r.maidenId) : undefined;
            return <div className={`item-exchange-result${maiden ? " is-maiden" : ""}`} key={r.key}>
              {maiden ? <TablePortrait maiden={maiden} onOpen={openMaiden} /> : r.image ? <img className="item-exchange-icon" src={r.image} alt={r.name} loading="lazy" /> : <span className="item-exchange-missing">原版无图</span>}
              <span>{(o.rewards.length > 1 || r.name !== o.name) && r.name}{r.equipmentLevel && <b> S{r.equipmentLevel}</b>}{r.outfit && <em>舞装</em>}<strong>×{r.amount.toLocaleString("zh-CN")}</strong></span>
            </div>;
          }) : <div className="item-exchange-result">{o.image ? <img className="item-exchange-icon" src={o.image} alt={o.name} loading="lazy" /> : <span className="item-exchange-missing">原版图标缺失</span>}</div>}
        </div>
        <section className="item-exchange-costs" aria-label="每次兑换消耗"><h4>每次兑换消耗</h4><div>{o.costs.map((r) => <span className={r.key === `1:${item.id}` ? "is-current" : ""} key={r.key} title={r.name}>
          {r.image ? <img src={r.image} alt="" loading="lazy" /> : <span className="item-exchange-missing">原版无图</span>}<span>{r.name}{r.equipmentLevel && <b> S{r.equipmentLevel}</b>} <strong>×{r.amount.toLocaleString("zh-CN")}</strong></span>
        </span>)}</div></section>
        {o.notes.map((note) => <p className="item-exchange-note" key={note}>{note}</p>)}
      </article>)}</div>
      {!filtered.length && <p className="item-exchange-empty">没有符合条件的兑换内容</p>}
    </div>
  </dialog>, document.body);
}
