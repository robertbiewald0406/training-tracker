import { describe, expect, it } from 'vitest'
import { buildAdjustment } from './adjust'
import { plan } from './plan'
import {
  addDays,
  berlinDay,
  berlinMidnight,
  berlinOffsetMs,
  berlinWeekEnd,
  berlinWeekStart,
  bodyweightAvg7,
  buildWeekReport,
  isBerlinSunday,
  isoWeek,
  latestReportWeek,
  MUSCLE_TARGETS,
  shiftWeek,
  weekLabel,
} from './report'
import { epley } from './stats'

const iso = (d: Date) => d.toISOString()

describe('Woche in Europe/Berlin', () => {
  it('Versatz: Winter +1 h, Sommer +2 h', () => {
    expect(berlinOffsetMs(new Date('2026-01-15T12:00:00Z'))).toBe(3_600_000)
    expect(berlinOffsetMs(new Date('2026-07-15T12:00:00Z'))).toBe(7_200_000)
  })
  it('Berlin-Mitternacht als Zeitpunkt', () => {
    expect(iso(berlinMidnight('2026-10-19'))).toBe('2026-10-18T22:00:00.000Z') // Sommerzeit
    expect(iso(berlinMidnight('2026-10-26'))).toBe('2026-10-25T23:00:00.000Z') // nach der Umstellung
    expect(iso(berlinMidnight('2026-01-05'))).toBe('2026-01-04T23:00:00.000Z')
  })
  it('Woche beginnt Montag 0 Uhr Berlin, auch ueber die Zeitumstellung (169 Stunden)', () => {
    const s = berlinWeekStart(new Date('2026-10-22T10:00:00Z')) // Donnerstag
    expect(iso(s)).toBe('2026-10-18T22:00:00.000Z')
    const e = berlinWeekEnd(s)
    expect(iso(e)).toBe('2026-10-25T23:00:00.000Z')
    expect((e.getTime() - s.getTime()) / 3_600_000).toBe(169)
    // Sonntag 23:30 Berlin gehoert noch zur Woche, Montag 0:00 nicht mehr
    expect(iso(berlinWeekStart(new Date('2026-10-25T22:30:00Z')))).toBe(iso(s))
    expect(iso(berlinWeekStart(new Date('2026-10-25T23:00:00Z')))).toBe('2026-10-25T23:00:00.000Z')
  })
  it('Sonntag nach Berliner Zeit, nicht nach UTC', () => {
    expect(isBerlinSunday(new Date('2026-10-24T22:30:00Z'))).toBe(true) // Sa 22:30 UTC = So 00:30 Berlin
    expect(isBerlinSunday(new Date('2026-10-25T21:30:00Z'))).toBe(true) // So 23:30 Berlin (Sommerzeit endet nachts)
    expect(isBerlinSunday(new Date('2026-10-25T23:30:00Z'))).toBe(false) // Mo 0:30 Berlin
    expect(isBerlinSunday(new Date('2026-10-24T21:30:00Z'))).toBe(false) // Sa 23:30 Berlin
  })
  it('juengste Berichtswoche: Sonntag die laufende, sonst die letzte volle', () => {
    expect(berlinDay(latestReportWeek(new Date('2026-10-25T16:00:00Z')))).toBe('2026-10-19') // Sonntag
    expect(berlinDay(latestReportWeek(new Date('2026-10-22T10:00:00Z')))).toBe('2026-10-12') // Donnerstag
    expect(berlinDay(latestReportWeek(new Date('2026-10-26T08:00:00Z')))).toBe('2026-10-19') // Montag
  })
  it('Tage rechnen, Wochen verschieben, Kalenderwoche und Beschriftung', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(berlinDay(shiftWeek(berlinMidnight('2026-10-19'), -2))).toBe('2026-10-05')
    expect(isoWeek(berlinMidnight('2026-10-19'))).toEqual({ year: 2026, week: 43 })
    expect(isoWeek(berlinMidnight('2026-12-28'))).toEqual({ year: 2026, week: 53 })
    expect(isoWeek(berlinMidnight('2026-01-05'))).toEqual({ year: 2026, week: 2 })
    expect(weekLabel(berlinMidnight('2026-10-19'))).toBe('KW 43 · 19. – 25. Okt. 2026')
    expect(weekLabel(berlinMidnight('2026-10-26'))).toBe('KW 44 · 26. Okt. – 1. Nov. 2026')
  })
})

