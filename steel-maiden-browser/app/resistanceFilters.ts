type ResistanceOption = { resistance: readonly string[] };

export function matchesCraftResistances(
  options: readonly ResistanceOption[],
  selected: readonly string[],
  allowCrossCraftResistance = false,
): boolean {
  if (!selected.length) return true;
  if (allowCrossCraftResistance) {
    return selected.every((name) => options.some((option) => option.resistance.includes(name)));
  }
  return options.some((option) => selected.every((name) => option.resistance.includes(name)));
}
