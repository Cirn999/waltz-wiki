// Separate nearby promotion bubbles without moving their pointers off the level.
export function promotionBubbleShifts(trackWidth: number, levels: number[], widths: number[], edgeGap = 0) {
  if (levels.length !== 2 || widths.length !== 2 || trackWidth <= 0) return levels.map(() => 0);
  const centers = levels.map(level => (level - 1) / 98 * trackWidth);
  const lefts = centers.map((center, index) => Math.max(edgeGap, Math.min(trackWidth - edgeGap - widths[index], center - widths[index] / 2)));
  const overlap = lefts[0] + widths[0] + 8 - lefts[1];
  if (overlap > 0) {
    lefts[0] -= overlap / 2;
    lefts[1] += overlap / 2;
    const overflow = Math.max(0, lefts[1] + widths[1] - trackWidth + edgeGap);
    lefts[0] -= overflow;
    lefts[1] -= overflow;
    const underflow = Math.max(0, edgeGap - lefts[0]);
    lefts[0] += underflow;
    lefts[1] += underflow;
  }
  return lefts.map((left, index) => left - centers[index] + widths[index] / 2);
}
