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

  // Sesión en curso: solo se muestra si la sesión sin terminar empezó HOY.
  // Esto evita que sesiones huérfanas de días anteriores aparezcan como "en curso"
  // en días en los que el usuario no ha pulsado Comenzar.
  const sessionInProgress = useLiveQuery(
    () => {
      const uid = user?.id ?? ''
      const todayISO = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
      return db.sessions
        .filter((s) => s.user_id === uid && !s.ended_at && !s.deleted_at && s.started_at >= todayISO)
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
  const autoNextDay: RoutineDay | undefined = (() => {
    if (!days || days.length === 0) return undefined
    if (!lastSession?.routine_day_id) return days[0]
    const lastIdx = days.findIndex((d) => d.id === lastSession.routine_day_id)
    return days[(lastIdx + 1) % days.length]
  })()

  const [overrideDayId, setOverrideDayId] = useState<string | null>(null)
  const [pickingDay, setPickingDay] = useState(false)

  const nextDay = overrideDayId
    ? days?.find((d) => d.id === overrideDayId) ?? autoNextDay
    : autoNextDay

  const [starting, setStarting] = useState(false)

  async function handleStart() {
    if (!nextDay || !user) return
    setStarting(true)
    try {
      const sessionId = await startSession(nextDay.id, user.id)
      setOverrideDayId(null)
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
        <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
          <button
            onClick={() => navigate(`/sesion/${sessionInProgress.id}`)}
            className="w-full px-4 py-4 flex items-center gap-3 text-left"
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
          <div className="border-t border-amber-200 px-4 py-2 flex justify-end">
            <CancelSessionButton sessionId={sessionInProgress.id} />
          </div>
        </div>
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
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-xl font-bold text-gray-900">{nextDay?.name}</h3>
                {overrideDayId && (
                  <span className="text-xs text-amber-500 font-medium">modificado</span>
                )}
              </div>

              {/* Day picker */}
              {pickingDay ? (
                <div className="mt-3 space-y-1">
                  <p className="text-xs text-gray-400 mb-2">Elige el día a entrenar:</p>
                  {days?.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => { setOverrideDayId(d.id); setPickingDay(false) }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        (overrideDayId ?? autoNextDay?.id) === d.id
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {d.name}
                    </button>
                  ))}
                  <button onClick={() => setPickingDay(false)}
                    className="w-full text-center text-gray-400 text-xs py-1 mt-1">
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setPickingDay(true)}
                  className="text-xs text-gray-400 hover:text-indigo-500 mt-1 transition-colors"
                >
                  Cambiar día
                </button>
              )}
            </div>

            {!pickingDay && <DayExerciseList dayId={nextDay?.id} />}

            {!pickingDay && (
              <button
                onClick={handleStart}
                disabled={starting}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-colors text-lg min-h-[56px]"
              >
                {starting ? 'Iniciando...' : '▶ Empezar sesión'}
              </button>
            )}
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

import { useState } from 'react'

function CancelSessionButton({ sessionId }: { sessionId: string }) {
  const [confirm, setConfirm] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  async function cancel() {
    setCancelling(true)
    const now = new Date().toISOString()
    const ses = await db.session_exercises
      .filter((se) => se.session_id === sessionId && !se.deleted_at)
      .toArray()
    for (const se of ses) {
      const allSets = await db.sets.filter((s) => s.session_exercise_id === se.id).toArray()
      for (const s of allSets) {
        await db.sets.update(s.id, { deleted_at: now, updated_at: now })
        await db.outbox.add({ table: 'sets', record_id: s.id, op: 'delete', payload: { deleted_at: now }, ts: now })
      }
      await db.session_exercises.update(se.id, { deleted_at: now, updated_at: now })
      await db.outbox.add({ table: 'session_exercises', record_id: se.id, op: 'delete', payload: { deleted_at: now }, ts: now })
    }
    await db.sessions.update(sessionId, { deleted_at: now, updated_at: now })
    await db.outbox.add({ table: 'sessions', record_id: sessionId, op: 'delete', payload: { deleted_at: now }, ts: now })
    setCancelling(false)
  }

  if (!confirm) {
    return (
      <button onClick={() => setConfirm(true)} className="text-amber-600 text-xs font-medium min-h-[36px] px-2 hover:text-red-600">
        Cancelar sesión
      </button>
    )
  }
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-amber-700">¿Seguro? Se borrará sin guardar.</span>
      <button onClick={() => setConfirm(false)} className="text-gray-500 text-xs min-h-[36px] px-2">No</button>
      <button onClick={cancel} disabled={cancelling} className="text-red-600 text-xs font-semibold min-h-[36px] px-2 disabled:opacity-50">
        {cancelling ? '...' : 'Sí, borrar'}
      </button>
    </div>
  )
}
