/* eslint-disable @next/next/no-img-element -- approved raster medal layers */
import { cardCostCanvas, cardCostSprites, type CardCost } from "./cardAtlasCost";

export default function CardCostMedal({ cost }: { cost: CardCost | null }) {
  return <span className="atlas-cost" role="img" aria-label={`魔改费用 ${cost?.label ?? "未配置"}`} data-cost-group={cost?.label ?? ""}>
    {cost && cardCostSprites(cost).map((sprite, index) => <img key={`${sprite.role}-${index}`} className="atlas-cost-sprite" data-cost-role={sprite.role}
      src={sprite.image} alt="" aria-hidden="true" loading="lazy" decoding="async" style={{
        left: `${sprite.x / cardCostCanvas.width * 100}%`, top: `${sprite.y / cardCostCanvas.height * 100}%`,
        width: `${sprite.width / cardCostCanvas.width * 100}%`, height: `${sprite.height / cardCostCanvas.height * 100}%`, zIndex: sprite.layer,
      }} />)}
  </span>;
}
