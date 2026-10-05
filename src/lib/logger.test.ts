import { describe, expect, it } from 'vitest'
import { plan, type Plan } from './plan'
import {
  activeSession,
  stalePositionKeys,
  buildSetRow,
  dayForVariant,
  defaultVariant,
  derivePosition,
  resolveSessionDay,
  sessionDayKey,
  startValues,
  variantMatch,
  variantOfKey,
  setsByPosition,
  isRampUp,
  nextSetNo,
  parseNumber,
  pendingRightSide,
  planDayForDate,
  prefill,
  resolvePosition,
  setsFor,
  weekOverview,
  weekStart,
  workingSetCount,
} from './logger'
import type { WorkoutSetRow } from './types'

const sess = (id: string, day_key: string, started_at: string, ended_at: string | null = null) => ({
  id, day_key, started_at, ended_at,
})
let n = 0
const mk = (o: Partial<WorkoutSetRow>): WorkoutSetRow => ({
  id: `set${n++}`,
  session_id: 's1',
  exercise_key: 'hs_incline_press',
  set_no: 1,
  weight_kg: 40,
  reps: 8,
  rir: null,
  is_warmup: false,
  side: 'both',
  logged_at: `2026-10-05T10:0${n % 10}:00Z`,
  note: null,
  ...o,
})

describe('Wochentag-Zuordnung', () => {
  it('Montag bis Freitag auf Plan-Tage, Wochenende = Lauftag', () => {
    // 5.10.2026 ist ein Montag
    const keys = [5, 6, 7, 8, 9].map((d) => planDayForDate(new Date(2026, 9, d), plan)?.key)
    expect(keys).toEqual(['mo_brust', 'di_ruecken', 'mi_beine', 'do_schultern', 'fr_arme'])
    expect(planDayForDate(new Date(2026, 9, 10), plan)).toBeNull() // Samstag
    expect(planDayForDate(new Date(2026, 9, 11), plan)).toBeNull() // Sonntag
  })
  it('Wochenstart ist Montag (auch am Sonntag)', () => {
    expect(weekStart(new Date(2026, 9, 11, 15)).getDate()).toBe(5)
    expect(weekStart(new Date(2026, 9, 5)).getDate()).toBe(5)
  })
})

describe('Wochenuebersicht', () => {
  it('beendete Einheiten dieser Woche sind erledigt, Vorwoche und unbeendete nicht', () => {
    const sessions = [
      sess('a', 'mo_brust', new Date(2026, 9, 5, 10).toISOString(), new Date(2026, 9, 5, 11).toISOString()),
      sess('b', 'di_ruecken', new Date(2026, 9, 6, 10).toISOString(), null), // nicht beendet
      sess('c', 'mi_beine', new Date(2026, 9, 2, 10).toISOString(), new Date(2026, 9, 2, 11).toISOString()), // Vorwoche
    ]
    const o = weekOverview(plan, sessions, new Date(2026, 9, 8))
    expect(o.map((x) => x.done)).toEqual([true, false, false, false, false])
  })
})

// Die Tests fuer aktive Anlaufphase nutzen weeks = 2, unabhaengig vom aktuellen Wert in plan.json.
const rampPlan: Plan = { ...plan, ramp_up: { ...plan.ramp_up, weeks: 2 } }
const offPlan: Plan = { ...plan, ramp_up: { ...plan.ramp_up, weeks: 0 } }

