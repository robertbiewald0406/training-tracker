import type { SupabaseClient } from '@supabase/supabase-js'
import { countPending, getPending, markError, markSynced, saveLocal } from './db'
import type { RowByStore, StoreName } from './types'

export interface SyncStatus {
  online: boolean
  syncing: boolean
  pending: number
  lastSyncAt: string | null
  error: string | null
}

let status: SyncStatus = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  pending: 0,
  lastSyncAt: null,
  error: null,
}
const listeners = new Set<() => void>()

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}
export const getSyncStatus = () => status
export function subscribeSyncStatus(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const refreshPending = async () => setStatus({ pending: await countPending() })

// Reihenfolge wegen Fremdschlüsseln: session vor workout_set.
const ORDER: StoreName[] = ['session', 'workout_set', 'bodyweight']
// bodyweight: eine Zeile pro Nutzer und Tag. user_id wird serverseitig gesetzt (default auth.uid()).
const CONFLICT: Record<StoreName, string> = {
  session: 'id',
  workout_set: 'id',
  bodyweight: 'user_id,measured_on',
}
const BATCH = 200

/** Entfernt lokale Metadaten und user_id. user_id wird nie vom Client gesendet. */
function toRemote<S extends StoreName>(rec: any): RowByStore[S] {
  const { _sync, _v, _error, user_id, ...row } = rec
  return row
}

let running: Promise<void> | null = null
let again = false

/** Überträgt alle pending-Einträge. Parallele Aufrufe werden zusammengefasst. */
export function syncNow(client: SupabaseClient): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    do {
      again = false
      await runOnce(client)
    } while (again)
  })().finally(() => {
    running = null
  })
  return running
}

async function runOnce(client: SupabaseClient) {
  setStatus({ syncing: true, online: typeof navigator === 'undefined' ? true : navigator.onLine })
  let error: string | null = null
  try {
    const { data } = await client.auth.getSession()
    if (!data.session) {
      error = 'Nicht angemeldet, Einträge bleiben lokal gespeichert.'
    } else {
      outer: for (const store of ORDER) {
        const pending = await getPending(store)
        for (let i = 0; i < pending.length; i += BATCH) {
          const batch = pending.slice(i, i + BATCH)
          const ids = batch.map((r) => r.id)
          try {
            const { error: err } = await client
              .from(store)
              .upsert(batch.map(toRemote), { onConflict: CONFLICT[store] })
            if (err) throw new Error(err.message)
            // Erst jetzt, nach fehlerfreier Bestätigung, auf synced setzen.
            await markSynced(store, batch.map((r) => ({ id: r.id, _v: r._v })))
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            await markError(store, ids, msg)
            error = `${store}: ${msg}`
            break outer // Abhängige Tabellen nicht weiter versuchen
          }
        }
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  setStatus({
    syncing: false,
    pending: await countPending(),
    error,
    lastSyncAt: error ? status.lastSyncAt : new Date().toISOString(),
  })
}

/** Speichert lokal (sofort) und stößt danach den Sync an. Fehler des Syncs gehen nur in den Status. */
export async function saveAndSync<S extends StoreName>(
  client: SupabaseClient,
  store: S,
  row: RowByStore[S],
) {
  const rec = await saveLocal(store, row)
  await refreshPending()
  void syncNow(client)
  return rec
}

/** Sync beim App-Start, beim online-Event und beim Zurückkehren in den Vordergrund. Gibt eine Abmelde-Funktion zurück. */
export function startSync(client: SupabaseClient): () => void {
  const onOnline = () => {
    setStatus({ online: true })
    void syncNow(client)
  }
  const onOffline = () => setStatus({ online: false })
  const onVisible = () => {
    if (document.visibilityState === 'visible') void syncNow(client)
  }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('offline', onOffline)
  void refreshPending()
  void syncNow(client)
  return () => {
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('offline', onOffline)
  }
}
