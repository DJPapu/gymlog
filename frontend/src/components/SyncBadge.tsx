import { BACKEND_ORIGIN } from '../lib/api'
import { type SyncState } from '../sync/useSyncStatus'

interface Props {
  state: SyncState
  pendingCount: number
  onSync: () => void
  lastError?: string | null
}

function isCloudflareChallenge(msg: string): boolean {
  return msg.includes('<!DOCTYPE') || msg.includes('API 429:')
}

function friendlyError(msg: string | null | undefined): string {
  if (!msg) return ''
  if (isCloudflareChallenge(msg)) return 'Cloudflare bloqueó la petición (backend dormido). Toca "Despertar" y luego reintentar.'
  if (msg.includes('API 503:')) return 'Backend no disponible (503). Puede estar arrancando.'
  return msg.length > 160 ? msg.slice(0, 160) + '…' : msg
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
    const showWakeButton = !!lastError && isCloudflareChallenge(lastError)
    return (
      <div className="text-right space-y-1">
        <button
          onClick={onSync}
          className="text-red-500 text-xs text-right leading-tight max-w-[260px]"
        >
          <span className="underline">Error al sync — tocar para reintentar</span>
        </button>
        {lastError && (
          <p className="text-red-400 text-[10px] break-words max-w-[260px]">
            {friendlyError(lastError)}
          </p>
        )}
        {showWakeButton && (
          <a
            href={`${BACKEND_ORIGIN}/health`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-indigo-500 text-[10px] underline"
            onClick={(e) => e.stopPropagation()}
          >
            Despertar backend ↗
          </a>
        )}
      </div>
    )
  }
  if (pendingCount > 0) {
    return (
      <button onClick={onSync} className="text-amber-600 text-xs">
        ⬆ {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
      </button>
    )
  }
  return (
    <button onClick={onSync} className="text-gray-400 text-xs">
      ✓ Sincronizado
    </button>
  )
}
