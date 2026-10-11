export type TechnologyPoint = { x: number; y: number };
type TechnologyEdge = { from: number; to: number };

/** Keep the native turns, but remove leftover branch bends and retraced spurs. */
export function technologyPathPoints(points: readonly TechnologyPoint[]): TechnologyPoint[] {
  if (points.length < 2) return points.map((point) => ({ ...point }));
  const start = points[0], end = points[points.length - 1];
  const minX = Math.min(start.x, end.x), maxX = Math.max(start.x, end.x);
  const result: TechnologyPoint[] = [];
  for (const point of points) {
    // Technology stages progress horizontally. A bend beyond the target stage
    // belongs to a different branch (e.g. rocket III 15578 -> 15583).
    if (point.x < minX || point.x > maxX) continue;
    const previous = result[result.length - 1];
    if (previous?.x === point.x && previous.y === point.y) continue;
    result.push({ ...point });
    while (result.length >= 3) {
      const [a, b, c] = result.slice(-3);
      if (!((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y))) break;
      // Also collapse out-and-back vertical legs; they must not light siblings.
      result.splice(result.length - 2, 1);
    }
    if (result.length >= 2) {
      const a = result[result.length - 2], b = result[result.length - 1];
      if (a.x === b.x && a.y === b.y) result.pop();
    }
  }
  return result;
}

export function technologyPrerequisites(lines: readonly TechnologyEdge[], selectedTag: number | null): Set<number> {
  const tags = new Set<number>();
  const pending = selectedTag === null ? [] : [selectedTag];
  while (pending.length) {
    const tag = pending.pop()!;
    if (tags.has(tag)) continue;
    tags.add(tag);
    for (const line of lines) if (line.to === tag) pending.push(line.from);
  }
  return tags;
}
