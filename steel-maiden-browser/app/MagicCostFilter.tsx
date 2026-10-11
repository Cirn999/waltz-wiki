"use client";
/* eslint-disable @next/next/no-img-element -- original local game sprites */

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./magic-cost-filter.css";

type Props = {
  selected: string[];
  onChange: (selected: string[]) => void;
  counts: Record<string, number>;
  stageIcons: Record<string, string>;
};
const tiers = [{ name: "低", suffix: "-" }, { name: "中", suffix: "" }, { name: "高", suffix: "+" }];

export default function MagicCostFilter({ selected, onChange, counts, stageIcons }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const opener = trigger.current;
    dialog.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"], .magic-cost-option:not(:disabled)')?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(false);
      }
      if (event.key === "Tab") {
        const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && (document.activeElement === first || !dialog.current?.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.current?.contains(document.activeElement))) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    // Capture Escape before the parent filter or detail dialog can close.
    window.addEventListener("keydown", handler, true);
    return () => { window.removeEventListener("keydown", handler, true); if (opener?.isConnected) opener.focus(); };
  }, [open]);
  const toggle = (value: string) => setDraft((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  return <div className="magic-cost-filter">
    <button ref={trigger} type="button" className={`magic-cost-trigger${selected.length ? " active" : ""}`} aria-label="魔改费用筛选" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} title={selected.length ? `魔改费用：${selected.join("、")}` : "魔改费用筛选"} onClick={() => { setDraft([...selected]); setOpen(true); }}>
      魔改费用
    </button>
    {open && createPortal(<div className="magic-cost-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section ref={dialog} id={id} className="magic-cost-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <header><div><h3 id={`${id}-title`}>魔改费用</h3><p>按实际配方分组 · 可多选，符合任一费用组即可</p></div><button type="button" onClick={() => setOpen(false)} aria-label="关闭魔改费用筛选">×</button></header>
        <div className="magic-cost-matrix" role="group" aria-label="魔改费用低中高三行、N1至N6六列">
          {tiers.map((tier) => <div className="magic-cost-tier" key={tier.name}><strong>{tier.name}</strong><div className="magic-cost-options">
            {[1, 2, 3, 4, 5, 6].map((number) => {
              const stage = `N${number}`, group = `${stage}${tier.suffix}`, count = counts[group] ?? 0;
              return <button key={group} type="button" className="magic-cost-option" aria-label={group} aria-pressed={draft.includes(group)} disabled={!count} title={count ? `${group} · ${count} 位钢舞姬` : `${group} · 当前没有对应车辆`} onClick={() => toggle(group)}>
                {stageIcons[stage] && <img src={stageIcons[stage]} alt="" />}<b>{group}</b><small>{count ? `${count} 位` : "—"}</small>
              </button>;
            })}
          </div></div>)}
        </div>
        <p className="magic-cost-note">置灰项暂无对应车辆；空钢包含在各费用组中。</p>
        <footer><button type="button" onClick={() => setDraft([])}>清空</button><span>{draft.length ? `已选 ${draft.length} 项` : "不限费用"}</span><button type="button" onClick={() => setOpen(false)}>取消</button><button type="button" className="magic-cost-confirm" onClick={() => { onChange([...draft]); setOpen(false); }}>确定</button></footer>
      </section>
    </div>, document.body)}
  </div>;
}
