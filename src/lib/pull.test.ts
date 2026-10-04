import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { deleteLocal, getAll, getDb, resetDbHandle, saveLocal } from './db'
import { PAGE, pullAll } from './pull'
import { syncNow } from './sync'

type Tables = Record<'session' | 'workout_set' | 'bodyweight', any[]>

interface Opts {
  cap?: number // Server liefert hoechstens so viele Zeilen pro Abfrage (z. B. Projekt-Limit)
  failAt?: { table: string; call: number } // call = laufende Nummer der Abfrage dieser Tabelle (1-basiert)
}

/** In-Memory-Supabase: select().order().range() mit Seitenlimit, upsert/delete schreiben in die Tabellen. */
function remote(tables: Tables, opts: Opts = {}) {
  const log: string[] = []
  const counts: Record<string, number> = {}
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: {} } } }) },
    from: (table: keyof Tables) => ({
      select: () => ({
        order: () => ({
          range: async (a: number, b: number) => {
            counts[table] = (counts[table] ?? 0) + 1
            log.push(`select:${table}`)
            if (opts.failAt && opts.failAt.table === table && opts.failAt.call === counts[table])
              return { data: null, error: { message: 'Netzwerk weg' } }
            const sorted = [...tables[table]].sort((x, y) => (x.id < y.id ? -1 : 1))
            const max = Math.min(b - a + 1, opts.cap ?? Infinity)
            return { data: sorted.slice(a, a + max), error: null }
          },
        }),
      }),
      upsert: async (rows: any[]) => {
        log.push(`upsert:${table}`)
        for (const r of rows) {
          const i = tables[table].findIndex((x) => x.id === r.id)
          if (i >= 0) tables[table][i] = r
          else tables[table].push(r)
        }
        return { error: null }
      },
      delete: () => ({
        in: async (_c: string, ids: string[]) => {
          log.push(`delete:${table}`)
          tables[table] = tables[table].filter((x) => !ids.includes(x.id))
          return { error: null }
        },
      }),
    }),
  }
  return { client: client as any, log, counts }
}

let n = 0
const id = () => `id-${String(++n).padStart(6, '0')}`
const session = (over: any = {}) => ({
  id: id(), user_id: 'u', day_key: 'mo_brust', started_at: '2026-10-05T10:00:00Z', ended_at: null, note: null, ...over,
})
const set = (session_id: string, over: any = {}) => ({
  id: id(), user_id: 'u', session_id, exercise_key: 'hs_incline_press', set_no: 1, weight_kg: 40, reps: 8,
  rir: null, is_warmup: false, side: 'both', logged_at: '2026-10-05T10:05:00Z', note: null, ...over,
})
const bw = (over: any = {}) => ({ id: id(), user_id: 'u', measured_on: '2026-10-05', weight_kg: 80, ...over })
const empty = (): Tables => ({ session: [], workout_set: [], bodyweight: [] })
const strip = ({ user_id: _u, ...r }: any) => r // so speichert saveLocal (ohne user_id)

/** Lokale Zeile, die als synchronisiert gilt (wie nach einem Upload). */
async function putSynced(store: 'session' | 'workout_set' | 'bodyweight', row: any) {
  await saveLocal(store, strip(row))
  const db = await getDb()
  const cur: any = await db.get(store, row.id)
  await db.put(store, { ...cur, _sync: 'synced' })
}

beforeEach(async () => {
  await resetDbHandle()
  globalThis.indexedDB = new IDBFactory()
})

