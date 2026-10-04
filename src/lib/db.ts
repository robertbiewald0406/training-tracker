import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { LocalRow, RowByStore, StoreName } from './types'

export const DB_VERSION = 2

interface Schema extends DBSchema {
  session: { key: string; value: LocalRow<'session'>; indexes: { by_sync: string } }
  workout_set: {
    key: string
    value: LocalRow<'workout_set'>
    indexes: { by_sync: string; by_session: string }
  }
  bodyweight: {
    key: string
    value: LocalRow<'bodyweight'>
    indexes: { by_sync: string; by_date: string }
  }
  // Nur lokal, wird nie synchronisiert (z. B. Position in der laufenden Einheit).
  meta: { key: string; value: { key: string; value: unknown } }
}

const STORES: StoreName[] = ['session', 'workout_set', 'bodyweight']

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null

export function getDb() {
  dbPromise ??= openDB<Schema>('training-tracker', DB_VERSION, {
    upgrade(db, oldVersion) {
      // Upgrades sind rein additiv: bestehende Stores und Daten bleiben unangetastet.
      if (oldVersion < 1) {
        db.createObjectStore('session', { keyPath: 'id' }).createIndex('by_sync', '_sync')
        const sets = db.createObjectStore('workout_set', { keyPath: 'id' })
        sets.createIndex('by_sync', '_sync')
        sets.createIndex('by_session', 'session_id')
        const bw = db.createObjectStore('bodyweight', { keyPath: 'id' })
        bw.createIndex('by_sync', '_sync')
        bw.createIndex('by_date', 'measured_on')
      }
      if (oldVersion < 2) {
        db.createObjectStore('meta', { keyPath: 'key' })
      }
    },
  })
  return dbPromise
}

// Nur fuer Tests: Verbindung schliessen und Cache verwerfen.
export async function resetDbHandle() {
  if (dbPromise) (await dbPromise).close()
  dbPromise = null
}

// Aenderungsbenachrichtigung fuer die UI (Hook useLocalData).
const listeners = new Set<() => void>()
export const subscribeDb = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const notifyDb = () => listeners.forEach((l) => l())

type Row<S extends StoreName> = RowByStore[S]

/** Lokal speichern (immer pending). Erhöht _v, damit ein laufender Sync den neuen Stand nicht als synced markiert. */
export async function saveLocal<S extends StoreName>(store: S, row: Row<S>): Promise<LocalRow<S>> {
  const db = await getDb()
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store) as any
  let id = row.id
  let prev = await os.get(id)
  if (store === 'bodyweight' && !prev) {
    // Pro Datum nur ein Eintrag: bestehende lokale Zeile (und damit ihre id) wiederverwenden.
    const same = await os.index('by_date').get((row as Row<'bodyweight'>).measured_on)
    if (same) {
      prev = same
      id = same.id
    }
  }
  // Ein erneutes Speichern hebt einen Tombstone bewusst auf (kein _deleted im neuen Datensatz).
  const rec = { ...row, id, _sync: 'pending', _v: (prev?._v ?? 0) + 1 } as unknown as LocalRow<S>
  await os.put(rec)
  await tx.done
  notifyDb()
  return rec
}

/** Lokal loeschen = Tombstone. Der Datensatz bleibt, bis Supabase die Loeschung bestaetigt hat. */
export async function deleteLocal<S extends StoreName>(store: S, id: string): Promise<boolean> {
  const db = await getDb()
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store) as any
  const cur = await os.get(id)
  if (cur) await os.put({ ...cur, _deleted: true, _sync: 'pending', _v: cur._v + 1, _error: undefined })
  await tx.done
  if (cur) notifyDb()
  return Boolean(cur)
}

/** Offene Upserts (ohne Tombstones). */
export async function getPending<S extends StoreName>(store: S): Promise<LocalRow<S>[]> {
  const db = await getDb()
  const rows = (await (db as any).getAllFromIndex(store, 'by_sync', 'pending')) as LocalRow<S>[]
  return rows.filter((r) => !r._deleted)
}

/** Offene Loeschungen (Tombstones). */
export async function getPendingDeletes<S extends StoreName>(store: S): Promise<LocalRow<S>[]> {
  const db = await getDb()
  const rows = (await (db as any).getAllFromIndex(store, 'by_sync', 'pending')) as LocalRow<S>[]
  return rows.filter((r) => r._deleted)
}

export async function countPending(): Promise<number> {
  const db = await getDb()
  let n = 0
  for (const s of STORES) n += await (db as any).countFromIndex(s, 'by_sync', 'pending')
  return n
}

/** Erst nach Bestätigung durch Supabase aufrufen. Überspringt Zeilen, die inzwischen erneut geändert wurden. */
export async function markSynced<S extends StoreName>(
  store: S,
  sent: { id: string; _v: number }[],
): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store) as any
  for (const { id, _v } of sent) {
    const cur = await os.get(id)
    if (cur && cur._v === _v) await os.put({ ...cur, _sync: 'synced', _error: undefined })
  }
  await tx.done
}

/** Erst nach bestätigter Loeschung in Supabase: entfernt den Tombstone lokal (nur wenn unveraendert). */
export async function markDeleted<S extends StoreName>(
  store: S,
  sent: { id: string; _v: number }[],
): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store) as any
  for (const { id, _v } of sent) {
    const cur = await os.get(id)
    if (cur && cur._deleted && cur._v === _v) await os.delete(id)
  }
  await tx.done
}

