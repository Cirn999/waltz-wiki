"use client";
/* eslint-disable @next/next/no-img-element -- original skin head sprites */

import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { MaidenSkin } from "./maidenSkinData";

export type CardSkinMenuTarget = { id: number; tank: string; x: number; y: number; trigger: HTMLElement | null };

export default function CardSkinMenu({ target, skins, selectedId, loading, error, onSelect, onClose, onRetry }: {
  target: CardSkinMenuTarget; skins: MaidenSkin[]; selectedId: number;
  loading: boolean; error: boolean; onSelect: (skinId: number) => void;
  onClose: () => void; onRetry: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(target.x, window.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(target.y, window.innerHeight - bounds.height - 8))}px`;
    const current = menu.querySelector<HTMLElement>('[aria-checked="true"]') ?? menu.querySelector<HTMLElement>("button") ?? menu;
    current.focus({ preventScroll: true });
  }, [target, skins, loading, error]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) onClose(); };
    const scroll = (event: Event) => { if (!menuRef.current?.contains(event.target as Node)) onClose(); };
    const focus = (event: FocusEvent) => { if (!menuRef.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", focus);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", focus);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); target.trigger?.focus({ preventScroll: true }); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };
  const choose = (id: number) => { onSelect(id); target.trigger?.focus({ preventScroll: true }); };
  return createPortal(<div ref={menuRef} className="atlas-skin-menu" role="menu" aria-label={`${target.tank} 皮肤`} tabIndex={-1}
    style={{ left: target.x, top: target.y }} onKeyDown={keyDown} onContextMenu={(event) => event.preventDefault()}>
    <div className="atlas-skin-menu-heading" role="presentation"><strong>切换皮肤</strong><span>{target.tank}</span></div>
    {loading ? <p role="status">正在加载皮肤…</p> : error ? <><p role="status">皮肤资料加载失败</p><button type="button" role="menuitem" onClick={onRetry}>重新加载</button></> : <>
      <button type="button" role="menuitemradio" aria-checked={selectedId === 0} onClick={() => choose(0)}><span className="atlas-skin-default" aria-hidden="true">默认</span><span>默认立绘</span><b aria-hidden="true">{selectedId === 0 ? "✓" : ""}</b></button>
      {skins.map((skin) => <button type="button" key={skin.id} role="menuitemradio" aria-checked={selectedId === skin.id} onClick={() => choose(skin.id)}>
        {skin.headImage ? <img src={skin.headImage} alt="" /> : <span className="atlas-skin-default" aria-hidden="true">皮肤</span>}<span>{skin.name}</span><b aria-hidden="true">{selectedId === skin.id ? "✓" : ""}</b>
      </button>)}
      {!skins.length && <p>暂无额外皮肤</p>}
    </>}
  </div>, document.body);
}
