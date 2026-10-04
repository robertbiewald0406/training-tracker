import { useSyncExternalStore } from 'react'
import { applyUpdate, getPwaState, subscribePwa } from '../lib/pwa'

// Dezenter Hinweis unten: neue Version ist geladen. Aktiviert sich beim naechsten Start, oder sofort per Tap.
export function UpdateBanner() {
  const { needRefresh } = useSyncExternalStore(subscribePwa, getPwaState)
  if (!needRefresh) return null
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center justify-between gap-3 border-[3px] border-ink bg-card px-3 py-2 shadow-hard"
    >
      <span className="text-base font-bold">Neue Version</span>
      <button
        onClick={applyUpdate}
        className="min-h-12 border-[3px] border-ink bg-neon px-4 font-display uppercase tracking-wider text-ink active:translate-x-1 active:translate-y-1"
      >
        Aktualisieren
      </button>
    </div>
  )
}
