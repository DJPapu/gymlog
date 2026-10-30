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

  if (resp.errors.length > 0) {
    console.warn('[sync] errores en push:', resp.errors)
  }

  await db.outbox.bulkDelete(entries.map((e) => e.id!))
  return resp.applied
}

export async function syncPull(): Promise<void> {
  const since = localStorage.getItem(PULL_KEY)
  const url = since ? `/sync/pull?since=${encodeURIComponent(since)}` : '/sync/pull'
  const data = await apiFetch<PullResponse>(url)

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
  await syncPush()
  await syncPull()
}
