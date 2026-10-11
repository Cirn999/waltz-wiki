"use client";
/* eslint-disable @next/next/no-img-element -- approved raster card frame and original game sprites */

import { memo, useCallback, useEffect, useMemo, useState, type CSSProperties, type MouseEvent, type KeyboardEvent } from "react";
import TablePortrait from "./TablePortrait";
import AtlasTalents, { type AtlasTalent } from "./AtlasTalents";
import { cardNameLayout, cardRarityBackgrounds, orderedAtlasRows, type MeasureCardText } from "./cardAtlasLayout";
import { cardArtFraming, cardArtUsesContain, cardSkinFraming, defaultCardArtFraming } from "./cardAtlasFraming";
import { loadMaidenSkins, type MaidenSkin } from "./maidenSkinData";
import { atlasSkinEntries, atlasSkinStorageKey, parseAtlasSkinSelections, selectedAtlasSkin, withAtlasSkin, type CardAtlasSkinMode } from "./cardAtlasSkins";
import CardSkinMenu, { type CardSkinMenuTarget } from "./CardSkinMenu";
import CardPersonName from "./CardPersonName";
import CardCostMedal from "./CardCostMedal";
import { cardCostFrames, cardCostStyle, cardRarityLeft } from "./cardAtlasCost";
import { compareTalentLevels } from "./talentSort";
import AtlasTalentTeam from "./AtlasTalentTeam";
import { activeAtlasTeam, atlasTeamCapacity, type AtlasTeamAction, type AtlasTeamWorkspace } from "./atlasTeamState";
import "./card-atlas.css";

export type CardAtlasMode = "cards" | "avatars";
export type { CardAtlasSkinMode } from "./cardAtlasSkins";
export type AtlasMaiden = {
  id: number; tank: string; person: string; image: string; nation: string; nationIcon: string;
  rarityId: number; rarity: string; rarityIcon: string; classId: number; className: string;
  classIcon: string; magicCostGroup: string; talents: AtlasTalent[];
};
let measurement: MeasureCardText | undefined;
function browserMeasure(): MeasureCardText | undefined {
  if (!measurement) {
    const context = document.createElement("canvas").getContext("2d");
    if (context) {
      context.font = '700 100px Bahnschrift, SimHei, "黑体", sans-serif';
      measurement = (value) => context.measureText(value).width / 100;
    }
  }
  return measurement;
}

