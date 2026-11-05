import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../db/schema'
import { sync } from './engine'
import { wakeUpBackend } from '../lib/api'

export type SyncState = 'idle' | 'syncing' | 'warming' | 'error' | 'offline'

const isNetworkError = (msg: string) => /fetch failed|load failed|network/i.test(msg)

// Backoff: 5s, 15s, 30s → reintentos en T=5, 20, 50s
const RETRY_DELAYS = [5_000, 15_000, 30_000]

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
        if (!isNetworkError(lastMsg)) {
          console.warn('[sync] fallo no-red:', lastMsg)
          setLastError(lastMsg)
          setState('error')
          return
        }
      }

      // Error de red → Render probablemente dormido.
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
          if (!isNetworkError(lastMsg)) {
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
