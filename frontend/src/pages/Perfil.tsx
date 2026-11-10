import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { DeleteButton } from '../components/DeleteButton'
import { db, type BodyMetric, type Profile } from '../db/schema'
import { useAuth } from '../lib/auth'

const SEX_OPTIONS = [
  { value: 'male' as const, label: 'Hombre' },
  { value: 'female' as const, label: 'Mujer' },
  { value: 'other' as const, label: 'Otro' },
]

const GOAL_OPTIONS = [
  { value: 'lose_fat' as const, label: 'Perder grasa' },
  { value: 'gain_muscle' as const, label: 'Ganar músculo' },
  { value: 'maintain' as const, label: 'Mantenimiento' },
  { value: 'performance' as const, label: 'Rendimiento' },
]

export default function Perfil() {
  const { user } = useAuth()
  const userId = user?.id ?? ''

  const profile = useLiveQuery(() => db.profiles.get(userId), [userId])
  const metrics = useLiveQuery(
    () =>
      db.body_metrics
        .filter((m) => m.user_id === userId && !m.deleted_at)
        .toArray()
        .then((arr) => arr.sort((a, b) => b.measured_at.localeCompare(a.measured_at))),
    [userId],
  )

  return (
    <div className="flex flex-col h-full">
      <header className="px-4 pt-4 pb-3">
        <h2 className="text-xl font-bold text-gray-900">Perfil</h2>
      </header>
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        <PersonalDataSection userId={userId} profile={profile ?? null} />
        <BodyMetricsSection userId={userId} metrics={metrics ?? []} />
      </div>
    </div>
  )
}

// ── Datos personales ────────────────────────────────────────────────────────

interface ProfileForm {
  display_name: string
  height_cm: string
  birth_date: string
  sex: Profile['sex']
  goal: Profile['goal']
}

