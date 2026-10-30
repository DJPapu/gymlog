import exercisesJson from '../../../catalog/exercises.json'
import { db } from '../db/schema'

export async function seedCatalogIfEmpty(): Promise<void> {
  const count = await db.exercises.count()
  if (count > 0) return

  const now = new Date().toISOString()
  await db.exercises.bulkAdd(
    (exercisesJson as Record<string, unknown>[]).map((ex) => ({
      id: ex.id as string,
      name: ex.name as string,
      machine_name: (ex.machine_name as string) ?? null,
      equipment: ex.equipment as string,
      primary_muscle: ex.primary_muscle as string,
      secondary_muscles: (ex.secondary_muscles as string[]) ?? [],
      movement_pattern: ex.movement_pattern as string,
      unilateral: ex.unilateral as boolean,
      weight_increment_kg: ex.weight_increment_kg as number,
      default_rep_range: (ex.default_rep_range as string) ?? null,
      setup_tips: (ex.setup_tips as string) ?? null,
      photo_ref: (ex.photo_ref as string) ?? null,
      created_by: null,
      updated_at: now,
      deleted_at: null,
    })),
  )
  console.log(`[seed] ${exercisesJson.length} ejercicios cargados en Dexie`)
}
