import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar, BarChart, ComposedChart, Line, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { DeleteButton } from '../components/DeleteButton'
import { db, type Session, type SessionExercise, type SetRecord } from '../db/schema'
import { useAuth } from '../lib/auth'
import { estimateCalories } from '../lib/calories'

// ── Calorie Balance Chart ────────────────────────────────────────────────────

const BASE_KCAL = 2600
const MET_STRENGTH = 5

function CalorieBalanceChart() {
  const [days, setDays] = useState(14)

  const latestMetric = useLiveQuery(
    () => db.body_metrics.orderBy('measured_at').filter((m) => !m.deleted_at && m.weight_kg != null).last(),
    [],
  )
  const foodLogs = useLiveQuery(() => db.food_logs.filter((l) => !l.deleted_at).toArray(), [])
  const gymSessions = useLiveQuery(() => db.sessions.filter((s) => !s.deleted_at && !!s.ended_at).toArray(), [])
  const activityLogs = useLiveQuery(() => db.activity_logs.filter((l) => !l.deleted_at).toArray(), [])

  const weightKg = latestMetric?.weight_kg ?? 75

  const chartData = useMemo(() => {
    const today = new Date()
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - (days - 1 - i))
      const dateStr = d.toISOString().slice(0, 10)

      const intake = Math.round(
        (foodLogs ?? []).filter((l) => l.logged_at === dateStr).reduce((s, l) => s + l.calories_kcal, 0),
      )
      const gymCals = (gymSessions ?? [])
        .filter((s) => s.started_at.startsWith(dateStr) && s.ended_at)
        .reduce((sum, s) => {
          const durH = (new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime()) / 3_600_000
          return sum + Math.round(MET_STRENGTH * weightKg * durH)
        }, 0)
      const extraCals = (activityLogs ?? [])
        .filter((l) => l.logged_at === dateStr)
        .reduce((s, l) => s + l.calories_burned, 0)

      return {
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        intake: intake > 0 ? intake : null,
        expenditure: BASE_KCAL + gymCals + extraCals,
        hasGym: gymCals > 0,
      }
    })
  }, [foodLogs, gymSessions, activityLogs, days, weightKg])

  const hasFoodData = chartData.some((d) => d.intake != null)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Balance calórico</p>
        <div className="flex gap-1">
          {([7, 14, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                days === d ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 text-xs text-gray-500 mb-2">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" /> Ingesta
        </span>
        <span className="flex items-center gap-1">
          <span className="w-5 border-t-2 border-dashed border-indigo-400 inline-block" /> Gasto
        </span>
      </div>

      {!hasFoodData ? (
        <p className="text-sm text-gray-400 text-center py-6">
          Registra tu alimentación en Nutrición para ver el balance.
        </p>
      ) : (
        <div style={{ width: '100%', height: 150 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                interval={Math.ceil(days / 7) - 1}
              />
              <YAxis
                tick={{ fontSize: 9, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${Math.round(v / 100) * 100}`}
              />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 11, padding: '4px 10px' }}
                formatter={(value, name) => [
                  value != null ? `${value} kcal` : '—',
                  name === 'intake' ? 'Ingesta' : 'Gasto estimado',
                ]}
              />
              <Bar dataKey="intake" fill="#fbbf24" radius={[3, 3, 0, 0]} maxBarSize={18} name="intake" />
              <Line type="monotone" dataKey="expenditure" stroke="#6366f1" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="expenditure" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Progreso() {
  const { user } = useAuth()

  const sessions = useLiveQuery(
    () =>
      db.sessions
        .filter((s) => s.user_id === (user?.id ?? '') && !!s.ended_at && !s.deleted_at)
        .toArray()
        .then((list) => {
          list.sort((a, b) => (b.started_at > a.started_at ? 1 : -1))
          return list
        }),
    [user?.id],
  )

  const allDays = useLiveQuery(() => db.routine_days.toArray(), [])
  const dayMap = allDays ? Object.fromEntries(allDays.map((d) => [d.id, d])) : {}

  return (
    <div className="flex flex-col h-full">
      <header className="px-4 pt-4 pb-3">
        <h2 className="text-xl font-bold text-gray-900">Progreso</h2>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        <CalorieBalanceChart />

        {sessions === undefined && (
          <div className="bg-gray-100 rounded-2xl p-5 animate-pulse h-24" />
        )}
        {sessions?.length === 0 && (
          <div className="text-center mt-16 space-y-2">
            <p className="text-4xl">🏋️</p>
            <p className="text-gray-500 text-sm">Aún no hay sesiones registradas.</p>
            <p className="text-gray-400 text-xs">Completa tu primera sesión para ver el historial.</p>
          </div>
        )}
        {sessions?.map((s) => (
          <SessionCard
            key={s.id}
            session={s}
            dayName={s.routine_day_id ? dayMap[s.routine_day_id]?.name : undefined}
          />
        ))}
      </div>
    </div>
  )
}

// ── Tarjeta de sesión ───────────────────────────────────────────────────────

function SessionCard({ session, dayName }: { session: Session; dayName?: string }) {
  const [expanded, setExpanded] = useState(false)
  const [resyncing, setResyncing] = useState(false)
  const navigate = useNavigate()

  async function resyncSession() {
    setResyncing(true)
    try {
      const ses = await db.session_exercises
        .filter((se) => se.session_id === session.id && !se.deleted_at)
        .toArray()
      const seIds = ses.map((se) => se.id)
      const allSets = await db.sets
        .filter((s) => seIds.includes(s.session_exercise_id) && !s.deleted_at)
        .toArray()
      const now = new Date().toISOString()
      // Pisamos updated_at=now en cada payload: el pull incremental filtra por
      // updated_at > last_pulled_at, así que si el registro tiene un updated_at
      // antiguo (anterior al último pull de otro cliente) el server no lo devuelve.
      await db.transaction('rw', [db.outbox], async () => {
        await db.outbox.add({ table: 'sessions', record_id: session.id, op: 'upsert', payload: { ...session, updated_at: now }, ts: now })
        for (const se of ses) {
          await db.outbox.add({ table: 'session_exercises', record_id: se.id, op: 'upsert', payload: { ...se, updated_at: now }, ts: now })
        }
        for (const s of allSets) {
          await db.outbox.add({ table: 'sets', record_id: s.id, op: 'upsert', payload: { ...s, updated_at: now }, ts: now })
        }
      })
    } finally {
      setResyncing(false)
    }
  }

  async function deleteSession() {
    const now = new Date().toISOString()
    const ses = await db.session_exercises.filter((se) => se.session_id === session.id).toArray()
    for (const se of ses) {
      const allSets = await db.sets.filter((s) => s.session_exercise_id === se.id).toArray()
      for (const s of allSets) {
        await db.sets.update(s.id, { deleted_at: now, updated_at: now })
        await db.outbox.add({ table: 'sets', record_id: s.id, op: 'delete', payload: { deleted_at: now }, ts: now })
      }
      await db.session_exercises.update(se.id, { deleted_at: now, updated_at: now })
      await db.outbox.add({ table: 'session_exercises', record_id: se.id, op: 'delete', payload: { deleted_at: now }, ts: now })
    }
    await db.sessions.update(session.id, { deleted_at: now, updated_at: now })
    await db.outbox.add({ table: 'sessions', record_id: session.id, op: 'delete', payload: { deleted_at: now }, ts: now })
  }

  const sessionExercises = useLiveQuery(
    () =>
      db.session_exercises
        .filter((se) => se.session_id === session.id && !se.deleted_at)
        .sortBy('position'),
    [session.id],
  )

  const startDate = new Date(session.started_at)
  const dateStr = startDate.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const timeStr = startDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

  const durationMin = session.ended_at
    ? Math.round((new Date(session.ended_at).getTime() - startDate.getTime()) / 60_000)
    : null

  const calories = useLiveQuery(async () => {
    if (!durationMin) return null
    const bm = await db.body_metrics.orderBy('measured_at').reverse().first()
    if (!bm?.weight_kg) return null
    const ses = await db.session_exercises
      .filter((se) => se.session_id === session.id && !se.deleted_at)
      .toArray()
    const patterns: string[] = []
    for (const se of ses) {
      const ex = await db.exercises.get(se.exercise_id)
      if (ex?.movement_pattern) patterns.push(ex.movement_pattern)
    }
    return estimateCalories(durationMin, patterns, bm.weight_kg)
  }, [session.id, durationMin])

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
      <div className="flex items-start">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 text-left px-4 py-4 min-w-0"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-gray-900 font-semibold leading-tight">
                {dayName ?? 'Sesión libre'}
              </p>
              <p className="text-gray-500 text-xs mt-0.5 capitalize">
                {dateStr} · {timeStr}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {durationMin != null && (
                <p className="text-gray-400 text-xs">{durationMin} min</p>
              )}
              {calories != null && (
                <p className="text-orange-400 text-xs font-medium">~{calories} kcal</p>
              )}
              {sessionExercises !== undefined && (
                <p className="text-gray-400 text-xs">{sessionExercises.length} ejercicios</p>
              )}
              <span className="text-gray-400 text-xs block mt-1">{expanded ? '▲' : '▼'}</span>
            </div>
          </div>
        </button>
        <div className="pt-3 pr-2 shrink-0 flex items-center gap-1">
          <button
            onClick={() => navigate(`/sesion/${session.id}`)}
            title="Editar sesión"
            className="text-gray-300 hover:text-indigo-500 text-base px-1 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
          >
            ✏️
          </button>
          <button
            onClick={resyncSession}
            disabled={resyncing}
            title="Re-sincronizar sesión"
            className="text-gray-300 hover:text-indigo-500 disabled:opacity-40 text-base px-1 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
          >
            ↺
          </button>
          <DeleteButton onConfirm={deleteSession} size="sm" />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 pt-3 pb-4 space-y-5">
          {!sessionExercises ? (
            <p className="text-gray-400 text-xs">Cargando...</p>
          ) : sessionExercises.length === 0 ? (
            <p className="text-gray-400 text-xs">Sin ejercicios registrados</p>
          ) : (
            sessionExercises.map((se: SessionExercise) => (
              <ExerciseSummary
                key={se.id}
                sessionExercise={se}
                routineDayId={session.routine_day_id ?? null}
              />
            ))
          )}
          {session.notes && (
            <p className="text-gray-500 text-xs italic border-t border-gray-100 pt-3">
              {session.notes}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Resumen de ejercicio dentro de una sesión ───────────────────────────────

function ExerciseSummary({
  sessionExercise: se,
  routineDayId,
}: {
  sessionExercise: SessionExercise
  routineDayId: string | null
}) {
  const exercise = useLiveQuery(() => db.exercises.get(se.exercise_id), [se.exercise_id])
  const sets = useLiveQuery(
    () =>
      db.sets
        .filter((s) => s.session_exercise_id === se.id && !s.deleted_at)
        .sortBy('set_index'),
    [se.id],
  )
  const rde = useLiveQuery(
    () =>
      routineDayId
        ? db.routine_day_exercises
            .filter(
              (r) =>
                r.routine_day_id === routineDayId &&
                r.exercise_id === se.exercise_id &&
                !r.deleted_at,
            )
            .first()
        : undefined,
    [routineDayId, se.exercise_id],
  )

  if (!exercise || !sets) return null

  const totalSets = sets.filter((s) => !s.is_warmup)
  const completedSets = sets.filter((s) => s.completed && !s.is_warmup)

  // Chart: all non-warmup sets with weight data (completed or not)
  const chartData = totalSets
    .filter((s) => s.weight_kg != null)
    .map((s, i) => ({
      n: String(i + 1),
      weight: s.weight_kg!,
      reps: s.reps,
      rpe: s.rpe,
      done: s.completed,
    }))

  const targetWeight = rde?.target_weight_kg ?? null
  const increment = exercise.weight_increment_kg ?? 2.5

  // Suggestion based on completed sets only
  let suggestion: { direction: 'up' | 'down'; maxWeight: number } | null = null
  if (completedSets.length > 0 && targetWeight != null) {
    const completedWithWeight = completedSets.filter((s) => s.weight_kg != null)
    if (completedWithWeight.length > 0) {
      const maxWeight = Math.max(...completedWithWeight.map((s) => s.weight_kg!))
      if (maxWeight >= targetWeight + increment * 0.5) {
        suggestion = { direction: 'up', maxWeight }
      } else if (maxWeight <= targetWeight - increment * 0.5) {
        suggestion = { direction: 'down', maxWeight }
      }
    }
  }

  // Y-axis domain: start a bit below min to show differences clearly
  const weights = chartData.map((d) => d.weight)
  const allWeights = targetWeight != null ? [...weights, targetWeight] : weights
  const domainMin =
    allWeights.length > 0
      ? Math.max(0, Math.floor((Math.min(...allWeights) - increment * 2) / 5) * 5)
      : 0
  const domainMax =
    allWeights.length > 0
      ? Math.ceil((Math.max(...allWeights) + increment) / 5) * 5
      : 'auto'

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {exercise.photo_ref && (
          <img
            src={`/${exercise.photo_ref}`}
            alt=""
            className="w-7 h-7 object-cover rounded shrink-0"
          />
        )}
        <p className="text-gray-900 text-sm font-medium leading-tight flex-1">{exercise.name}</p>
        <span className="text-gray-400 text-xs shrink-0">
          {completedSets.length}/{totalSets.length} series
        </span>
      </div>

      {chartData.length > 0 ? (
        <div style={{ width: '100%', height: 130 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 48, bottom: 0, left: -16 }}>
            <XAxis
              dataKey="n"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              domain={[domainMin, domainMax]}
            />
            <Tooltip
              contentStyle={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 12,
                padding: '4px 10px',
              }}
              formatter={(value) => [value != null ? `${value} kg` : '', 'Peso']}
              labelFormatter={(label) => `Serie ${label}`}
            />
            <Bar dataKey="weight" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
            {targetWeight != null && (
              <ReferenceLine
                y={targetWeight}
                stroke="#10b981"
                strokeDasharray="5 3"
                label={{
                  value: `Obj. ${targetWeight} kg`,
                  position: 'right',
                  fontSize: 10,
                  fill: '#10b981',
                }}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {sets.map((s: SetRecord) => (
            <SetChip key={s.id} set={s} />
          ))}
        </div>
      )}

      {suggestion && (
        <p
          className={`text-xs mt-1.5 font-medium ${
            suggestion.direction === 'up' ? 'text-emerald-600' : 'text-amber-600'
          }`}
        >
          {suggestion.direction === 'up'
            ? `↑ Superaste el objetivo (${targetWeight} kg → ${suggestion.maxWeight} kg). Sube el peso en la próxima sesión.`
            : `↓ Quedaste por debajo del objetivo (${targetWeight} kg). Considera ajustar.`}
        </p>
      )}

      {se.notes && (
        <p className="text-gray-400 text-xs mt-1.5 italic">{se.notes}</p>
      )}
    </div>
  )
}

function SetChip({ set: s }: { set: SetRecord }) {
  const hasData = s.weight_kg != null || s.reps != null

  if (!hasData && !s.completed) {
    return (
      <span className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-400 line-through">
        serie {s.set_index + 1}
      </span>
    )
  }

  const label = [
    s.weight_kg != null ? `${s.weight_kg.toLocaleString('es', { maximumFractionDigits: 2 })} kg` : null,
    s.reps != null ? `× ${s.reps}` : null,
    s.rpe != null ? `RPE ${s.rpe}` : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span
      className={`text-xs px-2.5 py-1 rounded-lg font-mono ${
        s.completed
          ? s.is_warmup
            ? 'bg-gray-100 text-gray-500'
            : 'bg-green-50 text-green-700'
          : 'bg-gray-100 text-gray-400 line-through'
      }`}
    >
      {label || `serie ${s.set_index + 1}`}
    </span>
  )
}
