import { db } from '../db/schema'
import { getExerciseHistory } from './lastSession'
import { suggestProgression } from './progression'

/**
 * Crea una nueva sesión en Dexie a partir de un día de rutina.
 * Precarga los sets con la sugerencia de progresión basada en el historial.
 * Retorna el id de la sesión creada.
 */
export async function startSession(routineDayId: string, userId: string): Promise<string> {
  const now = new Date().toISOString()
  const sessionId = crypto.randomUUID()

  const rdes = await db.routine_day_exercises
    .filter((r) => r.routine_day_id === routineDayId && !r.deleted_at)
    .sortBy('position')

  // Calcular sugerencia para cada ejercicio antes de la transacción
  const suggestions = await Promise.all(
    rdes.map(async (rde) => {
      const exercise = await db.exercises.get(rde.exercise_id)
      const history = await getExerciseHistory(rde.exercise_id, 3)
      return suggestProgression(
        {
          rep_min: rde.rep_min,
          rep_max: rde.rep_max,
          target_rpe: rde.target_rpe,
          target_weight_kg: rde.target_weight_kg,
          weight_increment_kg: exercise?.weight_increment_kg ?? 2.5,
        },
        history,
      )
    }),
  )

  await db.transaction('rw', [db.sessions, db.session_exercises, db.sets, db.outbox], async () => {
    await db.sessions.add({
      id: sessionId,
      user_id: userId,
      routine_day_id: routineDayId,
      started_at: now,
      ended_at: null,
      notes: null,
      updated_at: now,
      deleted_at: null,
    })

    for (let pos = 0; pos < rdes.length; pos++) {
      const rde = rdes[pos]
      const suggestion = suggestions[pos]
      const seId = crypto.randomUUID()

      await db.session_exercises.add({
        id: seId,
        session_id: sessionId,
        exercise_id: rde.exercise_id,
        position: pos,
        notes: null,
        updated_at: now,
        deleted_at: null,
      })

      for (let i = 0; i < rde.target_sets; i++) {
        await db.sets.add({
          id: crypto.randomUUID(),
          session_exercise_id: seId,
          set_index: i,
          is_warmup: false,
          planned_reps: suggestion.reps,
          planned_weight_kg: suggestion.weight_kg,
          reps: suggestion.reps,
          weight_kg: suggestion.weight_kg,
          rpe: null,
          completed: false,
          notes: null,
          updated_at: now,
          deleted_at: null,
        })
      }
    }

    await db.outbox.add({
      table: 'sessions',
      record_id: sessionId,
      op: 'upsert',
      payload: { id: sessionId, user_id: userId, routine_day_id: routineDayId, started_at: now },
      ts: now,
    })
  })

  return sessionId
}
