import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import m002 from '../../supabase/migrations/002_session_adjustment_plan_override.sql?raw'
import m003 from '../../supabase/migrations/003_push_weekly_report.sql?raw'
import m004 from '../../supabase/migrations/004_push_weekly_cron.sql?raw'
import schema from '../../supabase/schema.sql?raw'
import { plan } from './plan'
import { addDays, berlinMidnight, buildWeekReport } from './report'

// Fuehrt die echten Migrationen in einer Postgres-Engine (PGlite) aus und vergleicht weekly_report() mit src/lib/report.ts.

const USER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  // Minimaler Ersatz fuer die Supabase-Umgebung: Rollen, auth.users, auth.uid().
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    insert into auth.users values ('${USER}'), ('${OTHER}');
  `)
  await db.exec(schema)
  await db.exec(m002)
  await db.exec(m003)
  await db.exec(m003) // mehrfach ausfuehrbar
  // Supabase gibt service_role standardmaessig alle Rechte auf Tabellen in public (und umgeht RLS).
  await db.exec('grant all on all tables in schema public to service_role')
}, 60_000)

let n = 0
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const at = (day: string, h = 10) => new Date(berlinMidnight(day).getTime() + h * 3_600_000).toISOString()

interface Data {
  sessions: any[]
  sets: any[]
  adjustments: any[]
  bodyweight: any[]
}
const empty = (): Data => ({ sessions: [], sets: [], adjustments: [], bodyweight: [] })
const sess = (d: Data, day: string, day_key = 'mo_brust', h = 10) => {
  const s = { id: uuid(), day_key, started_at: at(day, h), ended_at: null, note: null }
  d.sessions.push(s)
  return s
}
const set = (d: Data, s: any, over: Record<string, unknown> = {}) =>
  d.sets.push({
    id: uuid(), session_id: s.id, exercise_key: 'hs_incline_press', set_no: 1, weight_kg: 60, reps: 8, rir: null,
    is_warmup: false, side: 'both', logged_at: s.started_at, note: null, ...over,
  })

async function load(d: Data, user = USER) {
  for (const s of d.sessions)
    await db.query('insert into session (id, user_id, day_key, started_at, ended_at, note) values ($1,$2,$3,$4,$5,$6)', [s.id, user, s.day_key, s.started_at, s.ended_at, s.note])
  for (const w of d.sets)
    await db.query(
      'insert into workout_set (id, user_id, session_id, exercise_key, set_no, weight_kg, reps, rir, is_warmup, side, logged_at, note) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [w.id, user, w.session_id, w.exercise_key, w.set_no, w.weight_kg, w.reps, w.rir, w.is_warmup, w.side, w.logged_at, w.note],
    )
  for (const a of d.adjustments)
    await db.query(
      'insert into session_adjustment (id, user_id, session_id, typ, original_key, neuer_key, position, grund, note, dauerhaft, logged_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [a.id, user, a.session_id, a.typ, a.original_key, a.neuer_key, a.position, a.grund, a.note, a.dauerhaft, a.logged_at],
    )
  for (const b of d.bodyweight) await db.query('insert into bodyweight (id, user_id, measured_on, weight_kg) values ($1,$2,$3,$4)', [b.id, user, b.measured_on, b.weight_kg])
}
async function clear() {
  await db.exec('delete from session_adjustment; delete from workout_set; delete from session; delete from bodyweight;')
}
const sql = async (user: string, week: string | null) =>
  (await db.query<{ r: any }>('select weekly_report($1, $2) as r', [user, week])).rows[0].r

const W0 = '2026-10-19'
const js = (d: Data, week = W0) =>
  buildWeekReport({ plan, sessions: d.sessions, sets: d.sets, adjustments: d.adjustments, bodyweight: d.bodyweight, weekStart: berlinMidnight(week) })

/** Gleiche Zahlen wie die App-Auswertung? */
function expectSame(r: any, j: ReturnType<typeof js>) {
  expect(r.training_days).toBe(j.trainingDays.count)
  expect(r.sessions).toBe(j.trainingDays.sessions)
  expect(r.better).toBe(j.progress.better.length)
  expect(r.stable).toBe(j.progress.stable.length)
  expect(r.below).toBe(j.progress.below.length)
  expect(r.fresh).toBe(j.progress.fresh.length)
  expect(r.records).toBe(j.records.length)
  expect(r.skipped).toBe(j.adjustments.filter((a) => a.typ === 'auslassen').length)
  expect(r.swapped).toBe(j.adjustments.filter((a) => a.typ === 'tauschen').length)
  if (j.bodyweight.avg === null) expect(r.bodyweight_avg).toBeNull()
  else expect(Number(r.bodyweight_avg)).toBeCloseTo(j.bodyweight.avg, 6)
  if (j.bodyweight.prevAvg === null) expect(r.bodyweight_prev_avg).toBeNull()
  else expect(Number(r.bodyweight_prev_avg)).toBeCloseTo(j.bodyweight.prevAvg, 6)
}

describe('Migration 003 und weekly_report()', () => {
  it('Beispielwoche: gleiche Zahlen wie report.ts', async () => {
    await clear()
    const d = empty()
    for (let w = 6; w >= 0; w--) {
      const mon = addDays(W0, -7 * w)
      const g = w === 0 ? 6 : 0
      const a = sess(d, mon)
      set(d, a, { weight_kg: 60 + g }) // besser in Woche 0
      set(d, a, { exercise_key: 'mts_chest_press', weight_kg: 50 })
      set(d, a, { exercise_key: 'pushdown_vgrip', weight_kg: w === 0 ? 20 : 30 }) // darunter
      set(d, a, { exercise_key: 'fly_machine', weight_kg: 30, is_warmup: true }) // Aufwaermen zaehlt nicht
      set(d, a, { exercise_key: 'cable_curl_bar', weight_kg: 25, reps: 12 }) // ueber 10 Wdh. zaehlt nicht
      const b = sess(d, addDays(mon, 2), 'mi_beine_a')
      set(d, b, { exercise_key: 'hack_squat', weight_kg: 100 + (w === 0 ? 1 : 0) })
      if (w <= 1) set(d, b, { exercise_key: 'leg_extension', weight_kg: 40 }) // nur 2 Wochen Historie -> "fresh" bzw. Vergleich
    }
    // Sonntag 23:30 Berlin gehoert zur Woche, Montag 0:30 nicht
    const sun = { id: uuid(), day_key: 'fr_arme', started_at: new Date(berlinMidnight('2026-10-26').getTime() - 30 * 60_000).toISOString(), ended_at: null, note: null }
    const mon = { id: uuid(), day_key: 'mo_brust', started_at: new Date(berlinMidnight('2026-10-26').getTime() + 30 * 60_000).toISOString(), ended_at: null, note: null }
    d.sessions.push(sun, mon)
    set(d, sun, { exercise_key: 'incline_db_curl', weight_kg: 14 })
    set(d, mon, { exercise_key: 'mts_chest_press', weight_kg: 99 })
    d.adjustments.push(
      { id: uuid(), session_id: d.sessions.find((s) => s.started_at === at(W0))!.id, typ: 'auslassen', original_key: 'fly_machine', neuer_key: null, position: null, grund: 'zeit', note: null, dauerhaft: false, logged_at: '2026-10-19T09:00:00Z' },
      { id: uuid(), session_id: d.sessions.find((s) => s.started_at === at(W0))!.id, typ: 'tauschen', original_key: 'fly_machine', neuer_key: 'cable_fly_low_to_high', position: null, grund: 'schmerz', note: null, dauerhaft: false, logged_at: '2026-10-19T10:00:00Z' },
      { id: uuid(), session_id: d.sessions.find((s) => s.started_at === at(W0))!.id, typ: 'reihenfolge', original_key: 'fly_machine', neuer_key: null, position: 1, grund: 'schmerz', note: null, dauerhaft: false, logged_at: '2026-10-19T11:00:00Z' },
      { id: uuid(), session_id: d.sessions.find((s) => s.started_at === at(addDays(W0, -7)))!.id, typ: 'auslassen', original_key: 'fly_machine', neuer_key: null, position: null, grund: 'zeit', note: null, dauerhaft: false, logged_at: '2026-10-12T09:00:00Z' },
    )
    d.bodyweight.push(
      { id: uuid(), measured_on: '2026-10-14', weight_kg: 83 },
      { id: uuid(), measured_on: '2026-10-18', weight_kg: 99 },
      { id: uuid(), measured_on: '2026-10-21', weight_kg: 82.4 },
      { id: uuid(), measured_on: '2026-10-25', weight_kg: 82 },
    )
    await load(d)
    const r = await sql(USER, W0)
    const j = js(d)
    expectSame(r, j)
    expect(r.better).toBeGreaterThan(0)
    expect(r.below).toBe(1)
    expect(r.records).toBeGreaterThan(0)
    expect(r.top_reason).toBe('zeit')
    expect(r.week_start).toBe(W0)
    expect(r.week_end).toBe('2026-10-25')
  }, 60_000)

  it('Schwellen: 3 % ueber Schnitt = besser, knapp darunter = stabil; Vergleich braucht 2 Vorwochen', async () => {
    await clear()
    for (const [factor, expected] of [[1.0301, 'better'], [1.0299, 'stable'], [0.9699, 'below'], [0.9701, 'stable']] as const) {
      await clear()
      const d = empty()
      for (const w of [1, 2, 3, 4]) set(d, sess(d, addDays(W0, -7 * w)), { weight_kg: 60 })
      set(d, sess(d, W0), { weight_kg: 60 * factor })
      await load(d)
      const r = await sql(USER, W0)
      expect(r[expected === 'better' ? 'better' : expected === 'below' ? 'below' : 'stable'], String(factor)).toBe(1)
      expectSame(r, js(d))
    }
    await clear()
    const d = empty()
    set(d, sess(d, addDays(W0, -21)), { weight_kg: 60 })
    set(d, sess(d, W0), { weight_kg: 80 })
    await load(d)
    const r = await sql(USER, W0)
    expect([r.fresh, r.better]).toEqual([1, 0])
    expectSame(r, js(d))
  }, 60_000)

  it('Rekord braucht einen frueheren Wert; Wochen ueber 4 Wochen zurueck zaehlen fuer den Rekord, nicht fuer den Schnitt', async () => {
    await clear()
    const d = empty()
    set(d, sess(d, addDays(W0, -63)), { weight_kg: 70 }) // alt, hoeher
    set(d, sess(d, W0), { weight_kg: 62 })
    await load(d)
    const r = await sql(USER, W0)
    expect([r.records, r.fresh]).toEqual([0, 1])
    expectSame(r, js(d))
  }, 60_000)

  it('ohne Daten: Nullen und leere Werte; ohne Datum die aktuelle Berliner Woche', async () => {
    await clear()
    const r = await sql(USER, '2026-10-21') // Mittwoch -> Montag der Woche
    expect(r).toMatchObject({ week_start: W0, training_days: 0, sessions: 0, better: 0, stable: 0, below: 0, fresh: 0, records: 0, skipped: 0, swapped: 0, top_reason: null, bodyweight_avg: null })
    const cur = await sql(USER, null)
    expect(new Date(`${cur.week_start}T00:00:00Z`).getUTCDay()).toBe(1)
  })

  it('beachtet nur den angefragten Nutzer', async () => {
    await clear()
    const d = empty()
    set(d, sess(d, W0), { weight_kg: 60 })
    await load(d, OTHER)
    expect((await sql(USER, W0)).training_days).toBe(0)
    expect((await sql(OTHER, W0)).training_days).toBe(1)
  })

  it('Rechte: weekly_report nur fuer service_role, push_subscription nur fuer authenticated, RLS an', async () => {
    const exec = async (role: string, query: string) => {
      await db.exec(`set role ${role}`)
      try {
        await db.query(query)
        return 'ok'
      } catch (e) {
        return (e as Error).message
      } finally {
        await db.exec('reset role')
      }
    }
    for (const role of ['anon', 'authenticated']) expect(await exec(role, `select weekly_report('${USER}')`), role).toMatch(/permission denied/)
    expect(await exec('service_role', `select weekly_report('${USER}')`)).toBe('ok')
    expect(await exec('anon', 'select * from push_subscription')).toMatch(/permission denied/)
    const rls = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname = 'push_subscription'")
    expect(rls.rows[0].relrowsecurity).toBe(true)
  })

  it('RLS: ein Nutzer sieht und aendert nur eigene Abos', async () => {
    await db.exec('delete from push_subscription')
    await db.exec(`insert into push_subscription (user_id, endpoint, p256dh, auth) values ('${USER}', 'https://push.example/a', 'k1', 'a1'), ('${OTHER}', 'https://push.example/b', 'k2', 'a2')`)
    await db.exec(`grant select, insert, update, delete on push_subscription to authenticated`)
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${USER}', false)`)
    try {
      const own = await db.query<{ endpoint: string }>('select endpoint from push_subscription')
      expect(own.rows.map((r) => r.endpoint)).toEqual(['https://push.example/a'])
      await db.exec(`delete from push_subscription where endpoint = 'https://push.example/b'`)
      await expect(db.exec(`insert into push_subscription (user_id, endpoint, p256dh, auth) values ('${OTHER}', 'https://push.example/c', 'k', 'a')`)).rejects.toThrow(/row-level security/)
      // user_id wird per auth.uid() gesetzt
      await db.exec(`insert into push_subscription (endpoint, p256dh, auth) values ('https://push.example/d', 'k', 'a')`)
    } finally {
      await db.exec('reset role')
    }
    const all = await db.query<{ endpoint: string; user_id: string }>('select endpoint, user_id from push_subscription order by endpoint')
    expect(all.rows).toEqual([
      { endpoint: 'https://push.example/a', user_id: USER },
      { endpoint: 'https://push.example/b', user_id: OTHER },
      { endpoint: 'https://push.example/d', user_id: USER },
    ])
  })
})

