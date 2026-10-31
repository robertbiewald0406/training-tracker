import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import migrationSql from '../../supabase/migrations/002_session_adjustment_plan_override.sql?raw'
import {
  applyAdjustments,
  buildAdjustment,
  buildOverride,
  describeOverride,
  effectiveDay,
  effectiveSessionDay,
  moveTarget,
  remapPosition,
  swapChoices,
  withFullAssign,
  type Adjust,
} from './adjust'
import { parseBackup } from './backup'
import { applyRemote, deleteLocal, exportAll, getAll, removeMissingSessions, resetDbHandle, saveLocal } from './db'
import { derivePosition, type Position } from './logger'
import { plan } from './plan'
import { weekAdjustments } from './stats'
import { syncNow } from './sync'
import type { PlanOverrideRow, SessionAdjustmentRow } from './types'

const mo = plan.days.find((d) => d.key === 'mo_brust')!
const keys = (items: { exercise_key: string }[]) => items.map((i) => i.exercise_key)
const adj = (typ: Adjust['typ'], original_key: string, extra: Partial<Adjust> = {}): Adjust => ({
  typ,
  original_key,
  neuer_key: null,
  position: null,
  ...extra,
})
const A = keys(mo.items) // hs_incline_press, mts_chest_press, cable_fly_low_to_high, fly_machine, pushdown_vgrip

describe('Anpassungen anwenden', () => {
  it('Auslassen entfernt die Uebung, der Rest bleibt in Reihenfolge', () => {
    expect(keys(applyAdjustments(mo.items, [adj('auslassen', A[1])], plan))).toEqual([A[0], ...A.slice(2)])
  })
  it('Tauschen ersetzt die Uebung an gleicher Stelle und behaelt Saetze, Wdh. und Pause', () => {
    const out = applyAdjustments(mo.items, [adj('tauschen', A[0], { neuer_key: 'lf_shoulder_press' })], plan)
    expect(out[0]).toEqual({ ...mo.items[0], exercise_key: 'lf_shoulder_press' })
    expect(out).toHaveLength(mo.items.length)
  })
  it('Tauschen ignoriert stillgelegte, unbekannte und schon vorhandene Uebungen', () => {
    for (const neuer of ['hs_chest_press', 'gibt_es_nicht', A[1]])
      expect(keys(applyAdjustments(mo.items, [adj('tauschen', A[0], { neuer_key: neuer })], plan))).toEqual(A)
  })
  it('Reihenfolge verschiebt auf die Zielposition', () => {
    expect(keys(applyAdjustments(mo.items, [adj('reihenfolge', A[0], { position: 2 })], plan))).toEqual([A[1], A[2], A[0], A[3], A[4]])
    expect(keys(applyAdjustments(mo.items, [adj('reihenfolge', A[4], { position: 0 })], plan))[0]).toBe(A[4])
  })
  it('Anpassungen an fehlenden Uebungen werden ignoriert', () => {
    expect(keys(applyAdjustments(mo.items, [adj('auslassen', 'hack_squat')], plan))).toEqual(A)
  })
  it('moveTarget: nach oben/unten, null am Rand', () => {
    expect(moveTarget(mo.items, A[0], 'up')).toBeNull()
    expect(moveTarget(mo.items, A[0], 'down')).toBe(1)
    expect(moveTarget(mo.items, A[4], 'down')).toBeNull()
    expect(moveTarget(mo.items, A[4], 'up')).toBe(3)
  })
  it('swapChoices: Alternativen zuerst, dann Katalog, ohne stillgelegte und ohne Uebungen im Tag', () => {
    const { alternatives, others } = swapChoices(plan, mo.items, A[0])
    expect(alternatives).toEqual(plan.exercises[A[0]].alternatives.filter((k) => !plan.exercises[k].retired && !A.includes(k)))
    for (const k of [...alternatives, ...others]) {
      expect(plan.exercises[k].retired, k).toBeFalsy()
      expect(A, k).not.toContain(k)
    }
    expect(others).not.toContain('hs_chest_press')
    expect(others.some((k) => !alternatives.includes(k))).toBe(true)
  })
})