// ---------- Testdaten: eine Einheit je Wochentag, Wochen ab Mo 2026-09-21 ----------

let n = 0
const id = () => `id-${String(++n).padStart(5, '0')}`
const W0 = '2026-10-19' // Berichtswoche (Mo)
const at = (day: string, h = 10) => new Date(berlinMidnight(day).getTime() + h * 3_600_000).toISOString()
const sess = (day: string, day_key = 'mo_brust') => ({ id: id(), day_key, started_at: at(day) })
const set = (session_id: string, over: Record<string, unknown> = {}) => ({
  id: id(), session_id, exercise_key: 'hs_incline_press', set_no: 1, weight_kg: 60, reps: 8, rir: null,
  is_warmup: false, side: 'both' as const, logged_at: '2026-10-19T10:00:00.000Z', note: null, ...over,
}) as any
const report = (o: { sessions: any[]; sets: any[]; adjustments?: any[]; bodyweight?: any[]; week?: string }) =>
  buildWeekReport({ plan, adjustments: [], bodyweight: [], ...o, weekStart: berlinMidnight(o.week ?? W0) })

/** Wochenbeste fuer eine Uebung in den 4 Wochen davor: 60 kg x 8 (e1RM ~76,0). */
function history(weeks: number[], over: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  const sessions: any[] = []
  const sets: any[] = []
  for (const w of weeks) {
    const s = sess(addDays(W0, -7 * w))
    sessions.push(s)
    sets.push(set(s.id, { ...over, ...extra }))
  }
  return { sessions, sets }
}