describe('Pull', () => {
  it('leeres Geraet: uebernimmt alle Zeilen aller Tabellen als synchronisiert', async () => {
    const t = empty()
    const s = session()
    t.session.push(s)
    t.workout_set.push(set(s.id), set(s.id, { set_no: 2 }), set(s.id, { set_no: 3 }))
    t.bodyweight.push(bw())
    const { client, log } = remote(t)
    const r = await pullAll(client)

    expect(r.errors).toEqual([])
    expect(r.completed).toEqual(['session', 'workout_set', 'bodyweight'])
    expect((await getAll('session')).length).toBe(1)
    expect((await getAll('workout_set')).length).toBe(3)
    expect((await getAll('bodyweight')).length).toBe(1)
    expect((await getAll('workout_set')).every((x) => x._sync === 'synced')).toBe(true)
    expect(Object.keys((await getAll('session'))[0])).not.toContain('user_id')
    // Reihenfolge der Tabellen: session, workout_set, bodyweight
    const order = [...new Set(log.map((l) => l.split(':')[1]))]
    expect(order).toEqual(['session', 'workout_set', 'bodyweight'])
  })

  it('neue Zeilen werden uebernommen, vorhandene bleiben', async () => {
    const t = empty()
    const s = session()
    t.session.push(s)
    t.workout_set.push(set(s.id))
    await putSynced('session', s)
    const fresh = set(s.id, { set_no: 2 })
    t.workout_set.push(fresh)
    const r = await pullAll(remote(t).client)
    expect(r.errors).toEqual([])
    expect((await getAll('workout_set')).map((x) => x.id)).toContain(fresh.id)
    expect((await getAll('session')).length).toBe(1)
  })

  it('remote geloeschte, synchronisierte Zeilen verschwinden lokal', async () => {
    const t = empty()
    const s = session()
    const keep = set(s.id)
    const gone = set(s.id, { set_no: 2 })
    const oldBw = bw()
    t.session.push(s)
    t.workout_set.push(keep) // gone und oldBw gibt es remote nicht mehr
    await putSynced('session', s)
    await putSynced('workout_set', keep)
    await putSynced('workout_set', gone)
    await putSynced('bodyweight', oldBw)

    const r = await pullAll(remote(t).client)

    expect(r.errors).toEqual([])
    expect(r.removed).toBe(2)
    expect((await getAll('workout_set')).map((x) => x.id)).toEqual([keep.id])
    expect(await getAll('bodyweight')).toHaveLength(0)
    expect(await getAll('session')).toHaveLength(1)
  })

  it('fehlende Einheit wird samt synchronisierten Saetzen entfernt', async () => {
    const s = session()
    await putSynced('session', s)
    await putSynced('workout_set', set(s.id))
    const r = await pullAll(remote(empty()).client)
    expect(r.removed).toBe(2)
    expect(await getAll('session')).toHaveLength(0)
    expect(await getAll('workout_set')).toHaveLength(0)
  })

  it('pending-Zeilen und Tombstones bleiben, auch wenn sie remote fehlen', async () => {
    const s = session()
    await putSynced('session', s)
    const p = set(s.id) // lokal neu, noch nicht gesendet (pending)
    await saveLocal('workout_set', strip(p))
    const dead = set(s.id, { set_no: 2 })
    await putSynced('workout_set', dead)
    await deleteLocal('workout_set', dead.id) // Tombstone, Loeschung steht aus
    const pBw = bw()
    await saveLocal('bodyweight', strip(pBw))

    // remote ist leer; Einheit hat ungesendete Saetze -> bleibt, Konflikt wird gemeldet
    const r = await pullAll(remote(empty()).client)

    expect(r.errors).toEqual([])
    expect(r.removed).toBe(0)
    expect(r.conflicts).toHaveLength(1)
    expect(r.conflicts[0]).toMatch(/Konflikt/)
    expect(await getAll('session')).toHaveLength(1)
    expect((await getAll('workout_set')).map((x) => x.id)).toEqual([p.id])
    const raw = await (await getDb()).getAll('workout_set')
    expect(raw.find((x) => x.id === dead.id)?._deleted).toBe(true)
    expect(await getAll('bodyweight')).toHaveLength(1)
  })

  it('Pull ueberschreibt keine pending-Aenderung mit dem Serverstand', async () => {
    const t = empty()
    const s = session()
    const w = set(s.id)
    t.session.push(s)
    t.workout_set.push({ ...w, weight_kg: 40 })
    await putSynced('session', s)
    await saveLocal('workout_set', { ...strip(w), weight_kg: 50 }) // lokal geaendert, noch pending
    await pullAll(remote(t).client)
    expect((await getAll('workout_set'))[0].weight_kg).toBe(50)
  })

  it('Abbruch mitten im Pull (zweite Seite schlaegt fehl) entfernt nichts und meldet Tabelle und Meldung', async () => {
    const t = empty()
    const s = session()
    t.session.push(s)
    for (let i = 0; i < PAGE + 50; i++) t.workout_set.push(set(s.id, { set_no: i }))
    const stale = set(s.id, { set_no: 99999 }) // lokal synchronisiert, remote nicht vorhanden
    await putSynced('session', s)
    await putSynced('workout_set', stale)
    const oldBw = bw()
    await putSynced('bodyweight', oldBw) // bodyweight-Pull laeuft vollstaendig (leer) -> darf entfernt werden

    const r = await pullAll(remote(t, { failAt: { table: 'workout_set', call: 2 } }).client)

    expect(r.completed).not.toContain('workout_set')
    expect(r.errors).toEqual(['workout_set laden: Netzwerk weg'])
    const ids = (await getAll('workout_set')).map((x) => x.id)
    expect(ids).toContain(stale.id) // nichts aus workout_set entfernt
    // Seite 1 wurde uebernommen (nur Hinzufuegen ist sicher)
    expect(ids.length).toBe(PAGE + 1)
    // vollstaendig geladene Tabellen duerfen weiter abgeglichen werden
    expect(await getAll('bodyweight')).toHaveLength(0)
    expect(await getAll('session')).toHaveLength(1)
  })

  it('Fehler schon bei der ersten Seite: nichts entfernt', async () => {
    const s = session()
    await putSynced('session', s)
    await putSynced('workout_set', set(s.id))
    const r = await pullAll(remote(empty(), { failAt: { table: 'session', call: 1 } }).client)
    expect(r.errors[0]).toBe('session laden: Netzwerk weg')
    expect(await getAll('session')).toHaveLength(1)
    // Einheiten-Pull unvollstaendig: Saetze duerfen trotzdem nur wegen ihrer eigenen Tabelle entfernt werden
    expect(r.completed).toEqual(['workout_set', 'bodyweight'])
  })

  it('mehr als 1000 Zeilen: seitenweise bis alles da ist', async () => {
    const t = empty()
    const s = session()
    t.session.push(s)
    for (let i = 0; i < 2500; i++) t.workout_set.push(set(s.id, { set_no: i }))
    const { client, counts } = remote(t)
    const r = await pullAll(client)
    expect(r.errors).toEqual([])
    expect(await getAll('workout_set')).toHaveLength(2500)
    expect(counts.workout_set).toBe(4) // 1000 + 1000 + 500 + leere Abschlussseite
  })

  it('Server mit kleinerem Limit (500 pro Abfrage) liefert trotzdem alles', async () => {
    const t = empty()
    const s = session()
    t.session.push(s)
    for (let i = 0; i < 1300; i++) t.workout_set.push(set(s.id, { set_no: i }))
    const r = await pullAll(remote(t, { cap: 500 }).client)
    expect(r.errors).toEqual([])
    expect(await getAll('workout_set')).toHaveLength(1300)
  })

  it('genau 1000 Zeilen: eine volle Seite plus leere Abschlussseite, nichts geht verloren', async () => {
    const t = empty()
    const s = session()
    t.session.push(s)
    for (let i = 0; i < PAGE; i++) t.workout_set.push(set(s.id, { set_no: i }))
    const stale = set(s.id, { set_no: -1 })
    await putSynced('workout_set', stale)
    const r = await pullAll(remote(t).client)
    expect(r.errors).toEqual([])
    expect(await getAll('workout_set')).toHaveLength(PAGE) // stale ist weg, alle 1000 da
  })
})