describe('Nur heute gegen dauerhaft', () => {
  const sid = 's1'
  const row = (o: Partial<SessionAdjustmentRow>): SessionAdjustmentRow =>
    buildAdjustment({ sessionId: sid, typ: 'auslassen', original_key: A[0], dauerhaft: false, ...o } as any)
  const override = (o: Partial<PlanOverrideRow> = {}): PlanOverrideRow => ({
    ...buildOverride({ dayKey: 'mo_brust', typ: 'auslassen', exercise_key: A[1] }),
    ...o,
  })
  const session = { id: sid, day_key: 'mo_brust' }

  it('nur heute wirkt nur in dieser Einheit, plan.json und andere Einheiten bleiben unveraendert', () => {
    const a = row({ original_key: A[0] })
    expect(keys(effectiveSessionDay(session, plan, [], [a])!.items)).toEqual(A.slice(1))
    expect(keys(effectiveSessionDay({ id: 'andere', day_key: 'mo_brust' }, plan, [], [a])!.items)).toEqual(A)
    expect(keys(effectiveDay(mo, null, plan, []).items)).toEqual(A)
    expect(keys(mo.items)).toEqual(A) // Plan selbst unveraendert
  })
  it('dauerhaft wirkt in jeder Einheit des Tages, ueber plan.json gelegt', () => {
    const o = override()
    expect(keys(effectiveSessionDay(session, plan, [o], [])!.items)).toEqual(A.filter((k) => k !== A[1]))
    expect(keys(effectiveSessionDay({ id: 'x', day_key: 'mo_brust' }, plan, [o], [])!.items)).toEqual(A.filter((k) => k !== A[1]))
    expect(keys(effectiveDay(plan.days.find((d) => d.key === 'di_ruecken')!, null, plan, [o]).items)).toEqual(
      keys(plan.days.find((d) => d.key === 'di_ruecken')!.items),
    )
  })
  it('eine dauerhafte Anpassung der Einheit wird nicht doppelt angewendet (Verschieben)', () => {
    const o = override({ typ: 'reihenfolge', exercise_key: A[0], position: 1 })
    const a = row({ typ: 'reihenfolge', original_key: A[0], position: 1, dauerhaft: true })
    expect(keys(effectiveSessionDay(session, plan, [o], [a])!.items)).toEqual([A[1], A[0], ...A.slice(2)])
  })
  it('Zuruecksetzen: ohne Override gilt wieder der Plan', () => {
    const o = override()
    expect(keys(effectiveDay(mo, null, plan, [o]).items)).not.toEqual(A)
    expect(keys(effectiveDay(mo, null, plan, []).items)).toEqual(A)
  })
  it('Overrides werden in der Reihenfolge ihrer Erstellung angewendet', () => {
    const t1 = override({ typ: 'tauschen', exercise_key: A[0], neuer_key: 'lf_shoulder_press', created_at: '2026-10-01T10:00:00.000Z' })
    const t2 = override({ typ: 'auslassen', exercise_key: 'lf_shoulder_press', created_at: '2026-10-02T10:00:00.000Z' })
    expect(keys(effectiveDay(mo, null, plan, [t2, t1]).items)).toEqual(A.slice(1))
  })
  it('Beintag: Positionen beziehen sich auf die Liste der Variante', () => {
    const legs = plan.days.find((d) => d.key === 'mi_beine')!
    const o = override({ day_key: 'mi_beine', typ: 'auslassen', exercise_key: 'adductor_machine' })
    for (const v of ['A', 'B']) {
      const k = keys(effectiveDay(legs, v, plan, [o]).items)
      expect(k).not.toContain('adductor_machine')
      expect(k).toContain('abductor_machine')
    }
  })
  it('Beschreibung fuer die Einstellungen', () => {
    expect(describeOverride(override(), plan)).toEqual({ day: mo.name, text: `${plan.exercises[A[1]].name} ausgelassen` })
  })
})

