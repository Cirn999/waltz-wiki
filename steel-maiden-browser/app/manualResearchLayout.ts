import type { ManualGraph } from "./researchManualGraph";

type Point = { x: number; y: number };
type Vertex = { key: string; id?: number; rank: number };
type Segment = { source: string; target: string };
export type ManualLayoutEdge = ManualGraph["edges"][number] & {
    x1: number; y1: number; x2: number; y2: number; points: Point[];
};

/** Order adjacent ranks by their actual neighbours, rather than click order.
 * Long edges receive empty routing slots so they cannot pass through a card. */
export function layoutManualGraph(graph: ManualGraph) {
    const cardWidth = 184, cardHeight = 212, gapX = 58, gapY = 90, padding = 54;
    const ids = [...new Set(graph.ids)];
    const outgoing = new Map(ids.map((id) => [id, graph.edges.filter((e) => e.source === id)]));
    const rank = new Map(ids.map((id) => [id, 0]));
    const indegree = new Map(ids.map((id) => [id, graph.edges.filter((e) => e.target === id).length]));
    const queue = ids.filter((id) => !indegree.get(id));
    for (let i = 0; i < queue.length; i++) for (const edge of outgoing.get(queue[i]) ?? []) {
        rank.set(edge.target, Math.max(rank.get(edge.target)!, rank.get(edge.source)! + 1));
        indegree.set(edge.target, indegree.get(edge.target)! - 1);
        if (!indegree.get(edge.target)) queue.push(edge.target);
    }
    if (queue.length !== ids.length) throw new Error("研发路线包含回环，无法排列");

    const vertices = new Map<string, Vertex>();
    let rows: string[][] = [];
    const add = (vertex: Vertex) => {
        vertices.set(vertex.key, vertex);
        (rows[vertex.rank] ??= []).push(vertex.key);
    };
    ids.forEach((id) => add({ key: `node:${id}`, id, rank: rank.get(id)! }));
    const paths = graph.edges.map((edge) => {
        const keys = [`node:${edge.source}`];
        for (let r = rank.get(edge.source)! + 1; r < rank.get(edge.target)!; r++) {
            const key = `route:${edge.source}:${edge.target}:${r}`;
            add({ key, rank: r });
            keys.push(key);
        }
        keys.push(`node:${edge.target}`);
        return { edge, keys };
    });
    const segments: Segment[][] = Array.from({ length: Math.max(0, rows.length - 1) }, () => []);
    const above = new Map([...vertices.keys()].map((key) => [key, [] as string[]]));
    const below = new Map([...vertices.keys()].map((key) => [key, [] as string[]]));
    for (const path of paths) for (let i = 1; i < path.keys.length; i++) {
        const source = path.keys[i - 1], target = path.keys[i];
        segments[vertices.get(source)!.rank].push({ source, target });
        below.get(source)!.push(target);
        above.get(target)!.push(source);
    }
    const positions = () => new Map(rows.flatMap((row) => row.map((key, index) => [key, index] as const)));
    const crossingCount = () => {
        const pos = positions();
        let count = 0;
        for (const band of segments) for (let i = 0; i < band.length; i++) for (let j = i + 1; j < band.length; j++) {
            const a = band[i], b = band[j];
            if ((pos.get(a.source)! - pos.get(b.source)!) * (pos.get(a.target)! - pos.get(b.target)!) < 0) count++;
        }
        return count;
    };
    const sweep = (down: boolean) => {
        const neighbours = down ? above : below;
        for (let r = down ? 1 : rows.length - 2; down ? r < rows.length : r >= 0; r += down ? 1 : -1) {
            const pos = positions(), old = new Map(rows[r].map((key, index) => [key, index]));
            const score = (key: string) => {
                const adjacent = neighbours.get(key)!;
                if (!adjacent.length) return old.get(key)! / Math.max(1, rows[r].length - 1);
                const adjacentRow = rows[r + (down ? -1 : 1)];
                return adjacent.reduce((sum, n) => sum + pos.get(n)!, 0) / adjacent.length / Math.max(1, adjacentRow.length - 1);
            };
            const scores = new Map(rows[r].map((key) => [key, score(key)]));
            rows[r].sort((a, b) => scores.get(a)! - scores.get(b)! || old.get(a)! - old.get(b)!);
        }
    };
    // A barycentre can tie at a shared node. Adjacent swaps then compare the
    // exact crossing change on both sides of the row, without a global search.
    const transpose = () => {
        const pos = positions();
        for (let pass = 0; pass < 4; pass++) {
            let changed = false;
            for (const row of rows) for (let i = 0; i + 1 < row.length; i++) {
                const a = row[i], b = row[i + 1];
                let delta = 0;
                for (const neighbours of [above, below]) for (const x of neighbours.get(a)!) for (const y of neighbours.get(b)!) {
                    delta += Math.sign(pos.get(y)! - pos.get(x)!);
                }
                if (delta < 0) {
                    [row[i], row[i + 1]] = [b, a];
                    pos.set(a, i + 1); pos.set(b, i);
                    changed = true;
                }
            }
            if (!changed) break;
        }
    };
    let crossings = crossingCount(), best = rows.map((row) => [...row]);
    for (let pass = 0; pass < 12 && crossings; pass++) {
        sweep(pass % 2 === 0); transpose();
        const count = crossingCount();
        if (count < crossings) { crossings = count; best = rows.map((row) => [...row]); }
    }
    rows = best;

    const vertexWidth = (key: string) => vertices.get(key)!.id === undefined ? 24 : cardWidth;
    const rowWidth = (row: string[]) => row.reduce((sum, key) => sum + vertexWidth(key), 0) + Math.max(0, row.length - 1) * gapX;
    const width = Math.max(760, padding * 2 + Math.max(0, ...rows.map(rowWidth)));
    const centers = new Map<string, Point>();
    rows.forEach((row, r) => {
        let x = (width - rowWidth(row)) / 2;
        for (const key of row) {
            centers.set(key, { x: x + vertexWidth(key) / 2, y: padding + r * (cardHeight + gapY) });
            x += vertexWidth(key) + gapX;
        }
    });
    const nodes = rows.flatMap((row) => row.filter((key) => vertices.get(key)!.id !== undefined).map((key) => ({ id: vertices.get(key)!.id!, x: centers.get(key)!.x - cardWidth / 2, y: centers.get(key)!.y })));
    const sourceBuckets = new Map<number, typeof paths>(), targetBuckets = new Map<number, typeof paths>();
    for (const path of paths) {
        sourceBuckets.set(path.edge.source, [...(sourceBuckets.get(path.edge.source) ?? []), path]);
        targetBuckets.set(path.edge.target, [...(targetBuckets.get(path.edge.target) ?? []), path]);
    }
    for (const bucket of sourceBuckets.values()) bucket.sort((a, b) => centers.get(a.keys[1])!.x - centers.get(b.keys[1])!.x || a.edge.target - b.edge.target);
    for (const bucket of targetBuckets.values()) bucket.sort((a, b) => centers.get(a.keys.at(-2)!)!.x - centers.get(b.keys.at(-2)!)!.x || a.edge.source - b.edge.source);
    const port = (bucket: typeof paths, path: typeof paths[number]) => bucket.length < 2 ? 0 : (bucket.indexOf(path) / (bucket.length - 1) - .5) * Math.min(112, (bucket.length - 1) * 22);
    const edges: ManualLayoutEdge[] = paths.map((path) => {
        const source = centers.get(path.keys[0])!, target = centers.get(path.keys.at(-1)!)!;
        const first = { x: source.x + port(sourceBuckets.get(path.edge.source)!, path), y: source.y + cardHeight };
        const last = { x: target.x + port(targetBuckets.get(path.edge.target)!, path), y: target.y };
        const points = [first];
        for (const key of path.keys.slice(1, -1)) {
            const point = centers.get(key)!;
            points.push(point, { x: point.x, y: point.y + cardHeight });
        }
        points.push(last);
        return { ...path.edge, x1: first.x, y1: first.y, x2: last.x, y2: last.y, points };
    });
    return { nodes, edges, width, height: Math.max(340, padding * 2 + rows.length * cardHeight + Math.max(0, rows.length - 1) * gapY), cardWidth, cardHeight, crossings };
}

export function manualEdgeCurves(edge: ManualLayoutEdge) {
    return edge.points.slice(1).map((point, i) => {
        const from = edge.points[i], bend = (point.y - from.y) / 2;
        return { x1: from.x, y1: from.y, cx1: from.x, cy1: from.y + bend, cx2: point.x, cy2: point.y - bend, x2: point.x, y2: point.y };
    });
}

export function manualEdgePath(edge: ManualLayoutEdge) {
    return `M${edge.x1},${edge.y1}` + manualEdgeCurves(edge).map((c) => ` C${c.cx1},${c.cy1} ${c.cx2},${c.cy2} ${c.x2},${c.y2}`).join("");
}