const CardFace = memo(function CardFace({ maiden, skin, onOpen }: { maiden: AtlasMaiden; skin?: MaidenSkin; onOpen: (id: number) => void }) {
  const [failedArt, setFailedArt] = useState(false);
  const [layout, setLayout] = useState(() => cardNameLayout(maiden.tank));
  useEffect(() => {
    let active = true;
    const fit = () => { if (active) setLayout(cardNameLayout(maiden.tank, browserMeasure())); };
    fit();
    void document.fonts.ready.then(fit);
    return () => { active = false; };
  }, [maiden.tank]);
  // Each skin uses its own model placement, including the export's alpha trim.
  // Never reuse the default model's coordinates for a skin.
  const skinPlacement = skin ? cardSkinFraming(skin.modelId) : null;
  const compactDefault = !skin && cardArtUsesContain(maiden.id);
  const framing = skin ? skinPlacement ?? defaultCardArtFraming : cardArtFraming(maiden.id);
  const portrait = skin?.image ?? maiden.image;
  const cost = cardCostStyle(maiden.magicCostGroup);
  const metal = cost?.metal ?? "copper";
  const style = {
    "--atlas-rarity-left": `${cardRarityLeft(metal, maiden.rarityIcon)}%`,
    "--atlas-title-size": `${layout.fontSize}cqw`,
    "--atlas-person-size": `${Math.min(5.7, 76 / Math.max([...maiden.person].length * 1.1, 1))}cqw`,
    "--atlas-hero-x": `${framing.x}%`,
    "--atlas-hero-height": `${framing.height}%`,
    "--atlas-hero-bottom": `${framing.bottom}%`,
  } as CSSProperties;
  return <button type="button" className="atlas-card-face" data-frame-metal={metal} data-art-framing={skin ? skinPlacement ? "skin-model" : "skin-fit" : compactDefault ? "default-fit" : "default"} style={style} onClick={() => onOpen(maiden.id)} aria-label={`查看 ${maiden.tank} 详情，${skin?.name ?? "默认立绘"}，${maiden.person}，${maiden.rarity}，${maiden.nation}，${maiden.className}，魔改费用 ${maiden.magicCostGroup}`}>
    <span className="atlas-art-window">
      <img className="atlas-rarity-background" src={cardRarityBackgrounds[maiden.rarityId] ?? cardRarityBackgrounds[2]} alt="" loading="lazy" />
      {portrait && !failedArt ? <img className={`atlas-hero${skin && !skinPlacement ? " atlas-skin-hero" : compactDefault ? " atlas-compact-hero" : ""}`} src={portrait} alt={skin ? `${maiden.tank} · ${skin.name}` : ""} loading="lazy" decoding="async" onError={() => setFailedArt(true)} /> : <span className="atlas-art-placeholder">暂无立绘</span>}
    </span>
    <img className="atlas-frame" src={cardCostFrames[metal].image} alt="" />
    {maiden.nationIcon ? <img className="atlas-nation" src={maiden.nationIcon} alt={maiden.nation} loading="lazy" /> : <span className="atlas-nation atlas-nation-fallback">{maiden.nation.slice(0, 1)}</span>}
    {maiden.classIcon && <img className="atlas-vehicle" src={maiden.classIcon} alt={maiden.className} loading="lazy" />}
    {maiden.rarityIcon && <img className="atlas-rarity" src={maiden.rarityIcon} alt={maiden.rarity} loading="lazy" />}
    <span className={`atlas-name-region${layout.lines.length > 1 ? " multiline" : ""}`}><span className="atlas-tank-name">{layout.lines.map((line, index) => <span className="atlas-name-line" key={index}>{line}</span>)}</span></span>
    <span className="atlas-person-region"><CardPersonName id={maiden.id} person={maiden.person} /></span>
    <CardCostMedal cost={cost} />
  </button>;
});

