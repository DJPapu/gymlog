import { db } from '../db/schema'

export interface LastSessionSummary {
  date: string          // ISO
  sets: number
  reps: number | null   // reps de la top set
  weight_kg: number | null
  display: string       // "3×10 @ 40 kg"
}

/** Última sesión completada para un ejercicio dado, sin contar la sesión activa. */
export async function getLastSession(
  exerciseId: string,
  excludeSessionId?: string,
): Promise<LastSessionSummary | null> {
  // Buscar session_exercises del ejercicio, ordenadas por sesión más reciente
  const allSE = await db.session_exercises
    .filter((se) => se.exercise_id === exerciseId && !se.deleted_at)
    .toArray()

  // Obtener las sesiones asociadas (excluir la activa)
  const sessionIds = [...new Set(allSE.map((se) => se.session_id))].filter(
    (id) => id !== excludeSessionId,
  )
  if (sessionIds.length === 0) return null

  const sessions = await db.sessions
    .where('id')
    .anyOf(sessionIds)
    .filter((s) => !!s.ended_at && !s.deleted_at)
    .toArray()

  if (sessions.length === 0) return null

  // La más reciente
  sessions.sort((a, b) => (b.started_at > a.started_at ? 1 : -1))
  const lastSession = sessions[0]

  const se = allSE.find((s) => s.session_id === lastSession.id)
  if (!se) return null

  const sets = await db.sets
    .filter((s) => s.session_exercise_id === se.id && s.completed && !s.is_warmup && !s.deleted_at)
    .toArray()

  if (sets.length === 0) return null

  // Top set por e1RM (Epley: w * (1 + reps/30))
  const top = sets.reduce((best, s) => {
    const e1rm = (s.weight_kg ?? 0) * (1 + (s.reps ?? 0) / 30)
    const bE1rm = (best.weight_kg ?? 0) * (1 + (best.reps ?? 0) / 30)
    return e1rm > bE1rm ? s : best
  }, sets[0])

  const setsCount = sets.length
  const repsList = sets.map((s) => s.reps ?? 0)
  const allSameReps = repsList.every((r) => r === repsList[0])
  const repsDisplay = allSameReps ? `${repsList[0]}` : repsList.join('/')

  const display =
    top.weight_kg != null
      ? `${setsCount}×${repsDisplay} @ ${top.weight_kg.toLocaleString('es', { maximumFractionDigits: 2 })} kg`
      : `${setsCount}×${repsDisplay}`

  return {
    date: lastSession.started_at,
    sets: setsCount,
    reps: top.reps,
    weight_kg: top.weight_kg,
    display,
  }
}
