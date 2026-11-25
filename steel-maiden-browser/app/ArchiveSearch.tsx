"use client";
/* eslint-disable @next/next/no-img-element -- use the existing local square portraits */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import portraitAssets from "../public/data/table-portraits.json";
import "./archive-search.css";

type SearchMaiden = { id: number; tank: string; person: string; headImage: string };

export default function ArchiveSearch({ value, onChange, onSearch, maidens, pinnedIds, onPin, onRemove }: {
  value: string;
  onChange: (value: string) => void;
  onSearch: (value: string) => void;
  maidens: SearchMaiden[];
  pinnedIds: number[];
  onPin: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const candidates = useMemo(() => {
    const needle = value.trim().toLowerCase();
    if (!needle) return [];
    return maidens.filter((row) => [row.tank, row.person, String(row.id)].some((text) => text.toLowerCase().includes(needle)));
  }, [maidens, value]);
  const pinned = useMemo(() => {
    const byId = new Map(maidens.map((row) => [row.id, row]));
    return pinnedIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
  }, [maidens, pinnedIds]);
  const expanded = focused && candidates.length > 0;
  const active = expanded ? candidates[activeIndex] : undefined;
  const squareHeads: Record<string, string> = portraitAssets.rows;

  useEffect(() => {
    if (expanded && activeIndex >= 0) {
      listRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, expanded]);

  function submit() {
    onSearch(value.trim());
    setFocused(false);
    setActiveIndex(-1);
  }

  function choose(id: number) {
    onPin(id);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  return <div className="archive-search" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
  }}>
    <div className="archive-search-field">
      <div className="search-box">
        <span aria-hidden="true">⌕</span>
        <input ref={inputRef} value={value} role="combobox" aria-label="搜索钢舞姬" aria-autocomplete="list"
          aria-expanded={expanded} aria-controls={expanded ? listId : undefined}
          aria-activedescendant={active ? listId + "-" + active.id : undefined} autoComplete="off"
          placeholder="搜索坦克名、人名、车种、弹药、才艺或工艺…"
          onFocus={() => setFocused(true)}
          onChange={(event) => { onChange(event.target.value); setFocused(true); setActiveIndex(-1); }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Escape") {
              event.preventDefault();
              setFocused(false);
              setActiveIndex(-1);
            } else if (candidates.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              event.preventDefault();
              setFocused(true);
              setActiveIndex((index) => event.key === "ArrowDown"
                ? (index + 1) % candidates.length
                : (index <= 0 ? candidates.length : index) - 1);
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (active) choose(active.id);
              else submit();
            }
          }} />
        <button type="button" onClick={submit}>搜索</button>
      </div>
      {expanded && <div className="archive-search-suggestions" id={listId} ref={listRef} role="listbox" aria-label="钢舞姬搜索候选">
        {candidates.map((row, index) => <button type="button" role="option" id={listId + "-" + row.id}
          aria-selected={index === activeIndex} aria-label={row.tank} key={row.id} tabIndex={-1}
          data-maiden-id={row.id} onMouseDown={(event) => event.preventDefault()}
          onClick={() => choose(row.id)}>
          <img src={squareHeads[String(row.id)] || row.headImage} alt="" />
          <span>{row.tank}</span>
        </button>)}
      </div>}
    </div>
    {pinned.length > 0 && <ul className="archive-search-pins" aria-label="固定显示的钢舞姬">
      {pinned.map((row) => <li key={row.id} data-maiden-id={row.id}>
        <span>{row.tank}</span>
        <button type="button" aria-label={"取消固定 " + row.tank} onClick={() => { onRemove(row.id); inputRef.current?.focus(); }}>
          <span aria-hidden="true">×</span>
        </button>
      </li>)}
    </ul>}
  </div>;
}