describe('Eintraege bauen', () => {
  it('Kommentar wird getrimmt und auf 200 Zeichen gekuerzt, leer = null', () => {
    const b = (note: string) => buildAdjustment({ sessionId: 's', typ: 'auslassen', original_key: A[0], dauerhaft: false, note })
    expect(b('  ').note).toBeNull()
    expect(b(' Schulter zwickt ').note).toBe('Schulter zwickt')
    expect(b('x'.repeat(300)).note).toHaveLength(200)
  })
  it('neuer_key nur bei Tauschen, position nur bei Reihenfolge', () => {
    const r = buildAdjustment({ sessionId: 's', typ: 'auslassen', original_key: A[0], neuer_key: 'x', position: 3, dauerhaft: false })
    expect(r).toMatchObject({ neuer_key: null, position: null, grund: null, dauerhaft: false })
    expect(buildAdjustment({ sessionId: 's', typ: 'tauschen', original_key: A[0], neuer_key: 'x', dauerhaft: true })).toMatchObject({ neuer_key: 'x', dauerhaft: true })
  })
})

describe('Laufende Einheit nach Anpassung', () => {
  const sess = 'sess'
  const set = (key: string, no: number, t: number) => ({
    id: `${key}-${no}`, session_id: sess, exercise_key: key, set_no: no, weight_kg: 40, reps: 8, rir: null,
    is_warmup: false, side: 'both' as const, logged_at: new Date(Date.UTC(2026, 9, 5, 10, t)).toISOString(), note: null,
  })

  it('Reihenfolge: aktuelle Uebung wird mitgenommen, Zuordnung und Wahl folgen den Uebungen', () => {
    const pos: Position = { itemIdx: 1, chosen: { 0: A[0], 1: A[1] }, assign: { 'a-1': 0, 'b-1': 1 } }
    const next = applyAdjustments(mo.items, [adj('reihenfolge', A[1], { position: 0 })], plan)
    const r = remapPosition(pos, mo.items, next)
    expect(r.itemIdx).toBe(0)
    expect(r.assign).toEqual({ 'a-1': 1, 'b-1': 0 })
    expect(r.chosen).toEqual({ 1: A[0], 0: A[1] })
  })
  it('Auslassen: naechste Uebung rueckt nach, Saetze der ausgelassenen gehoeren zu keiner Position', () => {
    const pos: Position = { itemIdx: 1, chosen: { 1: A[1] }, assign: { 'b-1': 1 } }
    const next = applyAdjustments(mo.items, [adj('auslassen', A[1])], plan)
    const r = remapPosition(pos, mo.items, next)
    expect(r.itemIdx).toBe(1)
    expect(keys([next[1]])).toEqual([A[2]])
    expect(r.assign['b-1']).toBe(-1)
    expect(r.chosen).toEqual({})
  })
  it('Auslassen der letzten Uebung fuehrt zum Abschluss', () => {
    const last = mo.items.length - 1
    const next = applyAdjustments(mo.items, [adj('auslassen', A[last])], plan)
    expect(remapPosition({ itemIdx: last, chosen: {}, assign: {} }, mo.items, next).itemIdx).toBe(next.length)
  })
  it('Tauschen: bisherige Saetze zaehlen nicht zum Fortschritt (auch bei Tausch gegen eine Alternative), Statistik behaelt sie', () => {
    // Tausch gegen eine Uebung, die den Key der alten als Alternative fuehrt: ohne ausdrueckliche Zuordnung wuerde die Heuristik die alten Saetze zaehlen.
    const sym = {
      ...plan,
      exercises: {
        ...plan.exercises,
        [A[0]]: { ...plan.exercises[A[0]], alternatives: ['lf_shoulder_press'] },
        lf_shoulder_press: { ...plan.exercises.lf_shoulder_press, alternatives: [A[0]] },
      },
    }
    const sets = [set(A[0], 1, 0), set(A[0], 2, 5)]
    const pos = derivePosition(mo, sets, sess, false, sym)
    const next = applyAdjustments(mo.items, [adj('tauschen', A[0], { neuer_key: 'lf_shoulder_press' })], sym)
    const r = remapPosition(withFullAssign(pos, mo, sym, sets, sess), mo.items, next, 'lf_shoulder_press')
    expect(r.itemIdx).toBe(0)
    expect(Object.values(r.assign)).toEqual([-1, -1])
    const again = derivePosition({ ...mo, items: next }, sets, sess, false, sym, r.assign)
    expect(again.itemIdx).toBe(0) // neue Uebung ist noch nicht begonnen
    expect(sets).toHaveLength(2) // Saetze bleiben gespeichert
  })
  it('Wiederaufnahme nach Neustart: gleiche Position aus gespeicherter Zuordnung', () => {
    const sets = [set(A[0], 1, 0), set(A[1], 1, 5)]
    const pos = derivePosition(mo, sets, sess, false, plan)
    const next = applyAdjustments(mo.items, [adj('reihenfolge', A[1], { position: 0 })], plan)
    const r = remapPosition(pos, mo.items, next)
    const resumed = derivePosition({ ...mo, items: next }, sets, sess, false, plan, r.assign)
    expect(resumed.assign).toEqual(r.assign)
  })
})

