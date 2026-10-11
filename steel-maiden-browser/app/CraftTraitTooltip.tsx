"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./craft-trait-tooltip.css";

export default function CraftTraitTooltip({ name, description, children }: { name: string; description: string; children: ReactNode }) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const show = () => { if (description) setOpen(true); };
  const hide = () => { setOpen(false); setPosition(null); };

  useLayoutEffect(() => {
    if (!open || !anchor.current || !tooltip.current) return;
    // Measure the rendered text so long client descriptions also fit at viewport edges.
    const place = () => {
      const source = anchor.current!.getBoundingClientRect();
      const tip = tooltip.current!.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(source.left + source.width / 2 - tip.width / 2, window.innerWidth - tip.width - 8)),
        top: source.bottom + tip.height + 16 <= window.innerHeight ? source.bottom + 8 : Math.max(8, source.top - tip.height - 8),
      });
    };
    place();
    const dismiss = () => { setOpen(false); setPosition(null); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      dismiss();
    };
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("keydown", escape, true);
    };
  }, [open, description]);

  return <>
    <span ref={anchor} className={`craft-trait${description ? " has-description" : ""}`} data-trait-name={name} data-trait-description={description || undefined} tabIndex={description ? 0 : undefined} aria-describedby={open && description ? id : undefined} onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide}>
      {children}
    </span>
    {open && description && createPortal(<div ref={tooltip} id={id} role="tooltip" className="craft-trait-tooltip share-export-hide" style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}>
      <strong>{name}</strong><p>{description}</p>
    </div>, document.body)}
  </>;
}
