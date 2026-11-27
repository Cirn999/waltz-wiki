"use client";
/* eslint-disable @next/next/no-img-element -- local game nationality icons */

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./nation-filter.css";

type NationOption = { name: string; label?: string; image?: string };
const primaryNations = ["英国", "德国", "苏联", "法国", "美国", "中国", "旅行者"];

export default function NationFilter({ label, options, selected, onToggle }: {
  label: string; options: NationOption[]; selected: string[]; onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const id = useId();
  const primary = primaryNations.flatMap((name) => options.filter((option) => (option.label ?? option.name) === name));
  const others = options.filter((option) => !primary.includes(option));
  const otherSelected = others.filter((option) => selected.includes(option.name));
  useEffect(() => {
    if (!open) return;
    const opener = trigger.current;
    dialog.current?.querySelector<HTMLButtonElement>('.nation-options button[aria-pressed="true"], .nation-options button')?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation(); setOpen(false);
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
    window.addEventListener("keydown", handler, true);
    return () => { window.removeEventListener("keydown", handler, true); if (opener?.isConnected) opener.focus(); };
  }, [open]);
  const optionButton = (option: NationOption, values: string[], toggle: (name: string) => void) => {
    const name = option.label ?? option.name;
    return <button type="button" key={option.name} title={name} aria-label={name} aria-pressed={values.includes(option.name)} className={values.includes(option.name) ? "active" : ""} onClick={() => toggle(option.name)}>{option.image && <img src={option.image} alt="" loading="lazy" />}<span>{name}</span></button>;
  };
  return <div className="rank-filter-row nation-filter-row"><strong><span>{label}</span></strong><div>
    {primary.map((option) => optionButton(option, selected, onToggle))}
    <button ref={trigger} type="button" className={otherSelected.length ? "nation-other-trigger active" : "nation-other-trigger"} aria-label="其他国家" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} title={otherSelected.length ? otherSelected.map((option) => option.label ?? option.name).join("、") : "其他国家"} onClick={() => { setDraft(otherSelected.map((option) => option.name)); setOpen(true); }}><span>其他国家</span>{otherSelected.length ? <b>{otherSelected.length}</b> : <i aria-hidden="true">›</i>}</button>
    {open && createPortal(<div className="nation-filter-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section ref={dialog} id={id} className="nation-filter-dialog" role="dialog" aria-modal="true" aria-labelledby={id + "-title"}>
        <header><h3 id={id + "-title"}>其他国家</h3><button type="button" onClick={() => setOpen(false)} aria-label="关闭其他国家">×</button></header>
        <div className="nation-options">{others.map((option) => optionButton(option, draft, (name) => setDraft((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name])))}</div>
        <footer><button type="button" onClick={() => setDraft([])}>清空</button><span>已选 {draft.length} 项</span><button type="button" onClick={() => setOpen(false)}>取消</button><button type="button" className="nation-confirm" onClick={() => { for (const option of others) if (selected.includes(option.name) !== draft.includes(option.name)) onToggle(option.name); setOpen(false); }}>确定</button></footer>
      </section>
    </div>, document.body)}
  </div></div>;
}
