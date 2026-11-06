import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type Exercise, type Routine, type RoutineDay } from '../db/schema'
import { apiFetch } from '../lib/api'
import { useAuth } from '../lib/auth'
import { groupByMuscle } from '../lib/muscleGroups'

const EQUIPMENT_OPTIONS = ['machine', 'cable', 'barbell', 'dumbbell', 'bodyweight', 'smith', 'plate_loaded']
const MOVEMENT_OPTIONS = ['push', 'pull', 'squat', 'hinge', 'lunge', 'carry', 'isolation', 'core']
const MUSCLE_OPTIONS = [
  'pectoral', 'dorsal', 'trapecio', 'romboides', 'deltoides anterior', 'deltoides lateral',
  'deltoides posterior', 'bíceps', 'tríceps', 'antebrazo', 'cuádriceps', 'isquiotibiales',
  'glúteo', 'aductores', 'abductores', 'gemelos', 'abdominales', 'oblicuos', 'lumbares',
]

const BLANK: Omit<Exercise, 'id' | 'created_by' | 'updated_at' | 'deleted_at'> = {
  name: '', machine_name: null, equipment: 'machine', primary_muscle: 'pectoral',
  secondary_muscles: [], movement_pattern: 'push', unilateral: false,
  weight_increment_kg: 2.5, default_rep_range: '8-12', setup_tips: null, photo_ref: null,
}

