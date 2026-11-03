/* eslint-disable @next/next/no-img-element -- lossless sprites exported from the game */
import portraitAssets from "../public/data/table-portraits.json";
import "./table-identity.css";

const assets: {
  rows: Record<string, string>;
  frames: Record<string, string>;
  rarities: Record<string, string>;
  classes: Record<string, string>;
  bottomMask: string;
} = portraitAssets;

export type PortraitMaiden = { id: number; tank: string; person: string; rarityId: number; rarity: string; classId: number; className: string; magicCostGroup: string };

export function portraitSources(maiden: PortraitMaiden, headImage?: string) {
  return { head: headImage ?? assets.rows[String(maiden.id)], frame: assets.frames[String(maiden.rarityId)] ?? assets.frames["2"], rarity: assets.rarities[String(maiden.rarityId)], vehicleClass: assets.classes[String(maiden.classId)], bottomMask: assets.bottomMask };
}

function PortraitLayers({ maiden, headImage }: { maiden: PortraitMaiden; headImage?: string }) {
  const { head, frame, rarity, vehicleClass } = portraitSources(maiden, headImage);
  return <>
    <img className="table-portrait-frame" src={frame} alt="" loading="lazy" />
    {head ? <img className="table-portrait-head" src={head} alt={`${maiden.person}头像`} loading="lazy" /> : <span className="table-portrait-fallback">{maiden.tank.slice(0, 2)}</span>}
    {rarity && <img className="table-portrait-rarity" src={rarity} alt="" loading="lazy" />}
    <span className="table-portrait-bottom">
      <img className="table-portrait-mask" src={assets.bottomMask} alt="" loading="lazy" />
      {vehicleClass && <img className="table-portrait-class" src={vehicleClass} alt="" loading="lazy" />}
      <span className="table-portrait-cost">{maiden.magicCostGroup}</span>
    </span>
  </>;
}

// Non-interactive artwork for existing buttons/flowchart nodes. Keep the same
// layers as the atlas without nesting a button inside another button.
export function TablePortraitImage({ maiden }: { maiden: PortraitMaiden }) {
  return <span className="table-avatar table-game-avatar" role="img" aria-label={`${maiden.tank}，${maiden.rarity}，${maiden.className}，魔改费用${maiden.magicCostGroup}`}><PortraitLayers maiden={maiden} /></span>;
}

export default function TablePortrait({ maiden, onOpen, headImage, skinName }: { maiden: PortraitMaiden; onOpen: (id: number) => void; headImage?: string; skinName?: string }) {
  const description = `${skinName ? `${skinName} · ` : ""}${maiden.rarity} · ${maiden.className} · 魔改费用 ${maiden.magicCostGroup}`;
  return <button type="button" className="table-avatar table-game-avatar" onClick={() => onOpen(maiden.id)} aria-label={`查看 ${maiden.tank} 详情，${description}`} title={description}>
    <PortraitLayers maiden={maiden} headImage={headImage} />
  </button>;
}
