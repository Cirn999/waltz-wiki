/* eslint-disable @next/next/no-img-element -- native game sprites */
import type { CSSProperties } from "react";
import ammunitionAssets from "../public/data/table-ammunition.json";
import "./table-ammunition.css";

const assets: {
  background: string;
  width: number;
  height: number;
  iconScale: number;
  types: Record<string, { fundId: number; image: string; width: number; height: number }>;
} = ammunitionAssets;

export default function TableAmmunition({ types }: { types: string[] }) {
  const ordered = [...new Set(types)].sort((left, right) =>
    (assets.types[left]?.fundId ?? Infinity) - (assets.types[right]?.fundId ?? Infinity)
    || left.localeCompare(right, "zh-CN"));
  if (!ordered.length) return <span>—</span>;
  return <ul className="table-ammo-cards" aria-label="可用弹药类型">
    {ordered.map((type) => {
      const icon = assets.types[type];
      return <li key={type}>
        <span className="table-ammo-card" role="img" aria-label={type} title={type}>
          <img className="table-ammo-card-background" src={assets.background} alt="" loading="lazy" />
          {icon ? <img className="table-ammo-card-icon" src={icon.image} alt="" loading="lazy" style={{ width: icon.width * assets.iconScale, height: icon.height * assets.iconScale } as CSSProperties} /> : <span>{type}</span>}
        </span>
      </li>;
    })}
  </ul>;
}