describe('Ramp-up', () => {
  const item = (sets: number) => ({ exercise_key: 'x', sets, rep_min: 6, rep_max: 10, rest_sec: 90 })
  it('ein Satz weniger, mindestens 2, nie mehr als geplant', () => {
    expect(setsFor(item(4), true, plan)).toBe(3)
    expect(setsFor(item(3), true, plan)).toBe(2)
    expect(setsFor(item(2), true, plan)).toBe(2)
    expect(setsFor(item(1), true, plan)).toBe(1)
    expect(setsFor(item(4), false, plan)).toBe(4)
  })
  it('weeks = 0: nie aktiv (auch ohne Einheiten) und volle Satzzahl aus dem Plan', () => {
    const first = new Date(2026, 9, 5, 10)
    const sessions = [sess('a', 'mo_brust', first.toISOString())]
    expect(isRampUp(new Date(2026, 9, 5), [], offPlan)).toBe(false)
    expect(isRampUp(new Date(2026, 9, 5, 11), sessions, offPlan)).toBe(false)
    for (const day of plan.days)
      for (const item of day.items)
        expect(setsFor(item, isRampUp(new Date(2026, 9, 5), [], offPlan), offPlan)).toBe(item.sets)
  })
  it('plan.json hat die Anlaufphase abgeschaltet (weeks = 0)', () => {
    expect(plan.ramp_up.weeks).toBe(0)
    expect(isRampUp(new Date(), [], plan)).toBe(false)
  })
  it('aktiv ohne Einheit, bis 14 Tage nach der ersten, danach nicht mehr; Testdaten zaehlen nicht', () => {
    const first = new Date(2026, 9, 5, 10)
    const sessions = [sess('a', 'mo_brust', first.toISOString())]
    expect(isRampUp(new Date(2026, 9, 5), [], rampPlan)).toBe(true)
    expect(isRampUp(new Date(2026, 9, 18, 9), sessions, rampPlan)).toBe(true) // Tag 13
    expect(isRampUp(new Date(2026, 9, 19, 10), sessions, rampPlan)).toBe(false) // genau 14 Tage
    expect(isRampUp(new Date(2026, 9, 20), sessions, rampPlan)).toBe(false)
    expect(isRampUp(new Date(2026, 9, 25), [sess('t', 'test', '2000-01-01T00:00:00Z')], rampPlan)).toBe(true)
  })
})

describe('Vorbelegung', () => {
  const sessions = [
    sess('s0', 'mo_brust', '2026-09-28T10:00:00Z', '2026-09-28T11:00:00Z'),
    sess('s1', 'mo_brust', '2026-10-05T10:00:00Z'),
  ]
  it('leer ohne fruehere Saetze', () => {
    expect(prefill('hs_incline_press', 'both', [], sessions, 's1')).toBeNull()
  })
  it('nimmt den letzten Arbeitssatz der letzten frueheren Einheit', () => {
    const sets = [
      mk({ session_id: 's0', weight_kg: 35, reps: 10, logged_at: '2026-09-28T10:05:00Z' }),
      mk({ session_id: 's0', weight_kg: 40, reps: 8, logged_at: '2026-09-28T10:10:00Z' }),
    ]
    expect(prefill('hs_incline_press', 'both', sets, sessions, 's1')).toEqual({ weight_kg: 40, reps: 8 })
  })
  it('laufende Einheit hat Vorrang; Aufwaermsaetze zaehlen nicht', () => {
    const sets = [
      mk({ session_id: 's0', weight_kg: 40, reps: 8, logged_at: '2026-09-28T10:10:00Z' }),
      mk({ session_id: 's1', weight_kg: 20, reps: 12, is_warmup: true, logged_at: '2026-10-05T10:01:00Z' }),
    ]
    expect(prefill('hs_incline_press', 'both', sets, sessions, 's1')).toEqual({ weight_kg: 40, reps: 8 })
    sets.push(mk({ session_id: 's1', weight_kg: 42.5, reps: 7, logged_at: '2026-10-05T10:09:00Z' }))
    expect(prefill('hs_incline_press', 'both', sets, sessions, 's1')).toEqual({ weight_kg: 42.5, reps: 7 })
  })
  it('einseitig je Seite getrennt', () => {
    const sets = [
      mk({ session_id: 's0', exercise_key: 'cable_lateral_raise', side: 'left', weight_kg: 5, reps: 12, logged_at: '2026-09-28T10:10:00Z' }),
      mk({ session_id: 's0', exercise_key: 'cable_lateral_raise', side: 'right', weight_kg: 6, reps: 11, logged_at: '2026-09-28T10:11:00Z' }),
    ]
    expect(prefill('cable_lateral_raise', 'left', sets, sessions, 's1')).toEqual({ weight_kg: 5, reps: 12 })
    expect(prefill('cable_lateral_raise', 'right', sets, sessions, 's1')).toEqual({ weight_kg: 6, reps: 11 })
  })
})

