import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db, type Exercise, type SessionExercise, type SetRecord } from '../db/schema'
import { getLastSession, type LastSessionSummary } from '../lib/lastSession'
import { DeleteButton } from '../components/DeleteButton'

export default function Sesion() {
  const { id: sessionId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const session = useLiveQuery(() => (sessionId ? db.sessions.get(sessionId) : undefined), [sessionId])
  const sessionExercises = useLiveQuery(
    () =>
      db.session_exercises
        .filter((se) => se.session_id === (sessionId ?? '') && !se.deleted_at)
        .sortBy('position'),
    [sessionId],
  )

  const [finishing, setFinishing] = useState(false)

  async function finishSession() {
    if (!sessionId || !session) return
    setFinishing(true)
    const now = new Date().toISOString()
    navigate('/')  // navegar primero; escrituras en segundo plano

    await db.sessions.update(sessionId, { ended_at: now, updated_at: now })

    // Volcar estado completo de la sesión al outbox (session + exercises + sets)
    const ses = await db.session_exercises
      .filter((se) => se.session_id === sessionId && !se.deleted_at)
      .toArray()
    const seIds = ses.map((se) => se.id)
    const allSets = await db.sets
      .filter((s) => seIds.includes(s.session_exercise_id) && !s.deleted_at)
      .toArray()

    await db.transaction('rw', [db.outbox], async () => {
      await db.outbox.add({
        table: 'sessions', record_id: sessionId, op: 'upsert',
        payload: { ...session, ended_at: now, updated_at: now }, ts: now,
      })
      for (const se of ses) {
        await db.outbox.add({ table: 'session_exercises', record_id: se.id, op: 'upsert', payload: se, ts: now })
      }
      for (const s of allSets) {
        await db.outbox.add({ table: 'sets', record_id: s.id, op: 'upsert', payload: s, ts: now })
      }
    })
  }

  if (!session || session.ended_at) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Sesión no encontrada</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-800">
        <button onClick={() => navigate('/')} className="text-gray-400 text-sm min-h-[44px] px-2">
          ← Atrás
        </button>
        <h2 className="text-base font-bold text-white">Sesión en curso</h2>
        <button
          onClick={finishSession}
          disabled={finishing}
          className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl min-h-[44px]"
        >
          {finishing ? '...' : 'Terminar'}
        </button>
      </header>

      {/* Lista de ejercicios */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 pb-6">
        {sessionExercises === undefined && <p className="text-gray-500 text-sm">Cargando...</p>}
        {sessionExercises?.map((se: SessionExercise) => (
          <ExerciseCard key={se.id} sessionExercise={se} sessionId={sessionId!} routineDayId={session.routine_day_id ?? null} />
        ))}
      </div>
    </div>
  )
}

// ── Tarjeta de ejercicio ────────────────────────────────────────────────────

function ExerciseCard({ sessionExercise: se, sessionId, routineDayId }: { sessionExercise: SessionExercise; sessionId: string; routineDayId: string | null }) {
  const sets = useLiveQuery(
    () =>
      db.sets
        .filter((s) => s.session_exercise_id === se.id && !s.deleted_at)
        .sortBy('set_index'),
    [se.id],
  )
  const exercise = useLiveQuery(() => db.exercises.get(se.exercise_id), [se.exercise_id])
  const rde = useLiveQuery(
    () =>
      routineDayId
        ? db.routine_day_exercises
            .filter((r) => r.routine_day_id === routineDayId && r.exercise_id === se.exercise_id && !r.deleted_at)
            .first()
        : undefined,
    [routineDayId, se.exercise_id],
  )
  const [lastSummary, setLastSummary] = useState<LastSessionSummary | null>(null)
  const [showNote, setShowNote] = useState(false)
  const [note, setNote] = useState(se.notes ?? '')
  const [updatePrompt, setUpdatePrompt] = useState<{ direction: 'up' | 'down'; suggestedWeight: number; currentTarget: number } | null>(null)
  const promptedRef = useRef(false)

  useEffect(() => {
    getLastSession(se.exercise_id, sessionId).then(setLastSummary)
  }, [se.exercise_id, sessionId])

  const completedCount = sets?.filter((s) => s.completed).length ?? 0
  const totalCount = sets?.length ?? 0

  useEffect(() => {
    if (!rde?.target_weight_kg || !sets || !exercise) return
    if (completedCount === 0 || completedCount !== totalCount) return
    if (promptedRef.current) return
    const doneSets = sets.filter((s) => s.completed && !s.is_warmup && s.weight_kg != null)
    if (doneSets.length === 0) return
    const maxWeight = Math.max(...doneSets.map((s) => s.weight_kg!))
    const target = rde.target_weight_kg
    const inc = exercise.weight_increment_kg ?? 2.5
    if (maxWeight >= target + inc * 0.5) {
      promptedRef.current = true
      setUpdatePrompt({ direction: 'up', suggestedWeight: maxWeight, currentTarget: target })
    } else if (maxWeight <= target - inc * 0.5) {
      promptedRef.current = true
      setUpdatePrompt({ direction: 'down', suggestedWeight: maxWeight, currentTarget: target })
    }
  }, [completedCount, totalCount, rde, sets, exercise])

  async function saveNote() {
    const now = new Date().toISOString()
    await db.session_exercises.update(se.id, { notes: note || null, updated_at: now })
    setShowNote(false)
  }

  async function updateTarget(newWeight: number) {
    if (!rde) return
    const now = new Date().toISOString()
    await db.routine_day_exercises.update(rde.id, { target_weight_kg: newWeight, updated_at: now })
    await db.outbox.add({ table: 'routine_day_exercises', record_id: rde.id, op: 'upsert', payload: { ...rde, target_weight_kg: newWeight, updated_at: now }, ts: now })
    setUpdatePrompt(null)
  }

  async function deleteExercise() {
    const now = new Date().toISOString()
    const allSets = await db.sets.filter((s) => s.session_exercise_id === se.id).toArray()
    for (const s of allSets) {
      await db.sets.update(s.id, { deleted_at: now, updated_at: now })
      await db.outbox.add({ table: 'sets', record_id: s.id, op: 'delete', payload: { deleted_at: now }, ts: now })
    }
    await db.session_exercises.update(se.id, { deleted_at: now, updated_at: now })
    await db.outbox.add({ table: 'session_exercises', record_id: se.id, op: 'delete', payload: { deleted_at: now }, ts: now })
  }

  if (!exercise) return null

  return (
    <div className="bg-gray-800 rounded-2xl overflow-hidden">
      {/* Cabecera ejercicio */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-bold text-base leading-tight">{exercise.name}</h3>
            {rde && (
              <p className="text-emerald-500 text-xs mt-0.5">
                Objetivo: {rde.target_sets}×{rde.rep_min}–{rde.rep_max} reps
                {rde.target_weight_kg != null && ` · ${rde.target_weight_kg} kg`}
              </p>
            )}
            {lastSummary && (
              <p className="text-indigo-400 text-xs mt-0.5">
                Última vez: {lastSummary.display}
              </p>
            )}
            {exercise.setup_tips && (
              <p className="text-gray-500 text-xs mt-0.5 line-clamp-1">{exercise.setup_tips}</p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <span className="text-xs text-gray-400">{completedCount}/{totalCount} series</span>
            <button
              onClick={() => setShowNote(!showNote)}
              className="block text-gray-500 text-xs mt-1 hover:text-gray-300"
            >
              {se.notes ? '📝 nota' : '+ nota'}
            </button>
          </div>
        </div>

        {showNote && (
          <div className="mt-2 flex gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nota del ejercicio..."
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500"
            />
            <button onClick={saveNote} className="text-indigo-400 text-xs px-2">✓</button>
          </div>
        )}
      </div>

      {/* Cabecera columnas */}
      <div className="px-4 pb-1 grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 text-xs text-gray-500">
        <span>#</span>
        <span className="text-center">Peso (kg)</span>
        <span className="text-center">Reps</span>
        <span />
      </div>

      {/* Sets */}
      <div className="divide-y divide-gray-700/50">
        {sets?.map((set: SetRecord) => (
          <SetRow key={set.id} set={set} exercise={exercise} />
        ))}
      </div>

      {/* Botón añadir serie + eliminar ejercicio */}
      <div className="px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => addSet(se.id)}
          className="text-indigo-400 text-sm hover:text-indigo-300"
        >
          + Añadir serie
        </button>
        <DeleteButton onConfirm={deleteExercise} size="sm" />
      </div>

      {/* Sugerencia de actualizar objetivo */}
      {updatePrompt && (
        <div className="px-4 pb-4 pt-3 border-t border-indigo-800/40 bg-indigo-950/30">
          <p className="text-indigo-200 text-xs mb-3 leading-relaxed">
            {updatePrompt.direction === 'up'
              ? `Superaste el objetivo (${updatePrompt.currentTarget} kg → máx ${updatePrompt.suggestedWeight} kg). ¿Subir el objetivo?`
              : `Quedaste por debajo del objetivo (${updatePrompt.currentTarget} kg → máx ${updatePrompt.suggestedWeight} kg). ¿Bajar el objetivo?`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => updateTarget(updatePrompt.suggestedWeight)}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2.5 rounded-xl min-h-[44px]"
            >
              {updatePrompt.direction === 'up'
                ? `↑ Subir a ${updatePrompt.suggestedWeight} kg`
                : `↓ Bajar a ${updatePrompt.suggestedWeight} kg`}
            </button>
            <button
              onClick={() => setUpdatePrompt(null)}
              className="px-5 text-gray-400 text-xs min-h-[44px]"
            >
              Mantener
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

async function addSet(sessionExerciseId: string) {
  const now = new Date().toISOString()
  const existing = await db.sets
    .filter((s) => s.session_exercise_id === sessionExerciseId && !s.deleted_at)
    .toArray()
  const lastSet = existing.sort((a, b) => b.set_index - a.set_index)[0]
  await db.sets.add({
    id: crypto.randomUUID(),
    session_exercise_id: sessionExerciseId,
    set_index: (lastSet?.set_index ?? -1) + 1,
    is_warmup: false,
    planned_reps: lastSet?.planned_reps ?? null,
    planned_weight_kg: lastSet?.planned_weight_kg ?? null,
    reps: lastSet?.reps ?? null,
    weight_kg: lastSet?.weight_kg ?? null,
    rpe: null,
    completed: false,
    notes: null,
    updated_at: now,
    deleted_at: null,
  })
}

// ── Fila de serie ───────────────────────────────────────────────────────────

function SetRow({ set, exercise }: { set: SetRecord; exercise: Exercise }) {
  const increment = exercise.weight_increment_kg

  async function update(patch: Partial<SetRecord>) {
    const now = new Date().toISOString()
    await db.sets.update(set.id, { ...patch, updated_at: now })
  }

  async function toggleComplete() {
    await update({ completed: !set.completed })
  }

  const [showRPE, setShowRPE] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [noteVal, setNoteVal] = useState(set.notes ?? '')

  const rpeOptions = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]

  return (
    <div
      className={`px-4 py-2.5 transition-colors ${
        set.completed ? 'bg-green-950/30' : ''
      }`}
    >
      <div className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 items-center">
        {/* Número */}
        <span className="text-gray-400 text-sm font-mono">
          {set.is_warmup ? 'C' : set.set_index + 1}
        </span>

        {/* Peso */}
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => update({ weight_kg: Math.max(0, (set.weight_kg ?? 0) - increment) })}
            className="w-8 h-8 bg-gray-700 rounded-lg text-white text-lg flex items-center justify-center active:bg-gray-600 min-h-[44px] min-w-[44px]"
          >
            −
          </button>
          <input
            type="number"
            inputMode="decimal"
            step={increment}
            min={0}
            value={set.weight_kg ?? ''}
            onChange={(e) => update({ weight_kg: e.target.value ? parseFloat(e.target.value) : null })}
            className="w-14 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm text-center py-1.5 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => update({ weight_kg: (set.weight_kg ?? 0) + increment })}
            className="w-8 h-8 bg-gray-700 rounded-lg text-white text-lg flex items-center justify-center active:bg-gray-600 min-h-[44px] min-w-[44px]"
          >
            +
          </button>
        </div>

        {/* Reps */}
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => update({ reps: Math.max(1, (set.reps ?? 1) - 1) })}
            className="w-8 h-8 bg-gray-700 rounded-lg text-white text-lg flex items-center justify-center active:bg-gray-600 min-h-[44px] min-w-[44px]"
          >
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={set.reps ?? ''}
            onChange={(e) => update({ reps: e.target.value ? parseInt(e.target.value) : null })}
            className="w-10 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm text-center py-1.5 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => update({ reps: (set.reps ?? 0) + 1 })}
            className="w-8 h-8 bg-gray-700 rounded-lg text-white text-lg flex items-center justify-center active:bg-gray-600 min-h-[44px] min-w-[44px]"
          >
            +
          </button>
        </div>

        {/* Completar */}
        <button
          onClick={toggleComplete}
          className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold min-h-[44px] min-w-[44px] transition-colors ${
            set.completed
              ? 'bg-green-600 text-white'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
        >
          ✓
        </button>
      </div>

      {/* RPE + nota (fila secundaria) */}
      <div className="flex items-center gap-3 mt-1.5 pl-8">
        <button
          onClick={() => setShowRPE(!showRPE)}
          className={`text-xs px-2 py-1 rounded-lg min-h-[32px] ${
            set.rpe != null
              ? 'bg-amber-900/50 text-amber-300'
              : 'text-gray-500 hover:text-gray-400'
          }`}
        >
          {set.rpe != null ? `RPE ${set.rpe}` : 'RPE'}
        </button>
        <button
          onClick={() => setShowNote(!showNote)}
          className={`text-xs px-2 py-1 rounded-lg min-h-[32px] ${
            set.notes ? 'text-gray-300' : 'text-gray-500 hover:text-gray-400'
          }`}
        >
          {set.notes ? '📝' : '+ nota'}
        </button>
      </div>

      {/* Selector RPE */}
      {showRPE && (
        <div className="flex flex-wrap gap-1.5 mt-2 pl-8">
          {rpeOptions.map((v) => (
            <button
              key={v}
              onClick={() => { update({ rpe: v }); setShowRPE(false) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono min-h-[36px] ${
                set.rpe === v
                  ? 'bg-amber-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {v}
            </button>
          ))}
          <button
            onClick={() => { update({ rpe: null }); setShowRPE(false) }}
            className="px-3 py-1.5 rounded-lg text-xs text-gray-500 bg-gray-700 min-h-[36px]"
          >
            Quitar
          </button>
        </div>
      )}

      {/* Nota de la serie */}
      {showNote && (
        <div className="flex gap-2 mt-2 pl-8">
          <input
            value={noteVal}
            onChange={(e) => setNoteVal(e.target.value)}
            placeholder="Nota de la serie..."
            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => { db.sets.update(set.id, { notes: noteVal || null, updated_at: new Date().toISOString() }); setShowNote(false) }}
            className="text-indigo-400 text-xs px-2"
          >
            ✓
          </button>
        </div>
      )}
    </div>
  )
}
