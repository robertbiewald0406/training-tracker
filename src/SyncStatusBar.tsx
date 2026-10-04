import { useSyncExternalStore } from 'react'
import { getSyncStatus, subscribeSyncStatus, syncNow } from './lib/sync'
import { supabase } from './lib/supabase'

export function SyncStatusBar() {
  const s = useSyncExternalStore(subscribeSyncStatus, getSyncStatus)
  return (
    <section className="rounded-xl border border-neutral-800 p-4 space-y-2" aria-live="polite">
      <div className="flex items-center justify-between">
        <span className="font-medium">
          {s.syncing ? 'Synchronisiere …' : s.pending > 0 ? `${s.pending} offen` : 'Alles synchronisiert'}
        </span>
        <span className={s.online ? 'text-emerald-400' : 'text-amber-400'}>
          {s.online ? 'Online' : 'Offline'}
        </span>
      </div>
      {s.lastSyncAt && (
        <p className="text-sm text-neutral-400">
          Zuletzt: {new Date(s.lastSyncAt).toLocaleTimeString('de-DE')}
        </p>
      )}
      {s.error && (
        <p role="alert" className="text-sm text-red-400">
          Sync-Fehler: {s.error}
        </p>
      )}
      <button
        onClick={() => void syncNow(supabase)}
        disabled={s.syncing}
        className="w-full rounded-xl border border-neutral-700 py-3 disabled:opacity-50"
      >
        Jetzt synchronisieren
      </button>
    </section>
  )
}
