import type { SupabaseClient } from '@supabase/supabase-js'
import {
  countPending,
  deleteLocal,
  getPending,
  getPendingDeletes,
  markDeleted,
  markError,
  markSynced,
  saveLocal,
} from './db'
import { pullAll } from './pull'
import type { RowByStore, StoreName } from './types'

export interface SyncStatus {
  online: boolean
  syncing: boolean
  pending: number
  lastSyncAt: string | null
  error: string | null
  held: { total: number; text: string } | null // Schutzbremse des Pull-Abgleichs
}

let status: SyncStatus = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  pending: 0,
  lastSyncAt: null,
  error: null,
  held: null,
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
  const { _sync, _v, _error, _deleted, user_id, ...row } = rec
  return row
}

let running: Promise<void> | null = null
let queued: { pull: boolean; force: boolean } | null = null

/**
 * Sendet alle pending-Eintraege (Uploads zuerst) und holt danach, wenn `pull` gesetzt ist, alle Zeilen aus Supabase.
 * Pull nur beim Start/Login, bei Rueckkehr in die App, online-Event und manuellem Sync, nicht nach jedem Speichern.
 * `force` (nach Bestaetigung im Dialog) umgeht nur die Schutzbremse des Abgleichs, nie die Anmeldepruefung.
 * Parallele Aufrufe werden zusammengefasst.
 */
export function syncNow(client: SupabaseClient, opts: { pull?: boolean; force?: boolean } = {}): Promise<void> {
  const o = { pull: Boolean(opts.pull || opts.force), force: Boolean(opts.force) }
  if (running) {
    queued = { pull: (queued?.pull ?? false) || o.pull, force: (queued?.force ?? false) || o.force }
    return running
  }
  running = (async () => {
    let cur: { pull: boolean; force: boolean } | null = o
    while (cur) {
      queued = null
      await runOnce(client, cur.pull, cur.force)
      cur = queued
    }
  })().finally(() => {
    running = null
  })
  return running
}

/** "Trotzdem abgleichen": Rueckfrage mit der Anzahl, dann Abgleich ohne Schutzbremse (mit frischem Pull). */
export async function confirmHeldReconcile(
  client: SupabaseClient,
  confirm: (message: string) => boolean = (m) => window.confirm(m),
): Promise<boolean> {
  const held = status.held
  if (!held) return false
  const ok = confirm(
    `${held.total} lokal gespeicherte Zeilen entfernen, die in Supabase nicht (mehr) vorhanden sind?\n\n` +
      'Das lässt sich nicht rückgängig machen. Nicht gesendete Einträge bleiben in jedem Fall erhalten.',
  )
  if (ok) await syncNow(client, { pull: true, force: true })
  return ok
}

async function runOnce(client: SupabaseClient, pull: boolean, force: boolean) {
  setStatus({ syncing: true, online: typeof navigator === 'undefined' ? true : navigator.onLine })
  let error: string | null = null
  let heldUpdate: { value: SyncStatus['held'] } | null = null
  try {
    const { data } = await client.auth.getSession()
    if (!data.session) {
      error = 'Nicht angemeldet, Einträge bleiben lokal gespeichert.'
    } else {
      outer: for (const store of ORDER) {
        // Erst Loeschungen (Tombstones), dann Upserts. Tombstone erst nach bestaetigtem Delete entfernen.
        const dels = await getPendingDeletes(store)
        for (let i = 0; i < dels.length; i += BATCH) {
          const batch = dels.slice(i, i + BATCH)
          try {
            const { error: err } = await client.from(store).delete().in('id', batch.map((r) => r.id))
            if (err) throw new Error(err.message)
            await markDeleted(store, batch.map((r) => ({ id: r.id, _v: r._v })))
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            await markError(store, batch.map((r) => r.id), msg)
            error = `${store} löschen: ${msg}`
            break outer
          }
        }
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
      // Erst nach den Uploads pullen. Ohne Netz wird gar nicht erst versucht (App startet mit lokalen Daten).
      if (pull && !(typeof navigator !== 'undefined' && navigator.onLine === false)) {
        const r = await pullAll(client, { force })
        heldUpdate = { value: r.held }
        const msgs = [...r.errors, ...r.conflicts]
        if (msgs.length) error = [error, ...msgs].filter(Boolean).join(' | ')
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  setStatus({
    syncing: false,
    pending: await countPending(),
    error,
    ...(heldUpdate ? { held: (heldUpdate as { value: SyncStatus['held'] }).value } : {}),
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

/** Loescht lokal per Tombstone (sofort) und stoesst die Loeschung in Supabase an. */
export async function deleteAndSync(client: SupabaseClient, store: StoreName, id: string) {
  await deleteLocal(store, id)
  await refreshPending()
  void syncNow(client)
}

/** Sync beim App-Start, beim online-Event und beim Zurückkehren in den Vordergrund. Gibt eine Abmelde-Funktion zurück. */
export function startSync(client: SupabaseClient): () => void {
  const onOnline = () => {
    setStatus({ online: true })
    void syncNow(client, { pull: true })
  }
  const onOffline = () => setStatus({ online: false })
  const onVisible = () => {
    if (document.visibilityState === 'visible') void syncNow(client, { pull: true })
  }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('offline', onOffline)
  void refreshPending()
  void syncNow(client, { pull: true }) // blockiert den App-Start nie
  return () => {
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('offline', onOffline)
  }
}