describe('Einseitige Saetze', () => {
  const key = 'cable_lateral_raise'
  it('ein Satz zaehlt erst mit beiden Seiten; rechts offen nach links', () => {
    const left = mk({ exercise_key: key, side: 'left', set_no: 1 })
    expect(workingSetCount([left], true)).toBe(0)
    expect(pendingRightSide([left], 's1', key)).toMatchObject({ setNo: 1, weight_kg: 40 })
    const right = mk({ exercise_key: key, side: 'right', set_no: 1 })
    expect(workingSetCount([left, right], true)).toBe(1)
    expect(pendingRightSide([left, right], 's1', key)).toBeNull()
  })
  it('links und rechts teilen sich die set_no, der naechste Satz zaehlt weiter', () => {
    const sets = [mk({ exercise_key: key, side: 'left', set_no: 1 }), mk({ exercise_key: key, side: 'right', set_no: 1 })]
    expect(nextSetNo(sets, 's1', key)).toBe(2)
    expect(nextSetNo([], 's1', key)).toBe(1)
  })
  it('buildSetRow: Bis Versagen = rir 0, sonst null; side wird uebernommen', () => {
    const base = { sessionId: 's1', exerciseKey: key, setNo: 1, weight_kg: 5.123, reps: 12, warmup: false }
    const l = buildSetRow({ ...base, failure: true, side: 'left' })
    const r = buildSetRow({ ...base, failure: false, side: 'right' })
    expect(l).toMatchObject({ side: 'left', rir: 0, weight_kg: 5.12, is_warmup: false })
    expect(r).toMatchObject({ side: 'right', rir: null })
    expect(l.id).not.toBe(r.id)
  })
})

describe('Wiederaufnahme', () => {
  const day = plan.days[0] // Brust: 4/3/4/3 Saetze
  it('startet bei der ersten unfertigen Uebung', () => {
    expect(derivePosition(day, [], 's1', false, plan).itemIdx).toBe(0)
    const sets = [1, 2, 3, 4].map((i) => mk({ set_no: i, logged_at: `2026-10-05T10:0${i}:00Z` }))
    expect(derivePosition(day, sets, 's1', false, plan).itemIdx).toBe(1)
  })
  it('Ramp-up verkuerzt: 3 statt 4 Saetze reichen', () => {
    const sets = [1, 2, 3].map((i) => mk({ set_no: i, logged_at: `2026-10-05T10:0${i}:00Z` }))
    expect(derivePosition(day, sets, 's1', true, plan).itemIdx).toBe(1)
  })
  it('merkt sich die genutzte Alternative und ist nach allen Uebungen am Ende', () => {
    const back = plan.days[1] // Ruecken: Position 3 = Latzug, Alternative High Row (keine eigene Plan-Uebung)
    const sets = [mk({ exercise_key: 'hs_high_row', set_no: 1 })]
    expect(derivePosition(back, sets, 's1', false, plan).chosen[3]).toBe('hs_high_row')
    const all = day.items.flatMap((it, idx) =>
      Array.from({ length: it.sets }, (_, i) =>
        // einseitige Uebungen zaehlen erst mit links und rechts
        (plan.exercises[it.exercise_key].unilateral ? (['left', 'right'] as const) : (['both'] as const)).map((side) =>
          mk({ exercise_key: it.exercise_key, set_no: i + 1, side, logged_at: `2026-10-05T1${idx}:0${i}:00Z` }),
        ),
      ).flat(),
    )
    expect(derivePosition(day, all, 's1', false, plan).itemIdx).toBe(day.items.length)
  })
  it('Alternative, die selbst Plan-Uebung ist: Zuordnung entscheidet (Tausch-Fall)', () => {
    // Brust: Position 0 = Incline Press, Position 1 = Chest Press (beide sind gegenseitig Alternativen).
    // Incline ist belegt: Chest Press an Position 0, Incline an Position 1.
    const a = [1, 2, 3, 4].map((i) => mk({ id: `a${i}`, exercise_key: 'hs_chest_press', set_no: i, logged_at: `2026-10-05T10:0${i}:00Z` }))
    const assign = Object.fromEntries(a.map((x) => [x.id, 0]))
    const per = setsByPosition(day, plan, a, 's1', assign)
    expect(per.map((l) => l.length)).toEqual([4, ...day.items.slice(1).map(() => 0)])
    expect(derivePosition(day, a, 's1', false, plan, assign).itemIdx).toBe(1)
    // ohne Zuordnung (Heuristik) zaehlen sie fuer Position 1 (Hauptschluessel)
    expect(setsByPosition(day, plan, a, 's1').map((l) => l.length)).toEqual([0, 4, ...day.items.slice(2).map(() => 0)])
  })
  it('gespeicherte Position hat Vorrang, ungueltige faellt auf abgeleitete zurueck', () => {
    const derived = { itemIdx: 1, chosen: {}, assign: {} }
    expect(resolvePosition({ itemIdx: 3, chosen: { 3: 'x' }, assign: {}, restEndsAt: 5 }, derived, 4)).toMatchObject({ itemIdx: 3, restEndsAt: 5 })
    expect(resolvePosition({ itemIdx: 99, chosen: {}, assign: {} }, derived, 4)).toEqual(derived)
    expect(resolvePosition(undefined, derived, 4)).toEqual(derived)
  })
})