describe('syncNow mit Pull', () => {
  it('sendet erst die ausstehenden Uploads, dann wird gepullt', async () => {
    const t = empty()
    const s = session()
    await saveLocal('session', strip(s)) // pending
    const { client, log } = remote(t)
    await syncNow(client, { pull: true })
    const firstSelect = log.findIndex((l) => l.startsWith('select'))
    const lastUpsert = log.map((l) => l.startsWith('upsert')).lastIndexOf(true)
    expect(lastUpsert).toBeGreaterThanOrEqual(0)
    expect(lastUpsert).toBeLessThan(firstSelect)
    // die gerade hochgeladene Einheit bleibt lokal bestehen (wurde vor dem Pull hochgeladen)
    expect(await getAll('session')).toHaveLength(1)
  })

  it('ohne pull-Option wird nicht gepullt (z. B. nach dem Speichern)', async () => {
    await saveLocal('session', strip(session()))
    const { client, log } = remote(empty())
    await syncNow(client)
    expect(log.some((l) => l.startsWith('select'))).toBe(false)
  })

  it('Pull-Fehler erscheinen in der Sync-Anzeige mit Tabelle und Meldung', async () => {
    const { client } = remote(empty(), { failAt: { table: 'workout_set', call: 1 } })
    await syncNow(client, { pull: true })
    const { getSyncStatus } = await import('./sync')
    expect(getSyncStatus().error).toContain('workout_set laden: Netzwerk weg')
  })
})
