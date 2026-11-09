import { db } from '../db/schema'
import { apiFetch } from '../lib/api'

const PULL_KEY = 'gymlog_last_pulled_at'

interface PushResponse {
  applied: number
  errors: string[]
}

interface PullResponse {
  exercises: Record<string, unknown>[]
  routines: Record<string, unknown>[]
  routine_days: Record<string, unknown>[]
  routine_day_exercises: Record<string, unknown>[]
  sessions: Record<string, unknown>[]
  session_exercises: Record<string, unknown>[]
  sets: Record<string, unknown>[]
  pulled_at: string
}

export async function syncPush(): Promise<number> {
  const entries = await db.outbox.orderBy('ts').toArray()
  if (entries.length === 0) return 0

  const seEntries = entries.filter((e) => e.table === 'session_exercises')
  console.log('[push] outbox total:', entries.length,
    'session_exercises:', seEntries.map((e) => ({
      id: e.record_id.slice(0, 8),
      session_id: ((e.payload as Record<string, unknown>).session_id as string | undefined)?.slice(0, 8),
      deleted_at: (e.payload as Record<string, unknown>).deleted_at,
    }))
  )

  const resp = await apiFetch<PushResponse>('/sync/push', {
    method: 'POST',
    body: JSON.stringify({
      changes: entries.map((e) => ({
        table: e.table,
        op: e.op,
        record_id: e.record_id,
        payload: e.payload,
      })),
    }),
  })

  console.log('[push] respuesta:', resp.applied, 'applied, errores:', resp.errors)
  await db.outbox.bulkDelete(entries.map((e) => e.id!))

  if (resp.errors.length > 0) {
    // Guardamos los errores para diagnóstico visible en la UI
    localStorage.setItem('gymlog_push_errors', JSON.stringify(resp.errors))
    console.warn('[sync] errores en push:', resp.errors)
    throw new Error(`[push-partial] ${resp.errors.slice(0, 2).join(' | ')}`)
  }

  localStorage.removeItem('gymlog_push_errors')
  return resp.applied
}

export async function syncPull(): Promise<void> {
  const since = localStorage.getItem(PULL_KEY)
  const url = since ? `/sync/pull?since=${encodeURIComponent(since)}` : '/sync/pull'
  const data = await apiFetch<PullResponse>(url)

  console.log('[pull] session_exercises recibidos del servidor:', data.session_exercises.length,
    data.session_exercises.map((se: Record<string, unknown>) => ({
      id: (se.id as string)?.slice(0, 8),
      session_id: (se.session_id as string)?.slice(0, 8),
      deleted_at: se.deleted_at,
    }))
  )

  await db.transaction('rw', [
    db.exercises,
    db.routines,
    db.routine_days,
    db.routine_day_exercises,
    db.sessions,
    db.session_exercises,
    db.sets,
  ], async () => {
    for (const r of data.exercises)           await db.exercises.put(r as never)
    for (const r of data.routines)            await db.routines.put(r as never)
    for (const r of data.routine_days)        await db.routine_days.put(r as never)
    for (const r of data.routine_day_exercises) await db.routine_day_exercises.put(r as never)
    for (const r of data.sessions)            await db.sessions.put(r as never)
    for (const r of data.session_exercises)   await db.session_exercises.put(r as never)
    for (const r of data.sets)                await db.sets.put(r as never)
  })

  localStorage.setItem(PULL_KEY, data.pulled_at)
}

export async function sync(): Promise<void> {
  // Pull primero: el GET despierta Render y cachea el preflight CORS.
  // Así el POST del push encuentra el backend ya vivo y su preflight OPTIONS
  // resuelve rápido en lugar de colgar contra un servidor dormido.
  try {
    await syncPull()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`[pull] ${msg}`)
  }
  try {
    await syncPush()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`[push] ${msg}`)
  }
}
