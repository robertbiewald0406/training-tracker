import { useSyncExternalStore } from 'react'
import { getSyncStatus, subscribeSyncStatus, syncNow } from '../lib/sync'
import { supabase } from '../lib/supabase'
import { Wordmark } from './Wordmark'
import { Dumbbell } from './icons'

// Kopfzeile: kleines Logo; die Hantel ist das Sync-Symbol und dreht sich beim Sync.
export function Header() {
  const s = useSyncExternalStore(subscribeSyncStatus, getSyncStatus)
  const label = s.error
    ? 'Sync-Fehler, tippen zum Wiederholen'
    : s.syncing
      ? 'Synchronisiere'
      : s.pending > 0
        ? `${s.pending} offen, jetzt synchronisieren`
        : 'Alles synchronisiert'
  const tone = s.error ? 'bg-err text-white' : s.pending > 0 || !s.online ? 'bg-neon text-ink' : 'bg-ok text-ink'
  return (
    <header className="flex items-center justify-between gap-3 px-4 pt-4">
      <Wordmark size="sm" />
      <button
        onClick={() => void syncNow(supabase)}
        aria-label={label}
        className={`relative flex size-14 items-center justify-center border-[3px] border-ink shadow-hard active:translate-x-1 active:translate-y-1 active:shadow-none ${tone}`}
      >
        <Dumbbell className={`size-8 ${s.syncing ? 'animate-spin motion-reduce:animate-none' : ''}`} />
        {s.pending > 0 && (
          <span className="num absolute -right-2 -top-2 min-w-6 border-[3px] border-ink bg-card px-1 text-center text-sm leading-5 text-ink">
            {s.pending}
          </span>
        )}
      </button>
    </header>
  )
}