describe('Zahleneingabe', () => {
  it('Komma und Punkt, leer/ungueltig = null', () => {
    expect(parseNumber('42,5')).toBe(42.5)
    expect(parseNumber('42.5')).toBe(42.5)
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('abc')).toBeNull()
  })
})

// Typ-Check: plan.json passt zu den Plan-Typen
const _p: Plan = plan
void _p

describe('Gemerkte Position ohne Session', () => {
  const open1 = sess('s1', 'mo_brust', '2026-10-05T10:00:00Z')
  it('Position einer lokal fehlenden Session ist veraltet, die einer offenen nicht', () => {
    const keys = ['position:ghost', 'position:s1', 'quotes:recent']
    expect(stalePositionKeys(keys, [open1])).toEqual(['position:ghost'])
    expect(stalePositionKeys(keys, [])).toEqual(['position:ghost', 'position:s1'])
  })
  it('beendete Sessions haben keine gueltige Position mehr', () => {
    const done = sess('s1', 'mo_brust', '2026-10-05T10:00:00Z', '2026-10-05T11:00:00Z')
    expect(stalePositionKeys(['position:s1'], [done])).toEqual(['position:s1'])
  })
  it('ohne offene Session gibt es keine aktive Einheit (Startseite)', () => {
    expect(activeSession([], plan)).toBeUndefined()
    expect(activeSession([sess('x', 'test', '2026-10-05T10:00:00Z')], plan)).toBeUndefined()
    expect(activeSession([open1, sess('s2', 'di_ruecken', '2026-10-06T10:00:00Z')], plan)?.id).toBe('s2')
  })
})

