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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

// ── Panel principal ───────────────────────────────────────────────────────────

function StatsPanel({ userId }: { userId: string }) {
  const sessions = useLiveQuery(
    () => db.sessions.filter((s) => s.user_id === userId && !s.deleted_at).toArray(),
    [userId],
  )
  const exercises = useLiveQuery(() => db.exercises.filter((e) => !e.deleted_at).toArray(), [])
  const [selectedExId, setSelectedExId] = useState<string>('')

  if (!sessions || !exercises) {
    return <div className="bg-gray-100 rounded-2xl p-8 animate-pulse h-32" />
  }

  if (sessions.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center space-y-2">
        <p className="text-2xl">📱</p>
        <p className="text-gray-600 text-sm font-medium">Sin datos en este navegador</p>
        <p className="text-gray-400 text-xs">
          Abre la app en el iPhone y espera que sincronice.<br />
          Después pulsa <strong>⟳ Full sync</strong> en esta página.
        </p>
      </div>
    )
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const sorted = [...sessions].sort((a, b) => a.started_at > b.started_at ? 1 : -1)
  const sessionsLast30 = sessions.filter(
    (s) => new Date(s.started_at) >= new Date(Date.now() - 30 * 86_400_000),
  ).length
  const durations = sessions
    .filter((s) => s.ended_at)
    .map((s) => (new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime()) / 60_000)
  const avgDuration = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null

  // ── Weekly frequency ───────────────────────────────────────────────────────
  const now = Date.now()
  const weeklyFreq = Array.from({ length: 10 }, (_, i) => {
    const weekStart = new Date(now - (9 - i) * 7 * 86_400_000)
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000)
    const count = sessions.filter((s) => {
      const d = new Date(s.started_at)
      return d >= weekStart && d < weekEnd
    }).length
    return { label: weekStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }), count }
  })

  return (
    <div className="space-y-6">
      {/* Cards resumen */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Sesiones totales" value={String(sessions.length)} />
        <StatCard label="Últimos 30 días" value={String(sessionsLast30)} />
        <StatCard label="Duración media" value={avgDuration != null ? `${avgDuration} min` : '—'} />
      </div>

      {/* Frecuencia semanal + volumen por músculo en paralelo */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Sesiones / semana (últimas 10)</h3>
          <div style={{ height: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyFreq} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => [v, 'Sesiones']} />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <MuscleVolumeChart userId={userId} />
      </div>

      {/* Volumen total por sesión */}
      <VolumeChart userId={userId} sessions={sorted} />

      {/* RPE promedio por sesión */}
      <RpeChart userId={userId} sessions={sorted} />

      {/* e1RM por ejercicio */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Tendencia e1RM por ejercicio</h3>
          <select value={selectedExId} onChange={(e) => setSelectedExId(e.target.value)}
            className="ml-auto text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500 bg-white text-gray-700 max-w-[220px]">
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

// ── Volumen total por sesión ───────────────────────────────────────────────────

function VolumeChart({ userId, sessions }: { userId: string; sessions: { id: string; started_at: string }[] }) {
  const data = useLiveQuery(async () => {
    const last = sessions.slice(-15)
    const result: { date: string; vol: number }[] = []
    for (const s of last) {
      const ses = await db.session_exercises.filter((se) => se.session_id === s.id && !se.deleted_at).toArray()
      let vol = 0
      for (const se of ses) {
        const sets = await db.sets
          .filter((st) => st.session_exercise_id === se.id && !st.is_warmup && !st.deleted_at)
          .toArray()
        for (const st of sets) {
          if (st.weight_kg && st.reps) vol += st.weight_kg * st.reps
        }
      }
      if (vol > 0) result.push({ date: fmtDate(s.started_at), vol: Math.round(vol) })
    }
    return result
  }, [userId, sessions.length])

  if (!data) return <div className="bg-gray-100 rounded-2xl animate-pulse h-40" />
  if (data.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Volumen total por sesión (kg)</h3>
      <div style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)} />
            <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
              formatter={(v) => [`${Number(v).toLocaleString('es')} kg`, 'Volumen']} />
            <Bar dataKey="vol" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── RPE promedio por sesión ───────────────────────────────────────────────────

function RpeChart({ userId, sessions }: { userId: string; sessions: { id: string; started_at: string }[] }) {
  const data = useLiveQuery(async () => {
    const last = sessions.slice(-15)
    const result: { date: string; rpe: number }[] = []
    for (const s of last) {
      const ses = await db.session_exercises.filter((se) => se.session_id === s.id && !se.deleted_at).toArray()
      const allRpe: number[] = []
      for (const se of ses) {
        const sets = await db.sets
          .filter((st) => st.session_exercise_id === se.id && !st.is_warmup && st.rpe != null && !st.deleted_at)
          .toArray()
        sets.forEach((st) => { if (st.rpe != null) allRpe.push(st.rpe) })
      }
      if (allRpe.length > 0) {
        const avg = allRpe.reduce((a, b) => a + b, 0) / allRpe.length
        result.push({ date: fmtDate(s.started_at), rpe: Math.round(avg * 10) / 10 })
      }
    }
    return result
  }, [userId, sessions.length])

  if (!data || data.length < 2) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">RPE promedio por sesión</h3>
      <p className="text-xs text-gray-400 mb-4">Intensidad percibida (1–10). Estable o bajando = te estás adaptando.</p>
      <div style={{ height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
            <YAxis domain={[5, 10]} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
              formatter={(v) => [v, 'RPE medio']} />
            <Line type="monotone" dataKey="rpe" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: '#f59e0b' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Volumen por músculo (últimas 4 semanas) ───────────────────────────────────

function MuscleVolumeChart({ userId }: { userId: string }) {
  const data = useLiveQuery(async () => {
    const since = new Date(Date.now() - 28 * 86_400_000)
    const sessions = await db.sessions
      .filter((s) => s.user_id === userId && !s.deleted_at && new Date(s.started_at) >= since)
      .toArray()
    const muscleVol: Record<string, number> = {}
    for (const s of sessions) {
      const ses = await db.session_exercises.filter((se) => se.session_id === s.id && !se.deleted_at).toArray()
      for (const se of ses) {
        const ex = await db.exercises.get(se.exercise_id)
        if (!ex) continue
        const sets = await db.sets
          .filter((st) => st.session_exercise_id === se.id && !st.is_warmup && !st.deleted_at)
          .toArray()
        for (const st of sets) {
          if (st.weight_kg && st.reps) {
            muscleVol[ex.primary_muscle] = (muscleVol[ex.primary_muscle] ?? 0) + st.weight_kg * st.reps
          }
        }
      }
    }
    return Object.entries(muscleVol)
      .map(([muscle, vol]) => ({ muscle, vol: Math.round(vol) }))
      .sort((a, b) => b.vol - a.vol)
      .slice(0, 8)
  }, [userId])

  if (!data) return <div className="bg-gray-100 rounded-2xl animate-pulse" style={{ height: 220 }} />

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Volumen por músculo · últimas 4 sem.</h3>
      {data.length === 0
        ? <p className="text-gray-400 text-xs text-center py-8">Sin datos</p>
        : (
          <div style={{ height: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 56 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                <YAxis type="category" dataKey="muscle" tick={{ fontSize: 10, fill: '#374151' }} tickLine={false} axisLine={false} width={56} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => [`${Number(v).toLocaleString('es')} kg`, 'Volumen']} />
                <Bar dataKey="vol" fill="#8b5cf6" radius={[0, 4, 4, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      }
    </div>
  )
}

// ── Tendencia e1RM ────────────────────────────────────────────────────────────

function E1RMChart({ exerciseId, userId }: { exerciseId: string; userId: string }) {
  const data = useLiveQuery(async () => {
    const sessions = await db.sessions.filter((s) => s.user_id === userId && !s.deleted_at).toArray()
    const points: { date: string; e1rm: number | null; maxKg: number }[] = []
    let sessionsWithExercise = 0

    for (const session of sessions) {
      const ses = await db.session_exercises
        .filter((se) => se.session_id === session.id && se.exercise_id === exerciseId && !se.deleted_at)
        .toArray()
      if (ses.length === 0) continue
      sessionsWithExercise++

      let bestE1rm = 0
      let bestKg = 0
      for (const se of ses) {
        const sets = await db.sets
          .filter((s) => s.session_exercise_id === se.id && !s.is_warmup && !s.deleted_at)
          .toArray()
        for (const s of sets) {
          if (s.weight_kg && s.weight_kg > bestKg) bestKg = s.weight_kg
          if (s.weight_kg && s.reps && s.reps <= 20) {
            const e1rm = s.weight_kg * (1 + s.reps / 30)
            if (e1rm > bestE1rm) bestE1rm = e1rm
          }
        }
      }
      if (bestKg > 0) {
        points.push({
          date: fmtDate(session.started_at),
          e1rm: bestE1rm > 0 ? Math.round(bestE1rm * 10) / 10 : null,
          maxKg: bestKg,
        })
      }
    }
    points.sort((a, b) => a.date > b.date ? 1 : -1)
    return { points, sessionsWithExercise, totalSessions: sessions.length }
  }, [exerciseId, userId])

  if (!data) return <div className="bg-gray-50 rounded-xl animate-pulse h-24" />

  const { points, sessionsWithExercise, totalSessions } = data

  if (points.length === 0) {
    return (
      <div className="py-6 text-center space-y-1">
        <p className="text-gray-400 text-xs">Sin peso registrado para este ejercicio</p>
        <p className="text-gray-300 text-xs">
          {sessionsWithExercise > 0
            ? `Aparece en ${sessionsWithExercise} sesión/es pero sin kg anotados`
            : `No aparece en ninguna de las ${totalSessions} sesiones encontradas`}
        </p>
      </div>
    )
  }

  const hasE1rm = points.some((p) => p.e1rm != null)

  return (
    <div style={{ height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} unit=" kg" />
          <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
            formatter={(v, name) => [`${v} kg`, name === 'e1rm' ? 'e1RM est.' : 'Peso máx.']} />
          <Line type="monotone" dataKey="maxKg" stroke="#94a3b8" strokeWidth={2}
            strokeDasharray={hasE1rm ? '4 2' : undefined}
            dot={{ r: 3, fill: '#94a3b8' }} name="maxKg" />
          {hasE1rm && (
            <Line type="monotone" dataKey="e1rm" stroke="#6366f1" strokeWidth={2}
              dot={{ r: 3, fill: '#6366f1' }} name="e1rm" connectNulls />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
