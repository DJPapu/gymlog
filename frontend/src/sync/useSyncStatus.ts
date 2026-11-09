import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../db/schema'
import { sync } from './engine'
import { wakeUpBackend } from '../lib/api'

export type SyncState = 'idle' | 'syncing' | 'warming' | 'error' | 'offline'

// Errores que indican que el backend está dormido/arrancando → reintento con backoff.
// API 429: Cloudflare Bot Management desafía la IP del Pages Worker cuando Render está frío.
// API 503: backend temporalmente no disponible.
const isRetriableError = (msg: string) =>
  /fetch failed|load failed|network/i.test(msg) ||
  /API (429|503):/.test(msg)

// Backoff: 5s, 15s, 30s, 25s → reintentos en T=5, 20, 50, 75s
// Render Free puede tardar hasta 60s en arrancar; 75s cubre el peor caso.
const RETRY_DELAYS = [5_000, 15_000, 30_000, 25_000]

export function useSyncStatus() {
  const pendingCount = useLiveQuery(() => db.outbox.count(), []) ?? 0
  const [state, setState] = useState<SyncState>(navigator.onLine ? 'idle' : 'offline')
  const [lastError, setLastError] = useState<string | null>(null)
  const isSyncing = useRef(false)

  const doSync = useCallback(async () => {
    if (isSyncing.current) return
    isSyncing.current = true
    try {
      if (!navigator.onLine) {
        setState('offline')
        return
      }
      setState('syncing')
      setLastError(null)

      let lastMsg = ''
      try {
        await sync()
        setState('idle')
        return
      } catch (err) {
        lastMsg = err instanceof Error ? err.message : String(err)
        if (!isRetriableError(lastMsg)) {
          console.warn('[sync] fallo no-red:', lastMsg)
          setLastError(lastMsg)
          setState('error')
          return
        }
      }

      // Error retriable (red caída, 429, 503) → Render probablemente dormido.
      // Reintentamos con backoff hasta que responda (max ~50s).
      setState('warming')
      wakeUpBackend() // dispara el boot de Render en paralelo
      for (const delay of RETRY_DELAYS) {
        await new Promise<void>((r) => setTimeout(r, delay))
        try {
          await sync()
          setState('idle')
          return
        } catch (retryErr) {
          lastMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
          if (!isRetriableError(lastMsg)) {
            setLastError(lastMsg)
            setState('error')
            return
          }
        }
      }

      setLastError(lastMsg)
      setState('error')
    } finally {
      isSyncing.current = false
    }
  }, [])

  useEffect(() => {
    wakeUpBackend()
    doSync()

    const handleOnline = () => doSync()
    const handleOffline = () => setState('offline')
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    const interval = setInterval(doSync, 5 * 60 * 1000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [doSync])

  return { state, pendingCount, doSync, lastError }
}
