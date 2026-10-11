// These are the recipe variants actually assigned to cards in the client, not
// rarity or displayed blueprint guesses. Unused lower-cost templates in N5/N6
// must not shift the three active tiers. N1/N2 each have one active recipe.
export const costTiersByStage = {
  N1: { 1: "normal" }, N2: { 1: "normal" },
  N3: { 1: "normal", 2: "high" },
  N4: { 1: "low", 2: "normal", 3: "high" },
  N5: { 2: "low", 3: "normal", 4: "high" },
  N6: { 3: "low", 4: "normal", 5: "high" },
};
const suffixes = { low: "-", normal: "", high: "+" };

export function organizeMagicCosts(rows, progression) {
  const paths = new Map();
  for (const [stage, vehicles] of Object.entries(progression)) {
    for (const [vehicle, kinds] of Object.entries(vehicles)) {
      for (const [kind, recipes] of Object.entries(kinds)) {
        for (const recipe of recipes) {
          if (paths.has(recipe.selectorId)) throw new Error(`Duplicate magic selector ${recipe.selectorId}`);
          if (recipe.levels.length !== 10) throw new Error(`Incomplete magic recipe ${recipe.selectorId}`);
          paths.set(recipe.selectorId, { stage, vehicle, kind, variant: recipe.selectorId % 10, recipe });
        }
      }
    }
  }
  const groups = ["low", "normal", "high"].flatMap((tier) => [1, 2, 3, 4, 5, 6].map((number) => ({
    id: `N${number}${suffixes[tier]}`, stage: `N${number}`, tier, count: 0,
  })));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const cards = rows.map((row) => {
    const ordnance = paths.get(row.magicSelectors.ordnance);
    const tactics = paths.get(row.magicSelectors.tactics);
    if (!ordnance || !tactics || ordnance.kind !== "ordnance" || tactics.kind !== "tactics"
      || ordnance.stage !== tactics.stage || ordnance.vehicle !== tactics.vehicle || ordnance.variant !== tactics.variant) {
      throw new Error(`Mismatched magic cost recipes for ${row.id} ${row.tank}`);
    }
    const tier = costTiersByStage[ordnance.stage]?.[ordnance.variant];
    if (!tier) throw new Error(`Unclassified magic cost recipe ${ordnance.recipe.selectorId} for ${row.id}`);
    const group = `${ordnance.stage}${suffixes[tier]}`;
    groupById.get(group).count++;
    return { id: row.id, tank: row.tank, person: row.person, blueprint: row.stage, group,
      costStage: ordnance.stage, tier, vehicle: ordnance.vehicle, ...row.magicSelectors };
  });
  const used = new Set(cards.flatMap((card) => [card.ordnance, card.tactics]));
  return {
    source: "CapsuleTypeInfo group_b_ids → CapsuleFacultyTrainInfo type-12 selector → ConsumeGroupInfo",
    semantics: "按本车实际魔改配方归组；不同费用组选项取或，与其他筛选条件取且。空钢沿用同档位命名，资源仍保留其真实配方。",
    groups, cards,
    recipes: Object.fromEntries([...paths].filter(([id]) => used.has(id)).map(([id, value]) => [id, value])),
    exceptions: cards.filter((card) => card.blueprint !== card.costStage),
  };
}
