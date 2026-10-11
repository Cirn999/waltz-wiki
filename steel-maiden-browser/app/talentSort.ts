type Talent = { name: string; level: number };
type TalentRow = { id: number; talents: Talent[] };

export function compareTalentLevels(left: TalentRow, right: TalentRow, name: string, descending: boolean): number {
  const leftLevel = left.talents.find((talent) => talent.name === name)?.level;
  const rightLevel = right.talents.find((talent) => talent.name === name)?.level;
  const hasLeft = leftLevel !== undefined && Number.isFinite(leftLevel);
  const hasRight = rightLevel !== undefined && Number.isFinite(rightLevel);
  // Missing talents stay last in both directions; they are not level zero.
  if (hasLeft !== hasRight) return hasLeft ? -1 : 1;
  if (hasLeft && hasRight) {
    const difference = leftLevel! - rightLevel!;
    if (difference) return descending ? -difference : difference;
  }
  return left.id - right.id;
}
