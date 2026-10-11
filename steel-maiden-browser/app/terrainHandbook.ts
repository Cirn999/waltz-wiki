import type { Terrain } from "./stageTypes";

export type TerrainPerspective = "ground" | "air";
export type HandbookTerrain = {
  ids: number[];
  name: string;
  image: string;
  effects: Terrain["effects"];
  range: number[];
  rangeIcon: string;
};

export function handbookTerrains(terrains: Record<string, Terrain>, perspective: TerrainPerspective = "ground"): HandbookTerrain[] {
  const groups = new Map<string, HandbookTerrain>();
  for (const terrain of Object.values(terrains).sort((a, b) => a.id - b.id)) {
    const effects = perspective === "air" ? terrain.airEffects : terrain.effects;
    const range = perspective === "air" ? terrain.altitudes : terrain.distances;
    const rangeIcon = perspective === "air" ? terrain.altitudeIcon : terrain.distanceIcon;
    // Merge only identical effects and ranges for the selected perspective.
    // Use one representative icon, including the duplicate spore fields.
    const key = JSON.stringify([terrain.name, effects.map(({ name, description, image }) => [name, description, image]), range, rangeIcon]);
    const existing = groups.get(key);
    if (existing) {
      existing.ids.push(terrain.id);
      if (!existing.image) existing.image = terrain.image;
    } else {
      groups.set(key, { ids: [terrain.id], name: terrain.name, image: terrain.image, effects, range, rangeIcon });
    }
  }
  return [...groups.values()];
}

export function matchesTerrain(terrain: HandbookTerrain, query: string): boolean {
  const text = [terrain.name, ...terrain.effects.flatMap((effect) => [effect.name, effect.description])].join(" ").toLocaleLowerCase();
  return query.trim().toLocaleLowerCase().split(/\s+/).every((word) => text.includes(word));
}
