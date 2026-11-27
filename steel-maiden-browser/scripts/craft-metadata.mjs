const rankLabels = { 1: "一期", 2: "二期", 3: "三期" };

export function createCraftMetadata(technology) {
  const byId = new Map(technology.blocks.flatMap((block) => block.nodes.map((node) => [node.craftId, { node, rank: block.generation }])));
  return (options) => options.map((option) => {
    const current = byId.get(option.id);
    const rank = current?.rank ?? option.rank;
    return {
      ...option, rank, rankLabel: rankLabels[rank] ?? option.rankLabel,
      resistanceDetails: (option.resistanceDetails ?? []).map((trait) => ({
        ...trait,
        description: current?.node.traits.find((item) => item.name === trait.name)?.description?.trim() ?? "",
      })),
    };
  });
}
