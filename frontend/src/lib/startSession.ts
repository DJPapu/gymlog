import { db } from '../db/schema'
import { getExerciseHistory } from './lastSession'
import { suggestProgression } from './progression'

/**
 * Crea una nueva sesión en Dexie a partir de un día de rutina.
 * Precarga los sets con la sugerencia de progresión basada en el historial.
 * Para ejercicios de cardio, crea un único set de duración.
 * Retorna el id de la sesión creada.
 */
export async function startSession(routineDayId: string, userId: string): Promise<string> {
  const now = new Date().toISOString()
  const sessionId = crypto.randomUUID()

  const rdes = await db.routine_day_exercises
    .filter((r) => r.routine_day_id === routineDayId && !r.deleted_at)
    .sortBy('position')

  // Pre-compute per-exercise data (exercise type + progression suggestion)
  const rdeData = await Promise.all(
    rdes.map(async (rde) => {
      const exercise = await db.exercises.get(rde.exercise_id)
      if (exercise?.exercise_type === 'cardio') {
        return { rde, isCardio: true, suggestion: null }
      }
      const history = await getExerciseHistory(rde.exercise_id, 3)
      const suggestion = suggestProgression(
        {
          rep_min: rde.rep_min,
          rep_max: rde.rep_max,
          target_rpe: rde.target_rpe,
          target_weight_kg: rde.target_weight_kg,
          weight_increment_kg: exercise?.weight_increment_kg ?? 2.5,
        },
        history,
      )
      return { rde, isCardio: false, suggestion }
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

    for (let pos = 0; pos < rdeData.length; pos++) {
      const { rde, isCardio, suggestion } = rdeData[pos]
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

      if (isCardio) {
        // Cardio: single set tracking duration
        await db.sets.add({
          id: crypto.randomUUID(),
          session_exercise_id: seId,
          set_index: 0,
          is_warmup: false,
          planned_reps: null,
          planned_weight_kg: null,
          reps: null,
          weight_kg: null,
          rpe: null,
          completed: false,
          notes: null,
          duration_min: null,
          updated_at: now,
          deleted_at: null,
        })
      } else {
        for (let i = 0; i < rde.target_sets; i++) {
          await db.sets.add({
            id: crypto.randomUUID(),
            session_exercise_id: seId,
            set_index: i,
            is_warmup: false,
            planned_reps: suggestion?.reps ?? null,
            planned_weight_kg: suggestion?.weight_kg ?? null,
            reps: suggestion?.reps ?? null,
            weight_kg: suggestion?.weight_kg ?? null,
            rpe: null,
            completed: false,
            notes: null,
            duration_min: null,
            updated_at: now,
            deleted_at: null,
          })
        }
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
