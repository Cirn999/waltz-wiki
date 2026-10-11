"use client";
/* eslint-disable @next/next/no-img-element -- reuse the client's local phase sprites */

import "./generation-tabs.css";

export const generationIcons = ["/art/rarities/kpsj-031.webp", "/art/rarities/kpsj-033.webp", "/art/rarities/kpsj-030.webp"];

export default function GenerationTabs({ selected, onSelect, label, available, className = "" }: {
  selected: number;
  onSelect: (generation: number) => void;
  label: string;
  available?: number[];
  className?: string;
}) {
  return <div className={`technology-generation-tabs generation-tabs-compact ${className}`} aria-label={label}>
    {[1, 2, 3].map((value) => <button key={value} type="button" className={selected === value ? "active" : ""} disabled={available ? !available.includes(value) : false} onClick={() => onSelect(value)} title={`${value}期`} aria-label={`${label}：${value}期`} aria-pressed={selected === value}><img src={generationIcons[value - 1]} alt="" /></button>)}
  </div>;
}
