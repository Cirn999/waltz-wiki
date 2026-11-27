"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./craft-trait-tooltip.css";

let activeTooltip: { id: string; hide: () => void } | null = null;

export default function CraftTraitTooltip({ name, description, children, className = "" }: { name: string; description: string; children: ReactNode; className?: string }) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; timer: number | null; fired: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const hide = () => {
    if (activeTooltip?.id === id) activeTooltip = null;
    setOpen(false); setPosition(null);
  };
  const show = () => {
    if (!description) return;
    if (activeTooltip?.id !== id) activeTooltip?.hide();
    activeTooltip = { id, hide };
    setOpen(true);
  };
  const cancelTimer = () => { if (press.current?.timer !== null && press.current?.timer !== undefined) window.clearTimeout(press.current.timer); };

  useEffect(() => () => {
    if (press.current?.timer !== null && press.current?.timer !== undefined) window.clearTimeout(press.current.timer);
    if (activeTooltip?.id === id) activeTooltip = null;
  }, [id]);
  useLayoutEffect(() => {
    if (!open || !anchor.current || !tooltip.current) return;
    const place = () => {
      const source = anchor.current!.getBoundingClientRect();
      const tip = tooltip.current!.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(source.left + source.width / 2 - tip.width / 2, window.innerWidth - tip.width - 8)),
        top: source.bottom + tip.height + 16 <= window.innerHeight ? source.bottom + 8 : Math.max(8, source.top - tip.height - 8),
      });
    };
    place();
    const dismiss = () => {
      if (activeTooltip?.id === id) activeTooltip = null;
      setOpen(false); setPosition(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      dismiss();
    };
    const outside = (event: PointerEvent) => { if (!anchor.current?.contains(event.target as Node)) dismiss(); };
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("keydown", escape, true);
    document.addEventListener("pointerdown", outside, true);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("keydown", escape, true);
      document.removeEventListener("pointerdown", outside, true);
    };
  }, [open, description, id]);

  return <>
    <span ref={anchor} className={`craft-trait ${className}${description ? " has-description" : ""}`} data-trait-name={name} data-trait-description={description || undefined}
      tabIndex={description ? 0 : undefined} aria-describedby={open && description ? id : undefined}
      onPointerEnter={(event) => { if (event.pointerType === "mouse") show(); }}
      onPointerLeave={(event) => { if (event.pointerType === "mouse") hide(); }}
      onFocus={() => { if (!press.current) show(); }} onBlur={() => { cancelTimer(); press.current = null; hide(); }}
      onPointerDown={(event) => {
        cancelTimer(); press.current = null;
        if (event.pointerType === "mouse" || !description) return;
        const current = { x: event.clientX, y: event.clientY, timer: null as number | null, fired: false };
        current.timer = window.setTimeout(() => { current.fired = true; current.timer = null; show(); }, 450);
        press.current = current;
      }}
      onPointerMove={(event) => {
        if (event.pointerType === "mouse") { show(); return; }
        const current = press.current;
        if (current && Math.hypot(event.clientX - current.x, event.clientY - current.y) > 10) {
          cancelTimer(); press.current = null; hide();
        }
      }}
      onPointerUp={() => { cancelTimer(); if (press.current && !press.current.fired) press.current = null; }}
      onPointerCancel={() => { cancelTimer(); press.current = null; hide(); }}
      onClickCapture={(event) => { if (press.current?.fired) { event.preventDefault(); event.stopPropagation(); press.current = null; } }}
      onContextMenu={(event) => { if (description) event.preventDefault(); }}>
      {children}
    </span>
    {open && description && createPortal(<div ref={tooltip} id={id} role="tooltip" className="craft-trait-tooltip share-export-hide" style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}>
      <strong>{name}</strong><p>{description}</p>
    </div>, document.body)}
  </>;
}
