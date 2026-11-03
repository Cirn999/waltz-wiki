export type ManualResearchNode = {
    id: number;
    tank: string;
    person: string;
    stage: string;
};
export type ManualRecipe = {
    id: string;
    targetId: number;
    requirements: {
        cardId: number;
        generation: number | null;
        level: number | null;
    }[];
};
export type ManualResearchData = {
    nodes: ManualResearchNode[];
    recipes: ManualRecipe[];
};
export type ManualEdge = {
    source: number;
    target: number;
    recipeIds: string[];
};
export type ManualGraph = {
    rootId: number | null;
    ids: number[];
    edges: ManualEdge[];
};
export type ExpandDirection = "up" | "down";
export type ExpansionChoice = {
    node: ManualResearchNode;
    edge: ManualEdge;
    status: "new" | "connect" | "added" | "cycle";
    requirements: string[];
};
export const createManualGraph = (rootId: number | null = null): ManualGraph => ({ rootId, ids: rootId === null ? [] : [rootId], edges: [] });
export function reaches(edges: ManualEdge[], start: number, target: number) {
    const pending = [start], seen = new Set<number>();
    while (pending.length) {
        const id = pending.pop()!;
        if (id === target)
            return true;
        if (seen.has(id))
            continue;
        seen.add(id);
        edges.filter((edge) => edge.source === id).forEach((edge) => pending.push(edge.target));
    }
    return false;
}
export function expansionChoices(data: ManualResearchData, graph: ManualGraph, anchor: number, direction: ExpandDirection): ExpansionChoice[] {
    const nodes = new Map(data.nodes.map((node) => [node.id, node]));
    const grouped = new Map<number, {
        recipeIds: string[];
        requirements: Set<string>;
    }>();
    for (const recipe of data.recipes) {
        const candidates = direction === "up" && recipe.targetId === anchor ? recipe.requirements.map((r) => r.cardId)
            : direction === "down" && recipe.requirements.some((r) => r.cardId === anchor) ? [recipe.targetId] : [];
        for (const id of candidates) {
            if (!nodes.has(id) || id === anchor)
                continue;
            const group = grouped.get(id) ?? { recipeIds: [], requirements: new Set<string>() };
            group.recipeIds.push(recipe.id);
            const requirement = recipe.requirements.find((r) => r.cardId === (direction === "up" ? id : anchor));
            const label = [requirement?.generation ? `${requirement.generation}期` : "", requirement?.level ? `${requirement.level}级` : ""].filter(Boolean).join(" · ");
            if (label)
                group.requirements.add(label);
            grouped.set(id, group);
        }
    }
    return [...grouped].map(([id, value]) => {
        const edge = { source: direction === "up" ? id : anchor, target: direction === "up" ? anchor : id, recipeIds: [...new Set(value.recipeIds)] };
        const status = graph.edges.some((e) => e.source === edge.source && e.target === edge.target) ? "added"
            : reaches(graph.edges, edge.target, edge.source) ? "cycle" : graph.ids.includes(id) ? "connect" : "new";
        return { node: nodes.get(id)!, edge, status, requirements: [...value.requirements] } as ExpansionChoice;
    }).sort((a, b) => a.node.id - b.node.id);
}
export function expandManualGraph(data: ManualResearchData, graph: ManualGraph, anchor: number, direction: ExpandDirection, selected: number): ManualGraph {
    if (!graph.ids.includes(anchor))
        return graph;
    const choice = expansionChoices(data, graph, anchor, direction).find((c) => c.node.id === selected);
    if (!choice || choice.status === "added" || choice.status === "cycle")
        return graph;
    return { ...graph, ids: [...new Set([...graph.ids, selected])], edges: [...graph.edges, choice.edge] };
}
export function visibleManualGraph(data: ManualResearchData, graph: ManualGraph): ManualGraph {
    const ids = new Set(data.nodes.map((n) => n.id));
    if (graph.rootId === null || !ids.has(graph.rootId))
        return createManualGraph();
    const edges = graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target) && data.recipes.some((r) => r.targetId === e.target && r.requirements.some((p) => p.cardId === e.source)));
    const connected = new Set([graph.rootId]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const edge of edges)
            if (connected.has(edge.source) || connected.has(edge.target))
                for (const id of [edge.source, edge.target])
                    if (!connected.has(id)) {
                        connected.add(id);
                        changed = true;
                    }
    }
    return { rootId: graph.rootId, ids: graph.ids.filter((id) => connected.has(id)), edges: edges.filter((e) => connected.has(e.source) && connected.has(e.target)) };
}
export { layoutManualGraph, manualEdgeCurves, manualEdgePath } from "./manualResearchLayout.ts";