function PersonalDataSection({
  userId,
  profile,
}: {
  userId: string
  profile: Profile | null
}) {
  const [form, setForm] = useState<ProfileForm>({
    display_name: '',
    height_cm: '',
    birth_date: '',
    sex: null,
    goal: null,
  })
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const initialized = useRef(false)

  useEffect(() => {
    if (profile && !initialized.current) {
      initialized.current = true
      setForm({
        display_name: profile.display_name ?? '',
        height_cm: profile.height_cm != null ? String(profile.height_cm) : '',
        birth_date: profile.birth_date ?? '',
        sex: profile.sex,
        goal: profile.goal,
      })
    }
  }, [profile])

  function set<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setIsDirty(true)
  }

  async function save() {
    setSaving(true)
    const now = new Date().toISOString()
    const updated: Profile = {
      user_id: userId,
      display_name: form.display_name || null,
      units: profile?.units ?? 'kg',
      height_cm: form.height_cm ? Number(form.height_cm) : null,
      birth_date: form.birth_date || null,
      sex: form.sex,
      goal: form.goal,
      updated_at: now,
      deleted_at: null,
    }
    await db.profiles.put(updated)
    await db.outbox.add({
      table: 'profiles',
      record_id: userId,
      op: 'upsert',
      payload: updated,
      ts: now,
    })
    setIsDirty(false)
    setSaving(false)
  }

  const age = form.birth_date ? calculateAge(form.birth_date) : null

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
      <h3 className="font-semibold text-gray-900">Datos personales</h3>

      <div className="space-y-1">
        <label className="text-xs text-gray-500 font-medium">Nombre</label>
        <input
          type="text"
          value={form.display_name}
          onChange={(e) => set('display_name', e.target.value)}
          placeholder="Tu nombre"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-gray-500 font-medium">Altura</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={form.height_cm}
            onChange={(e) => set('height_cm', e.target.value)}
            placeholder="175"
            min={100}
            max={250}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-gray-400 text-sm font-medium pr-1">cm</span>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-gray-500 font-medium">
          Fecha de nacimiento{age != null ? ` · ${age} años` : ''}
        </label>
        <input
          type="date"
          value={form.birth_date}
          onChange={(e) => set('birth_date', e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-gray-500 font-medium">Sexo</label>
        <div className="flex gap-2">
          {SEX_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => set('sex', form.sex === o.value ? null : o.value)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                form.sex === o.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-gray-500 font-medium">Objetivo</label>
        <div className="grid grid-cols-2 gap-2">
          {GOAL_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => set('goal', form.goal === o.value ? null : o.value)}
              className={`py-2 rounded-xl text-sm font-medium transition-colors ${
                form.goal === o.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {isDirty && (
        <button
          onClick={save}
          disabled={saving}
          className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      )}
    </div>
  )
}

// ── Métricas corporales ─────────────────────────────────────────────────────

interface MetricForm {
  measured_at: string
  weight_kg: string
  body_fat_pct: string
  waist_cm: string
  notes: string
}

function BodyMetricsSection({
  userId,
  metrics,
}: {
  userId: string
  metrics: BodyMetric[]
}) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<MetricForm>({
    measured_at: todayString(),
    weight_kg: '',
    body_fat_pct: '',
    waist_cm: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  async function saveMetric() {
    if (!form.weight_kg && !form.body_fat_pct && !form.waist_cm) return
    setSaving(true)
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const metric: BodyMetric = {
      id,
      user_id: userId,
      measured_at: form.measured_at
        ? new Date(form.measured_at + 'T12:00:00').toISOString()
        : now,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
      body_fat_pct: form.body_fat_pct ? Number(form.body_fat_pct) : null,
      waist_cm: form.waist_cm ? Number(form.waist_cm) : null,
      notes: form.notes || null,
      updated_at: now,
      deleted_at: null,
    }
    await db.body_metrics.add(metric)
    await db.outbox.add({
      table: 'body_metrics',
      record_id: id,
      op: 'upsert',
      payload: metric,
      ts: now,
    })
    setForm({ measured_at: todayString(), weight_kg: '', body_fat_pct: '', waist_cm: '', notes: '' })
    setShowForm(false)
    setSaving(false)
  }

  async function deleteMetric(metric: BodyMetric) {
    const now = new Date().toISOString()
    await db.body_metrics.update(metric.id, { deleted_at: now, updated_at: now })
    await db.outbox.add({
      table: 'body_metrics',
      record_id: metric.id,
      op: 'delete',
      payload: { deleted_at: now },
      ts: now,
    })
  }

  const weightEntries = [...metrics]
    .filter((m) => m.weight_kg != null)
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at))

  const chartData = weightEntries.map((m) => ({
    fecha: new Date(m.measured_at).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
    }),
    peso: m.weight_kg,
  }))

  const latestWeight = weightEntries.at(-1)?.weight_kg

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Mediciones corporales</h3>
          {latestWeight != null && (
            <p className="text-xs text-gray-400 mt-0.5">
              Último peso registrado: <span className="font-medium text-gray-600">{latestWeight} kg</span>
            </p>
          )}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-indigo-600 text-sm font-medium min-h-[44px] px-2 flex items-center"
        >
          {showForm ? 'Cancelar' : '+ Registrar'}
        </button>
      </div>

      {chartData.length >= 2 && (
        <div className="px-2 pb-2">
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <XAxis
                dataKey="fecha"
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  fontSize: 12,
                  padding: '4px 10px',
                }}
                formatter={(v) => [`${v} kg`, 'Peso']}
              />
              <Line
                type="monotone"
                dataKey="peso"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ fill: '#6366f1', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {showForm && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Fecha</label>
              <input
                type="date"
                value={form.measured_at}
                onChange={(e) => setForm((f) => ({ ...f, measured_at: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Peso (kg)</label>
              <input
                type="number"
                inputMode="decimal"
                value={form.weight_kg}
                onChange={(e) => setForm((f) => ({ ...f, weight_kg: e.target.value }))}
                placeholder="75"
                step={0.1}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">% Grasa</label>
              <input
                type="number"
                inputMode="decimal"
                value={form.body_fat_pct}
                onChange={(e) => setForm((f) => ({ ...f, body_fat_pct: e.target.value }))}
                placeholder="20"
                step={0.1}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Cintura (cm)</label>
              <input
                type="number"
                inputMode="decimal"
                value={form.waist_cm}
                onChange={(e) => setForm((f) => ({ ...f, waist_cm: e.target.value }))}
                placeholder="80"
                step={0.5}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Notas (opcional)</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Mañana en ayunas, etc."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={saveMetric}
            disabled={saving || (!form.weight_kg && !form.body_fat_pct && !form.waist_cm)}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar medición'}
          </button>
        </div>
      )}

      {metrics.length > 0 && (
        <div className="divide-y divide-gray-50 border-t border-gray-100">
          {metrics.map((m) => (
            <MetricRow key={m.id} metric={m} onDelete={() => deleteMetric(m)} />
          ))}
        </div>
      )}

      {metrics.length === 0 && !showForm && (
        <div className="px-4 pb-5 text-center">
          <p className="text-gray-400 text-sm">Sin mediciones aún</p>
          <p className="text-gray-300 text-xs mt-0.5">Toca "+ Registrar" para empezar</p>
        </div>
      )}
    </div>
  )
}

// ── Fila de historial ───────────────────────────────────────────────────────

function MetricRow({ metric: m, onDelete }: { metric: BodyMetric; onDelete: () => void }) {
  const dateStr = new Date(m.measured_at).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  const parts = [
    m.weight_kg != null ? `${m.weight_kg} kg` : null,
    m.body_fat_pct != null ? `${m.body_fat_pct}% grasa` : null,
    m.waist_cm != null ? `${m.waist_cm} cm cintura` : null,
  ].filter(Boolean)

  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400">{dateStr}</p>
        <p className="text-sm text-gray-900 font-medium leading-tight">
          {parts.join(' · ')}
        </p>
        {m.notes && <p className="text-xs text-gray-400 italic mt-0.5">{m.notes}</p>}
      </div>
      <DeleteButton onConfirm={onDelete} size="sm" />
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function todayString(): string {
  return new Date().toISOString().slice(0, 10)
}

function calculateAge(birthDate: string): number {
  const today = new Date()
  const birth = new Date(birthDate)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}
