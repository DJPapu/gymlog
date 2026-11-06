import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { DeleteButton } from '../../components/DeleteButton'
import { db, type Exercise, type Routine, type RoutineDay, type RoutineDayExercise } from '../../db/schema'
import { useAuth } from '../../lib/auth'

export default function AdminRutinas() {
  const { user } = useAuth()
  const routines = useLiveQuery(
    () => db.routines.filter((r) => r.user_id === (user?.id ?? '') && !r.deleted_at).toArray(),
    [user?.id]
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)

  async function createRoutine(name: string) {
    if (!user) return
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const payload = { id, user_id: user.id, name, is_active: true, start_date: null, duration_weeks: null, updated_at: now, deleted_at: null }
    await db.routines.add(payload)
    await db.outbox.add({ table: 'routines', record_id: id, op: 'upsert', payload, ts: now })
    setSelectedId(id)
  }

  async function deleteRoutine(id: string) {
    const now = new Date().toISOString()
    if (selectedId === id) setSelectedId(null)
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

  const selectedRoutine = routines?.find((r) => r.id === selectedId)

  return (
    <div className="flex gap-6 h-full">
      {/* Sidebar */}
      <RoutineSidebar
        routines={routines ?? []}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={createRoutine}
        onDelete={deleteRoutine}
      />

      {/* Editor */}
      <div className="flex-1 overflow-auto min-w-0">
        {selectedRoutine ? (
          <RoutineEditor key={selectedRoutine.id} routine={selectedRoutine} />
        ) : (
          <div className="flex items-center justify-center h-48 text-gray-600 text-sm">
            ← Selecciona o crea una rutina
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function RoutineSidebar({
  routines,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
}: {
  routines: Routine[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: (name: string) => void
  onDelete: (id: string) => void
}) {
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    onCreate(newName.trim())
    setNewName('')
    setShowNew(false)
  }

  return (
    <div className="w-60 shrink-0 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold text-sm">Rutinas</h2>
        <button onClick={() => setShowNew(true)} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">
          + Nueva
        </button>
      </div>

      {showNew && (
        <form onSubmit={handleCreate} className="flex gap-1.5">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre..."
            className="flex-1 bg-gray-800 border border-indigo-500 rounded-lg px-2.5 py-1.5 text-white text-sm focus:outline-none"
          />
          <button type="submit" className="text-indigo-400 px-2 text-sm font-semibold">✓</button>
          <button type="button" onClick={() => setShowNew(false)} className="text-gray-500 px-1 text-sm">✕</button>
        </form>
      )}

      <div className="space-y-0.5">
        {routines.length === 0 && !showNew && (
          <p className="text-gray-600 text-xs text-center py-6">Sin rutinas aún</p>
        )}
        {routines.map((r) => (
          <div
            key={r.id}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-2 cursor-pointer group transition-colors ${
              selectedId === r.id ? 'bg-indigo-600' : 'hover:bg-gray-800'
            }`}
            onClick={() => onSelect(r.id)}
          >
            <span className={`flex-1 text-sm truncate ${selectedId === r.id ? 'text-white font-medium' : 'text-gray-300'}`}>
              {r.name}
            </span>
            <span className="opacity-0 group-hover:opacity-100 shrink-0" onClick={(e) => e.stopPropagation()}>
              <DeleteButton onConfirm={() => onDelete(r.id)} size="sm" />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Routine editor ─────────────────────────────────────────────────────────────

function RoutineEditor({ routine }: { routine: Routine }) {
  const days = useLiveQuery(
    () => db.routine_days.filter((d) => d.routine_id === routine.id && !d.deleted_at).sortBy('position'),
    [routine.id]
  )
  const [showNewDay, setShowNewDay] = useState(false)
  const [newDayName, setNewDayName] = useState('')

  async function createDay(e: React.FormEvent) {
    e.preventDefault()
    if (!newDayName.trim()) return
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const position = days?.length ?? 0
    const payload = { id, routine_id: routine.id, name: newDayName.trim(), position, updated_at: now, deleted_at: null }
    await db.routine_days.add(payload)
    await db.outbox.add({ table: 'routine_days', record_id: id, op: 'upsert', payload, ts: now })
    setNewDayName('')
    setShowNewDay(false)
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
    <div className="max-w-4xl">
      <h2 className="text-white text-xl font-bold mb-5">{routine.name}</h2>

      <div className="space-y-5">
        {days?.map((day) => (
          <DaySection key={day.id} day={day} onDelete={() => deleteDay(day.id)} />
        ))}
      </div>

      <div className="mt-6">
        {showNewDay ? (
          <form onSubmit={createDay} className="flex gap-2 items-center">
            <input
              autoFocus
              value={newDayName}
              onChange={(e) => setNewDayName(e.target.value)}
              placeholder="Ej: Día A – Empuje"
              className="bg-gray-800 border border-indigo-500 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none w-72"
            />
            <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-3 py-1.5 rounded-lg">
              Crear día
            </button>
            <button type="button" onClick={() => setShowNewDay(false)} className="text-gray-500 hover:text-gray-300 text-sm px-2">
              Cancelar
            </button>
          </form>
        ) : (
          <button onClick={() => setShowNewDay(true)} className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors">
            + Añadir día
          </button>
        )}
      </div>
    </div>
  )
}

// ── Day section ───────────────────────────────────────────────────────────────

function DaySection({ day, onDelete }: { day: RoutineDay; onDelete: () => void }) {
  const rdes = useLiveQuery(
    () => db.routine_day_exercises.filter((r) => r.routine_day_id === day.id && !r.deleted_at).sortBy('position'),
    [day.id]
  )
  const exercises = useLiveQuery(() => db.exercises.filter((e) => !e.deleted_at).sortBy('name'), [])
  const exMap: Record<string, Exercise> = exercises
    ? Object.fromEntries(exercises.map((e) => [e.id, e]))
    : {}

  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(day.name)
  const [showAdd, setShowAdd] = useState(false)
  const [addExId, setAddExId] = useState('')
  const [addSets, setAddSets] = useState(3)
  const [addRepMin, setAddRepMin] = useState(8)
  const [addRepMax, setAddRepMax] = useState(12)
  const [addWeight, setAddWeight] = useState('')

  async function saveDayName() {
    const trimmed = nameInput.trim()
    if (!trimmed) return
    const now = new Date().toISOString()
    await db.routine_days.update(day.id, { name: trimmed, updated_at: now })
    await db.outbox.add({
      table: 'routine_days', record_id: day.id, op: 'upsert',
      payload: { id: day.id, routine_id: day.routine_id, name: trimmed, position: day.position, updated_at: now, deleted_at: null },
      ts: now,
    })
    setEditingName(false)
  }

  async function addExercise(e: React.FormEvent) {
    e.preventDefault()
    if (!addExId) return
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const position = rdes?.length ?? 0
    const target_weight_kg = addWeight ? parseFloat(addWeight) : null
    const payload = { id, routine_day_id: day.id, exercise_id: addExId, position, target_sets: addSets, rep_min: addRepMin, rep_max: addRepMax, target_weight_kg, target_rpe: null, notes: null, updated_at: now, deleted_at: null }
    await db.routine_day_exercises.add(payload)
    await db.outbox.add({ table: 'routine_day_exercises', record_id: id, op: 'upsert', payload, ts: now })
    setAddExId('')
    setAddWeight('')
    setShowAdd(false)
  }

  async function deleteRDE(id: string) {
    const now = new Date().toISOString()
    await db.routine_day_exercises.update(id, { deleted_at: now, updated_at: now })
    await db.outbox.add({ table: 'routine_day_exercises', record_id: id, op: 'delete', payload: { deleted_at: now }, ts: now })
  }

  async function moveRDE(rde: RoutineDayExercise, dir: -1 | 1) {
    if (!rdes) return
    const idx = rdes.findIndex((r) => r.id === rde.id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= rdes.length) return
    const other = rdes[swapIdx]
    const now = new Date().toISOString()
    await db.routine_day_exercises.update(rde.id, { position: other.position, updated_at: now })
    await db.outbox.add({ table: 'routine_day_exercises', record_id: rde.id, op: 'upsert', payload: { ...rde, position: other.position, updated_at: now }, ts: now })
    await db.routine_day_exercises.update(other.id, { position: rde.position, updated_at: now })
    await db.outbox.add({ table: 'routine_day_exercises', record_id: other.id, op: 'upsert', payload: { ...other, position: rde.position, updated_at: now }, ts: now })
  }

  // Exercises grouped by muscle for the <select>
  const exByMuscle = exercises
    ? exercises.reduce<Record<string, Exercise[]>>((acc, ex) => {
        const m = ex.primary_muscle ?? 'otros'
        ;(acc[m] ??= []).push(ex)
        return acc
      }, {})
    : {}

  return (
    <div className="bg-gray-900 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        {editingName ? (
          <>
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveDayName(); if (e.key === 'Escape') setEditingName(false) }}
              className="bg-gray-800 border border-indigo-500 rounded-lg px-2.5 py-1 text-white text-sm focus:outline-none"
            />
            <button onClick={saveDayName} className="text-indigo-400 hover:text-indigo-300 text-sm font-semibold">✓</button>
            <button onClick={() => { setEditingName(false); setNameInput(day.name) }} className="text-gray-500 text-sm">✕</button>
          </>
        ) : (
          <>
            <h3 className="text-white font-semibold">{day.name}</h3>
            <button
              onClick={() => { setEditingName(true); setNameInput(day.name) }}
              className="text-gray-600 hover:text-indigo-400 transition-colors"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
            <DeleteButton onConfirm={onDelete} size="sm" />
          </>
        )}
      </div>

      {/* Exercise table */}
      {rdes && rdes.length > 0 && (
        <table className="w-full text-sm mb-2">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-gray-800">
              <th className="text-left py-1.5 pr-4 font-medium">Ejercicio</th>
              <th className="text-center py-1.5 px-2 font-medium w-16">Series</th>
              <th className="text-center py-1.5 px-2 font-medium w-16">Rep.min</th>
              <th className="text-center py-1.5 px-2 font-medium w-16">Rep.max</th>
              <th className="text-center py-1.5 px-2 font-medium w-24">Peso obj.</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {rdes.map((rde, i) => {
              const ex = exMap[rde.exercise_id]
              if (!ex) return null
              return (
                <ExerciseRow
                  key={rde.id}
                  rde={rde}
                  ex={ex}
                  onDelete={() => deleteRDE(rde.id)}
                  onMoveUp={i > 0 ? () => moveRDE(rde, -1) : undefined}
                  onMoveDown={i < rdes.length - 1 ? () => moveRDE(rde, 1) : undefined}
                />
              )
            })}
          </tbody>
        </table>
      )}

      {/* Add exercise form */}
      {showAdd ? (
        <form onSubmit={addExercise} className="flex gap-2 flex-wrap items-center mt-2 p-2.5 bg-gray-800/60 rounded-lg">
          <select
            value={addExId}
            onChange={(e) => setAddExId(e.target.value)}
            className="flex-1 min-w-[200px] bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-indigo-500"
          >
            <option value="">— Seleccionar ejercicio —</option>
            {Object.entries(exByMuscle)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([muscle, exs]) => (
                <optgroup key={muscle} label={muscle}>
                  {exs.map((ex) => (
                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                  ))}
                </optgroup>
              ))}
          </select>

          <div className="flex items-center gap-1">
            <input type="number" inputMode="numeric" value={addSets} onChange={(e) => setAddSets(+e.target.value)} min={1} max={10}
              className="w-12 bg-gray-800 border border-gray-700 rounded px-1.5 py-1.5 text-white text-xs text-center focus:outline-none focus:border-indigo-500" />
            <span className="text-gray-500 text-xs">ser</span>
          </div>
          <div className="flex items-center gap-1">
            <input type="number" inputMode="numeric" value={addRepMin} onChange={(e) => setAddRepMin(+e.target.value)} min={1}
              className="w-12 bg-gray-800 border border-gray-700 rounded px-1.5 py-1.5 text-white text-xs text-center focus:outline-none focus:border-indigo-500" />
            <span className="text-gray-500 text-xs">–</span>
            <input type="number" inputMode="numeric" value={addRepMax} onChange={(e) => setAddRepMax(+e.target.value)} min={1}
              className="w-12 bg-gray-800 border border-gray-700 rounded px-1.5 py-1.5 text-white text-xs text-center focus:outline-none focus:border-indigo-500" />
            <span className="text-gray-500 text-xs">rep</span>
          </div>
          <div className="flex items-center gap-1">
            <input type="number" inputMode="decimal" value={addWeight} onChange={(e) => setAddWeight(e.target.value)} min={0} step={2.5} placeholder="—"
              className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1.5 text-white text-xs text-center focus:outline-none focus:border-indigo-500" />
            <span className="text-gray-500 text-xs">kg</span>
          </div>

          <button type="submit" disabled={!addExId}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">
            Añadir
          </button>
          <button type="button" onClick={() => setShowAdd(false)} className="text-gray-500 hover:text-gray-300 text-sm px-2">
            Cancelar
          </button>
        </form>
      ) : (
        <button onClick={() => setShowAdd(true)} className="text-indigo-400 hover:text-indigo-300 text-xs mt-1 transition-colors">
          + Ejercicio
        </button>
      )}
    </div>
  )
}

// ── Exercise row with inline edit ──────────────────────────────────────────────

function ExerciseRow({
  rde,
  ex,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  rde: RoutineDayExercise
  ex: Exercise
  onDelete: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [editSets, setEditSets] = useState(rde.target_sets)
  const [editRepMin, setEditRepMin] = useState(rde.rep_min)
  const [editRepMax, setEditRepMax] = useState(rde.rep_max)
  const [editWeight, setEditWeight] = useState(rde.target_weight_kg != null ? String(rde.target_weight_kg) : '')

  async function save() {
    const now = new Date().toISOString()
    const target_weight_kg = editWeight ? parseFloat(editWeight) : null
    const updated = { ...rde, target_sets: editSets, rep_min: editRepMin, rep_max: editRepMax, target_weight_kg, updated_at: now }
    await db.routine_day_exercises.update(rde.id, { target_sets: editSets, rep_min: editRepMin, rep_max: editRepMax, target_weight_kg, updated_at: now })
    await db.outbox.add({ table: 'routine_day_exercises', record_id: rde.id, op: 'upsert', payload: updated, ts: now })
    setEditing(false)
  }

  if (editing) {
    return (
      <tr className="border-b border-gray-800/50 bg-gray-800/30">
        <td className="py-1.5 pr-4 text-white text-sm">{ex.name}</td>
        <td className="px-2 py-1.5 text-center">
          <input type="number" value={editSets} onChange={(e) => setEditSets(+e.target.value)} min={1} max={10}
            className="w-12 bg-gray-700 border border-indigo-500 rounded px-1 py-0.5 text-white text-xs text-center focus:outline-none" />
        </td>
        <td className="px-2 py-1.5 text-center">
          <input type="number" value={editRepMin} onChange={(e) => setEditRepMin(+e.target.value)} min={1}
            className="w-12 bg-gray-700 border border-indigo-500 rounded px-1 py-0.5 text-white text-xs text-center focus:outline-none" />
        </td>
        <td className="px-2 py-1.5 text-center">
          <input type="number" value={editRepMax} onChange={(e) => setEditRepMax(+e.target.value)} min={1}
            className="w-12 bg-gray-700 border border-indigo-500 rounded px-1 py-0.5 text-white text-xs text-center focus:outline-none" />
        </td>
        <td className="px-2 py-1.5 text-center">
          <input type="number" value={editWeight} onChange={(e) => setEditWeight(e.target.value)} min={0} step={ex.weight_increment_kg ?? 2.5} placeholder="—"
            className="w-16 bg-gray-700 border border-indigo-500 rounded px-1 py-0.5 text-white text-xs text-center focus:outline-none" />
        </td>
        <td className="pl-2 py-1.5">
          <div className="flex items-center gap-0.5">
            <button onClick={save} className="text-indigo-400 hover:text-indigo-300 px-1.5 py-0.5 text-sm font-semibold">✓</button>
            <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-gray-300 px-1.5 py-0.5 text-sm">✕</button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr
      className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer group"
      onClick={() => setEditing(true)}
    >
      <td className="py-2 pr-4 text-white text-sm">{ex.name}</td>
      <td className="px-2 py-2 text-center text-gray-300 text-sm">{rde.target_sets}</td>
      <td className="px-2 py-2 text-center text-gray-300 text-sm">{rde.rep_min}</td>
      <td className="px-2 py-2 text-center text-gray-300 text-sm">{rde.rep_max}</td>
      <td className="px-2 py-2 text-center text-sm">
        {rde.target_weight_kg != null
          ? <span className="text-emerald-500">{rde.target_weight_kg} kg</span>
          : <span className="text-gray-600">—</span>}
      </td>
      <td className="pl-2 py-2">
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); onMoveUp?.() }} disabled={!onMoveUp}
            className="text-gray-500 hover:text-white disabled:opacity-20 px-1 text-xs transition-colors">▲</button>
          <button onClick={(e) => { e.stopPropagation(); onMoveDown?.() }} disabled={!onMoveDown}
            className="text-gray-500 hover:text-white disabled:opacity-20 px-1 text-xs transition-colors">▼</button>
          <button onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="text-gray-600 hover:text-red-400 px-1 text-xs ml-0.5 transition-colors">✕</button>
        </div>
      </td>
    </tr>
  )
}