export default function CardAtlas({ rows, allRows, teamWorkspace, onTeamAction, mode, skinMode, limit, selectedTalents, onOpen, onLoadMore, onResetFilters, hasFilters }: {
  rows: AtlasMaiden[]; mode: CardAtlasMode; skinMode: CardAtlasSkinMode; limit: number; onOpen: (id: number) => void;
  onLoadMore: () => void; onResetFilters: () => void; hasFilters: boolean; selectedTalents: readonly string[];
  allRows: AtlasMaiden[]; teamWorkspace: AtlasTeamWorkspace; onTeamAction: (action: AtlasTeamAction) => void;
}) {
  const team = activeAtlasTeam(teamWorkspace);
  const hasTeamMembers = teamWorkspace.plans.some((plan) => plan.memberIds.length > 0);
  const teamEnabled = mode === "avatars" && (selectedTalents.length > 0 || hasTeamMembers);
  const showTeam = mode === "avatars" && (teamEnabled || teamWorkspace.plans.length > 1);
  const allById = useMemo(() => new Map(allRows.map((maiden) => [maiden.id, maiden])), [allRows]);
  const teamMembers = team.memberIds.map((id) => allById.get(id)).filter((maiden): maiden is AtlasMaiden => Boolean(maiden));
  const talentOptions = useMemo(() => [...new Map(allRows.flatMap((maiden) => maiden.talents).map((talent) => [talent.name, { name: talent.name, image: talent.image }])).values()], [allRows]);
  const [preferredTalentSort, setPreferredTalentSort] = useState("");
  // Only applied talent filters affect avatars; keep vertical cards in ID order.
  // If the chosen talent is removed, immediately fall back to the first active one.
  const talentSortName = mode === "avatars" ? (selectedTalents.includes(preferredTalentSort) ? preferredTalentSort : selectedTalents[0] ?? "") : "";
  const ordered = useMemo(() => talentSortName
    ? [...rows].sort((left, right) => compareTalentLevels(left, right, talentSortName, true))
    : orderedAtlasRows(rows), [rows, talentSortName]);
  const [skinsById, setSkinsById] = useState<Record<string, MaidenSkin[]> | null>(null);
  const [skinError, setSkinError] = useState(false);
  const [skinRetry, setSkinRetry] = useState(0);
  const [selections, setSelections] = useState(() => {
    try { return parseAtlasSkinSelections(typeof window === "undefined" ? null : window.localStorage.getItem(atlasSkinStorageKey)); }
    catch { return {}; }
  });
  const [menu, setMenu] = useState<CardSkinMenuTarget | null>(null);
  const entries = useMemo(() => atlasSkinEntries(ordered, skinMode, skinsById ?? {}, selections), [ordered, skinMode, skinsById, selections]);
  const separate = skinMode === "separate";
  useEffect(() => {
    let active = true;
    loadMaidenSkins().then((data) => { if (active) { setSkinsById(data.rows); setSkinError(false); } })
      .catch(() => { if (active) setSkinError(true); });
    return () => { active = false; };
  }, [skinRetry]);
  const closeMenu = useCallback(() => setMenu(null), []);
  const retrySkins = () => { setSkinError(false); setSkinRetry((value) => value + 1); };
  const openMenu = (event: MouseEvent<HTMLLIElement> | KeyboardEvent<HTMLLIElement>, maiden: AtlasMaiden) => {
    if (separate) return;
    if (skinsById && !skinsById[maiden.id]?.length) return;
    event.preventDefault(); event.stopPropagation();
    const trigger = event.currentTarget.querySelector<HTMLButtonElement>("button");
    const rect = trigger?.getBoundingClientRect();
    const pointer = "clientX" in event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY) && (event.clientX !== 0 || event.clientY !== 0);
    setMenu({ id: maiden.id, tank: maiden.tank, x: pointer ? event.clientX : rect?.left ?? 8, y: pointer ? event.clientY : rect?.bottom ?? 8, trigger });
  };
  const chooseSkin = (skinId: number) => {
    if (!menu) return;
    const next = withAtlasSkin(selections, menu.id, skinId);
    setSelections(next);
    try { window.localStorage.setItem(atlasSkinStorageKey, JSON.stringify(next)); } catch { /* Keep the choice in memory if browser storage is unavailable. */ }
    closeMenu();
    const selectedMaidenId = menu.id;
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`.card-atlas .atlas-entry[data-maiden-id="${selectedMaidenId}"] button`)?.focus({ preventScroll: true }));
  };
  const menuSkins = menu ? skinsById?.[menu.id] ?? [] : [];
  return <section className="archive-section cards-archive archive-visible card-atlas" aria-label="卡牌图鉴" data-mode={mode} data-skin-mode={skinMode}>
    <header className="atlas-toolbar">
      <div><h2>卡牌图鉴 <span>{rows.length} 位钢舞姬{separate && skinsById ? ` · ${entries.length} 张卡牌` : ""}</span></h2><p>{talentSortName ? `${talentSortName}等级降序 · 同级按内部编号升序` : "内部编号升序"} · 点击查看详情 · {separate ? "默认立绘与各套皮肤独立展示" : "有皮肤的卡牌可右键切换"}</p></div>
      <div className="atlas-toolbar-actions">
        {mode === "avatars" && selectedTalents.length > 1 && <label className="atlas-talent-sort"><span>降序</span><select aria-label="才艺降序排序依据" value={talentSortName} onChange={(event) => setPreferredTalentSort(event.target.value)}>{selectedTalents.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>}
        {hasFilters && <button type="button" className="atlas-reset" onClick={() => { setPreferredTalentSort(""); onResetFilters(); }}>清除条件</button>}
      </div>
    </header>
    {separate && !skinsById && <div className="atlas-skin-status" role="status">{skinError ? <>皮肤资料加载失败，暂时仅显示默认立绘。<button type="button" className="atlas-reset" onClick={retrySkins}>重新加载皮肤</button></> : "正在加载皮肤…"}</div>}
    <div className={`atlas-workspace${showTeam ? " with-team" : ""}`}>
    {showTeam && <AtlasTalentTeam workspace={teamWorkspace} members={teamMembers} talents={talentOptions} selectedTalents={selectedTalents} canAddMembers={teamEnabled} onAction={onTeamAction} onOpen={onOpen} />}
    <div className="atlas-results">
    {entries.length ? <>
      <ul className={`atlas-album ${mode === "avatars" ? "atlas-album-avatars" : "atlas-album-cards"}`}>
        {(mode === "avatars" ? entries : entries.slice(0, limit)).map(({ key, maiden, skin }) => {
          return <li className="atlas-entry" data-maiden-id={maiden.id} data-skin-id={skin?.id ?? 0} key={key}
            title={separate ? `${maiden.tank} · ${skin?.name ?? "默认立绘"}` : skinsById?.[maiden.id]?.length ? `当前：${skin?.name ?? "默认立绘"} · 右键切换皮肤` : undefined}
            onContextMenu={(event) => openMenu(event, maiden)} onKeyDown={(event) => { if (event.key === "ContextMenu" || event.shiftKey && event.key === "F10") openMenu(event, maiden); }}>
            {mode === "cards" ? <CardFace maiden={maiden} skin={skin} onOpen={onOpen} /> : <>
              <div className="atlas-avatar-picker" data-in-team={teamEnabled && team.memberIds.includes(maiden.id)}>
                <TablePortrait maiden={maiden} headImage={skin?.headImage} skinName={skin?.name ?? (separate ? "默认立绘" : undefined)} onOpen={onOpen} />
                {teamEnabled && <button type="button" className="atlas-team-toggle" data-selected={team.memberIds.includes(maiden.id)}
                  disabled={!team.memberIds.includes(maiden.id) && team.memberIds.length >= atlasTeamCapacity}
                  aria-label={`${team.memberIds.includes(maiden.id) ? "移出" : "加入"}${team.name}：${maiden.tank}`}
                  title={team.memberIds.includes(maiden.id) ? `移出${team.name}` : team.memberIds.length >= atlasTeamCapacity ? "当前方案已满 6 车" : `加入${team.name}`}
                  onClick={() => onTeamAction({ type: "toggle", maidenId: maiden.id })}>{team.memberIds.includes(maiden.id) ? "−" : "+"}</button>}
              </div>
              <AtlasTalents talents={maiden.talents} selected={selectedTalents} />
              <span className="atlas-avatar-caption">{maiden.tank}</span>
            </>}
            {separate && <span className="atlas-skin-caption">{skin?.name ?? "默认立绘"}</span>}
          </li>;
        })}
      </ul>
      {mode === "cards" && limit < entries.length && <button type="button" className="load-more" onClick={onLoadMore}>继续载入 <span>{Math.min(48, entries.length - limit)} 张</span></button>}
    </> : <div className="empty-state"><strong>没有符合条件的钢舞姬</strong><p>试试减少筛选条件，或换一个关键词。</p><button type="button" onClick={onResetFilters}>重置筛选</button></div>}
    </div></div>
    {!separate && menu && <CardSkinMenu target={menu} skins={menuSkins} selectedId={selectedAtlasSkin(menuSkins, selections[menu.id])?.id ?? 0}
      loading={!skinsById && !skinError} error={skinError} onSelect={chooseSkin} onClose={closeMenu}
      onRetry={retrySkins} />}
  </section>;
}