describe('Kalender: Wochenmarkierung', () => {
  const now = new Date(2026, 9, 7, 12) // Mittwoch 7.10.2026
  const sessions = [
    { id: 'mo', day_key: 'mo_brust', started_at: new Date(2026, 9, 5, 18).toISOString() },
    { id: 'mi', day_key: 'mi_beine_b', started_at: new Date(2026, 9, 7, 9).toISOString() },
    { id: 'alt', day_key: 'mo_brust', started_at: new Date(2026, 9, 1, 18).toISOString() },
  ]
  const a = (session_id: string, typ: Adjust['typ']) =>
    buildAdjustment({ sessionId: session_id, typ, original_key: A[0], neuer_key: typ === 'tauschen' ? 'lf_shoulder_press' : null, position: typ === 'reihenfolge' ? 1 : null, dauerhaft: false })
  it('zaehlt Auslassen und Tausch je Plan-Tag der Woche, Verschieben und Vorwoche nicht', () => {
    const rows = [a('mo', 'auslassen'), a('mo', 'tauschen'), a('mo', 'reihenfolge'), a('mi', 'auslassen'), a('alt', 'auslassen')]
    expect(weekAdjustments(rows, sessions, plan, now)).toEqual({
      mo_brust: { skipped: 1, swapped: 1 },
      mi_beine: { skipped: 1, swapped: 0 },
    })
    expect(weekAdjustments(rows, sessions, plan, now, 1)).toEqual({ mo_brust: { skipped: 1, swapped: 0 } })
  })
})

beforeEach(async () => {
  await resetDbHandle()
  globalThis.indexedDB = new IDBFactory()
})

const session = (id = crypto.randomUUID()) => ({ id, day_key: 'mo_brust', started_at: '2026-10-05T10:00:00.000Z', ended_at: null, note: null })

function mockClient() {
  const calls: { table: string; rows: any[]; opts: any }[] = []
  const deletes: { table: string; ids: string[] }[] = []
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: {} } } }) },
    from: (table: string) => ({
      upsert: async (rows: any[], o: any) => (calls.push({ table, rows, opts: o }), { error: null }),
      delete: () => ({ in: async (_c: string, ids: string[]) => (deletes.push({ table, ids }), { error: null }) }),
    }),
  }
  return { client: client as any, calls, deletes }
}

