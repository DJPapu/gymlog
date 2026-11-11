import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db, type RoutineDay } from '../db/schema'
import { useAuth } from '../lib/auth'
import { startSession } from '../lib/startSession'

export default function Hoy() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const activeRoutine = useLiveQuery(
    () =>
      user
        ? db.routines.filter((r) => r.user_id === user.id && r.is_active && !r.deleted_at).first()
        : undefined,
    [user?.id],
  )

  const days = useLiveQuery(
    () =>
      db.routine_days
        .filter((d) => d.routine_id === (activeRoutine?.id ?? '') && !d.deleted_at)
        .sortBy('position'),
    [activeRoutine?.id],
  )

  // Sesión en curso: solo se muestra si no hay ninguna sesión terminada hoy.
  // Evita que sesiones huérfanas de días anteriores aparezcan como "en curso"
  // cuando el usuario ya registró y terminó una sesión en el día de hoy.
  const sessionInProgress = useLiveQuery(
    async () => {
      const uid = user?.id ?? ''
      const todayISO = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
      const completedToday = await db.sessions
        .filter((s) => s.user_id === uid && !!s.ended_at && !s.deleted_at && s.started_at >= todayISO)
        .first()
      if (completedToday) return null
      return db.sessions
        .filter((s) => s.user_id === uid && !s.ended_at && !s.deleted_at)
        .first()
    },
    [user?.id],
  )

  const lastSession = useLiveQuery(
    () =>
      db.sessions
        .filter((s) => s.user_id === (user?.id ?? '') && !!s.ended_at && !s.deleted_at)
        .toArray()
        .then((list) => {
          list.sort((a, b) => (b.started_at > a.started_at ? 1 : -1))
          return list[0] ?? null
        }),
    [user?.id],
  )

  // Determinar el siguiente día de la rutina
  const nextDay: RoutineDay | undefined = (() => {
    if (!days || days.length === 0) return undefined
    if (!lastSession?.routine_day_id) return days[0]
    const lastIdx = days.findIndex((d) => d.id === lastSession.routine_day_id)
    return days[(lastIdx + 1) % days.length]
  })()

  const [starting, setStarting] = useState(false)

  async function handleStart() {
    if (!nextDay || !user) return
    setStarting(true)
    try {
      const sessionId = await startSession(nextDay.id, user.id)
      navigate(`/sesion/${sessionId}`)
    } finally {
      setStarting(false)
    }
  }

  // Comprobar si el programa ha vencido
  const programExpired: boolean = (() => {
    if (!activeRoutine?.start_date || !activeRoutine?.duration_weeks) return false
    const endDate = new Date(activeRoutine.start_date)
    endDate.setDate(endDate.getDate() + activeRoutine.duration_weeks * 7)
    return new Date() > endDate
  })()

  const programEndDate: string | null = (() => {
    if (!activeRoutine?.start_date || !activeRoutine?.duration_weeks) return null
    const endDate = new Date(activeRoutine.start_date)
    endDate.setDate(endDate.getDate() + activeRoutine.duration_weeks * 7)
    return endDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
  })()

  // Nombre del día anterior (para contexto)
  const prevDay =
    days && lastSession?.routine_day_id
      ? days.find((d) => d.id === lastSession.routine_day_id)
      : undefined

  const name = user?.user_metadata?.full_name as string | undefined

  return (
    <div className="flex flex-col h-full px-4 pt-6 pb-4 space-y-6">
      <div>
        <p className="text-sm text-gray-400">¡Hola, {name ?? 'Valentin'}!</p>
        <h2 className="text-2xl font-bold text-gray-900">Hoy</h2>
      </div>

      {programExpired && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
          <span className="text-amber-500 text-lg mt-0.5">⏰</span>
          <div>
            <p className="text-amber-700 text-sm font-semibold">Programa completado</p>
            <p className="text-amber-600 text-xs mt-0.5">
              {activeRoutine?.name} finalizó el {programEndDate}. ¿Empezar un nuevo programa?
            </p>
          </div>
        </div>
      )}

      {/* Banner de sesión en curso — aparece si la app se cerró a mitad de sesión */}
      {sessionInProgress && (
        <button
          onClick={() => navigate(`/sesion/${sessionInProgress.id}`)}
          className="w-full bg-amber-50 border border-amber-200 rounded-2xl px-4 py-4 flex items-center gap-3 text-left"
        >
          <span className="text-2xl">⏱️</span>
          <div className="flex-1 min-w-0">
            <p className="text-amber-800 font-semibold text-sm">Sesión en curso</p>
            <p className="text-amber-600 text-xs mt-0.5">
              Iniciada a las{' '}
              {new Date(sessionInProgress.started_at).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              {' · '}Toca para continuar
            </p>
          </div>
          <span className="text-amber-400 text-lg">▶</span>
        </button>
      )}

      {activeRoutine === undefined || days === undefined ? (
        <LoadingCard />
      ) : !activeRoutine || days.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {prevDay && (
            <p className="text-gray-400 text-sm">
              Última sesión: <span className="text-gray-600">{prevDay.name}</span>
            </p>
          )}

          <div className="bg-white rounded-2xl p-5 space-y-4 shadow-sm border border-gray-100">
            <div>
              <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wide">
                {activeRoutine.name}
              </p>
              <h3 className="text-xl font-bold text-gray-900 mt-1">{nextDay?.name}</h3>
            </div>

            <DayExerciseList dayId={nextDay?.id} />

            <button
              onClick={handleStart}
              disabled={starting}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-colors text-lg min-h-[56px]"
            >
              {starting ? 'Iniciando...' : '▶ Empezar sesión'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function DayExerciseList({ dayId }: { dayId: string | undefined }) {
  const rdes = useLiveQuery(
    () =>
      db.routine_day_exercises
        .filter((r) => r.routine_day_id === (dayId ?? '') && !r.deleted_at)
        .sortBy('position'),
    [dayId],
  )
  const exercises = useLiveQuery(() => db.exercises.filter((e) => !e.deleted_at).toArray(), [])

  if (!rdes || !exercises) return null
  const exMap = Object.fromEntries(exercises.map((e) => [e.id, e]))

  return (
    <ul className="space-y-1">
      {rdes.map((rde) => {
        const ex = exMap[rde.exercise_id]
        return ex ? (
          <li key={rde.id} className="text-sm text-gray-700 flex justify-between">
            <span>{ex.name}</span>
            <span className="text-gray-400">
              {rde.target_sets}×{rde.rep_min}–{rde.rep_max}
            </span>
          </li>
        ) : null
      })}
      {rdes.length === 0 && (
        <li className="text-sm text-gray-400">Sin ejercicios en este día</li>
      )}
    </ul>
  )
}

function LoadingCard() {
  return <div className="bg-gray-100 rounded-2xl p-5 animate-pulse h-40" />
}

function EmptyState() {
  const navigate = useNavigate()
  return (
    <div className="text-center space-y-4 mt-8">
      <p className="text-gray-500">No tienes ninguna rutina activa.</p>
      <button
        onClick={() => navigate('/rutinas')}
        className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-3 rounded-xl min-h-[44px]"
      >
        Crear rutina
      </button>
    </div>
  )
}

// useState necesita import — añadir aquí
import { useState } from 'react'