describe('Varianten (Beintag)', () => {
  const legs = plan.days.find((d) => d.key === 'mi_beine')!
  const done = (id: string, key: string) => sess(id, key, new Date(2026, 9, 7).toISOString(), new Date(2026, 9, 7, 1).toISOString())

  it('Variante wechselt nach Paritaet abgeschlossener Einheiten', () => {
    expect(defaultVariant(legs, [])).toBe('A')
    expect(defaultVariant(legs, [done('a', 'mi_beine_a')])).toBe('B')
    expect(defaultVariant(legs, [done('a', 'mi_beine_a'), done('b', 'mi_beine_b')])).toBe('A')
    // offene Einheit und andere Tage zaehlen nicht
    const open = sess('c', 'mi_beine_a', new Date(2026, 9, 14).toISOString(), null)
    expect(defaultVariant(legs, [done('a', 'mi_beine_a'), open, done('m', 'mo_brust')])).toBe('B')
    expect(defaultVariant(plan.days[0], [])).toBeNull()
  })
  it('day_key traegt die Variante, Items filtern sich nach Variante', () => {
    expect(sessionDayKey(legs, 'A')).toBe('mi_beine_a')
    expect(sessionDayKey(legs, 'B')).toBe('mi_beine_b')
    expect(sessionDayKey(plan.days[0], 'A')).toBe('mo_brust')
    const a = dayForVariant(legs, 'A').items.map((i) => i.exercise_key)
    const b = dayForVariant(legs, 'B').items.map((i) => i.exercise_key)
    expect(a).toContain('hack_squat')
    expect(a).not.toContain('seated_leg_curl')
    expect(b).toContain('seated_leg_curl')
    expect(b).not.toContain('hack_squat')
    expect(plan.days[0]).toBe(dayForVariant(plan.days[0], null))
    expect(resolveSessionDay('mi_beine_b', plan)!.items.map((i) => i.exercise_key)).toEqual(b)
    expect(variantOfKey('mi_beine_b', plan)).toBe('B')
    expect(variantOfKey('mo_brust', plan)).toBeNull()
  })
  it('Wochenuebersicht und aktive Einheit ordnen ueber das Praefix zu', () => {
    const now = new Date(2026, 9, 8)
    const s = [sess('a', 'mi_beine_b', new Date(2026, 9, 7, 10).toISOString(), new Date(2026, 9, 7, 11).toISOString())]
    expect(weekOverview(plan, s, now).find((w) => w.day.key === 'mi_beine')!.done).toBe(true)
    const open = sess('o', 'mi_beine_a', new Date(2026, 9, 7, 10).toISOString(), null)
    expect(activeSession([open], plan)?.id).toBe('o')
    expect(activeSession([sess('x', 'mi_beine_x', '2026-10-07T10:00:00Z')], plan)).toBeUndefined()
  })
  it('Vorbelegung: gleiche Variante zuerst, sonst die andere', () => {
    const sessions = [
      sess('s1', 'mi_beine_a', '2026-09-23T10:00:00Z', '2026-09-23T11:00:00Z'),
      sess('s2', 'mi_beine_b', '2026-09-30T10:00:00Z', '2026-09-30T11:00:00Z'),
      sess('cur', 'mi_beine_a', '2026-10-07T10:00:00Z'),
    ]
    const sets = [
      mk({ session_id: 's1', exercise_key: 'adductor_machine', weight_kg: 50, reps: 12 }),
      mk({ session_id: 's2', exercise_key: 'adductor_machine', weight_kg: 60, reps: 10 }),
    ]
    const m = variantMatch('A', sessions, plan)
    expect(prefill('adductor_machine', 'both', sets, sessions, 'cur', m)).toEqual({ weight_kg: 50, reps: 12 })
    expect(prefill('adductor_machine', 'both', sets, sessions, 'cur', variantMatch('B', sessions, plan))).toEqual({
      weight_kg: 60,
      reps: 10,
    })
    // Keine Daten in der Variante: die andere
    expect(prefill('adductor_machine', 'both', [sets[1]], sessions, 'cur', m)).toEqual({ weight_kg: 60, reps: 10 })
  })
})

describe('Zeit- und Koerpergewichtsuebungen', () => {
  const item = { exercise_key: 'plank', sets: 3, rep_min: 30, rep_max: 60, rest_sec: 60 }
  it('Zeituebung: Dauer in reps, Gewicht 0, Vorbelegung = untere Grenze', () => {
    expect(startValues(plan.exercises.plank, item, null)).toEqual({ weight_kg: 0, reps: 30 })
    const row = buildSetRow({
      sessionId: 's', exerciseKey: 'plank', setNo: 1, weight_kg: 0, reps: 45, warmup: false, failure: false, side: 'both',
    })
    expect(row.reps).toBe(45)
    expect(row.weight_kg).toBe(0)
  })
  it('Koerpergewicht: Gewicht mit 0 vorbelegt, ohne Zeit leere Wiederholungen', () => {
    const hk = { ...item, exercise_key: 'hanging_knee_raise', rep_min: 10 }
    expect(startValues(plan.exercises.hanging_knee_raise, hk, null)).toEqual({ weight_kg: 0, reps: null })
  })
  it('letzter Satz hat Vorrang vor der Vorbelegung 0', () => {
    expect(startValues(plan.exercises.hanging_knee_raise, item, { weight_kg: 5, reps: 12 })).toEqual({ weight_kg: 5, reps: 12 })
  })
  it('normale Uebung ohne Verlauf: keine Vorbelegung', () => {
    expect(startValues(plan.exercises.hs_incline_press, item, null)).toBeNull()
  })
  it('einseitige Zeituebung (Seitstuetz) zaehlt erst mit links und rechts', () => {
    const l = mk({ exercise_key: 'side_plank', side: 'left', weight_kg: 0, reps: 30 })
    const r = mk({ exercise_key: 'side_plank', side: 'right', weight_kg: 0, reps: 30 })
    expect(workingSetCount([l], true)).toBe(0)
    expect(workingSetCount([l, r], true)).toBe(1)
  })
})
