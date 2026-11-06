import { type SyncState } from '../sync/useSyncStatus'

interface Props {
  state: SyncState
  pendingCount: number
  onSync: () => void
  lastError?: string | null
}

export default function SyncBadge({ state, pendingCount, onSync, lastError }: Props) {
  if (state === 'syncing') {
    return <span className="text-indigo-600 text-xs animate-pulse">Sincronizando…</span>
  }
  if (state === 'warming') {
    return <span className="text-amber-600 text-xs animate-pulse">Despertando servidor…</span>
  }
  if (state === 'offline') {
    return <span className="text-gray-400 text-xs">Sin conexión</span>
  }
  if (state === 'error') {
    return (
      <button
        onClick={onSync}
        className="text-red-500 text-xs text-right leading-tight max-w-[260px]"
      >
        <span className="underline">Error al sync — tocar para reintentar</span>
        {lastError && (
          <span className="block text-red-500 text-[10px] mt-0.5 break-all whitespace-pre-wrap">
            {lastError}
          </span>
        )}
      </button>
    )
  }
  if (pendingCount > 0) {
    return (
      <button onClick={onSync} className="text-amber-600 text-xs">
        ⬆ {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
      </button>
    )
  }
  return <span className="text-gray-400 text-xs">✓ Sincronizado</span>
}
