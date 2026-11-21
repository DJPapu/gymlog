import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { db } from '../../db/schema'
import { useAuth } from '../../lib/auth'
import Progreso from '../Progreso'

export default function AdminProgreso() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'stats' | 'historial'>('stats')

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold text-gray-900">Progreso</h2>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          <button onClick={() => setTab('stats')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'stats' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            Estadísticas
          </button>
          <button onClick={() => setTab('historial')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'historial' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            Historial
          </button>
        </div>
      </div>

      {tab === 'stats' ? <StatsPanel userId={user?.id ?? ''} /> : <Progreso />}
    </div>
  )
}

function StatsPanel({ userId }: { userId: string }) {
  const sessions = useLiveQuery(
    () => db.sessions.filter((s) => s.user_id === userId && !!s.ended_at && !s.deleted_at).toArray(),
    [userId],
  )
  const exercises = useLiveQuery(() => db.exercises.filter((e) => !e.deleted_at).toArray(), [])
  const [selectedExId, setSelectedExId] = useState<string>('')

  if (!sessions || !exercises) {
    return <div className="bg-gray-100 rounded-2xl p-8 animate-pulse h-32" />
  }

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalSessions = sessions.length
  const sessionsLast30 = sessions.filter(
    (s) => new Date(s.started_at) >= new Date(Date.now() - 30 * 86_400_000),
  ).length
  const durations = sessions
    .filter((s) => s.ended_at)
    .map((s) => (new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime()) / 60_000)
  const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null

  // ── Weekly sessions (last 10 weeks) ───────────────────────────────────────
  const now = Date.now()
  const weeklyData = Array.from({ length: 10 }, (_, i) => {
    const weekStart = new Date(now - (9 - i) * 7 * 86_400_000)
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000)
    const count = sessions.filter((s) => {
      const d = new Date(s.started_at)
      return d >= weekStart && d < weekEnd
    }).length
    const label = weekStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    return { label, count }
  })

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Sesiones totales" value={String(totalSessions)} />
        <StatCard label="Últimos 30 días" value={String(sessionsLast30)} />
        <StatCard label="Duración media" value={avgDuration != null ? `${avgDuration} min` : '—'} />
      </div>

      {/* Weekly sessions bar chart */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Sesiones por semana (últimas 10)</h3>
        <div style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [v, 'Sesiones']}
              />
              <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* e1RM trend by exercise */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Tendencia e1RM por ejercicio</h3>
          <select
            value={selectedExId}
            onChange={(e) => setSelectedExId(e.target.value)}
            className="ml-auto text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500 bg-white text-gray-700 max-w-[200px]"
          >
            <option value="">— Selecciona —</option>
            {exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.name}</option>
            ))}
          </select>
        </div>
        {selectedExId
          ? <E1RMChart exerciseId={selectedExId} userId={userId} />
          : <p className="text-gray-400 text-xs text-center py-8">Elige un ejercicio para ver su evolución</p>
        }
      </div>
    </div>
  )
}

function E1RMChart({ exerciseId, userId }: { exerciseId: string; userId: string }) {
  const data = useLiveQuery(async () => {
    const sessions = await db.sessions
      .filter((s) => s.user_id === userId && !!s.ended_at && !s.deleted_at)
      .toArray()

    const points: { date: string; e1rm: number }[] = []

    for (const session of sessions) {
      const ses = await db.session_exercises
        .filter((se) => se.session_id === session.id && se.exercise_id === exerciseId && !se.deleted_at)
        .toArray()
      if (ses.length === 0) continue

      let best = 0
      for (const se of ses) {
        const sets = await db.sets
          .filter((s) => s.session_exercise_id === se.id && s.completed && !s.is_warmup && !s.deleted_at)
          .toArray()
        for (const s of sets) {
          if (s.weight_kg && s.reps && s.reps <= 12) {
            const e1rm = s.weight_kg * (1 + s.reps / 30)
            if (e1rm > best) best = e1rm
          }
        }
      }
      if (best > 0) {
        const dateStr = new Date(session.started_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
        points.push({ date: dateStr, e1rm: Math.round(best * 10) / 10 })
      }
    }

    points.sort((a, b) => (a.date > b.date ? 1 : -1))
    return points
  }, [exerciseId, userId])

  if (!data) return <div className="bg-gray-50 rounded-xl animate-pulse h-24" />
  if (data.length === 0) return <p className="text-gray-400 text-xs text-center py-8">Sin datos de este ejercicio</p>

  return (
    <div style={{ height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} unit=" kg" />
          <Tooltip
            contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
            formatter={(v) => [`${v} kg`, 'e1RM']}
          />
          <Line type="monotone" dataKey="e1rm" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: '#6366f1' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
