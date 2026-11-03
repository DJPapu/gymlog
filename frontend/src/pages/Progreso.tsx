import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type Session, type SessionExercise, type SetRecord } from '../db/schema'
import { useAuth } from '../lib/auth'
import { DeleteButton } from '../components/DeleteButton'

export default function Progreso() {
  const { user } = useAuth()

  const sessions = useLiveQuery(
    () =>
      db.sessions
        .filter((s) => s.user_id === (user?.id ?? '') && !!s.ended_at && !s.deleted_at)
        .toArray()
        .then((list) => {
          list.sort((a, b) => (b.started_at > a.started_at ? 1 : -1))
          return list
        }),
    [user?.id],
  )

  const allDays = useLiveQuery(() => db.routine_days.filter((d) => !d.deleted_at).toArray(), [])
  const dayMap = allDays ? Object.fromEntries(allDays.map((d) => [d.id, d])) : {}

  return (
    <div className="flex flex-col h-full">
      <header className="px-4 pt-4 pb-3">
        <h2 className="text-xl font-bold text-white">Progreso</h2>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {sessions === undefined && (
          <div className="bg-gray-800 rounded-2xl p-5 animate-pulse h-24" />
        )}
        {sessions?.length === 0 && (
          <div className="text-center mt-16 space-y-2">
            <p className="text-4xl">🏋️</p>
            <p className="text-gray-400 text-sm">Aún no hay sesiones registradas.</p>
            <p className="text-gray-600 text-xs">Completa tu primera sesión para ver el historial.</p>
          </div>
        )}
        {sessions?.map((s) => (
          <SessionCard
            key={s.id}
            session={s}
            dayName={s.routine_day_id ? dayMap[s.routine_day_id]?.name : undefined}
          />
        ))}
      </div>
    </div>
  )
}

// ── Tarjeta de sesión ───────────────────────────────────────────────────────

function SessionCard({ session, dayName }: { session: Session; dayName?: string }) {
  const [expanded, setExpanded] = useState(false)

  async function deleteSession() {
    const now = new Date().toISOString()
    const ses = await db.session_exercises.filter((se) => se.session_id === session.id).toArray()
    for (const se of ses) {
      const allSets = await db.sets.filter((s) => s.session_exercise_id === se.id).toArray()
      for (const s of allSets) {
        await db.sets.update(s.id, { deleted_at: now, updated_at: now })
        await db.outbox.add({ table: 'sets', record_id: s.id, op: 'delete', payload: { deleted_at: now }, ts: now })
      }
      await db.session_exercises.update(se.id, { deleted_at: now, updated_at: now })
      await db.outbox.add({ table: 'session_exercises', record_id: se.id, op: 'delete', payload: { deleted_at: now }, ts: now })
    }
    await db.sessions.update(session.id, { deleted_at: now, updated_at: now })
    await db.outbox.add({ table: 'sessions', record_id: session.id, op: 'delete', payload: { deleted_at: now }, ts: now })
  }

  const sessionExercises = useLiveQuery(
    () =>
      db.session_exercises
        .filter((se) => se.session_id === session.id && !se.deleted_at)
        .sortBy('position'),
    [session.id],
  )

  const startDate = new Date(session.started_at)
  const dateStr = startDate.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const timeStr = startDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

  const durationMin = session.ended_at
    ? Math.round((new Date(session.ended_at).getTime() - startDate.getTime()) / 60_000)
    : null

  return (
    <div className="bg-gray-800 rounded-2xl overflow-hidden">
      <div className="flex items-start">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 text-left px-4 py-4 min-w-0"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-white font-semibold leading-tight">
                {dayName ?? 'Sesión libre'}
              </p>
              <p className="text-gray-400 text-xs mt-0.5 capitalize">
                {dateStr} · {timeStr}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {durationMin != null && (
                <p className="text-gray-500 text-xs">{durationMin} min</p>
              )}
              {sessionExercises !== undefined && (
                <p className="text-gray-600 text-xs">{sessionExercises.length} ejercicios</p>
              )}
              <span className="text-gray-600 text-xs block mt-1">{expanded ? '▲' : '▼'}</span>
            </div>
          </div>
        </button>
        <div className="pt-3 pr-2 shrink-0">
          <DeleteButton onConfirm={deleteSession} size="sm" />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-700 px-4 pt-3 pb-4 space-y-4">
          {!sessionExercises ? (
            <p className="text-gray-500 text-xs">Cargando...</p>
          ) : sessionExercises.length === 0 ? (
            <p className="text-gray-500 text-xs">Sin ejercicios registrados</p>
          ) : (
            sessionExercises.map((se: SessionExercise) => (
              <ExerciseSummary key={se.id} sessionExercise={se} />
            ))
          )}
          {session.notes && (
            <p className="text-gray-400 text-xs italic border-t border-gray-700 pt-3">
              {session.notes}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Resumen de ejercicio dentro de una sesión ───────────────────────────────

function ExerciseSummary({ sessionExercise: se }: { sessionExercise: SessionExercise }) {
  const exercise = useLiveQuery(() => db.exercises.get(se.exercise_id), [se.exercise_id])
  const sets = useLiveQuery(
    () =>
      db.sets
        .filter((s) => s.session_exercise_id === se.id && !s.deleted_at)
        .sortBy('set_index'),
    [se.id],
  )

  if (!exercise || !sets) return null

  const completedSets = sets.filter((s) => s.completed && !s.is_warmup)
  const totalSets = sets.filter((s) => !s.is_warmup)

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        {exercise.photo_ref && (
          <img
            src={`/${exercise.photo_ref}`}
            alt=""
            className="w-7 h-7 object-cover rounded shrink-0"
          />
        )}
        <p className="text-white text-sm font-medium leading-tight">{exercise.name}</p>
        <span className="ml-auto text-gray-500 text-xs shrink-0">
          {completedSets.length}/{totalSets.length} series
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {sets.map((s: SetRecord) => (
          <SetChip key={s.id} set={s} />
        ))}
      </div>

      {se.notes && (
        <p className="text-gray-500 text-xs mt-1.5 italic">{se.notes}</p>
      )}
    </div>
  )
}

function SetChip({ set: s }: { set: SetRecord }) {
  const hasData = s.weight_kg != null || s.reps != null

  if (!hasData && !s.completed) {
    return (
      <span className="text-xs px-2 py-1 rounded-lg bg-gray-700 text-gray-600 line-through">
        serie {s.set_index + 1}
      </span>
    )
  }

  const label = [
    s.weight_kg != null ? `${s.weight_kg.toLocaleString('es', { maximumFractionDigits: 2 })} kg` : null,
    s.reps != null ? `× ${s.reps}` : null,
    s.rpe != null ? `RPE ${s.rpe}` : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span
      className={`text-xs px-2.5 py-1 rounded-lg font-mono ${
        s.completed
          ? s.is_warmup
            ? 'bg-gray-700 text-gray-400'
            : 'bg-green-900/50 text-green-300'
          : 'bg-gray-700 text-gray-500 line-through'
      }`}
    >
      {label || `serie ${s.set_index + 1}`}
    </span>
  )
}