describe('Migration 004 (Cron)', () => {
  const code = m004.replace(/--.*$/gm, '')
  it('Zeitplan: Sonntag 16 und 17 Uhr UTC, gesendet wird nur bei Berlin Sonntag 18 Uhr', () => {
    expect(code).toMatch(/cron\.schedule\('weekly-report-push', '0 16,17 \* \* 0'/)
    expect(code).toMatch(/extract\(dow from v_local\) <> 0 or extract\(hour from v_local\) <> 18/)
    expect(code).toMatch(/now\(\) at time zone 'Europe\/Berlin'/)
  })
  it('keine Geheimnisse in der Datei, Zugangsdaten aus dem Vault, Funktion nicht fuer anon/authenticated', () => {
    expect(code).toMatch(/vault\.decrypted_secrets where name = 'weekly_push_url'/)
    expect(code).toMatch(/vault\.decrypted_secrets where name = 'weekly_push_secret'/)
    expect(code).not.toMatch(/https?:\/\//)
    expect(code).not.toMatch(/eyJ|sb_secret|service_role/)
    expect(code).toMatch(/revoke all on function send_weekly_report_push\(\) from public, anon, authenticated/)
    expect(code).toMatch(/security definer/)
    expect(code).toMatch(/set search_path = ''/)
  })
})