describe('Fortschritt (geschaetztes 1RM, Epley, Arbeitssaetze bis 10 Wdh.)', () => {
  const base = epley(60, 8)
  const withWeek = (weight: number, reps = 8, history_ = [1, 2, 3, 4], over: Record<string, unknown> = {}) => {
    const h = history(history_)
    const s = sess(W0)
    return report({ sessions: [...h.sessions, s], sets: [...h.sets, set(s.id, { weight_kg: weight, reps, ...over })] })
  }
  it('mindestens 3 % ueber dem Schnitt der Vorwochen = besser, darunter stabil', () => {
    // 3 % ueber dem Schnitt: e1rm(x, 8) = x * (1 + 8/30)
    const up = withWeek(60 * 1.0301)
    expect(up.progress.better.map((r) => r.key)).toEqual(['hs_incline_press'])
    expect(up.progress.better[0].pct).toBeGreaterThanOrEqual(0.03)
    const nearly = withWeek(60 * 1.0299)
    expect(nearly.progress.better).toEqual([])
    expect(nearly.progress.stable.map((r) => r.key)).toEqual(['hs_incline_press'])
    expect(withWeek(60).progress.stable).toHaveLength(1)
  })
  it('mindestens 3 % darunter = darunter, sonst stabil', () => {
    expect(withWeek(60 * 0.9699).progress.below).toHaveLength(1)
    expect(withWeek(60 * 0.9701).progress.stable).toHaveLength(1)
  })
  it('Vergleichswert ist der Schnitt der besten Wochenwerte (3 bis 4 Wochen)', () => {
    const h = history([1, 2, 3, 4])
    h.sets[0].weight_kg = 70 // Woche 1 besser, Rest 60
    const s = sess(W0)
    const r = report({ sessions: [...h.sessions, s], sets: [...h.sets, set(s.id, { weight_kg: 70 })] })
    const row = [...r.progress.better, ...r.progress.stable][0]
    expect(row.baseline).toBeCloseTo((epley(70, 8) + 3 * base) / 4, 6)
  })
  it('weniger als 2 Vorwochen mit Daten: "neu", kein Vergleich', () => {
    const r = withWeek(80, 8, [3])
    expect(r.progress.fresh.map((x) => x.key)).toEqual(['hs_incline_press'])
    expect(r.progress.better).toEqual([])
    expect(r.sentences.progress).toMatch(/zu wenige Vorwochen/)
    expect(withWeek(80, 8, [2, 4]).progress.better).toHaveLength(1)
  })
  it('Wochen aelter als 4 Wochen zaehlen nicht zum Vergleich', () => {
    expect(withWeek(80, 8, [5, 6, 7]).progress.fresh).toHaveLength(1)
  })
  it('Aufwaermsaetze, Saetze ueber 10 Wdh. und Zeituebungen zaehlen nicht', () => {
    const h = history([1, 2])
    const s = sess(W0)
    const r = report({
      sessions: [...h.sessions, s],
      sets: [
        ...h.sets,
        set(s.id, { weight_kg: 100, reps: 5, is_warmup: true }),
        set(s.id, { set_no: 2, weight_kg: 90, reps: 11 }),
        set(s.id, { set_no: 3, weight_kg: 60, reps: 8 }),
        set(s.id, { exercise_key: 'plank', weight_kg: 0, reps: 60 }),
      ],
    })
    const all = [...r.progress.better, ...r.progress.stable, ...r.progress.below, ...r.progress.fresh]
    expect(all.map((x) => x.key)).toEqual(['hs_incline_press'])
    expect(all[0].current).toBeCloseTo(base, 6)
    expect(all[0].status).toBe('stabil')
  })
  it('das zweite Segment (Dropsatz) zaehlt nicht', () => {
    const h = history([1, 2])
    const s = sess(W0)
    const r = report({ sessions: [...h.sessions, s], sets: [...h.sets, set(s.id, { weight_kg: 60, reps: 8, note: 'seg:drop|90|10' })] })
    expect(r.progress.stable[0].current).toBeCloseTo(base, 6)
  })
  it('Tausch: es zaehlt der tatsaechlich genutzte Key', () => {
    const h = history([1, 2], { exercise_key: 'mts_chest_press' })
    const s = sess(W0)
    const r = report({ sessions: [...h.sessions, s], sets: [...h.sets, set(s.id, { exercise_key: 'mts_chest_press', weight_kg: 70 })] })
    expect(r.progress.better.map((x) => x.key)).toEqual(['mts_chest_press'])
  })
  it('sortiert die groessten Fortschritte zuerst', () => {
    const h1 = history([1, 2], { exercise_key: 'hs_incline_press' })
    const h2 = history([1, 2], { exercise_key: 'mts_chest_press' })
    const s = sess(W0)
    const r = report({
      sessions: [...h1.sessions, ...h2.sessions, s],
      sets: [...h1.sets, ...h2.sets, set(s.id, { weight_kg: 66 }), set(s.id, { exercise_key: 'mts_chest_press', weight_kg: 72 })],
    })
    expect(r.progress.better.map((x) => x.key)).toEqual(['mts_chest_press', 'hs_incline_press'])
  })
  it('Saetze aus Einheiten ausserhalb der Woche zaehlen nicht (Sonntag 23:30 Berlin ja, Montag 0:30 nein)', () => {
    const h = history([1, 2])
    const sun = { id: id(), day_key: 'mo_brust', started_at: new Date(berlinMidnight('2026-10-26').getTime() - 30 * 60_000).toISOString() }
    const mon = { id: id(), day_key: 'mo_brust', started_at: new Date(berlinMidnight('2026-10-26').getTime() + 30 * 60_000).toISOString() }
    const r = report({
      sessions: [...h.sessions, sun, mon],
      sets: [...h.sets, set(sun.id, { weight_kg: 70 }), set(mon.id, { exercise_key: 'mts_chest_press', weight_kg: 99 })],
    })
    expect([...r.progress.better, ...r.progress.stable].map((x) => x.key)).toEqual(['hs_incline_press'])
    expect(r.trainingDays.weekdays).toEqual(['So'])
  })
})

describe('Neue Rekorde', () => {
  it('Wochenbestwert ueber allem davor; ohne frueheren Wert kein Rekord', () => {
    const h = history([1, 3, 9]) // 60 x 8 in drei frueheren Wochen
    const s = sess(W0)
    const r = report({ sessions: [...h.sessions, s], sets: [...h.sets, set(s.id, { weight_kg: 62 }), set(s.id, { exercise_key: 'mts_chest_press', weight_kg: 80 })] })
    expect(r.records.map((x) => x.key)).toEqual(['hs_incline_press'])
    expect(r.records[0].previous).toBeCloseTo(epley(60, 8), 6)
    expect(r.sentences.records).toMatch(/1 neuer Bestwert/)
  })
  it('gleich gut oder schlechter ist kein Rekord; spaetere Wochen zaehlen nicht als "davor"', () => {
    const h = history([1])
    const later = sess('2026-11-02')
    const s = sess(W0)
    const r = report({ sessions: [...h.sessions, s, later], sets: [...h.sets, set(s.id, { weight_kg: 60 }), set(later.id, { weight_kg: 200 })] })
    expect(r.records).toEqual([])
    expect(r.sentences.records).toBe('Keine neuen Bestwerte in dieser Woche.')
  })
})

