import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { applyRemote, deleteLocal, exportAll, getAll, getDb, resetDbHandle, saveLocal } from './db'
import { syncNow } from './sync'

type Call = { table: string; rows: any[]; opts: any }
type Del = { table: string; ids: string[] }

function mockClient(opts: { signedIn?: boolean; failTable?: string; failDelete?: boolean } = {}) {
  const calls: Call[] = []
  const deletes: Del[] = []
  const client = {
    auth: {
      getSession: async () => ({ data: { session: opts.signedIn === false ? null : { user: {} } } }),
    },
    from: (table: string) => ({
      upsert: async (rows: any[], o: any) => {
        calls.push({ table, rows, opts: o })
        return { error: table === opts.failTable ? { message: 'boom' } : null }
      },
      delete: () => ({
        in: async (_col: string, ids: string[]) => {
          deletes.push({ table, ids })
          return { error: opts.failDelete ? { message: 'nope' } : null }
        },
      }),
    }),
  }
  return { client: client as any, calls, deletes }
}

const session = (id = crypto.randomUUID()) => ({
  id,
  day_key: 'mo_brust',
  started_at: '2026-10-04T10:00:00Z',
  ended_at: null,
  note: null,
})
const set = (session_id: string) => ({
  id: crypto.randomUUID(),
  session_id,
  exercise_key: 'hs_incline_press',
  set_no: 1,
  weight_kg: 40,
  reps: 8,
  rir: 2,
  is_warmup: false,
  side: 'both' as const,
  logged_at: '2026-10-04T10:05:00Z',
  note: null,
})

beforeEach(async () => {
  await resetDbHandle()
  globalThis.indexedDB = new IDBFactory()
})

describe('sync', () => {
  it('speichert lokal als pending und setzt erst nach Bestätigung synced', async () => {
    const s = session()
    await saveLocal('session', s)
    await saveLocal('workout_set', set(s.id))
    expect((await getAll('session'))[0]._sync).toBe('pending')

    const { client, calls } = mockClient()
    await syncNow(client)

    expect(calls.map((c) => c.table)).toEqual(['session', 'workout_set'])
    expect((await getAll('session'))[0]._sync).toBe('synced')
    expect((await getAll('workout_set'))[0]._sync).toBe('synced')
  })

  it('sendet nie user_id oder lokale Metadaten', async () => {
    await saveLocal('session', { ...session(), user_id: 'x' } as any)
    const { client, calls } = mockClient()
    await syncNow(client)
    const keys = Object.keys(calls[0].rows[0])
    expect(keys).not.toContain('user_id')
    expect(keys.filter((k) => k.startsWith('_'))).toEqual([])
  })

  it('bleibt bei Fehler pending, behält Daten und stoppt abhängige Tabellen', async () => {
    const s = session()
    await saveLocal('session', s)
    await saveLocal('workout_set', set(s.id))
    const { client, calls } = mockClient({ failTable: 'session' })
    await syncNow(client)

    const rows = await getAll('session')
    expect(rows).toHaveLength(1)
    expect(rows[0]._sync).toBe('pending')
    expect(rows[0]._error).toBe('boom')
    expect(calls.map((c) => c.table)).toEqual(['session'])
  })

  it('sendet nichts ohne Login', async () => {
    await saveLocal('session', session())
    const { client, calls } = mockClient({ signedIn: false })
    await syncNow(client)
    expect(calls).toHaveLength(0)
    expect((await getAll('session'))[0]._sync).toBe('pending')
  })

  it('markiert keine Zeile als synced, die während des Syncs erneut geändert wurde', async () => {
    const s = session()
    await saveLocal('session', s)
    const { client } = mockClient()
    const orig = client.from
    client.from = (t: string) => {
      const q = orig(t)
      return {
        upsert: async (...a: any[]) => {
          await saveLocal('session', { ...s, note: 'neu' }) // Änderung mitten im Sync
          return q.upsert(...a)
        },
      }
    }
    await syncNow(client)
    expect((await getAll('session'))[0]._sync).toBe('pending')
  })

  it('bodyweight: Konflikt über user_id,measured_on, ein lokaler Eintrag pro Tag', async () => {
    await saveLocal('bodyweight', { id: crypto.randomUUID(), measured_on: '2026-10-04', weight_kg: 80 })
    await saveLocal('bodyweight', { id: crypto.randomUUID(), measured_on: '2026-10-04', weight_kg: 79.5 })
    expect(await getAll('bodyweight')).toHaveLength(1)

    const { client, calls } = mockClient()
    await syncNow(client)
    expect(calls[0].opts).toEqual({ onConflict: 'user_id,measured_on' })
    expect(calls[0].rows).toHaveLength(1)
    expect(calls[0].rows[0].weight_kg).toBe(79.5)
  })
})