describe('Sync der Anpassungen', () => {
  it('Reihenfolge: session, session_adjustment, workout_set, ..., plan_override; ohne user_id und Metadaten', async () => {
    const s = session()
    const row = buildAdjustment({ sessionId: s.id, typ: 'auslassen', original_key: A[0], grund: 'zeit', dauerhaft: true })
    const ov = buildOverride({ dayKey: 'mo_brust', typ: 'auslassen', exercise_key: A[0] })
    await saveLocal('plan_override', ov)
    await saveLocal('session_adjustment', row)
    await saveLocal('session', s)
    const { client, calls } = mockClient()
    await syncNow(client)
    expect(calls.map((c) => c.table)).toEqual(['session', 'session_adjustment', 'plan_override'])
    for (const c of calls.slice(1)) {
      expect(c.opts).toEqual({ onConflict: 'id' })
      expect(Object.keys(c.rows[0]).filter((k) => k.startsWith('_') || k === 'user_id')).toEqual([])
    }
    expect((await getAll('session_adjustment'))[0]._sync).toBe('synced')
    expect((await getAll('plan_override'))[0]._sync).toBe('synced')
  })
  it('Zuruecksetzen: Tombstone bleibt pending, wird erst nach bestaetigtem DELETE entfernt', async () => {
    const ov = buildOverride({ dayKey: 'mo_brust', typ: 'auslassen', exercise_key: A[0] })
    await saveLocal('plan_override', ov)
    const { client } = mockClient()
    await syncNow(client)
    await deleteLocal('plan_override', ov.id)
    expect(await getAll('plan_override')).toEqual([]) // ausgeblendet
    const db = await (await import('./db')).getDb()
    expect(await db.get('plan_override', ov.id)).toMatchObject({ _deleted: true, _sync: 'pending' })
    const m = mockClient()
    await syncNow(m.client)
    expect(m.deletes).toEqual([{ table: 'plan_override', ids: [ov.id] }])
    expect(await db.get('plan_override', ov.id)).toBeUndefined()
  })
  it('Pull legt Zeilen als synced an, ueberschreibt aber nie pending', async () => {
    const ov = buildOverride({ dayKey: 'mo_brust', typ: 'auslassen', exercise_key: A[0] })
    await saveLocal('plan_override', ov)
    const r = await applyRemote('plan_override', [{ ...ov, exercise_key: A[1], user_id: 'u' } as any])
    expect(r).toEqual({ applied: 0, skipped: 1 })
    expect((await getAll('plan_override'))[0].exercise_key).toBe(A[0])
  })
})

describe('Abgleich mit Anpassungen', () => {
  it('fehlende Einheit nimmt ihre synchronisierten Anpassungen mit, pending Anpassungen halten sie als Konflikt', async () => {
    const s1 = session()
    const s2 = session()
    await saveLocal('session', s1)
    await saveLocal('session', s2)
    await saveLocal('session_adjustment', buildAdjustment({ sessionId: s1.id, typ: 'auslassen', original_key: A[0], dauerhaft: false }))
    await saveLocal('session_adjustment', buildAdjustment({ sessionId: s2.id, typ: 'auslassen', original_key: A[0], dauerhaft: false }))
    const { client } = mockClient()
    await syncNow(client) // alles synced
    await saveLocal('session_adjustment', buildAdjustment({ sessionId: s2.id, typ: 'auslassen', original_key: A[1], dauerhaft: false })) // pending
    const r = await removeMissingSessions(new Set())
    expect(r.removed).toEqual([s1.id])
    expect(r.conflicts.map((c) => c.id)).toEqual([s2.id])
    expect((await getAll('session_adjustment')).map((a) => a.session_id)).toEqual([s2.id, s2.id])
  })
})