export default function Ejercicios() {
  const exercises = useLiveQuery(
    () => db.exercises.filter((e) => !e.deleted_at).sortBy('name'),
    []
  )
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      await db.exercises.add({ ...form, id, created_by: null, updated_at: now, deleted_at: null })
      try {
        const saved = await apiFetch<Exercise>('/exercises/', {
          method: 'POST',
          body: JSON.stringify({ ...form, id }),
        })
        await db.exercises.update(id, { updated_at: saved.updated_at })
      } catch {
        await db.outbox.add({ table: 'exercises', record_id: id, op: 'upsert', payload: { ...form, id }, ts: now })
      }
      setForm({ ...BLANK })
      setShowForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-4 pt-4 pb-3">
        <h2 className="text-xl font-bold text-gray-900">Ejercicios</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-xl min-h-[44px]"
        >
          + Nuevo
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {exercises === undefined && <p className="text-gray-400 text-sm mt-4">Cargando...</p>}
        {exercises?.length === 0 && (
          <p className="text-gray-400 text-sm text-center mt-8">
            No hay ejercicios. ¡Crea el primero!
          </p>
        )}
        {exercises !== undefined && exercises.length > 0 && groupByMuscle(exercises).map(({ muscle, items }) => (
          <div key={muscle}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 px-1 pt-5 pb-2 first:pt-3">
              {muscle}
            </h3>
            <div className="space-y-2">
              {items.map((ex: Exercise) => <ExerciseCard key={ex.id} exercise={ex} />)}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={() => setShowForm(false)}>
          <div
            className="bg-white rounded-t-2xl w-full max-h-[85vh] overflow-y-auto p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-900">Nuevo ejercicio</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <Field label="Nombre">
                <input
                  required
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  className={inputCls}
                  placeholder="Press de pecho en máquina"
                />
              </Field>
              <Field label="Nombre de la máquina">
                <input
                  value={form.machine_name ?? ''}
                  onChange={(e) => set('machine_name', e.target.value || null)}
                  className={inputCls}
                  placeholder="Chest Press (opcional)"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Equipo">
                  <Select value={form.equipment} onChange={(v) => set('equipment', v)} options={EQUIPMENT_OPTIONS} />
                </Field>
                <Field label="Patrón">
                  <Select value={form.movement_pattern} onChange={(v) => set('movement_pattern', v)} options={MOVEMENT_OPTIONS} />
                </Field>
              </div>
              <Field label="Músculo principal">
                <Select value={form.primary_muscle} onChange={(v) => set('primary_muscle', v)} options={MUSCLE_OPTIONS} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Incremento (kg)">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min="0.5"
                    value={form.weight_increment_kg}
                    onChange={(e) => set('weight_increment_kg', parseFloat(e.target.value))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Rango de reps">
                  <input
                    value={form.default_rep_range}
                    onChange={(e) => set('default_rep_range', e.target.value)}
                    className={inputCls}
                    placeholder="8-12"
                  />
                </Field>
              </div>
              <label className="flex items-center gap-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.unilateral}
                  onChange={(e) => set('unilateral', e.target.checked)}
                  className="w-5 h-5 rounded accent-indigo-600"
                />
                Unilateral (un lado a la vez)
              </label>
              <Field label="Consejos de ajuste">
                <textarea
                  value={form.setup_tips ?? ''}
                  onChange={(e) => set('setup_tips', e.target.value || null)}
                  className={`${inputCls} resize-none`}
                  rows={2}
                  placeholder="Asiento a la altura del pecho..."
                />
              </Field>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className={`${btnSecondary} flex-1`}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className={`${btnPrimary} flex-1`}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function ExerciseCard({ exercise: ex }: { exercise: Exercise }) {
  const [showAdd, setShowAdd] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [tipsExpanded, setTipsExpanded] = useState(false)

  return (
    <>
      <div className="bg-white rounded-xl overflow-hidden flex items-stretch shadow-sm border border-gray-100">
        {ex.photo_ref ? (
          <button onClick={() => setLightbox(true)} className="shrink-0 w-20 h-20 block">
            <img src={`/${ex.photo_ref}`} alt={ex.name} className="w-20 h-20 object-cover" />
          </button>
        ) : (
          <div className="w-20 h-20 bg-gray-50 shrink-0 flex items-center justify-center text-2xl text-gray-300">🏋️</div>
        )}
        <div className="px-3 py-3 flex flex-col justify-center min-w-0 flex-1">
          <p className="text-gray-900 font-medium text-sm leading-tight">{ex.name}</p>
          <p className="text-gray-500 text-xs mt-1">
            {ex.primary_muscle} · {ex.default_rep_range} reps · +{ex.weight_increment_kg} kg
          </p>
          {ex.setup_tips && (
            <button type="button" onClick={() => setTipsExpanded((v) => !v)} className="mt-0.5 text-left">
              <p className={`text-gray-400 text-xs leading-relaxed ${tipsExpanded ? '' : 'line-clamp-1'}`}>
                {ex.setup_tips}
              </p>
              {!tipsExpanded && <span className="text-indigo-500 text-[10px]">ver más</span>}
            </button>
          )}
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 flex items-center justify-center text-indigo-600 hover:text-indigo-500 text-2xl font-light shrink-0"
          aria-label="Añadir a rutina"
        >
          +
        </button>
      </div>

      {lightbox && ex.photo_ref && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          <img
            src={`/${ex.photo_ref}`}
            alt={ex.name}
            className="max-w-full max-h-[70vh] object-contain rounded-xl"
          />
          <p className="mt-4 text-white text-sm font-medium text-center">{ex.name}</p>
          {ex.setup_tips && (
            <p className="mt-2 text-gray-300 text-xs text-center max-w-xs leading-relaxed">{ex.setup_tips}</p>
          )}
          <button
            className="absolute top-5 right-5 text-white/70 hover:text-white text-3xl leading-none min-h-[44px] min-w-[44px]"
            onClick={() => setLightbox(false)}
          >
            ✕
          </button>
        </div>
      )}

      {showAdd && <AddToRoutineSheet exercise={ex} onClose={() => setShowAdd(false)} />}
    </>
  )
}

// ── Sheet: añadir ejercicio a rutina ───────────────────────────────────────

function parseRepRange(range: string | null): [number, number] {
  if (!range) return [8, 12]
  const parts = range.split('-').map(Number)
  return [parts[0] ?? 8, parts[1] ?? 12]
}

function AddToRoutineSheet({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const { user } = useAuth()
  const [mode, setMode] = useState<'pick' | 'new'>('pick')
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  const routines = useLiveQuery(
    () => db.routines.filter((r) => r.user_id === (user?.id ?? '') && !r.deleted_at).toArray(),
    [user?.id],
  )
  const allDays = useLiveQuery(() => db.routine_days.filter((d) => !d.deleted_at).toArray(), [])

  async function addToDay(dayId: string) {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const count = await db.routine_day_exercises.filter((r) => r.routine_day_id === dayId && !r.deleted_at).count()
    const [repMin, repMax] = parseRepRange(exercise.default_rep_range)
    await db.routine_day_exercises.add({
      id, routine_day_id: dayId, exercise_id: exercise.id, position: count,
      target_sets: 3, rep_min: repMin, rep_max: repMax,
      target_weight_kg: null, target_rpe: null, notes: null,
      updated_at: now, deleted_at: null,
    })
    await db.outbox.add({ table: 'routine_day_exercises', record_id: id, op: 'upsert',
      payload: { id, routine_day_id: dayId, exercise_id: exercise.id, position: count, target_sets: 3, rep_min: repMin, rep_max: repMax },
      ts: now })
    onClose()
  }

  async function createRoutineWithExercise() {
    if (!user || !newName.trim()) return
    setSaving(true)
    const now = new Date().toISOString()
    const routineId = crypto.randomUUID()
    const dayId = crypto.randomUUID()
    const rdeId = crypto.randomUUID()
    const [repMin, repMax] = parseRepRange(exercise.default_rep_range)
    await db.transaction('rw', [db.routines, db.routine_days, db.routine_day_exercises, db.outbox], async () => {
      await db.routines.add({ id: routineId, user_id: user.id, name: newName.trim(), is_active: true, start_date: null, duration_weeks: null, updated_at: now, deleted_at: null })
      await db.routine_days.add({ id: dayId, routine_id: routineId, name: 'Día A', position: 0, updated_at: now, deleted_at: null })
      await db.routine_day_exercises.add({ id: rdeId, routine_day_id: dayId, exercise_id: exercise.id, position: 0, target_sets: 3, rep_min: repMin, rep_max: repMax, target_weight_kg: null, target_rpe: null, notes: null, updated_at: now, deleted_at: null })
    })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl w-full max-h-[75vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-gray-900 font-bold text-base">Añadir a rutina</h3>
          <button onClick={onClose} className="text-gray-400 text-xl min-h-[44px] px-2">✕</button>
        </div>

        <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-gray-100">
          {exercise.photo_ref && (
            <img src={`/${exercise.photo_ref}`} className="w-12 h-12 object-cover rounded-lg shrink-0" alt="" />
          )}
          <div>
            <p className="text-gray-900 text-sm font-medium">{exercise.name}</p>
            <p className="text-gray-500 text-xs">{exercise.primary_muscle}</p>
          </div>
        </div>

        {mode === 'pick' ? (
          <>
            {routines?.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-2">No tienes rutinas. Crea una nueva abajo.</p>
            ) : (
              <div className="space-y-3">
                {routines?.map((r: Routine) => {
                  const days = allDays?.filter((d: RoutineDay) => d.routine_id === r.id) ?? []
                  return (
                    <div key={r.id}>
                      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1.5">{r.name}</p>
                      {days.length === 0 && <p className="text-gray-400 text-xs px-1">Sin días</p>}
                      {days.map((day: RoutineDay) => (
                        <button
                          key={day.id}
                          onClick={() => addToDay(day.id)}
                          className="w-full text-left bg-slate-50 hover:bg-slate-100 active:bg-indigo-50 rounded-xl px-4 py-3 text-gray-800 text-sm mb-1 min-h-[44px] border border-gray-100"
                        >
                          {day.name}
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
            <button
              onClick={() => setMode('new')}
              className="w-full border border-dashed border-gray-300 text-gray-500 rounded-xl py-3 text-sm hover:border-indigo-500 hover:text-indigo-600 min-h-[44px]"
            >
              + Crear nueva rutina con este ejercicio
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-gray-600 text-sm">Se creará la rutina con un "Día A" que incluye este ejercicio.</p>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre de la rutina..."
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-indigo-500"
            />
            <div className="flex gap-3">
              <button onClick={() => setMode('pick')} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl text-sm min-h-[44px]">Volver</button>
              <button
                onClick={createRoutineWithExercise}
                disabled={saving || !newName.trim()}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm min-h-[44px]"
              >
                {saving ? '...' : 'Crear rutina'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-gray-600">{label}</label>
      {children}
    </div>
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

const inputCls = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-indigo-500'
const btnPrimary = 'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors min-h-[44px] text-sm'
const btnSecondary = 'bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl transition-colors min-h-[44px] text-sm'
