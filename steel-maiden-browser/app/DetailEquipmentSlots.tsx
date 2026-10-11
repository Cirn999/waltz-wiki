/* eslint-disable @next/next/no-img-element -- original client sprites */
import { equipmentSlotUnlock, slotUnlockIcons } from "./equipmentSlotUnlocks";
import "./equipment-slot-unlocks.css";

export default function DetailEquipmentSlots({ cardId, items }: { cardId: number; items: { name: string; image: string }[] }) {
  if (!items.length) return <span className="muted">— 未配置</span>;
  return <div className="game-icon-list slot-icon-list detail-equipment-slots">
    {items.map((item, index) => {
      const unlock = equipmentSlotUnlock(cardId, index, item.name);
      const description = `第 ${index + 1} 槽 · ${item.name}：${unlock?.description ?? "解锁条件待核对"}`;
      return <span className="game-icon-chip game-icon-slot slot-unlock-chip" key={`${item.name}-${index}`} title={description} aria-label={description}>
        {item.image && <img className="slot-type-icon" src={item.image} alt="" loading="lazy" />}
        <b className="slot-unlock-name">{item.name}</b>
        {unlock && !unlock.initial && <span className="slot-unlock-badge" aria-hidden="true">
          {unlock.marks ? <span className="slot-unlock-marks"><img src={slotUnlockIcons.eagle} alt="" /><b>{unlock.marks}</b></span>
            : <span className="slot-unlock-stars">{Array.from({ length: unlock.stars }, (_, star) => <img key={star} src={slotUnlockIcons.star} alt="" />)}</span>}
          {unlock.honor && <img className="slot-unlock-honor" src={slotUnlockIcons.honor} alt="" />}
        </span>}
        {!unlock && <span className="slot-unlock-unknown">?</span>}
      </span>;
    })}
  </div>;
}
