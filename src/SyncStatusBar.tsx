import { useSyncExternalStore } from 'react'
import { confirmHeldReconcile, getSyncStatus, subscribeSyncStatus, syncNow } from './lib/sync'
import { supabase } from './lib/supabase'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { Check, Dumbbell } from './ui/icons'

export function SyncStatusBar() {
  const s = useSyncExternalStore(subscribeSyncStatus, getSyncStatus)
  const done = !s.syncing && s.pending === 0 && !s.error
  return (
    <Card className="space-y-3" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-2xl">
          {s.syncing ? (
            <Dumbbell className="size-7 animate-spin motion-reduce:animate-none" />
          ) : done ? (
            <Check className="size-7" />
          ) : (
            <Dumbbell className="size-7" />
          )}
          Sync
        </h2>
        <span
          className={`border-[3px] border-ink px-2 font-display uppercase tracking-wider text-ink ${
            s.online ? 'bg-ok' : 'bg-baby'
          }`}
        >
          {s.online ? 'Online' : 'Offline'}
        </span>
      </div>
      <p className="num text-6xl leading-none">
        {s.syncing ? '…' : s.pending}
        <span className="ml-2 font-sans text-lg font-semibold">
          {s.syncing ? 'synchronisiere' : s.pending > 0 ? 'offen' : 'alles synchronisiert'}
        </span>
      </p>
      {s.lastSyncAt && (
        <p className="text-base">Zuletzt: {new Date(s.lastSyncAt).toLocaleTimeString('de-DE')}</p>
      )}
      {s.error && (
        <p role="alert" className="border-[3px] border-ink bg-err px-3 py-2 text-white">
          Sync-Fehler: {s.error}
        </p>
      )}
      {s.held && (
        <div role="alert" className="space-y-3 border-[3px] border-ink bg-baby px-3 py-3">
          <p>{s.held.text}</p>
          <Button onClick={() => void confirmHeldReconcile(supabase)} disabled={s.syncing}>
            Trotzdem abgleichen
          </Button>
        </div>
      )}
      <Button variant="secondary" onClick={() => void syncNow(supabase, { pull: true })} disabled={s.syncing}>
        Jetzt synchronisieren
      </Button>
    </Card>
  )
}
