import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type Exercise, type Routine, type RoutineDay, type RoutineDayExercise } from '../db/schema'
import { useAuth } from '../lib/auth'
import { apiFetch } from '../lib/api'
import { DeleteButton } from '../components/DeleteButton'

export default function Rutinas() {
  const { user } = useAuth()
  const routines = useLiveQuery(
    () => db.routines.filter((r) => r.user_id === user?.id && !r.deleted_at).toArray(),
    [user?.id]
  )
  const [selected, setSelected] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStartDate, setNewStartDate] = useState('')
  const [newDurationWeeks, setNewDurationWeeks] = useState('')
  const [saving, setSaving] = useState(false)

  async function createRoutine(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !newName.trim()) return
    setSaving(true)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const start_date = newStartDate || null
    const duration_weeks = newDurationWeeks ? parseInt(newDurationWeeks) : null
    await db.routines.add({
      id, user_id: user.id, name: newName.trim(), is_active: true,
      start_date, duration_weeks, updated_at: now, deleted_at: null,
    })
    try {
      await apiFetch('/routines/', { method: 'POST', body: JSON.stringify({ id, name: newName.trim(), start_date, duration_weeks }) })
    } catch {
      await db.outbox.add({ table: 'routines', record_id: id, op: 'upsert', payload: { id, name: newName.trim(), start_date, duration_weeks }, ts: now })
    }
    setNewName('')
    setNewStartDate('')
    setNewDurationWeeks('')
    setShowNew(false)
    setSelected(id)
    setSaving(false)
  }

  async function deleteRoutine(id: string) {
    const now = new Date().toISOString()
    if (selected === id) setSelected(null)
    const days = await db.routine_days.filter((d) => d.routine_id === id).toArray()
    for (const day of days) {
      const rdes = await db.routine_day_exercises.filter((r) => r.routine_day_id === day.id).toArray()
      for (const rde of rdes) {
        await db.routine_day_exercises.update(rde.id, { deleted_at: now, updated_at: now })
        await db.outbox.add({ table: 'routine_day_exercises', record_id: rde.id, op: 'delete', payload: { deleted_at: now }, ts: now })
      }
      await db.routine_days.update(day.id, { deleted_at: now, updated_at: now })
      await db.outbox.add({ table: 'routine_days', record_id: day.id, op: 'delete', payload: { deleted_at: now }, ts: now })
    }
    await db.routines.update(id, { deleted_at: now, updated_at: now })
    await db.outbox.add({ table: 'routines', record_id: id, op: 'delete', payload: { deleted_at: now }, ts: now })
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-4 pt-4 pb-3">
        <h2 className="text-xl font-bold text-white">Rutinas</h2>
        <button
          onClick={() => setShowNew(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-xl min-h-[44px]"
        >
          + Nueva
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-4">
        {routines?.length === 0 && (
          <p className="text-gray-500 text-sm text-center mt-8">Sin rutinas. ¡Crea la primera!</p>
        )}
        {routines?.map((r: Routine) => (
          <div key={r.id}>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setSelected(selected === r.id ? null : r.id)}
                className="flex-1 bg-gray-800 rounded-xl px-4 py-3 text-left"
              >
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium">{r.name}</span>
                  <span className="text-gray-500 text-sm">{selected === r.id ? '▲' : '▼'}</span>
                </div>
              </button>
              <DeleteButton onConfirm={() => deleteRoutine(r.id)} />
            </div>
            {selected === r.id && <RoutineDetail routineId={r.id} />}
          </div>
        ))}
      </div>

      {/* Modal nueva rutina */}
      {showNew && (
        <div className="fixed inset-0 bg-black/70 flex items-end z-50" onClick={() => setShowNew(false)}>
          <div className="bg-gray-900 rounded-t-2xl w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white">Nueva rutina</h3>
            <form onSubmit={createRoutine} className="space-y-3">
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej: PPL, Full Body..."
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-gray-400 text-xs mb-1 block">Fecha de inicio</label>
                  <input
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
                  />
                </div>
                <div className="w-28">
                  <label className="text-gray-400 text-xs mb-1 block">Duración (sem.)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={52}
                    value={newDurationWeeks}
                    onChange={(e) => setNewDurationWeeks(e.target.value)}
                    placeholder="—"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm text-center focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowNew(false)} className="flex-1 bg-gray-700 text-white font-semibold py-3 rounded-xl min-h-[44px] text-sm">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl min-h-[44px] text-sm">
                  {saving ? 'Guardando...' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function RoutineDetail({ routineId }: { routineId: string }) {
  const days = useLiveQuery(
    () => db.routine_days.filter((d) => d.routine_id === routineId && !d.deleted_at).sortBy('position'),
    [routineId]
  )
  const [showNewDay, setShowNewDay] = useState(false)
  const [dayName, setDayName] = useState('')
  const [saving, setSaving] = useState(false)

  async function createDay(e: React.FormEvent) {
    e.preventDefault()
    if (!dayName.trim()) return
    setSaving(true)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const position = days?.length ?? 0
    await db.routine_days.add({ id, routine_id: routineId, name: dayName.trim(), position, updated_at: now, deleted_at: null })
    try {
      await apiFetch(`/routines/${routineId}/days`, { method: 'POST', body: JSON.stringify({ id, name: dayName.trim(), position }) })
    } catch {
      await db.outbox.add({ table: 'routine_days', record_id: id, op: 'upsert', payload: { id, routine_id: routineId, name: dayName.trim(), position }, ts: now })
    }
    setDayName('')
    setShowNewDay(false)
    setSaving(false)
  }

  async function deleteDay(id: string) {
    const now = new Date().toISOString()
    const rdes = await db.routine_day_exercises.filter((r) => r.routine_day_id === id).toArray()
    for (const rde of rdes) {
      await db.routine_day_exercises.update(rde.id, { deleted_at: now, updated_at: now })
      await db.outbox.add({ table: 'routine_day_exercises', record_id: rde.id, op: 'delete', payload: { deleted_at: now }, ts: now })
    }
    await db.routine_days.update(id, { deleted_at: now, updated_at: now })
    await db.outbox.add({ table: 'routine_days', record_id: id, op: 'delete', payload: { deleted_at: now }, ts: now })
  }

  return (
    <div className="ml-4 mt-1 space-y-1">
      {days?.map((day: RoutineDay) => (
        <DayDetail key={day.id} day={day} routineId={routineId} onDelete={() => deleteDay(day.id)} />
      ))}

      {showNewDay ? (
        <form onSubmit={createDay} className="flex gap-2 mt-2">
          <input
            autoFocus
            required
            value={dayName}
            onChange={(e) => setDayName(e.target.value)}
            placeholder="Ej: Día A – Empuje"
            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
          />
          <button type="button" onClick={() => setShowNewDay(false)} className="text-gray-400 px-2 text-sm">✕</button>
          <button type="submit" disabled={saving} className="bg-indigo-600 text-white text-sm px-3 py-2 rounded-lg min-h-[44px]">
            {saving ? '...' : '✓'}
          </button>
        </form>
      ) : (
        <button
          onClick={() => setShowNewDay(true)}
          className="text-indigo-400 text-sm py-2 hover:text-indigo-300"
        >
          + Añadir día
        </button>
      )}
    </div>
  )
}

function DayDetail({ day, routineId, onDelete }: { day: RoutineDay; routineId: string; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const rdes = useLiveQuery(
    () => db.routine_day_exercises.filter((r) => r.routine_day_id === day.id && !r.deleted_at).sortBy('position'),
    [day.id]
  )
  const exercises = useLiveQuery(() => db.exercises.filter((e) => !e.deleted_at).sortBy('name'), [])
  const [showAdd, setShowAdd] = useState(false)
  const [selectedEx, setSelectedEx] = useState('')
  const [selectedExObj, setSelectedExObj] = useState<Exercise | null>(null)
  const [sets, setSets] = useState(3)
  const [repMin, setRepMin] = useState(8)
  const [repMax, setRepMax] = useState(12)
  const [targetWeight, setTargetWeight] = useState('')
  const [saving, setSaving] = useState(false)

  const exMap: Record<string, Exercise> = exercises ? Object.fromEntries(exercises.map((e: Exercise) => [e.id, e])) : {}

  function handlePickExercise(ex: Exercise) {
    setSelectedEx(ex.id)
    setSelectedExObj(ex)
    if (ex.default_rep_range) {
      const [mn, mx] = ex.default_rep_range.split('-').map(Number)
      if (mn) setRepMin(mn)
      if (mx) setRepMax(mx)
    }
  }

  async function addExercise(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedEx) return
    setSaving(true)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const position = rdes?.length ?? 0
    const target_weight_kg = targetWeight ? parseFloat(targetWeight) : null
    const payload = { id, routine_day_id: day.id, exercise_id: selectedEx, position, target_sets: sets, rep_min: repMin, rep_max: repMax, target_weight_kg, target_rpe: null, notes: null }
    await db.routine_day_exercises.add({ ...payload, updated_at: now, deleted_at: null })
    try {
      await apiFetch(`/routines/${routineId}/days/${day.id}/exercises`, { method: 'POST', body: JSON.stringify({ id, exercise_id: selectedEx, position, target_sets: sets, rep_min: repMin, rep_max: repMax }) })
    } catch {
      await db.outbox.add({ table: 'routine_day_exercises', record_id: id, op: 'upsert', payload, ts: now })
    }
    setSelectedEx('')
    setSelectedExObj(null)
    setTargetWeight('')
    setShowAdd(false)
    setSaving(false)
  }

  async function deleteRDE(id: string) {
    const now = new Date().toISOString()
    await db.routine_day_exercises.update(id, { deleted_at: now, updated_at: now })
    await db.outbox.add({ table: 'routine_day_exercises', record_id: id, op: 'delete', payload: { deleted_at: now }, ts: now })
  }

  return (
    <div className="bg-gray-750 rounded-lg">
      <div className="flex items-center gap-1">
        <button onClick={() => setOpen(!open)} className="flex-1 text-left px-3 py-2 text-gray-300 text-sm flex justify-between items-center">
          <span>{day.name}</span>
          <span className="text-gray-500">{open ? '▲' : '▼'}</span>
        </button>
        <DeleteButton onConfirm={onDelete} size="sm" />
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-1.5">
          {rdes?.map((rde: RoutineDayExercise) => {
            const ex = exMap[rde.exercise_id]
            return ex ? (
              <div key={rde.id} className="bg-gray-800 rounded-lg px-3 py-2 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium">{ex.name}</p>
                  <p className="text-gray-400 text-xs">
                    {rde.target_sets} series · {rde.rep_min}–{rde.rep_max} reps
                    {rde.target_weight_kg != null && <span className="ml-1">· {rde.target_weight_kg} kg</span>}
                  </p>
                </div>
                <DeleteButton onConfirm={() => deleteRDE(rde.id)} size="sm" />
              </div>
            ) : null
          })}

          {showAdd ? (
            <form onSubmit={addExercise} className="space-y-2 mt-2">
              {/* Picker de ejercicio con thumbnails */}
              {!selectedExObj ? (
                <ExercisePicker exercises={exercises ?? []} onPick={handlePickExercise} />
              ) : (
                <button
                  type="button"
                  onClick={() => { setSelectedEx(''); setSelectedExObj(null) }}
                  className="w-full flex items-center gap-2 bg-indigo-900/40 border border-indigo-700 rounded-lg p-2 text-left"
                >
                  {selectedExObj.photo_ref && (
                    <img src={`/${selectedExObj.photo_ref}`} className="w-10 h-10 object-cover rounded" alt="" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-indigo-200 text-xs font-medium truncate">{selectedExObj.name}</p>
                    <p className="text-indigo-400 text-xs">{selectedExObj.primary_muscle}</p>
                  </div>
                  <span className="text-gray-500 text-xs">✕</span>
                </button>
              )}

              {selectedExObj && (
                <>
                  <div className="flex gap-2 flex-wrap">
                    <div className="flex gap-1 items-center">
                      <input type="number" inputMode="numeric" value={sets} onChange={(e) => setSets(+e.target.value)} min={1} max={10} className="w-12 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-xs text-center focus:outline-none" />
                      <span className="text-gray-500 text-xs">ser</span>
                    </div>
                    <div className="flex gap-1 items-center">
                      <input type="number" inputMode="numeric" value={repMin} onChange={(e) => setRepMin(+e.target.value)} min={1} className="w-12 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-xs text-center focus:outline-none" />
                      <span className="text-gray-500 text-xs">–</span>
                      <input type="number" inputMode="numeric" value={repMax} onChange={(e) => setRepMax(+e.target.value)} min={1} className="w-12 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-xs text-center focus:outline-none" />
                      <span className="text-gray-500 text-xs">rep</span>
                    </div>
                    <div className="flex gap-1 items-center">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={targetWeight}
                        onChange={(e) => setTargetWeight(e.target.value)}
                        min={0}
                        step={selectedExObj.weight_increment_kg ?? 2.5}
                        className="w-16 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-xs text-center focus:outline-none"
                        placeholder="—"
                      />
                      <span className="text-gray-500 text-xs">kg</span>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setShowAdd(false)} className="text-gray-400 text-xs px-3 py-1.5">Cancelar</button>
                    <button type="submit" disabled={saving} className="bg-indigo-600 text-white text-xs px-4 py-1.5 rounded-lg">
                      {saving ? '...' : 'Añadir'}
                    </button>
                  </div>
                </>
              )}

              {!selectedExObj && (
                <button type="button" onClick={() => setShowAdd(false)} className="text-gray-500 text-xs w-full text-center pt-1">Cancelar</button>
              )}
            </form>
          ) : (
            <button onClick={() => setShowAdd(true)} className="text-indigo-400 text-xs py-1 hover:text-indigo-300">
              + Ejercicio
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Picker de ejercicio con thumbnails, lightbox y agrupación por músculo ───

function groupByMuscle(exercises: Exercise[]) {
  const map = new Map<string, Exercise[]>()
  for (const ex of exercises) {
    const m = ex.primary_muscle
    if (!map.has(m)) map.set(m, [])
    map.get(m)!.push(ex)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([muscle, items]) => ({ muscle, items }))
}

function ExercisePicker({ exercises, onPick }: { exercises: Exercise[]; onPick: (ex: Exercise) => void }) {
  const [search, setSearch] = useState('')
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  const filtered = exercises.filter((ex) =>
    ex.name.toLowerCase().includes(search.toLowerCase()) ||
    (ex.primary_muscle ?? '').toLowerCase().includes(search.toLowerCase())
  )
  const groups = groupByMuscle(filtered)

  return (
    <>
      <div className="space-y-1.5">
        <input
          autoFocus
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar ejercicio..."
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
        />
        <div className="max-h-52 overflow-y-auto rounded-lg">
          {groups.length === 0 && (
            <p className="text-gray-500 text-xs text-center py-3">Sin resultados</p>
          )}
          {groups.map(({ muscle, items }) => (
            <div key={muscle}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 px-1.5 pt-2 pb-1 sticky top-0 bg-gray-800 z-10">
                {muscle}
              </p>
              {items.map((ex) => (
                <div
                  key={ex.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onPick(ex)}
                  onKeyDown={(e) => e.key === 'Enter' && onPick(ex)}
                  className="w-full flex items-center gap-2 hover:bg-gray-600 active:bg-indigo-900/50 rounded-lg p-1.5 mb-0.5 cursor-pointer"
                >
                  {ex.photo_ref ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setLightboxSrc(`/${ex.photo_ref!}`) }}
                      className="shrink-0 w-10 h-10 rounded overflow-hidden"
                    >
                      <img src={`/${ex.photo_ref}`} className="w-10 h-10 object-cover" alt="" />
                    </button>
                  ) : (
                    <div className="w-10 h-10 bg-gray-600 rounded shrink-0 flex items-center justify-center text-base">🏋️</div>
                  )}
                  <div className="min-w-0">
                    <p className="text-white text-xs font-medium leading-tight truncate">{ex.name}</p>
                    <p className="text-gray-400 text-xs">{ex.primary_muscle} · +{ex.weight_increment_kg} kg</p>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {lightboxSrc && (
        <div
          className="fixed inset-0 bg-black/92 z-[60] flex flex-col items-center justify-center p-4"
          onClick={() => setLightboxSrc(null)}
        >
          <img src={lightboxSrc} className="max-w-full max-h-[80vh] object-contain rounded-xl" alt="" />
          <button
            className="absolute top-5 right-5 text-white/70 hover:text-white text-3xl leading-none min-h-[44px] min-w-[44px]"
            onClick={() => setLightboxSrc(null)}
          >
            ✕
          </button>
        </div>
      )}
    </>
  )
}
