import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db, type SessionExercise, type SetRecord } from '../db/schema'
import { getExerciseHistory, getLastSession, type LastSessionSummary } from '../lib/lastSession'
import { suggestProgression, type ProgressionResult } from '../lib/progression'
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
  const [showCelebration, setShowCelebration] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Auto-guardado cada 2 minutos mientras la sesión está activa
  useEffect(() => {
    if (!session || session.ended_at || !sessionId) return

    async function saveCheckpoint() {
      const ses = await db.session_exercises
        .filter((se) => se.session_id === sessionId && !se.deleted_at)
        .toArray()
      const seIds = ses.map((se) => se.id)
      const allSets = await db.sets
        .filter((s) => seIds.includes(s.session_exercise_id) && !s.deleted_at)
        .toArray()
      const now = new Date().toISOString()
      await db.transaction('rw', [db.outbox], async () => {
        for (const se of ses) {
          await db.outbox.add({ table: 'session_exercises', record_id: se.id, op: 'upsert', payload: { ...se, updated_at: now }, ts: now })
        }
        for (const s of allSets) {
          await db.outbox.add({ table: 'sets', record_id: s.id, op: 'upsert', payload: { ...s, updated_at: now }, ts: now })
        }
      })
      setLastSaved(new Date())
    }

    const interval = setInterval(saveCheckpoint, 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [session?.ended_at, sessionId])

  async function finishSession() {
    if (!sessionId || !session) return
    setFinishing(true)
    const now = new Date().toISOString()

    // Todas las escrituras a Dexie/outbox ANTES de navegar.
    // En iOS, navigate() puede descargar la página y cortar operaciones async en curso.
    await db.sessions.update(sessionId, { ended_at: now, updated_at: now })

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
        await db.outbox.add({ table: 'session_exercises', record_id: se.id, op: 'upsert', payload: { ...se, updated_at: now }, ts: now })
      }
      for (const s of allSets) {
        await db.outbox.add({ table: 'sets', record_id: s.id, op: 'upsert', payload: { ...s, updated_at: now }, ts: now })
      }
    })

    setShowCelebration(true)
    setTimeout(() => navigate('/'), 2600)
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">Sesión no encontrada</p>
      </div>
    )
  }

  const isEditing = !!session.ended_at

  return (
    <div className="flex flex-col h-full">
      {showCelebration && <CelebrationOverlay />}
      <header className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-200">
        <button onClick={() => navigate(isEditing ? '/progreso' : '/')} className="text-gray-500 text-sm min-h-[44px] px-2">
          ← Atrás
        </button>
        <div className="text-center">
          <h2 className="text-base font-bold text-gray-900">
            {isEditing ? 'Editando sesión' : 'Sesión en curso'}
          </h2>
          {!isEditing && lastSaved && (
            <p className="text-xs text-gray-400">
              Guardado {lastSaved.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
          {isEditing && (
            <p className="text-xs text-gray-400">
              {new Date(session.started_at).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
          )}
        </div>
        {isEditing ? (
          <div className="w-16" />
        ) : (
          <button
            onClick={finishSession}
            disabled={finishing}
            className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl min-h-[44px]"
          >
            {finishing ? '...' : 'Terminar'}
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 pb-6">
        {isEditing && <SessionTimesEditor session={session} />}
        {sessionExercises === undefined && <p className="text-gray-400 text-sm">Cargando...</p>}
        {sessionExercises?.map((se: SessionExercise) => (
          <ExerciseCard key={se.id} sessionExercise={se} sessionId={sessionId!} routineDayId={session.routine_day_id ?? null} isEditing={isEditing} />
        ))}
      </div>
    </div>
  )
}

// ── Editor de tiempos de sesión (modo edición) ─────────────────────────────

function SessionTimesEditor({ session }: { session: { id: string; started_at: string; ended_at: string | null; updated_at: string } }) {
  function toLocalInput(iso: string) {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  async function updateTime(field: 'started_at' | 'ended_at', localValue: string) {
    if (!localValue) return
    const iso = new Date(localValue).toISOString()
    const now = new Date().toISOString()
    await db.sessions.update(session.id, { [field]: iso, updated_at: now })
    await db.outbox.add({
      table: 'sessions',
      record_id: session.id,
      op: 'upsert',
      payload: { ...session, [field]: iso, updated_at: now },
      ts: now,
    })
  }

  const durationMin = session.ended_at
    ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60_000)
    : null

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">Tiempos de la sesión</h4>
        {durationMin != null && (
          <span className="text-xs text-gray-400">{durationMin} min en total</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Inicio</label>
          <input
            type="datetime-local"
            defaultValue={toLocalInput(session.started_at)}
            onChange={(e) => updateTime('started_at', e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Fin</label>
          <input
            type="datetime-local"
            defaultValue={session.ended_at ? toLocalInput(session.ended_at) : ''}
            onChange={(e) => updateTime('ended_at', e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>
    </div>
  )
}

// ── Tarjeta de ejercicio ────────────────────────────────────────────────────

function ExerciseCard({ sessionExercise: se, sessionId, routineDayId, isEditing }: { sessionExercise: SessionExercise; sessionId: string; routineDayId: string | null; isEditing: boolean }) {
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
  const [suggestion, setSuggestion] = useState<ProgressionResult | null>(null)
  const [showNote, setShowNote] = useState(false)
  const [note, setNote] = useState(se.notes ?? '')
  const [updatePrompt, setUpdatePrompt] = useState<{ direction: 'up' | 'down'; suggestedWeight: number; currentTarget: number } | null>(null)
  const [savedEx, setSavedEx] = useState(false)
  const promptedRef = useRef(false)

  useEffect(() => {
    getLastSession(se.exercise_id, sessionId).then(setLastSummary)
  }, [se.exercise_id, sessionId])

  useEffect(() => {
    if (!exercise || !rde || isEditing) return
    getExerciseHistory(se.exercise_id, 3, sessionId).then((history) => {
      setSuggestion(suggestProgression(
        {
          rep_min: rde.rep_min,
          rep_max: rde.rep_max,
          target_rpe: rde.target_rpe,
          target_weight_kg: rde.target_weight_kg,
          weight_increment_kg: exercise.weight_increment_kg ?? 2.5,
        },
        history,
      ))
    })
  }, [se.exercise_id, sessionId, exercise?.id, rde?.id, isEditing])

  const completedCount = sets?.filter((s) => s.completed).length ?? 0
  const totalCount = sets?.length ?? 0

  useEffect(() => {
    if (!rde?.target_weight_kg || !sets || !exercise) return
    const targetSets = rde.target_sets ?? 1
    if (completedCount < targetSets) return
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

  async function saveExercise() {
    const allSets = await db.sets
      .filter((s) => s.session_exercise_id === se.id && !s.deleted_at)
      .toArray()
    const now = new Date().toISOString()
    await db.transaction('rw', [db.outbox], async () => {
      await db.outbox.add({ table: 'session_exercises', record_id: se.id, op: 'upsert', payload: { ...se, updated_at: now }, ts: now })
      for (const s of allSets) {
        await db.outbox.add({ table: 'sets', record_id: s.id, op: 'upsert', payload: { ...s, updated_at: now }, ts: now })
      }
    })
    setSavedEx(true)
    setTimeout(() => setSavedEx(false), 2000)
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
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
      {/* Cabecera ejercicio */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-gray-900 font-bold text-base leading-tight">{exercise.name}</h3>
            {rde && (
              <p className="text-emerald-600 text-xs mt-0.5">
                Objetivo: {rde.target_sets}×{rde.rep_min}–{rde.rep_max} reps
                {rde.target_weight_kg != null && ` · ${rde.target_weight_kg} kg`}
              </p>
            )}
            {lastSummary && (
              <p className="text-indigo-600 text-xs mt-0.5">
                Última vez: {lastSummary.display}
              </p>
            )}
            {suggestion && suggestion.direction !== 'first' && (
              <p className={`text-xs mt-0.5 font-medium ${
                suggestion.direction === 'up'
                  ? 'text-emerald-600'
                  : suggestion.direction === 'down'
                  ? 'text-amber-600'
                  : 'text-gray-400'
              }`}>
                {suggestion.reason}
              </p>
            )}
            {exercise.setup_tips && (
              <p className="text-gray-400 text-xs mt-0.5 line-clamp-1">{exercise.setup_tips}</p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <span className="text-xs text-gray-400">{completedCount}/{totalCount} series</span>
            <button
              onClick={() => setShowNote(!showNote)}
              className="block text-gray-400 text-xs mt-1 hover:text-gray-600"
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
              className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-900 text-xs focus:outline-none focus:border-indigo-500"
            />
            <button onClick={saveNote} className="text-indigo-600 text-xs px-2">✓</button>
          </div>
        )}
      </div>

      {/* Cabecera columnas */}
      <div className="px-4 pb-1 grid grid-cols-[2rem_1fr_1fr_2rem_2rem] gap-2 text-xs text-gray-400">
        <span>#</span>
        <span className="text-center">Peso (kg)</span>
        <span className="text-center">Reps</span>
        <span />
        <span />
      </div>

      {/* Sets */}
      <div className="divide-y divide-gray-100">
        {sets?.map((set: SetRecord) => (
          <SetRow key={set.id} set={set} />
        ))}
      </div>

      {/* Pie: añadir serie + guardar + eliminar ejercicio */}
      <div className="px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => addSet(se.id)}
          className="text-indigo-600 text-sm hover:text-indigo-500"
        >
          + Añadir serie
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={saveExercise}
            className={`text-sm font-medium transition-colors ${
              savedEx ? 'text-green-600' : 'text-gray-400 hover:text-indigo-600'
            }`}
          >
            {savedEx ? '✓ Guardado' : '↑ Guardar'}
          </button>
          <DeleteButton onConfirm={deleteExercise} size="sm" />
        </div>
      </div>

      {/* Sugerencia de actualizar objetivo (solo en sesión activa) */}
      {!isEditing && updatePrompt && (
        <div className="px-4 pb-4 pt-3 border-t border-indigo-100 bg-indigo-50">
          <p className="text-indigo-700 text-xs mb-3 leading-relaxed">
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

// ── Animación de festejo ────────────────────────────────────────────────────

const CONFETTI_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316']

function CelebrationOverlay() {
  const pieces = useMemo(() =>
    Array.from({ length: 70 }, (_, i) => ({
      id: i,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 1.4 + Math.random() * 1.0,
      size: 7 + Math.random() * 9,
      aspect: Math.random() > 0.5 ? 0.4 : 1,
    })), [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/75 overflow-hidden">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="absolute top-0 rounded-sm pointer-events-none"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * p.aspect,
            background: p.color,
            animation: `confettiFall ${p.duration}s ${p.delay}s ease-in both`,
          }}
        />
      ))}
      <div
        className="relative z-10 text-center px-8 space-y-3"
        style={{ animation: 'celebrationPop 0.5s ease-out both' }}
      >
        <div className="text-8xl">🏆</div>
        <h2 className="text-white text-3xl font-black tracking-tight">¡Sesión completada!</h2>
        <p className="text-white/70 text-lg">¡Excelente trabajo, Valentin!</p>
      </div>
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

function SetRow({ set }: { set: SetRecord }) {
  const increment = 0.5

  async function update(patch: Partial<SetRecord>) {
    const now = new Date().toISOString()
    await db.sets.update(set.id, { ...patch, updated_at: now })
  }

  async function toggleComplete() {
    await update({ completed: !set.completed })
  }

  async function deleteSet() {
    const now = new Date().toISOString()
    await db.sets.update(set.id, { deleted_at: now, updated_at: now })
    await db.outbox.add({ table: 'sets', record_id: set.id, op: 'delete', payload: { deleted_at: now }, ts: now })
  }

  const [showRPE, setShowRPE] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [noteVal, setNoteVal] = useState(set.notes ?? '')

  const rpeOptions = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]

  return (
    <div
      className={`px-4 py-2.5 transition-colors ${
        set.completed ? 'bg-green-50' : ''
      }`}
    >
      <div className="grid grid-cols-[2rem_1fr_1fr_2rem_2rem] gap-2 items-center">
        {/* Número */}
        <span className="text-gray-400 text-sm font-mono">
          {set.is_warmup ? 'C' : set.set_index + 1}
        </span>

        {/* Peso */}
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => update({ weight_kg: Math.max(0, (set.weight_kg ?? 0) - increment) })}
            className="w-8 h-8 bg-gray-100 rounded-lg text-gray-700 text-lg flex items-center justify-center active:bg-gray-200 min-h-[44px] min-w-[44px]"
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
            className="w-14 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm text-center py-1.5 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => update({ weight_kg: (set.weight_kg ?? 0) + increment })}
            className="w-8 h-8 bg-gray-100 rounded-lg text-gray-700 text-lg flex items-center justify-center active:bg-gray-200 min-h-[44px] min-w-[44px]"
          >
            +
          </button>
        </div>

        {/* Reps */}
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => update({ reps: Math.max(1, (set.reps ?? 1) - 1) })}
            className="w-8 h-8 bg-gray-100 rounded-lg text-gray-700 text-lg flex items-center justify-center active:bg-gray-200 min-h-[44px] min-w-[44px]"
          >
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={set.reps ?? ''}
            onChange={(e) => update({ reps: e.target.value ? parseInt(e.target.value) : null })}
            className="w-10 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm text-center py-1.5 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => update({ reps: (set.reps ?? 0) + 1 })}
            className="w-8 h-8 bg-gray-100 rounded-lg text-gray-700 text-lg flex items-center justify-center active:bg-gray-200 min-h-[44px] min-w-[44px]"
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
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
          }`}
        >
          ✓
        </button>

        {/* Borrar serie */}
        <button
          onClick={deleteSet}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors min-h-[44px] min-w-[44px]"
          aria-label="Borrar serie"
        >
          ×
        </button>
      </div>

      {/* RPE + nota (fila secundaria) */}
      <div className="flex items-center gap-3 mt-1.5 pl-8">
        <button
          onClick={() => setShowRPE(!showRPE)}
          className={`text-xs px-2 py-1 rounded-lg min-h-[32px] ${
            set.rpe != null
              ? 'bg-amber-50 text-amber-700'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          {set.rpe != null ? `RPE ${set.rpe}` : 'RPE'}
        </button>
        <button
          onClick={() => setShowNote(!showNote)}
          className={`text-xs px-2 py-1 rounded-lg min-h-[32px] ${
            set.notes ? 'text-gray-700' : 'text-gray-400 hover:text-gray-600'
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
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {v}
            </button>
          ))}
          <button
            onClick={() => { update({ rpe: null }); setShowRPE(false) }}
            className="px-3 py-1.5 rounded-lg text-xs text-gray-400 bg-gray-100 min-h-[36px]"
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
            className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-900 text-xs focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => { db.sets.update(set.id, { notes: noteVal || null, updated_at: new Date().toISOString() }); setShowNote(false) }}
            className="text-indigo-600 text-xs px-2"
          >
            ✓
          </button>
        </div>
      )}
    </div>
  )
}
