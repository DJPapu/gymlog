const MET: Record<string, number> = {
  isolation: 3.5,
  core: 3.5,
  push: 5.0,
  pull: 5.0,
  carry: 5.0,
  lunge: 5.5,
  squat: 6.0,
  hinge: 6.0,
}
const DEFAULT_MET = 5.0

/** Estimate kcal burned. Returns null if duration or weight are missing. */
export function estimateCalories(
  durationMin: number | null | undefined,
  movementPatterns: string[],
  weightKg: number | null | undefined,
): number | null {
  if (!durationMin || !weightKg) return null
  const met =
    movementPatterns.length > 0
      ? movementPatterns.reduce((s, p) => s + (MET[p] ?? DEFAULT_MET), 0) / movementPatterns.length
      : DEFAULT_MET
  return Math.round(met * weightKg * (durationMin / 60))
}
