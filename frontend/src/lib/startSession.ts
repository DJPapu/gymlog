import { db } from '../db/schema'

/**
 * Crea una nueva sesión en Dexie a partir de un día de rutina.
 * Copia planned_reps y planned_weight_kg desde el plan para que el
 * historial no se altere si después se modifica la rutina.
 * Retorna el id de la sesión creada.
 */
export async function startSession(routineDayId: string, userId: string): Promise<string> {
  const now = new Date().toISOString()
  const sessionId = crypto.randomUUID()

  // Obtener ejercicios del día ordenados por posición
  const rdes = await db.routine_day_exercises
    .filter((r) => r.routine_day_id === routineDayId && !r.deleted_at)
    .sortBy('position')

  await db.transaction('rw', [db.sessions, db.session_exercises, db.sets, db.outbox], async () => {
    // Crear sesión
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

    // Para cada ejercicio del día, crear session_exercise + sets planificados
    for (let pos = 0; pos < rdes.length; pos++) {
      const rde = rdes[pos]
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

      // Crear tantos sets como target_sets, precargados con lo planificado
      for (let i = 0; i < rde.target_sets; i++) {
        await db.sets.add({
          id: crypto.randomUUID(),
          session_exercise_id: seId,
          set_index: i,
          is_warmup: false,
          planned_reps: rde.rep_max,         // sugerimos el máximo del rango
          planned_weight_kg: rde.target_weight_kg,
          reps: rde.rep_max,                 // precargado, el usuario edita
          weight_kg: rde.target_weight_kg,
          rpe: null,
          completed: false,
          notes: null,
          updated_at: now,
          deleted_at: null,
        })
      }
    }

    // Añadir a outbox para sync posterior
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
