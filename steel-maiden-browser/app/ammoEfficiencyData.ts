/** Client TOGROUND / TOAIR values in basis points, not additive panel stats. */
export type AmmoEfficiencyValues = { ground: number; air: number };

export function formatAmmoEfficiency(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) ? `${Math.floor(value / 100)}%` : "—";
}
