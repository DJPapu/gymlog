import { useState } from 'react'

export function DeleteButton({ onConfirm, size = 'md' }: { onConfirm: () => void; size?: 'sm' | 'md' }) {
  const [confirming, setConfirming] = useState(false)
  const btnSize = size === 'sm' ? 'min-h-[36px] min-w-[36px]' : 'min-h-[44px] min-w-[44px]'

  if (confirming) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onConfirm(); setConfirming(false) }}
          className="text-red-400 text-xs px-2.5 py-1.5 bg-red-950/60 border border-red-800 rounded-lg min-h-[36px]"
        >
          Sí
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setConfirming(false) }}
          className="text-gray-400 text-xs px-2.5 py-1.5 bg-gray-700 rounded-lg min-h-[36px]"
        >
          No
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); setConfirming(true) }}
      className={`text-gray-600 hover:text-red-400 active:text-red-400 transition-colors flex items-center justify-center shrink-0 ${btnSize}`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'}>
        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.498-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.498-.06l-.3 7.5a.75.75 0 1 0 1.498.06l.3-7.5Z" clipRule="evenodd" />
      </svg>
    </button>
  )
}