export async function markError<S extends StoreName>(store: S, ids: string[], message: string) {
  const db = await getDb()
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store) as any
  for (const id of ids) {
    const cur = await os.get(id)
    if (cur) await os.put({ ...cur, _error: message })
  }
  await tx.done
}

/** Lokale Metadaten entfernen (vor erneutem Speichern oder Export). */
export function stripMeta<S extends StoreName>(rec: LocalRow<S>): RowByStore[S] {
  const { _sync, _v, _error, _deleted, ...row } = rec as LocalRow<S> & Record<string, unknown>
  return row as unknown as RowByStore[S]
}

/** Alle sichtbaren Zeilen. Tombstones werden ausgeblendet. */
export async function getAll<S extends StoreName>(store: S): Promise<LocalRow<S>[]> {
  const db = await getDb()
  return ((await db.getAll(store)) as LocalRow<S>[]).filter((r) => !r._deleted)
}

export async function getSetsForSession(sessionId: string): Promise<LocalRow<'workout_set'>[]> {
  const db = await getDb()
  return (await db.getAllFromIndex('workout_set', 'by_session', sessionId)).filter((r) => !r._deleted)
}

/** JSON-Export aller sichtbaren Daten (ohne Tombstones und ohne lokale Metadaten). */
export async function exportAll() {
  const strip = (r: any) => {
    const { _sync, _v, _error, _deleted, ...row } = r
    return row
  }
  return {
    app: 'lift-heavy',
    exported_at: new Date().toISOString(),
    session: (await getAll('session')).map(strip),
    workout_set: (await getAll('workout_set')).map(strip),
    bodyweight: (await getAll('bodyweight')).map(strip),
  }
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDb()
  return (await db.get('meta', key))?.value as T | undefined
}
export async function listMetaKeys(prefix = ''): Promise<string[]> {
  const db = await getDb()
  return ((await db.getAllKeys('meta')) as string[]).filter((k) => k.startsWith(prefix))
}
export async function setMeta(key: string, value: unknown) {
  const db = await getDb()
  await db.put('meta', { key, value })
}
export async function deleteMeta(key: string) {
  const db = await getDb()
  await db.delete('meta', key)
}

/**
 * Pull-Grundlage für ein neues Gerät: Zeilen aus Supabase als synced übernehmen.
 * Lokale pending-Einträge und Tombstones werden nie überschrieben bzw. wiederbelebt.
 * Der Aufrufer holt die Zeilen (z. B. supabase.from(store).select('*')) und übergibt sie hier.
 * Reihenfolge beim Pull: session, workout_set, bodyweight.
 */
export async function applyRemote<S extends StoreName>(
  store: S,
  remote: (Row<S> & { user_id?: string })[],
): Promise<{ applied: number; skipped: number }> {
  const db = await getDb()
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store) as any
  let applied = 0
  let skipped = 0
  for (const { user_id: _drop, ...row } of remote) {
    const cur = await os.get(row.id)
    if (cur?._deleted || cur?._sync === 'pending') {
      skipped++
      continue
    }
    if (store === 'bodyweight') {
      // Server-Zeile gewinnt pro Datum, sofern lokal nichts Offenes liegt.
      const same = await os.index('by_date').get((row as any).measured_on)
      if (same && same.id !== row.id) {
        if (same._sync === 'pending') {
          skipped++
          continue
        }
        await os.delete(same.id)
      }
    }
    await os.put({ ...row, _sync: 'synced', _v: (cur?._v ?? 0) + 1 })
    applied++
  }
  await tx.done
  if (applied) notifyDb()
  return { applied, skipped }
}

/**
 * Nach vollstaendigem Pull einer Tabelle: lokale Zeilen entfernen, die als synchronisiert markiert sind und
 * remote nicht mehr existieren. Niemals: pending-Eintraege und Tombstones (beide sind _sync = 'pending').
 * Gilt fuer workout_set und bodyweight; Einheiten haben removeMissingSessions.
 */
export async function removeMissing(
  store: 'workout_set' | 'bodyweight',
  remoteIds: Set<string>,
): Promise<string[]> {
  const db = await getDb()
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store) as any
  const removed: string[] = []
  for (const r of (await os.getAll()) as LocalRow<typeof store>[]) {
    if (r._sync === 'synced' && !r._deleted && !remoteIds.has(r.id)) {
      await os.delete(r.id)
      removed.push(r.id)
    }
  }
  await tx.done
  if (removed.length) notifyDb()
  return removed
}

/**
 * Wie removeMissing, fuer Einheiten. Eine fehlende Einheit wird samt ihren lokalen Saetzen entfernt, aber nur,
 * wenn keiner der Saetze pending ist (auch Tombstones zaehlen). Sonst bleibt sie erhalten und wird als Konflikt gemeldet.
 */
export async function removeMissingSessions(
  remoteIds: Set<string>,
): Promise<{ removed: string[]; conflicts: LocalRow<'session'>[] }> {
  const db = await getDb()
  const tx = db.transaction(['session', 'workout_set'], 'readwrite')
  const sessions = tx.objectStore('session')
  const sets = tx.objectStore('workout_set')
  const removed: string[] = []
  const conflicts: LocalRow<'session'>[] = []
  for (const s of await sessions.getAll()) {
    if (s._sync !== 'synced' || s._deleted || remoteIds.has(s.id)) continue
    const own = await sets.index('by_session').getAll(s.id)
    if (own.some((x) => x._sync === 'pending')) {
      conflicts.push(s)
      continue
    }
    for (const x of own) await sets.delete(x.id)
    await sessions.delete(s.id)
    removed.push(s.id)
  }
  await tx.done
  if (removed.length) notifyDb()
  return { removed, conflicts }
}
