import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type Exercise } from '../../db/schema'

const MUSCLES = [
  'pectoral','dorsal','trapecio','romboides','deltoides anterior','deltoides lateral',
  'deltoides posterior','bíceps','tríceps','antebrazo','cuádriceps','isquiotibiales',
  'glúteo','aductores','abductores','gemelos','abdominales','oblicuos','lumbares',
]
const EQUIPMENT = ['machine','cable','barbell','dumbbell','bodyweight','smith','plate_loaded']
const PATTERNS = ['push','pull','squat','hinge','lunge','carry','isolation','core']

export default function AdminCatalogo() {
  const exercises = useLiveQuery(() => db.exercises.filter((e) => !e.deleted_at).sortBy('name'), [])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filtered = exercises?.filter(
    (ex) =>
      ex.name.toLowerCase().includes(search.toLowerCase()) ||
      (ex.primary_muscle ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-white font-bold text-lg">Catálogo de ejercicios</h2>
          <span className="text-gray-500 text-sm">{exercises?.length ?? 0} ejercicios</span>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar..."
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-indigo-500 w-52"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-gray-700">
              <th className="text-left py-2 pr-3 w-12 font-medium">Foto</th>
              <th className="text-left py-2 pr-3 font-medium">Nombre</th>
              <th className="text-left py-2 pr-3 w-36 font-medium">Músculo</th>
              <th className="text-left py-2 pr-3 w-28 font-medium">Equipo</th>
              <th className="text-center py-2 pr-3 w-16 font-medium">Incr.</th>
              <th className="text-center py-2 pr-3 w-20 font-medium">Reps</th>
              <th className="text-center py-2 pr-3 w-12 font-medium">Uni</th>
              <th className="py-2 w-16" />
            </tr>
          </thead>
          <tbody>
            {filtered?.map((ex) =>
              editingId === ex.id ? (
                <ExerciseEditRow
                  key={ex.id}
                  ex={ex}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <ExerciseDisplayRow
                  key={ex.id}
                  ex={ex}
                  onEdit={() => setEditingId(ex.id)}
                />
              )
            )}
          </tbody>
        </table>

        {filtered?.length === 0 && (
          <p className="text-gray-600 text-sm text-center py-10">Sin resultados</p>
        )}
      </div>
    </div>
  )
}

// ── Display row ───────────────────────────────────────────────────────────────

function ExerciseDisplayRow({ ex, onEdit }: { ex: Exercise; onEdit: () => void }) {
  return (
    <tr className="border-b border-gray-800/50 hover:bg-gray-800/20 group">
      <td className="py-2 pr-3">
        {ex.photo_ref ? (
          <img src={`/${ex.photo_ref}`} className="w-10 h-10 object-cover rounded" alt="" />
        ) : (
          <div className="w-10 h-10 bg-gray-800 rounded flex items-center justify-center text-xs text-gray-600">—</div>
        )}
      </td>
      <td className="py-2 pr-3 text-white">{ex.name}</td>
      <td className="py-2 pr-3 text-gray-400 text-xs">{ex.primary_muscle}</td>
      <td className="py-2 pr-3 text-gray-400 text-xs">{ex.equipment}</td>
      <td className="py-2 pr-3 text-center text-gray-400 text-xs">{ex.weight_increment_kg} kg</td>
      <td className="py-2 pr-3 text-center text-gray-400 text-xs">{ex.default_rep_range}</td>
      <td className="py-2 pr-3 text-center text-gray-500 text-xs">{ex.unilateral ? '✓' : '—'}</td>
      <td className="py-2">
        <button
          onClick={onEdit}
          className="opacity-0 group-hover:opacity-100 text-indigo-400 hover:text-indigo-300 text-xs px-2 py-1 rounded transition-opacity"
        >
          Editar
        </button>
      </td>
    </tr>
  )
}

// ── Edit row (expands to two rows) ────────────────────────────────────────────

function ExerciseEditRow({ ex, onDone }: { ex: Exercise; onDone: () => void }) {
  const [name, setName] = useState(ex.name)
  const [muscle, setMuscle] = useState(ex.primary_muscle ?? '')
  const [secondary, setSecondary] = useState((ex.secondary_muscles ?? []).join(', '))
  const [equipment, setEquipment] = useState(ex.equipment)
  const [pattern, setPattern] = useState(ex.movement_pattern)
  const [increment, setIncrement] = useState(String(ex.weight_increment_kg))
  const [repRange, setRepRange] = useState(ex.default_rep_range)
  const [unilateral, setUnilateral] = useState(ex.unilateral)
  const [machineName, setMachineName] = useState(ex.machine_name ?? '')
  const [setupTips, setSetupTips] = useState(ex.setup_tips ?? '')

  async function save() {
    const now = new Date().toISOString()
    const changes: Partial<Exercise> = {
      name: name.trim() || ex.name,
      primary_muscle: muscle,
      secondary_muscles: secondary.split(',').map((s) => s.trim()).filter(Boolean),
      equipment,
      movement_pattern: pattern,
      weight_increment_kg: parseFloat(increment) || ex.weight_increment_kg,
      default_rep_range: repRange || ex.default_rep_range,
      unilateral,
      machine_name: machineName.trim() || null,
      setup_tips: setupTips.trim() || null,
      updated_at: now,
    }
    await db.exercises.update(ex.id, changes)
    await db.outbox.add({
      table: 'exercises',
      record_id: ex.id,
      op: 'upsert',
      payload: { ...ex, ...changes },
      ts: now,
    })
    onDone()
  }

  const inputCls = 'bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs w-full focus:outline-none focus:border-indigo-500'
  const selectCls = `${inputCls} cursor-pointer`

  return (
    <>
      {/* Main edit row */}
      <tr className="border-b border-indigo-900/40 bg-indigo-950/20">
        <td className="py-2 pr-3">
          {ex.photo_ref ? (
            <img src={`/${ex.photo_ref}`} className="w-10 h-10 object-cover rounded" alt="" />
          ) : (
            <div className="w-10 h-10 bg-gray-800 rounded" />
          )}
        </td>
        <td className="py-2 pr-3">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </td>
        <td className="py-2 pr-3">
          <select value={muscle} onChange={(e) => setMuscle(e.target.value)} className={selectCls}>
            {MUSCLES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </td>
        <td className="py-2 pr-3">
          <select value={equipment} onChange={(e) => setEquipment(e.target.value)} className={selectCls}>
            {EQUIPMENT.map((eq) => <option key={eq} value={eq}>{eq}</option>)}
          </select>
        </td>
        <td className="py-2 pr-3 text-center">
          <input type="number" value={increment} onChange={(e) => setIncrement(e.target.value)} step={0.5} min={0}
            className="w-14 bg-gray-800 border border-gray-600 rounded px-1 py-1 text-white text-xs text-center focus:outline-none focus:border-indigo-500" />
        </td>
        <td className="py-2 pr-3 text-center">
          <input value={repRange} onChange={(e) => setRepRange(e.target.value)} placeholder="8-12"
            className="w-16 bg-gray-800 border border-gray-600 rounded px-1 py-1 text-white text-xs text-center focus:outline-none focus:border-indigo-500" />
        </td>
        <td className="py-2 pr-3 text-center">
          <input type="checkbox" checked={unilateral} onChange={(e) => setUnilateral(e.target.checked)}
            className="w-4 h-4 accent-indigo-500 cursor-pointer" />
        </td>
        <td className="py-2">
          <div className="flex gap-0.5">
            <button onClick={save} className="text-indigo-400 hover:text-indigo-300 text-xs px-1.5 py-1 font-semibold">✓</button>
            <button onClick={onDone} className="text-gray-500 hover:text-gray-300 text-xs px-1.5 py-1">✕</button>
          </div>
        </td>
      </tr>

      {/* Extra fields row */}
      <tr className="border-b border-indigo-900/40 bg-indigo-950/10">
        <td />
        <td colSpan={3} className="py-2.5 pr-4">
          <div className="space-y-2">
            <div>
              <label className="text-gray-500 text-xs block mb-0.5">Nombre de la máquina</label>
              <input value={machineName} onChange={(e) => setMachineName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-gray-500 text-xs block mb-0.5">Músculos secundarios (separados por coma)</label>
              <input value={secondary} onChange={(e) => setSecondary(e.target.value)} className={inputCls} />
            </div>
          </div>
        </td>
        <td colSpan={3} className="py-2.5 pr-4">
          <div className="space-y-2">
            <div>
              <label className="text-gray-500 text-xs block mb-0.5">Patrón de movimiento</label>
              <select value={pattern} onChange={(e) => setPattern(e.target.value)} className={selectCls}>
                {PATTERNS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-gray-500 text-xs block mb-0.5">Setup tips</label>
              <textarea value={setupTips} onChange={(e) => setSetupTips(e.target.value)} rows={2}
                className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs w-full focus:outline-none focus:border-indigo-500 resize-none" />
            </div>
          </div>
        </td>
        <td />
      </tr>
    </>
  )
}