describe('applyRemote (Pull-Grundlage)', () => {
  it('übernimmt Server-Zeilen als synced, überschreibt aber nie pending', async () => {
    const mine = session()
    await saveLocal('session', { ...mine, note: 'lokal' })
    const other = session()
    const res = await applyRemote('session', [
      { ...mine, note: 'server', user_id: 'u' } as any,
      { ...other, user_id: 'u' } as any,
    ])
    expect(res).toEqual({ applied: 1, skipped: 1 })
    const all = await getAll('session')
    expect(all.find((r) => r.id === mine.id)!.note).toBe('lokal')
    expect(all.find((r) => r.id === other.id)!._sync).toBe('synced')
    expect(Object.keys(all[0])).not.toContain('user_id')
  })
})

describe('Tombstones und Loesch-Sync', () => {
  it('Loeschen blendet den Satz sofort aus, auch wenn er noch nicht synchronisiert war', async () => {
    const s = session()
    await saveLocal('session', s)
    const w = set(s.id)
    await saveLocal('workout_set', w)
    await deleteLocal('workout_set', w.id)
    expect(await getAll('workout_set')).toHaveLength(0) // Lesezugriffe blenden Tombstones aus
    expect((await (await getDb()).getAll('workout_set'))[0]._deleted).toBe(true) // Datensatz bleibt bis zur Bestaetigung
  })

  it('sendet delete und entfernt den Tombstone erst nach Bestaetigung; ein geloeschter Satz wird nicht mehr hochgeladen', async () => {
    const s = session()
    await saveLocal('session', s)
    const w = set(s.id)
    await saveLocal('workout_set', w)
    await deleteLocal('workout_set', w.id)
    const { client, calls, deletes } = mockClient()
    await syncNow(client)
    expect(deletes).toEqual([{ table: 'workout_set', ids: [w.id] }])
    expect(calls.map((c) => c.table)).toEqual(['session']) // kein Upsert fuer den Tombstone
    expect(await (await getDb()).getAll('workout_set')).toHaveLength(0)
  })

  it('bei Fehler bleibt der Tombstone erhalten und der Fehler ist sichtbar', async () => {
    const s = session()
    await saveLocal('session', s)
    const w = set(s.id)
    await saveLocal('workout_set', w)
    await deleteLocal('workout_set', w.id)
    const { client } = mockClient({ failDelete: true })
    await syncNow(client)
    const raw = await (await getDb()).getAll('workout_set')
    expect(raw).toHaveLength(1)
    expect(raw[0]._deleted).toBe(true)
    expect(raw[0]._sync).toBe('pending')
    expect(raw[0]._error).toBe('nope')
  })

  it('applyRemote spielt geloeschte Saetze nicht wieder ein', async () => {
    const s = session()
    const w = set(s.id)
    await saveLocal('workout_set', w)
    await deleteLocal('workout_set', w.id)
    const res = await applyRemote('workout_set', [{ ...w, user_id: 'u' } as any])
    expect(res).toEqual({ applied: 0, skipped: 1 })
    expect(await getAll('workout_set')).toHaveLength(0)
  })

  it('JSON-Export blendet Tombstones und lokale Metadaten aus', async () => {
    const s = session()
    await saveLocal('session', s)
    const keep = set(s.id)
    const gone = set(s.id)
    await saveLocal('workout_set', keep)
    await saveLocal('workout_set', gone)
    await deleteLocal('workout_set', gone.id)
    const out = await exportAll()
    expect(out.workout_set.map((r: any) => r.id)).toEqual([keep.id])
    expect(Object.keys(out.workout_set[0]).filter((k) => k.startsWith('_'))).toEqual([])
  })
})
