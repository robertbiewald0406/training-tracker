import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { openDB } from 'idb'
import { deleteMeta, getAll, getDb, getMeta, resetDbHandle, setMeta } from './db'

beforeEach(async () => {
  await resetDbHandle()
  globalThis.indexedDB = new IDBFactory()
})

describe('IndexedDB-Upgrade v1 -> v2', () => {
  it('erhaelt alle bestehenden Stores und Daten und legt meta an', async () => {
    // Version 1 exakt wie ausgeliefert anlegen und befuellen.
    const v1 = await openDB('training-tracker', 1, {
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
    await v1.put('session', { id: 's1', day_key: 'mo_brust', started_at: '2026-10-05T10:00:00Z', ended_at: null, note: null, _sync: 'pending', _v: 1 })
    await v1.put('workout_set', { id: 'w1', session_id: 's1', exercise_key: 'hs_incline_press', set_no: 1, weight_kg: 40, reps: 8, rir: null, is_warmup: false, side: 'both', logged_at: '2026-10-05T10:05:00Z', note: null, _sync: 'synced', _v: 2 })
    await v1.put('bodyweight', { id: 'b1', measured_on: '2026-10-05', weight_kg: 80, _sync: 'pending', _v: 1 })
    v1.close()

    const db = await getDb() // oeffnet mit Version 2 und fuehrt das Upgrade aus
    expect(db.version).toBe(2)
    expect([...db.objectStoreNames].sort()).toEqual(['bodyweight', 'meta', 'session', 'workout_set'])
    expect((await getAll('session')).map((r) => r.id)).toEqual(['s1'])
    const set = (await getAll('workout_set'))[0]
    expect(set).toMatchObject({ id: 'w1', weight_kg: 40, _sync: 'synced', _v: 2 })
    expect((await getAll('bodyweight'))[0]).toMatchObject({ id: 'b1', weight_kg: 80, _sync: 'pending' })
    // Indizes funktionieren weiter
    expect(await db.getAllFromIndex('workout_set', 'by_session', 's1')).toHaveLength(1)
    expect(await db.countFromIndex('session', 'by_sync', 'pending')).toBe(1)
  })

  it('meta-Store: speichern, lesen, loeschen', async () => {
    await setMeta('position:s1', { itemIdx: 2 })
    expect(await getMeta('position:s1')).toEqual({ itemIdx: 2 })
    await deleteMeta('position:s1')
    expect(await getMeta('position:s1')).toBeUndefined()
  })
})
