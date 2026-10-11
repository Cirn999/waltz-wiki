"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { starPromotionHonorIcon, starPromotions } from "./starPromotions";
import { promotionBubbleShifts } from "./promotionBubbleLayout";

const snapshotLevels = [1, 60, 90, 99];

export default function DetailLevelSlider({ cardId, level, onChange, disabled }: { cardId: number; level: number; onChange: (level: number) => void; disabled: boolean }) {
  const promotions = starPromotions(cardId);
  const levels = [...new Set([...snapshotLevels, ...promotions.map((promotion) => promotion.level)])].sort((a, b) => a - b);
  const costItems = Math.max(2, ...promotions.map((promotion) => promotion.costs.length + Number(promotion.showHonor)));
  const marksRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const marks = marksRef.current;
    if (!marks) return;
    const bubbles = [...marks.querySelectorAll<HTMLButtonElement>(".detail-promotion-bubble")];
    const align = () => {
      const heading = marks.previousElementSibling;
      const edgeGap = heading && getComputedStyle(heading).position === "absolute" ? 32 : 0;
      const shifts = promotionBubbleShifts(marks.getBoundingClientRect().width, bubbles.map(b => Number(b.dataset.level)), bubbles.map(b => b.getBoundingClientRect().width), edgeGap);
      bubbles.forEach((bubble, index) => bubble.style.setProperty("--bubble-shift", `${shifts[index]}px`));
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(marks);
    bubbles.forEach(bubble => observer.observe(bubble));
    return () => observer.disconnect();
  }, [cardId]);
  return <div className="detail-level-slider" style={{ "--level-progress": `${(level - 1) / 98 * 100}%` } as CSSProperties}>
    <label className="detail-level-slider-heading" htmlFor="detail-level"><span>等级</span><output htmlFor="detail-level">{level}级</output></label>
    <div ref={marksRef} className="detail-promotion-marks" aria-label="亮星消耗" style={{ "--promotion-rows": costItems, "--promotion-compact-rows": Math.ceil(costItems / 2) } as CSSProperties}>
      {promotions.map((promotion) => <button type="button" key={promotion.stars} className={`detail-promotion-bubble${level === promotion.level ? " active" : ""}`} style={{ left: `${(promotion.level - 1) / 98 * 100}%` }} title={promotion.description} aria-label={promotion.description} aria-pressed={level === promotion.level} disabled={disabled} data-stars={promotion.stars} data-level={promotion.level} onClick={() => onChange(promotion.level)}>
        {promotion.costs.map((cost) => <span className="detail-promotion-cost" key={cost.fundId} data-fund-id={cost.fundId}><img src={cost.image} alt="" /><b>{cost.amount.toLocaleString("zh-CN")}</b></span>)}
        {promotion.showHonor && <span className="detail-promotion-honor" title="须先完成授勋；非本次亮星重复消耗"><img src={starPromotionHonorIcon} alt="须先完成授勋（命运之勋）" /></span>}
      </button>)}
    </div>
    <input id="detail-level" type="range" min={1} max={99} step={1} value={level} disabled={disabled} aria-label="钢舞姬等级" aria-valuetext={`${level}级`} onChange={(event) => onChange(Number(event.currentTarget.value))} />
    <div className="detail-level-marks" aria-label="快捷等级">
      {levels.map((value) => <button type="button" key={value} style={{ left: `${(value - 1) / 98 * 100}%` }} className={level === value ? "active" : ""} aria-pressed={level === value} disabled={disabled && !snapshotLevels.includes(value)} onClick={() => onChange(value)}>{value}级</button>)}
    </div>
  </div>;
}
