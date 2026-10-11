"use client";
/* eslint-disable @next/next/no-img-element -- reuse original terrain and effect sprites */
import { useEffect, useMemo, useState } from "react";
import { loadStageCatalog } from "./stageCatalogData";
import type { StageCatalog } from "./stageTypes";
import { handbookTerrains, matchesTerrain, type TerrainPerspective } from "./terrainHandbook";
import "./terrains.css";

export default function TerrainArchive() {
  const [catalog, setCatalog] = useState<StageCatalog | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [perspective, setPerspective] = useState<TerrainPerspective>("ground");
  useEffect(() => {
    let cancelled = false;
    loadStageCatalog().then((data) => { if (!cancelled) setCatalog(data); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "地形数据加载失败"); });
    return () => { cancelled = true; };
  }, [attempt]);
  const terrains = useMemo(() => handbookTerrains(catalog?.terrains ?? {}, perspective), [catalog, perspective]);
  const visible = useMemo(() => terrains.filter((terrain) => matchesTerrain(terrain, query)), [terrains, query]);
  const effectCount = useMemo(() => new Set(terrains.flatMap((terrain) => terrain.effects.map((effect) => effect.name))).size, [terrains]);
  const nameCounts = useMemo(() => terrains.reduce((counts, terrain) => counts.set(terrain.name, (counts.get(terrain.name) ?? 0) + 1), new Map<string, number>()), [terrains]);

  if (error) return <section className="terrain-archive terrain-load-state" role="alert"><h1>地形加载失败</h1><p>{error}</p><button type="button" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>重试加载</button></section>;
  if (!catalog) return <section className="terrain-archive terrain-load-state" role="status">正在装载地形手册…</section>;
  return <section className="terrain-archive" aria-label="地形手册" data-perspective={perspective}>
    <header className="terrain-heading">
      <div><small>TERRAIN HANDBOOK</small><h1>地形 <span>{nameCounts.size} 种地形 · {effectCount} 种{perspective === "air" ? "空钢" : "陆钢"}效果</span></h1><p>按陆钢、空钢分别展示对应效果与三阶段作战参数</p></div>
      <label className="terrain-search"><span>快速检索</span><input type="search" aria-label="搜索地形" placeholder="搜索地形、效果名称或描述…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    </header>
    <div className="terrain-toolbar">
      <div className="terrain-perspective" role="group" aria-label="地形适用车种">
        <button type="button" aria-pressed={perspective === "ground"} onClick={() => setPerspective("ground")}>陆钢</button>
        <button type="button" aria-pressed={perspective === "air"} onClick={() => setPerspective("air")}>空钢</button>
      </div>
      <div className="terrain-results" role="status">显示 <b>{visible.length}</b> / {terrains.length} 张地形卡片{query && <button type="button" onClick={() => setQuery("")}>清除搜索</button>}</div>
    </div>
    {terrains.length > nameCounts.size && <p className="terrain-variant-note">同名地形在部分关卡的效果配置不同，以下分别列出，不合并叠加。</p>}
    {visible.length ? <div className="terrain-grid">{visible.map((terrain) => <article className="terrain-card" key={terrain.ids[0]} data-terrain-ids={terrain.ids.join(",")} aria-labelledby={`terrain-title-${terrain.ids[0]}`}>
      <header className="terrain-card-heading">
        <div className="terrain-icons">{terrain.image ? <img src={terrain.image} alt={`${terrain.name}地形图标`} loading="lazy" /> : <span>暂无图标</span>}</div>
        <div className="terrain-card-identity">
          <div className="terrain-title-row">
            <h2 id={`terrain-title-${terrain.ids[0]}`}>{terrain.name}</h2>
            <div className="terrain-combat-range" data-values={terrain.range.join(",")} data-kind={perspective === "air" ? "altitude" : "distance"}>
              <span className="terrain-range-label"><img src={terrain.rangeIcon} alt="" />{perspective === "air" ? "作战高度" : "作战距离"}<small>m</small></span>
              <strong>{terrain.range.map((value, index) => <span key={index}>{value}{index < terrain.range.length - 1 && <i aria-hidden="true">→</i>}</span>)}</strong>
              <span className="terrain-range-phases">炮击 → 接近 → 缠斗</span>
            </div>
          </div>
          <span>{terrain.effects.length} 项地形效果{(nameCounts.get(terrain.name) ?? 0) > 1 && <small className="terrain-variant" title="客户端地形配置编号">配置 #{terrain.ids.join("、")}</small>}</span>
        </div>
      </header>
      <h3>地形效果 / Debuff</h3>
      {terrain.effects.length ? <ul className="terrain-effect-list">{terrain.effects.map((effect, index) => <li key={`${effect.name}-${index}`}>
        {effect.image && <img src={effect.image} alt={`${effect.name}图标`} loading="lazy" />}
        <div><h4>{effect.name}</h4><p>{effect.description}</p></div>
      </li>)}</ul> : <p className="terrain-no-effects">无地形效果</p>}
    </article>)}</div> : <div className="terrain-empty"><h2>没有符合条件的地形</h2><p>试试地形名称，或“火力”“回避”等效果关键词。</p><button type="button" onClick={() => setQuery("")}>清除搜索</button></div>}
  </section>;
}
