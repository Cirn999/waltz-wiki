import type { SimEquipmentData, SimMagicChoice, SimSlotChoice } from "./loadoutMath";

// Client invoke modules 59 / 60; CardInfoUI uses pvp-083..088 / pvp-089..094.
// Empty slots stay in the denominator. Vehicle stats, craft and technology do not contribute.
export function equipmentAssessment(slotCount: number, choices: SimSlotChoice[], equipment: SimEquipmentData): number {
  if (slotCount <= 0) return 0;
  let squares = 0;
  for (const choice of choices.slice(0, slotCount)) {
    const family = equipment.families.find((entry) => entry.id === choice.familyId);
    const level = family?.levels.find((entry) => entry.level === choice.level)?.level;
    if (level) squares += (level + (family?.advanced ? 2 : 0)) ** 2;
  }
  return squares > 0 ? Math.min(6, Math.floor(Math.sqrt(squares / slotCount) / 2) + 1) : 0;
}

export function magicAssessment(ordnance: SimMagicChoice, tactics: SimMagicChoice): number {
  const activeLevel = (choice: SimMagicChoice) => choice.trendId === null || !Number.isFinite(choice.level) ? 0 : Math.max(0, Math.min(10, Math.trunc(choice.level)));
  const score = activeLevel(ordnance) + 2 * activeLevel(tactics);
  return score > 0 ? Math.min(6, Math.floor(score / 5) + 1) : 0;
}

export function assessmentIcon(kind: "equipment" | "magic", grade: number): string {
  return grade >= 1 && grade <= 6 ? `/art/assessments/pvp-${String((kind === "equipment" ? 82 : 88) + grade).padStart(3, "0")}.png` : "";
}
