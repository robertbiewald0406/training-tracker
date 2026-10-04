import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { LocalRow, RowByStore, StoreName } from './types'

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
}

const STORES: StoreName[] = ['session', 'workout_set', 'bodyweight']

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null

export function getDb() {
  dbPromise ??= openDB<Schema>('training-tracker', 1, {
    upgrade(db) {
      db.createObjectStore('session', { keyPath: 'id' }).createIndex('by_sync', '_sync')
      const sets = db.createObjectStore('workout_set', { keyPath: 'id' })
      sets.createIndex('by_sync', '_sync')
      sets.createIndex('by_session', 'session_id')
      const bw = db.createObjectStore('bodyweight', { keyPath: 'id' })
      bw.createIndex('by_sync', '_sync')
      bw.createIndex('by_date', 'measured_on')
    },
  })
  return dbPromise
}

// Nur für Tests: Verbindung schließen und Cache verwerfen.
export async function resetDbHandle() {
  if (dbPromise) (await dbPromise).close()
  dbPromise = null
}

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
  const rec = { ...row, id, _sync: 'pending', _v: (prev?._v ?? 0) + 1 } as unknown as LocalRow<S>
  await os.put(rec)
  await tx.done
  return rec
}

export async function getPending<S extends StoreName>(store: S): Promise<LocalRow<S>[]> {
  const db = await getDb()
  return (await (db as any).getAllFromIndex(store, 'by_sync', 'pending')) as LocalRow<S>[]
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

export async function getAll<S extends StoreName>(store: S): Promise<LocalRow<S>[]> {
  const db = await getDb()
  return (await db.getAll(store)) as LocalRow<S>[]
}

/**
 * Pull-Grundlage für ein neues Gerät: Zeilen aus Supabase als synced übernehmen.
 * Lokale pending-Einträge werden nie überschrieben. Der Aufrufer holt die Zeilen
 * (z. B. supabase.from(store).select('*') ohne user_id) und übergibt sie hier.
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
    if (cur?._sync === 'pending') {
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
  return { applied, skipped }
}