describe('Saetze pro Muskel mit Zielbereich', () => {
  it('zaehlt harte Saetze je primaerem Muskel, Bauch und Aufwaermen nicht, Status nach Zielbereich', () => {
    const s = sess(W0)
    const sets = [
      ...Array.from({ length: 12 }, (_, i) => set(s.id, { set_no: i + 1 })), // chest 12: im Bereich (10-16)
      ...Array.from({ length: 3 }, (_, i) => set(s.id, { exercise_key: 'pushdown_vgrip', set_no: i + 1 })), // triceps 3: darunter
      ...Array.from({ length: 20 }, (_, i) => set(s.id, { exercise_key: 'cable_curl_bar', set_no: i + 1 })), // biceps 20: darueber
      set(s.id, { exercise_key: 'cable_curl_bar', set_no: 99, is_warmup: true }),
      set(s.id, { exercise_key: 'captain_chair_leg_raise', set_no: 1, weight_kg: 0 }),
    ]
    const r = report({ sessions: [s], sets })
    const row = (m: string) => r.muscles.find((x) => x.muscle === m)!
    expect(row('chest')).toMatchObject({ sets: 12, min: 10, max: 16, status: 'im Bereich' })
    expect(row('triceps')).toMatchObject({ sets: 3, status: 'darunter' })
    expect(row('biceps')).toMatchObject({ sets: 20, status: 'darueber' })
    expect(r.muscles.find((m) => ['abs', 'core', 'obliques'].includes(m.muscle))).toBeUndefined()
    expect(row('quads')).toMatchObject({ sets: 0, status: 'darunter' })
    expect(r.sentences.muscles).toMatch(/^1 von \d+ Muskelgruppen im Zielbereich; darunter: .*; darüber: Bizeps\.$/)
  })
  it('links und rechts eines Satzes zaehlen einmal', () => {
    const s = sess(W0)
    const r = report({
      sessions: [s],
      sets: [
        set(s.id, { exercise_key: 'cable_lateral_raise', side: 'left' }),
        set(s.id, { exercise_key: 'cable_lateral_raise', side: 'right' }),
      ],
    })
    expect(r.muscles.find((m) => m.muscle === 'side_delts')!.sets).toBe(1)
  })
  it('jeder aktive Muskel des Plans hat einen Zielbereich', () => {
    const active = new Set<string>()
    for (const d of plan.days) for (const it of d.items) active.add(plan.exercises[it.exercise_key].primary_muscle)
    for (const m of active) expect(MUSCLE_TARGETS[m], m).toBeDefined()
    for (const t of Object.values(MUSCLE_TARGETS)) expect(t.min).toBeLessThan(t.max)
  })
})

describe('Trainingstage', () => {
  it('zaehlt Berliner Kalendertage mit Arbeitssaetzen, mehrere Einheiten am Tag einmal', () => {
    const a = sess('2026-10-19')
    const b = sess('2026-10-19', 'fr_arme')
    const c = sess('2026-10-21', 'mi_beine_a')
    const empty = sess('2026-10-23', 'fr_arme') // ohne Saetze
    const warm = sess('2026-10-24', 'fr_arme') // nur Aufwaermsatz
    const r = report({
      sessions: [a, b, c, empty, warm],
      sets: [set(a.id), set(b.id), set(c.id, { exercise_key: 'hack_squat' }), set(warm.id, { is_warmup: true })],
    })
    expect(r.trainingDays).toEqual({ count: 2, planned: 5, weekdays: ['Mo', 'Mi'], sessions: 3 })
    expect(r.sentences.training).toBe('2 von 5 geplanten Tagen trainiert (3 Einheiten).')
  })
  it('leere Woche', () => {
    expect(report({ sessions: [], sets: [] }).sentences.training).toBe('In dieser Woche ist kein Training erfasst.')
  })
})

