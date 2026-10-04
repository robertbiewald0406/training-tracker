import { describe, expect, it } from 'vitest'
import { plan } from './plan'
import {
  bodyweightSeries,
  compareSets,
  daysBetween,
  epley,
  exerciseHistory,
  hardSetCount,
  hardSetsByMuscle,
  lastLog,
  personalRecords,
  weekTotals,
} from './stats'
import type { WorkoutSetRow } from './types'

const NOW = new Date(2026, 9, 7, 12) // Mittwoch 7.10.2026
const sess = (id: string, y: number, m: number, d: number) => ({ id, started_at: new Date(y, m, d, 18).toISOString() })
let n = 0
const set = (p: Partial<WorkoutSetRow>): WorkoutSetRow => ({
  id: `s${++n}`,
  session_id: 'a',
  exercise_key: 'hs_incline_press',
  set_no: 1,
  weight_kg: 50,
  reps: 8,
  rir: null,
  is_warmup: false,
  side: 'both',
  logged_at: new Date(2026, 9, 5).toISOString(),
  note: null,
  ...p,
})

describe('epley', () => {
  it('schaetzt das 1RM, eine Wiederholung ist das Gewicht', () => {
    expect(epley(100, 1)).toBe(100)
    expect(epley(60, 10)).toBeCloseTo(80)
    expect(epley(0, 10)).toBe(0)
  })
})

describe('hardSetCount', () => {
  it('ignoriert Aufwaermsaetze und zaehlt links+rechts einmal', () => {
    const sets = [
      set({ is_warmup: true }),
      set({ set_no: 2 }),
      set({ exercise_key: 'hs_iso_row', set_no: 1, side: 'left' }),
      set({ exercise_key: 'hs_iso_row', set_no: 1, side: 'right' }),
    ]
    expect(hardSetCount(sets)).toBe(2)
  })
})

describe('Wochenwerte', () => {
  const sessions = [sess('a', 2026, 9, 5), sess('b', 2026, 9, 6), sess('old', 2026, 8, 30)]
  const sets = [
    set({ session_id: 'a', weight_kg: 10, reps: 10 }),
    set({ session_id: 'b', set_no: 1, exercise_key: 'fly_machine', weight_kg: 20, reps: 10 }),
    set({ session_id: 'b', set_no: 2, exercise_key: 'fly_machine', is_warmup: true }),
    set({ session_id: 'old', weight_kg: 40, reps: 5, exercise_key: 'hack_squat' }),
  ]
  it('summiert diese und die Vorwoche getrennt', () => {
    // 7.10.2026 ist Mittwoch, Woche beginnt Mo 5.10.
    const w0 = weekTotals(sets, sessions, NOW, 0)
    expect(w0).toMatchObject({ sessions: 2, sets: 2, volume: 300 })
    const w1 = weekTotals(sets, sessions, NOW, 1)
    expect(w1).toMatchObject({ sessions: 1, sets: 1, volume: 200 })
    // Nur bis zum gleichen Zeitpunkt: Vorwoche bis Mi 30.9. 12 Uhr, die Einheit vom 30.9. 18 Uhr zaehlt noch nicht.
    expect(weekTotals(sets, sessions, NOW, 1, true)).toMatchObject({ sessions: 0, sets: 0 })
  })
  it('zaehlt harte Saetze je primaerem Muskel', () => {
    expect(hardSetsByMuscle(sets, sessions, plan, NOW, 0)).toEqual({ chest: 2 })
    expect(hardSetsByMuscle(sets, sessions, plan, NOW, 1)).toEqual({ quads: 1 })
  })
})

describe('Vergleich mit dem letzten Mal', () => {
  const sessions = [sess('a', 2026, 9, 5), sess('b', 2026, 9, 12), sess('c', 2026, 9, 19)]
  const sets = [
    set({ session_id: 'a', set_no: 2, weight_kg: 50, reps: 8 }),
    set({ session_id: 'a', set_no: 1, weight_kg: 50, reps: 9 }),
    set({ session_id: 'b', weight_kg: 52.5, reps: 8 }),
    set({ session_id: 'c', weight_kg: 55, reps: 8 }),
  ]
  it('nimmt die letzte fruehere Einheit, nicht die aktuelle oder spaetere', () => {
    expect(lastLog('hs_incline_press', sets, sessions, 'b')?.sessionId).toBe('a')
    expect(lastLog('hs_incline_press', sets, sessions, 'c')?.sessionId).toBe('b')
    expect(lastLog('hs_incline_press', sets, sessions, 'a')).toBeNull()
  })
  it('sortiert die Saetze nach set_no', () => {
    expect(lastLog('hs_incline_press', sets, sessions, 'b')?.sets.map((s) => s.set_no)).toEqual([1, 2])
  })
  it('vergleicht ueber das geschaetzte 1RM', () => {
    const before = { weight_kg: 50, reps: 8 }
    expect(compareSets({ weight: 52.5, reps: 8 }, before)).toBe('better')
    expect(compareSets({ weight: 50, reps: 8 }, before)).toBe('same')
    expect(compareSets({ weight: 50, reps: 6 }, before)).toBe('worse')
  })
  it('zaehlt Kalendertage', () => {
    expect(daysBetween(new Date(2026, 9, 5, 23).toISOString(), new Date(2026, 9, 12, 7))).toBe(7)
  })
})

describe('Verlauf und Rekorde', () => {
  const sessions = [sess('a', 2026, 9, 5), sess('b', 2026, 9, 12)]
  const sets = [
    set({ session_id: 'a', weight_kg: 50, reps: 8, logged_at: '2026-10-05T10:00:00Z' }),
    set({ session_id: 'b', weight_kg: 60, reps: 8, logged_at: '2026-10-12T10:00:00Z' }),
    set({ session_id: 'b', set_no: 2, weight_kg: 90, reps: 1, is_warmup: true, logged_at: '2026-10-12T10:05:00Z' }),
  ]
  it('liefert je Einheit das beste 1RM, Aufwaermsaetze zaehlen nicht', () => {
    const h = exerciseHistory('hs_incline_press', sets, sessions)
    expect(h.map((p) => Math.round(p.e1rm))).toEqual([63, 76])
    expect(h[1].hardSets).toBe(1)
  })
  it('findet den Rekord je Uebung', () => {
    const [pr] = personalRecords(sets, sessions, plan)
    expect(pr).toMatchObject({ exerciseKey: 'hs_incline_press', weight: 60, reps: 8 })
  })
})

describe('Koerpergewicht', () => {
  it('bildet das 7-Tage-Mittel', () => {
    const rows = [
      { id: '1', measured_on: '2026-10-01', weight_kg: 80 },
      { id: '2', measured_on: '2026-10-03', weight_kg: 82 },
      { id: '3', measured_on: '2026-10-09', weight_kg: 84 },
    ]
    expect(bodyweightSeries(rows).map((p) => p.avg7)).toEqual([80, 81, 83])
  })
})
