import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useState } from 'react'
import { db } from '../db/schema'
import { sync } from './engine'
import { wakeUpBackend } from '../lib/api'

export type SyncState = 'idle' | 'syncing' | 'warming' | 'error' | 'offline'

const isNetworkError = (msg: string) => /fetch failed|load failed|network/i.test(msg)

export function useSyncStatus() {
  const pendingCount = useLiveQuery(() => db.outbox.count(), []) ?? 0
  const [state, setState] = useState<SyncState>(navigator.onLine ? 'idle' : 'offline')
  const [lastError, setLastError] = useState<string | null>(null)

  const doSync = useCallback(async () => {
    if (!navigator.onLine) {
      setState('offline')
      return
    }
    setState('syncing')
    setLastError(null)

    try {
      await sync()
      setState('idle')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)

      if (isNetworkError(msg)) {
        // Posible cold start de Render: despertar y reintentar automáticamente
        setState('warming')
        wakeUpBackend()
        await new Promise((r) => setTimeout(r, 45_000))
        setState('syncing')
        try {
          await sync()
          setState('idle')
          return
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
          setLastError(retryMsg)
          setState('error')
          return
        }
      }

      console.warn('[sync] fallo:', msg)
      setLastError(msg)
      setState('error')
    }
  }, [])

  useEffect(() => {
    // Despertar Render en segundo plano al abrir la app, antes del primer sync
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