describe('Ausgelassen und getauscht', () => {
  it('listet Auslassen und Tausch mit Grund, Verschieben nicht, andere Wochen nicht', () => {
    const s = sess(W0)
    const old = sess(addDays(W0, -7))
    const adj = (sessionId: string, typ: any, extra: any = {}) =>
      buildAdjustment({ sessionId, typ, original_key: 'hs_incline_press', neuer_key: typ === 'tauschen' ? 'mts_chest_press' : null, position: typ === 'reihenfolge' ? 1 : null, dauerhaft: false, ...extra })
    const r = report({
      sessions: [s, old],
      sets: [],
      adjustments: [
        adj(s.id, 'auslassen', { grund: 'zeit', now: new Date('2026-10-19T10:00:00Z') }),
        adj(s.id, 'tauschen', { grund: 'zeit', note: 'Gerät besetzt', now: new Date('2026-10-19T11:00:00Z') }),
        adj(s.id, 'auslassen', { grund: 'schmerz', dauerhaft: true, now: new Date('2026-10-19T12:00:00Z') }),
        adj(s.id, 'reihenfolge'),
        adj(old.id, 'auslassen', { grund: 'schmerz' }),
      ],
    })
    expect(r.adjustments.map((a) => [a.typ, a.grund, a.weekday])).toEqual([
      ['auslassen', 'Zeit', 'Mo'],
      ['tauschen', 'Zeit', 'Mo'],
      ['auslassen', 'Schmerz', 'Mo'],
    ])
    expect(r.adjustments[1].note).toBe('Gerät besetzt')
    expect(r.sentences.adjustments).toBe('2 Übungen ausgelassen, 1 getauscht; häufigster Grund: Zeit.')
  })
  it('nichts angepasst', () => {
    expect(report({ sessions: [], sets: [] }).sentences.adjustments).toBe('Nichts ausgelassen oder getauscht.')
  })
})

describe('Koerpergewicht (7-Tage-Mittel)', () => {
  const bw = (day: string, kg: number) => ({ id: id(), measured_on: day, weight_kg: kg })
  it('Mittel der Messungen der 7 Tage bis zum Wochenende', () => {
    const rows = [bw('2026-10-18', 99), bw('2026-10-19', 82), bw('2026-10-22', 83), bw('2026-10-25', 84)]
    expect(bodyweightAvg7(rows, '2026-10-25')).toBeCloseTo(83, 6) // 18.10. liegt ausserhalb (Fenster: 19.-25.)
    expect(bodyweightAvg7(rows, '2026-10-17')).toBeNull()
  })
  it('Vergleich mit der Vorwoche und Satz', () => {
    const rows = [bw('2026-10-14', 83), bw('2026-10-21', 82.4)]
    const r = report({ sessions: [], sets: [], bodyweight: rows })
    expect(r.bodyweight.avg).toBeCloseTo(82.4, 6)
    expect(r.bodyweight.prevAvg).toBeCloseTo(83, 6)
    expect(r.sentences.bodyweight).toBe('7-Tage-Mittel 82,4 kg, 0,6 kg weniger als eine Woche zuvor.')
  })
  it('kleine Aenderung = praktisch unveraendert, ohne Messung ehrlich', () => {
    expect(report({ sessions: [], sets: [], bodyweight: [bw('2026-10-14', 83), bw('2026-10-21', 83.1)] }).sentences.bodyweight).toMatch(/praktisch unverändert/)
    expect(report({ sessions: [], sets: [] }).sentences.bodyweight).toBe('Keine Messung in den letzten 7 Tagen.')
    expect(report({ sessions: [], sets: [], bodyweight: [bw('2026-10-21', 82)] }).sentences.bodyweight).toBe('7-Tage-Mittel 82 kg.')
  })
})

describe('Saetze', () => {
  it('Fortschrittssatz ohne Uebertreibung', () => {
    const h = history([1, 2, 3, 4])
    const s = sess(W0)
    const r = report({ sessions: [...h.sessions, s], sets: [...h.sets, set(s.id, { weight_kg: 66 })] })
    expect(r.sentences.progress).toBe('Bei 1 Übung liegt das geschätzte 1RM mindestens 3 % über dem Schnitt der letzten Wochen, bei 0 ist es etwa gleich.')
    const r2 = report({ sessions: [...h.sessions, s], sets: [...h.sets, set(s.id, { weight_kg: 50 })] })
    expect(r2.sentences.progress).toMatch(/bei 1 mindestens 3 % darunter\.$/)
  })
})