describe('Backup mit Anpassungen', () => {
  it('Export enthaelt beide Tabellen ohne Tombstones und Metadaten; Import-Pruefung nimmt sie an', async () => {
    const s = session()
    await saveLocal('session', s)
    const a = buildAdjustment({ sessionId: s.id, typ: 'tauschen', original_key: A[0], neuer_key: 'lf_shoulder_press', grund: 'geraet_belegt', note: 'Maschine besetzt', dauerhaft: false })
    const gone = buildAdjustment({ sessionId: s.id, typ: 'auslassen', original_key: A[1], dauerhaft: false })
    const ov = buildOverride({ dayKey: 'mo_brust', typ: 'reihenfolge', exercise_key: A[2], position: 0 })
    for (const x of [a, gone]) await saveLocal('session_adjustment', x)
    await saveLocal('plan_override', ov)
    await deleteLocal('session_adjustment', gone.id)
    const out = await exportAll()
    expect(out.session_adjustment).toEqual([a])
    expect(out.plan_override).toEqual([ov])
    const parsed = parseBackup(JSON.stringify(out))
    expect(parsed.ok && parsed.rows.session_adjustment).toEqual([a])
    expect(parsed.ok && parsed.rows.plan_override).toEqual([ov])
  })
  it('alte Backups ohne die neuen Felder bleiben importierbar', () => {
    const p = parseBackup(JSON.stringify({ format: 'lift-heavy-backup', version: 1, session: [], workout_set: [], bodyweight: [] }))
    expect(p.ok && [p.rows.session_adjustment, p.rows.plan_override]).toEqual([[], []])
  })
  it('lehnt ungueltige Anpassungen ab', () => {
    const sid = crypto.randomUUID()
    const base = { format: 'lift-heavy-backup', version: 1, session: [{ id: sid, day_key: 'mo_brust', started_at: '2026-10-05T10:00:00.000Z', ended_at: null, note: null }], workout_set: [], bodyweight: [] }
    const good = buildAdjustment({ sessionId: sid, typ: 'auslassen', original_key: A[0], dauerhaft: false })
    const bad = (o: any) => parseBackup(JSON.stringify({ ...base, session_adjustment: [{ ...good, ...o }] }))
    expect(bad({}).ok).toBe(true)
    for (const o of [{ typ: 'loeschen' }, { original_key: 'gibt_es_nicht' }, { grund: 'langeweile' }, { note: 'x'.repeat(201) }, { dauerhaft: 'ja' }, { session_id: crypto.randomUUID() }, { typ: 'tauschen', neuer_key: null }, { typ: 'reihenfolge', position: null }])
      expect(bad(o).ok, JSON.stringify(o)).toBe(false)
    const ov = buildOverride({ dayKey: 'mo_brust', typ: 'auslassen', exercise_key: A[0] })
    expect(parseBackup(JSON.stringify({ ...base, plan_override: [{ ...ov, day_key: 'sa_laufen' }] })).ok).toBe(false)
  })
})

describe('RLS und Rechte der Migration', () => {
  const code = migrationSql.replace(/--.*$/gm, '')
  for (const t of ['session_adjustment', 'plan_override']) {
    it(`${t}: RLS an, Policy nur eigene Zeilen, Rechte nur fuer authenticated`, () => {
      expect(code).toMatch(new RegExp(`alter table ${t} enable row level security`))
      const policy = code.match(new RegExp(`create policy own_rows on ${t} for all([\\s\\S]*?);`))![1]
      expect(policy).toMatch(/using \(user_id = \(select auth\.uid\(\)\)\)/)
      expect(policy).toMatch(/with check \(user_id = \(select auth\.uid\(\)\)\)/)
      expect(code).toMatch(new RegExp(`grant select, insert, update, delete\\s+on [^;]*\\b${t}\\b[^;]*to authenticated`))
      expect(code).toMatch(new RegExp(`revoke all on [^;]*\\b${t}\\b[^;]* from anon`))
    })
  }
  it('user_id per auth.uid(), Wertelisten und Notiz-Laenge als CHECK', () => {
    expect(code).toMatch(/user_id uuid not null default auth\.uid\(\)/)
    expect(code).toMatch(/typ in \('auslassen', 'tauschen', 'reihenfolge'\)/)
    expect(code).toMatch(/grund in \('schmerz', 'geraet_belegt', 'zeit', 'anderes'\)/)
    expect(code).toMatch(/char_length\(note\) <= 200/)
    expect(code).not.toMatch(/to anon|to public/)
  })
  it('der Client sendet nie user_id', async () => {
    const ov = buildOverride({ dayKey: 'mo_brust', typ: 'auslassen', exercise_key: A[0] })
    await saveLocal('plan_override', ov)
    const { client, calls } = mockClient()
    await syncNow(client)
    expect(calls[0].rows[0]).not.toHaveProperty('user_id')
  })
})
