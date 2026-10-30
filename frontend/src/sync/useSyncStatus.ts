import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useState } from 'react'
import { db } from '../db/schema'
import { sync } from './engine'

export type SyncState = 'idle' | 'syncing' | 'error' | 'offline'

export function useSyncStatus() {
  const pendingCount = useLiveQuery(() => db.outbox.count(), []) ?? 0
  const [state, setState] = useState<SyncState>(navigator.onLine ? 'idle' : 'offline')

  const doSync = useCallback(async () => {
    if (!navigator.onLine) {
      setState('offline')
      return
    }
    setState('syncing')
    try {
      await sync()
      setState('idle')
    } catch (err) {
      console.warn('[sync] fallo:', err)
      setState('error')
    }
  }, [])

  useEffect(() => {
    doSync()

    const handleOnline = () => doSync()
    const handleOffline = () => setState('offline')
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Re-sync cada 5 minutos si la app está abierta
    const interval = setInterval(doSync, 5 * 60 * 1000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [doSync])

  return { state, pendingCount, doSync }
}
