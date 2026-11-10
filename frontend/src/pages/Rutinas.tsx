import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useRef, useState } from 'react'
import { db, type Exercise, type Routine, type RoutineDay, type RoutineDayExercise } from '../db/schema'
import { useAuth } from '../lib/auth'
import { apiFetch } from '../lib/api'
import { DeleteButton } from '../components/DeleteButton'
import { groupByMuscle } from '../lib/muscleGroups'

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
        <h2 className="text-xl font-bold text-gray-900">Rutinas</h2>
        <button
          onClick={() => setShowNew(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-xl min-h-[44px]"
        >
          + Nueva
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-4">
        {routines?.length === 0 && (
          <p className="text-gray-400 text-sm text-center mt-8">Sin rutinas. ¡Crea la primera!</p>
        )}
        {routines?.map((r: Routine) => (
          <div key={r.id}>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setSelected(selected === r.id ? null : r.id)}
                className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 text-left"
              >
                <div className="flex items-center justify-between">
                  <span className="text-gray-900 font-medium">{r.name}</span>
                  <span className="text-gray-400 text-sm">{selected === r.id ? '▲' : '▼'}</span>
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
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={() => setShowNew(false)}>
          <div className="bg-white rounded-t-2xl w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900">Nueva rutina</h3>
            <form onSubmit={createRoutine} className="space-y-3">
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej: PPL, Full Body..."
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-indigo-500"
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-gray-600 text-xs mb-1 block">Fecha de inicio</label>
                  <input
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="w-28">
                  <label className="text-gray-600 text-xs mb-1 block">Duración (sem.)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={52}
                    value={newDurationWeeks}
                    onChange={(e) => setNewDurationWeeks(e.target.value)}
                    placeholder="—"
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm text-center focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowNew(false)} className="flex-1 bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl min-h-[44px] text-sm">
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

  async function swapDays(i: number, dir: -1 | 1) {
    if (!days) return
    const j = i + dir
    if (j < 0 || j >= days.length) return
    const a = days[i], b = days[j]
    const now = new Date().toISOString()
    await db.routine_days.update(a.id, { position: b.position, updated_at: now })
    await db.outbox.add({ table: 'routine_days', record_id: a.id, op: 'upsert', payload: { ...a, position: b.position, updated_at: now }, ts: now })
    await db.routine_days.update(b.id, { position: a.position, updated_at: now })
    await db.outbox.add({ table: 'routine_days', record_id: b.id, op: 'upsert', payload: { ...b, position: a.position, updated_at: now }, ts: now })
  }

  return (
    <div className="ml-4 mt-1 space-y-1">
      {days?.map((day: RoutineDay, i: number) => (
        <DayDetail
          key={day.id}
          day={day}
          routineId={routineId}
          onDelete={() => deleteDay(day.id)}
          onMoveUp={i > 0 ? () => swapDays(i, -1) : undefined}
          onMoveDown={i < (days?.length ?? 0) - 1 ? () => swapDays(i, 1) : undefined}
        />
      ))}

      {showNewDay ? (
        <form onSubmit={createDay} className="flex gap-2 mt-2">
          <input
            autoFocus
            required
            value={dayName}
            onChange={(e) => setDayName(e.target.value)}
            placeholder="Ej: Día A – Empuje"
            className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-indigo-500"
          />
          <button type="button" onClick={() => setShowNewDay(false)} className="text-gray-400 px-2 text-sm">✕</button>
          <button type="submit" disabled={saving} className="bg-indigo-600 text-white text-sm px-3 py-2 rounded-lg min-h-[44px]">
            {saving ? '...' : '✓'}
          </button>
        </form>
      ) : (
        <button
          onClick={() => setShowNewDay(true)}
          className="text-indigo-600 text-sm py-2 hover:text-indigo-500"
        >
          + Añadir día
        </button>
      )}
    </div>
  )
}

function DayDetail({ day, routineId, onDelete, onMoveUp, onMoveDown }: {
  day: RoutineDay; routineId: string; onDelete: () => void
  onMoveUp?: () => void; onMoveDown?: () => void
}) {
  const [open, setOpen] = useState(false)

  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(day.name)

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
  const [editingRDE, setEditingRDE] = useState<string | null>(null)
  const [editSets, setEditSets] = useState(3)
  const [editRepMin, setEditRepMin] = useState(8)
  const [editRepMax, setEditRepMax] = useState(12)
  const [editTargetWeight, setEditTargetWeight] = useState('')

  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  const displayedRdes = useMemo(() => {
    if (!rdes) return []
    if (dragging === null || dragOver === null || dragging === dragOver) return rdes
    const arr = [...rdes]
    const [moved] = arr.splice(dragging, 1)
    arr.splice(dragOver, 0, moved)
    return arr
  }, [rdes, dragging, dragOver])

  const exMap: Record<string, Exercise> = exercises ? Object.fromEntries(exercises.map((e: Exercise) => [e.id, e])) : {}

  async function saveDayName() {
    const trimmed = nameInput.trim()
    if (!trimmed) return
    const now = new Date().toISOString()
    await db.routine_days.update(day.id, { name: trimmed, updated_at: now })
    await db.outbox.add({
      table: 'routine_days',
      record_id: day.id,
      op: 'upsert',
      payload: { id: day.id, routine_id: day.routine_id, name: trimmed, position: day.position, updated_at: now, deleted_at: null },
      ts: now,
    })
    setEditingName(false)
  }

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

  function startEdit(rde: RoutineDayExercise) {
    setEditingRDE(rde.id)
    setEditSets(rde.target_sets)
    setEditRepMin(rde.rep_min)
    setEditRepMax(rde.rep_max)
    setEditTargetWeight(rde.target_weight_kg != null ? String(rde.target_weight_kg) : '')
  }

  async function saveEditRDE(rde: RoutineDayExercise) {
    const now = new Date().toISOString()
    const target_weight_kg = editTargetWeight ? parseFloat(editTargetWeight) : null
    const updated = { ...rde, target_sets: editSets, rep_min: editRepMin, rep_max: editRepMax, target_weight_kg, updated_at: now }
    await db.routine_day_exercises.update(rde.id, { target_sets: editSets, rep_min: editRepMin, rep_max: editRepMax, target_weight_kg, updated_at: now })
    await db.outbox.add({ table: 'routine_day_exercises', record_id: rde.id, op: 'upsert', payload: updated, ts: now })
    setEditingRDE(null)
  }

  function handleDragPointerDown(e: React.PointerEvent, index: number) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDragging(index)
    setDragOver(index)
    setDraggingId(rdes?.[index]?.id ?? null)
  }

  function handleDragPointerMove(e: React.PointerEvent) {
    if (dragging === null) return
    const y = e.clientY
    for (let i = 0; i < itemRefs.current.length; i++) {
      const el = itemRefs.current[i]
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (y >= rect.top && y < rect.bottom) {
        if (dragOver !== i) setDragOver(i)
        break
      }
    }
  }

  async function handleDragPointerUp() {
    const from = dragging
    const to = dragOver
    setDragging(null)
    setDragOver(null)
    setDraggingId(null)

    if (from !== null && to !== null && from !== to) {
      const arr = [...(rdes ?? [])]
      const [moved] = arr.splice(from, 1)
      arr.splice(to, 0, moved)
      const now = new Date().toISOString()
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].position !== i) {
          const item = arr[i]
          await db.routine_day_exercises.update(item.id, { position: i, updated_at: now })
          await db.outbox.add({
            table: 'routine_day_exercises',
            record_id: item.id,
            op: 'upsert',
            payload: { ...item, position: i, updated_at: now },
            ts: now,
          })
        }
      }
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
      <div className="flex items-center gap-1">
        {editingName ? (
          <>
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveDayName()
                if (e.key === 'Escape') { setEditingName(false); setNameInput(day.name) }
              }}
              className="flex-1 ml-3 bg-white border border-indigo-500 rounded-lg px-2 py-1.5 text-gray-900 text-sm focus:outline-none"
            />
            <button onClick={saveDayName} className="text-indigo-600 hover:text-indigo-500 flex items-center justify-center min-w-[36px] min-h-[36px] text-base">✓</button>
            <button onClick={() => { setEditingName(false); setNameInput(day.name) }} className="text-gray-400 flex items-center justify-center min-w-[36px] min-h-[36px] text-sm">✕</button>
          </>
        ) : (
          <>
            <button onClick={() => setOpen(!open)} className="flex-1 text-left px-3 py-2 text-gray-700 text-sm flex justify-between items-center">
              <span>{day.name}</span>
              <span className="text-gray-400">{open ? '▲' : '▼'}</span>
            </button>
            <button
              onClick={() => { setEditingName(true); setNameInput(day.name) }}
              className="text-gray-300 hover:text-indigo-600 flex items-center justify-center min-w-[36px] min-h-[36px] shrink-0"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
            <button onClick={onMoveUp} disabled={!onMoveUp}
              className="text-gray-300 hover:text-gray-600 disabled:opacity-20 flex items-center justify-center min-w-[30px] min-h-[36px] text-xs shrink-0">▲</button>
            <button onClick={onMoveDown} disabled={!onMoveDown}
              className="text-gray-300 hover:text-gray-600 disabled:opacity-20 flex items-center justify-center min-w-[30px] min-h-[36px] text-xs shrink-0">▼</button>
            <DeleteButton onConfirm={onDelete} size="sm" />
          </>
        )}
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-gray-100 pt-2">
          {displayedRdes.map((rde: RoutineDayExercise, index: number) => {
            const ex = exMap[rde.exercise_id]
            if (!ex) return null
            if (editingRDE === rde.id) {
              return (
                <div key={rde.id} ref={(el) => { itemRefs.current[index] = el }} className="bg-slate-50 rounded-lg border border-gray-100 px-3 py-2.5">
                  <p className="text-gray-900 text-xs font-semibold mb-2">{ex.name}</p>
                  <div className="flex gap-2 flex-wrap items-center mb-2.5">
                    <div className="flex gap-1 items-center">
                      <input type="number" inputMode="numeric" value={editSets} onChange={(e) => setEditSets(+e.target.value)} min={1} max={10}
                        className="w-12 bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-gray-900 text-xs text-center focus:outline-none focus:border-indigo-500" />
                      <span className="text-gray-400 text-xs">ser</span>
                    </div>
                    <div className="flex gap-1 items-center">
                      <input type="number" inputMode="numeric" value={editRepMin} onChange={(e) => setEditRepMin(+e.target.value)} min={1}
                        className="w-12 bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-gray-900 text-xs text-center focus:outline-none focus:border-indigo-500" />
                      <span className="text-gray-400 text-xs">–</span>
                      <input type="number" inputMode="numeric" value={editRepMax} onChange={(e) => setEditRepMax(+e.target.value)} min={1}
                        className="w-12 bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-gray-900 text-xs text-center focus:outline-none focus:border-indigo-500" />
                      <span className="text-gray-400 text-xs">rep</span>
                    </div>
                    <div className="flex gap-1 items-center">
                      <input type="number" inputMode="decimal" value={editTargetWeight} onChange={(e) => setEditTargetWeight(e.target.value)}
                        min={0} step={0.5} placeholder="—"
                        className="w-16 bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-gray-900 text-xs text-center focus:outline-none focus:border-indigo-500" />
                      <span className="text-gray-400 text-xs">kg</span>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditingRDE(null)} className="text-gray-400 text-xs px-3 py-1.5 min-h-[36px]">Cancelar</button>
                    <button type="button" onClick={() => saveEditRDE(rde)} className="bg-indigo-600 text-white text-xs px-4 py-1.5 rounded-lg min-h-[36px]">Guardar</button>
                  </div>
                </div>
              )
            }
            return (
              <div
                key={rde.id}
                ref={(el) => { itemRefs.current[index] = el }}
                className={`bg-slate-50 rounded-lg border border-gray-100 px-3 py-2 flex items-center gap-1.5 transition-opacity ${rde.id === draggingId ? 'opacity-50 ring-1 ring-indigo-500' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 text-xs font-medium">{ex.name}</p>
                  <p className="text-gray-500 text-xs">
                    {rde.target_sets} series · {rde.rep_min}–{rde.rep_max} reps
                    {rde.target_weight_kg != null && <span className="ml-1 text-emerald-600">· {rde.target_weight_kg} kg</span>}
                  </p>
                </div>
                <button
                  onClick={() => startEdit(rde)}
                  className="text-gray-300 hover:text-indigo-600 transition-colors flex items-center justify-center min-h-[36px] min-w-[36px] shrink-0"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                </button>
                <DeleteButton onConfirm={() => deleteRDE(rde.id)} size="sm" />
                <div
                  className="touch-none select-none text-gray-300 hover:text-gray-500 flex items-center justify-center min-w-[36px] min-h-[44px] shrink-0 cursor-grab active:cursor-grabbing"
                  onPointerDown={(e) => handleDragPointerDown(e, index)}
                  onPointerMove={handleDragPointerMove}
                  onPointerUp={handleDragPointerUp}
                  onPointerCancel={() => { setDragging(null); setDragOver(null); setDraggingId(null) }}
                >
                  <svg viewBox="0 0 10 16" fill="currentColor" className="w-3 h-4">
                    <circle cx="2" cy="2" r="1.5" /><circle cx="8" cy="2" r="1.5" />
                    <circle cx="2" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" />
                    <circle cx="2" cy="14" r="1.5" /><circle cx="8" cy="14" r="1.5" />
                  </svg>
                </div>
              </div>
            )
          })}

          {showAdd ? (
            <form onSubmit={addExercise} className="space-y-2 mt-2">
              {!selectedExObj ? (
                <ExercisePicker exercises={exercises ?? []} onPick={handlePickExercise} />
              ) : (
                <button
                  type="button"
                  onClick={() => { setSelectedEx(''); setSelectedExObj(null) }}
                  className="w-full flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg p-2 text-left"
                >
                  {selectedExObj.photo_ref && (
                    <img src={`/${selectedExObj.photo_ref}`} className="w-10 h-10 object-cover rounded" alt="" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-indigo-700 text-xs font-medium truncate">{selectedExObj.name}</p>
                    <p className="text-indigo-500 text-xs">{selectedExObj.primary_muscle}</p>
                  </div>
                  <span className="text-gray-400 text-xs">✕</span>
                </button>
              )}

              {selectedExObj && (
                <>
                  <div className="flex gap-2 flex-wrap">
                    <div className="flex gap-1 items-center">
                      <input type="number" inputMode="numeric" value={sets} onChange={(e) => setSets(+e.target.value)} min={1} max={10} className="w-12 bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-gray-900 text-xs text-center focus:outline-none focus:border-indigo-500" />
                      <span className="text-gray-400 text-xs">ser</span>
                    </div>
                    <div className="flex gap-1 items-center">
                      <input type="number" inputMode="numeric" value={repMin} onChange={(e) => setRepMin(+e.target.value)} min={1} className="w-12 bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-gray-900 text-xs text-center focus:outline-none focus:border-indigo-500" />
                      <span className="text-gray-400 text-xs">–</span>
                      <input type="number" inputMode="numeric" value={repMax} onChange={(e) => setRepMax(+e.target.value)} min={1} className="w-12 bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-gray-900 text-xs text-center focus:outline-none focus:border-indigo-500" />
                      <span className="text-gray-400 text-xs">rep</span>
                    </div>
                    <div className="flex gap-1 items-center">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={targetWeight}
                        onChange={(e) => setTargetWeight(e.target.value)}
                        min={0}
                        step={0.5}
                        className="w-16 bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-gray-900 text-xs text-center focus:outline-none focus:border-indigo-500"
                        placeholder="—"
                      />
                      <span className="text-gray-400 text-xs">kg</span>
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
                <button type="button" onClick={() => setShowAdd(false)} className="text-gray-400 text-xs w-full text-center pt-1">Cancelar</button>
              )}
            </form>
          ) : (
            <button onClick={() => setShowAdd(true)} className="text-indigo-600 text-xs py-1 hover:text-indigo-500">
              + Ejercicio
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Picker de ejercicio con thumbnails, lightbox y agrupación por músculo ───

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
          className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-xs focus:outline-none focus:border-indigo-500"
        />
        <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-100">
          {groups.length === 0 && (
            <p className="text-gray-400 text-xs text-center py-3">Sin resultados</p>
          )}
          {groups.map(({ muscle, items }) => (
            <div key={muscle}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-1.5 pt-2 pb-1 sticky top-0 bg-white z-10">
                {muscle}
              </p>
              {items.map((ex) => (
                <div
                  key={ex.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onPick(ex)}
                  onKeyDown={(e) => e.key === 'Enter' && onPick(ex)}
                  className="w-full flex items-center gap-2 hover:bg-slate-50 active:bg-indigo-50 rounded-lg p-1.5 mb-0.5 cursor-pointer"
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
                    <div className="w-10 h-10 bg-gray-100 rounded shrink-0 flex items-center justify-center text-base">🏋️</div>
                  )}
                  <div className="min-w-0">
                    <p className="text-gray-900 text-xs font-medium leading-tight truncate">{ex.name}</p>
                    <p className="text-gray-500 text-xs">{ex.primary_muscle} · +{ex.weight_increment_kg} kg</p>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {lightboxSrc && (
        <div
          className="fixed inset-0 bg-black/90 z-[60] flex flex-col items-center justify-center p-4"
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
