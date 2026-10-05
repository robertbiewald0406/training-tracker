import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { openDB } from 'idb'
import { deleteMeta, getAll, getDb, getMeta, listMetaKeys, resetDbHandle, saveLocal, setMeta } from './db'
import { pruneStalePositions } from './positions'

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

describe('Veraltete Positionen', () => {
  it('verwirft die Position einer fehlenden Session beim Start, laesst gueltige und andere meta-Eintraege', async () => {
    const live = { id: 's1', day_key: 'mo_brust', started_at: '2026-10-05T10:00:00Z', ended_at: null, note: null }
    await saveLocal('session', live)
    await setMeta('position:s1', { itemIdx: 1, chosen: {}, assign: {} })
    await setMeta('position:ghost', { itemIdx: 2, chosen: {}, assign: {} })
    await setMeta('quotes:recent', ['a'])

    const dropped = await pruneStalePositions(await getAll('session'))

    expect(dropped).toEqual(['position:ghost'])
    expect(await getMeta('position:ghost')).toBeUndefined()
    expect(await getMeta('position:s1')).toBeTruthy()
    expect(await listMetaKeys()).toEqual(['position:s1', 'quotes:recent'])
  })
})

describe('Uebung umschluesseln', () => {
  const set = (id: string, key: string, extra = {}) => ({
    id, session_id: 's1', exercise_key: key, set_no: 1, weight_kg: 40, reps: 9, rir: null, is_warmup: false,
    side: 'both' as const, logged_at: '2026-10-05T10:05:00Z', note: null, ...extra,
  })
  it('stellt nur die betroffenen Saetze um, pending, Gewicht unveraendert, Tombstones unberuehrt', async () => {
    const { rekeyExercise, setsOfExercise } = await import('./rekey')
    const { markSynced } = await import('./db')
    await saveLocal('workout_set', set('a', 'hs_chest_press', { weight_kg: 35, reps: 10 }))
    await saveLocal('workout_set', set('b', 'hs_chest_press'))
    await saveLocal('workout_set', set('c', 'hs_incline_press'))
    await saveLocal('workout_set', set('d', 'hs_chest_press'))
    const { deleteLocal } = await import('./db')
    await deleteLocal('workout_set', 'd')
    await markSynced('workout_set', [{ id: 'a', _v: 1 }, { id: 'b', _v: 1 }, { id: 'c', _v: 1 }])
    expect((await setsOfExercise('hs_chest_press')).map((s) => s.id)).toEqual(['a', 'b'])

    expect(await rekeyExercise('hs_chest_press', 'mts_chest_press')).toBe(2)
    // getAll blendet Tombstones aus, hier direkt aus dem Store lesen.
    const by = Object.fromEntries(((await (await getDb()).getAll('workout_set')) as { id: string }[]).map((s) => [s.id, s])) as Record<string, never>
    expect(by.a).toMatchObject({ exercise_key: 'mts_chest_press', weight_kg: 35, reps: 10, _sync: 'pending' })
    expect(by.b).toMatchObject({ exercise_key: 'mts_chest_press', weight_kg: 40, _sync: 'pending' })
    expect(by.c).toMatchObject({ exercise_key: 'hs_incline_press', _sync: 'synced' })
    expect(by.d).toMatchObject({ exercise_key: 'hs_chest_press', _deleted: true })
    expect(await rekeyExercise('hs_chest_press', 'mts_chest_press')).toBe(0)
  })
})
