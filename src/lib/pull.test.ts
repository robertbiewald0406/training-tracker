import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { deleteLocal, getAll, getDb, resetDbHandle, saveLocal } from './db'
import { AUTH_EXPIRED_MESSAGE, BRAKE_MAX_FRACTION, BRAKE_MIN_ROWS, PAGE, pullAll, reconcileBrake } from './pull'
import { confirmHeldReconcile, getSyncStatus, syncNow } from './sync'

type Tables = Record<'session' | 'workout_set' | 'bodyweight', any[]>

interface Opts {
  cap?: number // Server liefert hoechstens so viele Zeilen pro Abfrage (z. B. Projekt-Limit)
  failAt?: { table: string; call: number } // call = laufende Nummer der Abfrage dieser Tabelle (1-basiert)
  failError?: { message: string; status?: number } // Fehlerobjekt fuer failAt (Standard: Netzwerk)
  // Anmeldung: gueltig (Standard), abgelaufen, keine Sitzung, oder laeuft waehrend des Pulls ab
  auth?: 'valid' | 'expired' | 'none' | 'expires-during'
  refreshWorks?: boolean // erneuern klappt (nur bei 'expired')
}
const future = () => Math.floor(Date.now() / 1000) + 3600
const past = () => Math.floor(Date.now() / 1000) - 3600

