import { type SyncState } from '../sync/useSyncStatus'

interface Props {
  state: SyncState
  pendingCount: number
  onSync: () => void
}

export default function SyncBadge({ state, pendingCount, onSync }: Props) {
  if (state === 'syncing') {
    return <span className="text-indigo-400 text-xs animate-pulse">Sincronizando…</span>
  }
  if (state === 'offline') {
    return <span className="text-gray-500 text-xs">Sin conexión</span>
  }
  if (state === 'error') {
    return (
      <button onClick={onSync} className="text-red-400 text-xs underline-offset-2 underline">
        Error al sync
      </button>
    )
  }
  if (pendingCount > 0) {
    return (
      <button onClick={onSync} className="text-amber-400 text-xs">
        ⬆ {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
      </button>
    )
  }
  return <span className="text-gray-600 text-xs">✓ Sincronizado</span>
}
