import type { Exercise } from '../db/schema'

const MUSCLE_ORDER: Record<string, number> = {
  // Core
  abdominales: 0,
  oblicuos: 1,
  lumbares: 2,
  // Brazos
  'bíceps': 10,
  'tríceps': 11,
  antebrazo: 12,
  // Piernas
  'cuádriceps': 20,
  isquiotibiales: 21,
  'glúteo': 22,
  aductores: 23,
  abductores: 24,
  gemelos: 25,
  // Resto (pecho, espalda, hombros)
  pectoral: 30,
  dorsal: 31,
  trapecio: 32,
  romboides: 33,
  'deltoides anterior': 34,
  'deltoides lateral': 35,
  'deltoides posterior': 36,
}

export function groupByMuscle(exercises: Exercise[]) {
  const map = new Map<string, Exercise[]>()
  for (const ex of exercises) {
    const m = ex.primary_muscle
    if (!map.has(m)) map.set(m, [])
    map.get(m)!.push(ex)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => {
      const oa = MUSCLE_ORDER[a] ?? 99
      const ob = MUSCLE_ORDER[b] ?? 99
      if (oa !== ob) return oa - ob
      return a.localeCompare(b, 'es')
    })
    .map(([muscle, items]) => ({ muscle, items }))
}