/** In-Memory-Supabase: select().order().range() mit Seitenlimit, upsert/delete schreiben in die Tabellen. */
function remote(tables: Tables, opts: Opts = {}) {
  const log: string[] = []
  const counts: Record<string, number> = {}
  let sessionCalls = 0
  const mode = opts.auth ?? 'valid'
  const client = {
    auth: {
      getSession: async () => {
        sessionCalls++
        const expired = mode === 'expired' || (mode === 'expires-during' && sessionCalls > 1)
        if (mode === 'none') return { data: { session: null } }
        return { data: { session: { user: {}, expires_at: expired ? past() : future() } } }
      },
      refreshSession: async () =>
        opts.refreshWorks
          ? { data: { session: { user: {}, expires_at: future() } }, error: null }
          : { data: { session: null }, error: { message: 'Refresh Token Not Found' } },
    },
    from: (table: keyof Tables) => ({
      select: () => ({
        order: () => ({
          range: async (a: number, b: number) => {
            counts[table] = (counts[table] ?? 0) + 1
            log.push(`select:${table}`)
            if (opts.failAt && opts.failAt.table === table && opts.failAt.call === counts[table])
              return { data: null, error: opts.failError ?? { message: 'Netzwerk weg' } }
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

    const r = await pullAll(remote(t).client, { force: true }) // Abgleich-Logik, Bremse separat getestet

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
    const r = await pullAll(remote(empty()).client, { force: true }) // leerer Server loest sonst die Bremse aus
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
    const r = await pullAll(remote(empty()).client, { force: true })

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

    const r = await pullAll(remote(t, { failAt: { table: 'workout_set', call: 2 } }).client, { force: true })

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

// ---------- Anmeldung und Schutzbremse ----------

/** n lokal als synchronisiert markierte Saetze (zu einer Einheit), die auch remote existieren (ausser `missing`). */
async function seed(n: number, missing: number) {
  const t = empty()
  const s = session()
  t.session.push(s)
  await putSynced('session', s)
  for (let i = 0; i < n; i++) {
    const w = set(s.id, { set_no: i })
    await putSynced('workout_set', w)
    if (i >= missing) t.workout_set.push(w)
  }
  return t
}

describe('Anmeldung: kein Abgleich ohne gueltige Sitzung', () => {
  it('abgelaufene Sitzung mit leerer Antwort (RLS) entfernt nichts und meldet die Anmeldung', async () => {
    const s = session()
    await putSynced('session', s)
    for (let i = 0; i < 5; i++) await putSynced('workout_set', set(s.id, { set_no: i }))
    // remote leer, wie bei RLS ohne gueltigen Token: Antwort ohne Fehler
    const r = await pullAll(remote(empty(), { auth: 'expired' }).client)
    expect(r.authExpired).toBe(true)
    expect(r.errors).toEqual([AUTH_EXPIRED_MESSAGE])
    expect(r.removed).toBe(0)
    expect(await getAll('session')).toHaveLength(1)
    expect(await getAll('workout_set')).toHaveLength(5)
  })

  it('fehlende Sitzung: ebenfalls nichts entfernt', async () => {
    const s = session()
    await putSynced('session', s)
    await putSynced('workout_set', set(s.id))
    const r = await pullAll(remote(empty(), { auth: 'none' }).client)
    expect(r.errors).toEqual([AUTH_EXPIRED_MESSAGE])
    expect(await getAll('workout_set')).toHaveLength(1)
  })

  it('401 / JWT-Fehler der Abfrage: nichts entfernt, Meldung "Anmeldung abgelaufen"', async () => {
    const s = session()
    await putSynced('session', s)
    await putSynced('workout_set', set(s.id))
    const c = remote(empty(), { failAt: { table: 'workout_set', call: 1 }, failError: { message: 'JWT expired', status: 401 } })
    const r = await pullAll(c.client)
    expect(r.errors).toEqual([AUTH_EXPIRED_MESSAGE])
    expect(await getAll('workout_set')).toHaveLength(1)
    expect(await getAll('session')).toHaveLength(1)
  })

  it('Sitzung laeuft waehrend des Pulls ab: nichts entfernt', async () => {
    const s = session()
    await putSynced('session', s)
    await putSynced('workout_set', set(s.id))
    const r = await pullAll(remote(empty(), { auth: 'expires-during' }).client)
    expect(r.authExpired).toBe(true)
    expect(await getAll('workout_set')).toHaveLength(1)
  })

  it('Hinzufuegen neuer Zeilen laeuft trotzdem weiter', async () => {
    const t = empty()
    const s = session()
    t.session.push(s)
    t.workout_set.push(set(s.id))
    const r = await pullAll(remote(t, { auth: 'expired' }).client)
    expect(r.errors).toEqual([AUTH_EXPIRED_MESSAGE])
    expect(await getAll('workout_set')).toHaveLength(1) // neu uebernommen
  })

  it('abgelaufen, aber Erneuern klappt: normaler Abgleich', async () => {
    const t = await seed(3, 1) // ein Satz fehlt remote
    const r = await pullAll(remote(t, { auth: 'expired', refreshWorks: true }).client)
    expect(r.errors).toEqual([])
    expect(r.removed).toBe(1)
  })
})

describe('Schutzbremse', () => {
  it('Konstanten: 20 Prozent und mehr als 10 Zeilen', () => {
    expect(BRAKE_MAX_FRACTION).toBe(0.2)
    expect(BRAKE_MIN_ROWS).toBe(10)
  })
  it('reconcileBrake: Grenzfaelle', () => {
    expect(reconcileBrake(100, 5, 95)).toBeNull()
    expect(reconcileBrake(100, 15, 85)).toBeNull() // >10, aber nur 15 Prozent
    expect(reconcileBrake(100, 30, 70)).toBe('mass')
    expect(reconcileBrake(20, 10, 10)).toBeNull() // 50 Prozent, aber nicht MEHR als 10 Zeilen
    expect(reconcileBrake(21, 11, 10)).toBe('mass')
    expect(reconcileBrake(5, 5, 0)).toBe('zero')
    expect(reconcileBrake(0, 0, 0)).toBeNull() // leeres Geraet, leerer Server
  })

  it('leere Antwort bei vorhandenen lokalen Zeilen loest die Bremse aus: nichts entfernt', async () => {
    const s = session()
    await putSynced('session', s)
    for (let i = 0; i < 3; i++) await putSynced('workout_set', set(s.id, { set_no: i }))
    const r = await pullAll(remote(empty()).client)
    expect(r.authExpired).toBe(false)
    expect(r.removed).toBe(0)
    expect(r.held?.total).toBe(4) // 1 Einheit + 3 Saetze
    expect(r.held?.text).toMatch(/nichts wurde gelöscht/)
    expect(await getAll('session')).toHaveLength(1)
    expect(await getAll('workout_set')).toHaveLength(3)
  })

  it('zu viele Loeschungen (30 von 100) loesen die Bremse aus', async () => {
    const t = await seed(100, 30)
    const r = await pullAll(remote(t).client)
    expect(r.removed).toBe(0)
    expect(r.held).not.toBeNull()
    expect(r.held?.text).toContain('30 von 100')
    expect(await getAll('workout_set')).toHaveLength(100)
  })

  it('normaler Abgleich mit wenigen geloeschten Zeilen laeuft ohne Rueckfrage', async () => {
    const t = await seed(100, 5)
    const r = await pullAll(remote(t).client)
    expect(r.held).toBeNull()
    expect(r.removed).toBe(5)
    expect(await getAll('workout_set')).toHaveLength(95)
  })

  it('15 von 100 (mehr als 10, aber nur 15 Prozent) laeuft ohne Rueckfrage', async () => {
    const t = await seed(100, 15)
    const r = await pullAll(remote(t).client)
    expect(r.held).toBeNull()
    expect(r.removed).toBe(15)
  })

  it('Bestaetigung im Dialog entfernt tatsaechlich; Abbruch im Dialog entfernt nichts', async () => {
    const t = await seed(100, 30)
    const { client } = remote(t)
    await syncNow(client, { pull: true })
    expect(getSyncStatus().held?.total).toBe(30)
    expect(await getAll('workout_set')).toHaveLength(100)

    let asked = ''
    expect(await confirmHeldReconcile(client, (m) => ((asked = m), false))).toBe(false)
    expect(asked).toContain('30') // Rueckfrage nennt die Anzahl
    expect(await getAll('workout_set')).toHaveLength(100)

    expect(await confirmHeldReconcile(client, () => true)).toBe(true)
    expect(await getAll('workout_set')).toHaveLength(70)
    expect(getSyncStatus().held).toBeNull()
  })

  it('"Trotzdem abgleichen" umgeht die Anmeldepruefung nicht und entfernt nie pending', async () => {
    const t = await seed(100, 30)
    const pend = set((await getAll('session'))[0].id, { set_no: 500 })
    await saveLocal('workout_set', strip(pend)) // pending
    const expired = remote(t, { auth: 'expired' }).client
    const r = await pullAll(expired, { force: true })
    expect(r.errors).toEqual([AUTH_EXPIRED_MESSAGE])
    expect(await getAll('workout_set')).toHaveLength(101)
    await pullAll(remote(t).client, { force: true })
    const left = await getAll('workout_set')
    expect(left).toHaveLength(71) // 70 synchronisierte + 1 pending
    expect(left.some((x) => x.id === pend.id)).toBe(true)
  })
})
