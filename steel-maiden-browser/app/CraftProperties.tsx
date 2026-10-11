/* eslint-disable @next/next/no-img-element -- local game attribute and trait sprites */

import CraftTraitTooltip from "./CraftTraitTooltip";

type CraftProperty = { key: string; value: number };
type CraftTrait = { name: string; image: string; description?: string };
type CraftPropertiesData = { stats: CraftProperty[]; effects?: CraftTrait[]; resistanceDetails?: CraftTrait[] };

const attributeSprites: Record<string, string> = {
  "火力": "kpxx-035", "耐久": "kpxx-034", "隐蔽": "kpxx-033", "穿甲": "kpxx-032",
  "装甲": "kpxx-031", "侦查": "kpxx-030", "命中": "kpxx-029", "回避": "kpxx-028",
  "射程": "kpxx-027", "点燃": "kpxx-101",
};
const ammunitionOrder = ["火力", "穿甲", "命中", "射程", "耐久", "装甲", "回避", "隐蔽", "侦查"];

// Share the detail view's actual craft attributes and traits; never use the total vehicle panel.
export default function CraftProperties({ item, ammunition = false, simulator = false, traits = [] }: {
  item: CraftPropertiesData;
  ammunition?: boolean;
  simulator?: boolean;
  traits?: { name: string; description: string }[];
}) {
  const effects = (ammunition ? item.effects : item.resistanceDetails) ?? [];
  const stats = ammunition
    ? [...item.stats].sort((left, right) => ammunitionOrder.indexOf(left.key) - ammunitionOrder.indexOf(right.key))
    : item.stats;
  return <>
    <span className={simulator ? "sim-craft-effects" : ammunition ? "ammo-effects" : "craft-card-resistances"}>
      {effects.length ? effects.map((effect, index) => {
        const description = (effect.description || traits.find((trait) => trait.name === effect.name)?.description || "").trim();
        const content = <>{effect.image ? <img src={effect.image} alt="" loading="lazy" /> : <i aria-hidden="true">◆</i>}<b>{effect.name}</b></>;
        return simulator
          ? <CraftTraitTooltip key={`${effect.name}-${index}`} name={effect.name} description={description}>{content}</CraftTraitTooltip>
          : <span key={`${effect.name}-${index}`} className={!ammunition ? "game-icon-chip game-icon-resistance" : undefined} title={description || effect.name}>{content}</span>;
      }) : <span className="ammo-no-effect">{ammunition ? "无额外特效" : "无额外特性"}</span>}
    </span>
    <span className={simulator ? "sim-craft-stats" : `ammo-stats${ammunition ? "" : " craft-card-stats"}`}>
      {stats.length ? stats.map((stat) => {
        const sprite = attributeSprites[stat.key.startsWith("射程") ? "射程" : stat.key];
        const icon = sprite ? <img src={`/art/attributes/${sprite}.webp`} alt="" loading="lazy" /> : <span className="ammo-stat-fallback" aria-hidden="true">◆</span>;
        return <span key={stat.key} title={`${stat.key} ${stat.value}`} aria-label={`${stat.key} ${stat.value}`}>
          {simulator ? icon : <i>{icon}</i>}<b>{stat.value.toLocaleString("zh-CN")}</b>
        </span>;
      }) : <span className="craft-stat-empty">无可显示属性</span>}
    </span>
  </>;
}
