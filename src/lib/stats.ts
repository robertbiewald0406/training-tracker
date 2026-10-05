import type { Plan } from './plan'
import type { BodyweightRow, Side, WorkoutSetRow } from './types'
import { weekStart } from './logger'

// Reine Auswertungen fuer Dashboard und Vergleich "Letztes Mal". Keine Seiteneffekte, nur lokale Daten.

interface SessionLike {
  id: string
  started_at: string
}

const DAY_MS = 86_400_000

/** Geschaetztes 1RM nach Epley. Eine Wiederholung ist das Gewicht selbst. */
export function epley(weight: number, reps: number): number {
  if (!(reps > 0) || !(weight > 0)) return 0
  return reps === 1 ? weight : weight * (1 + reps / 30)
}

/** Datum lokal als YYYY-MM-DD. */
export function isoDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const work = (s: WorkoutSetRow) => !s.is_warmup

/** Anzahl harter Saetze: Aufwaermsaetze zaehlen nicht, links/rechts desselben Satzes zaehlen einmal. */
export function hardSetCount(sets: WorkoutSetRow[]): number {
  return new Set(sets.filter(work).map((s) => `${s.session_id}|${s.exercise_key}|${s.set_no}`)).size
}

export const volumeOf = (sets: WorkoutSetRow[]) =>
  sets.filter(work).reduce((sum, s) => sum + s.weight_kg * s.reps, 0)

function startOf(sessions: SessionLike[]) {
  return new Map(sessions.map((s) => [s.id, new Date(s.started_at)]))
}

/** Saetze, deren Einheit im Zeitraum [from, to) gestartet wurde. */
export function setsInRange(sets: WorkoutSetRow[], sessions: SessionLike[], from: Date, to: Date): WorkoutSetRow[] {
  const at = startOf(sessions)
  return sets.filter((s) => {
    const t = at.get(s.session_id)?.getTime()
    return t !== undefined && t >= from.getTime() && t < to.getTime()
  })
}

export interface WeekTotals {
  start: Date
  sessions: number
  sets: number
  volume: number
}

/**
 * Kennzahlen der Woche, die bei `weeksAgo` Wochen vor der aktuellen beginnt (0 = diese Woche).
 * `untilSameTime`: nur bis zum gleichen Zeitpunkt der Woche (fairer Vergleich mitten in der Woche).
 */
export function weekTotals(
  sets: WorkoutSetRow[],
  sessions: SessionLike[],
  now: Date,
  weeksAgo = 0,
  untilSameTime = false,
): WeekTotals {
  const start = new Date(weekStart(now).getTime() - weeksAgo * 7 * DAY_MS)
  let end = new Date(start)
  end.setDate(end.getDate() + 7)
  if (untilSameTime) end = new Date(Math.min(end.getTime(), now.getTime() - weeksAgo * 7 * DAY_MS))
  const inWeek = setsInRange(sets, sessions, start, end)
  const ids = new Set(inWeek.filter(work).map((s) => s.session_id))
  return { start, sessions: ids.size, sets: hardSetCount(inWeek), volume: volumeOf(inWeek) }
}

/** Harte Saetze je primaerem Muskel in einer Woche (nur Muskeln mit Saetzen). */
export function hardSetsByMuscle(
  sets: WorkoutSetRow[],
  sessions: SessionLike[],
  plan: Plan,
  now: Date,
  weeksAgo = 0,
): Record<string, number> {
  const start = new Date(weekStart(now).getTime() - weeksAgo * 7 * DAY_MS)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  const out: Record<string, number> = {}
  const by = new Map<string, WorkoutSetRow[]>()
  for (const s of setsInRange(sets, sessions, start, end)) {
    const muscle = plan.exercises[s.exercise_key]?.primary_muscle
    if (!muscle) continue
    by.set(muscle, [...(by.get(muscle) ?? []), s])
  }
  for (const [m, list] of by) {
    const n = hardSetCount(list)
    if (n > 0) out[m] = n
  }
  return out
}

export interface SessionLog {
  sessionId: string
  startedAt: string
  sets: WorkoutSetRow[] // nur Arbeitssaetze, nach set_no (links vor rechts)
}

const sideOrder: Record<Side, number> = { both: 0, left: 1, right: 2 }

/** Alle Einheiten mit Arbeitssaetzen einer Uebung, aelteste zuerst. */
export function exerciseLogs(exerciseKey: string, sets: WorkoutSetRow[], sessions: SessionLike[]): SessionLog[] {
  const at = startOf(sessions)
  const by = new Map<string, WorkoutSetRow[]>()
  for (const s of sets) {
    if (s.exercise_key !== exerciseKey || !work(s) || !at.has(s.session_id)) continue
    by.set(s.session_id, [...(by.get(s.session_id) ?? []), s])
  }
  return [...by.entries()]
    .map(([sessionId, list]) => ({
      sessionId,
      startedAt: at.get(sessionId)!.toISOString(),
      sets: list.sort((a, b) => a.set_no - b.set_no || sideOrder[a.side] - sideOrder[b.side]),
    }))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

/** Letzte fruehere Einheit dieser Uebung (vor der aktuellen), zum Vergleichen. */
export function lastLog(
  exerciseKey: string,
  sets: WorkoutSetRow[],
  sessions: SessionLike[],
  currentSessionId: string | null,
  variant: { current: string | null; of: (sessionId: string) => string | null } | null = null,
): SessionLog | null {
  const cur = currentSessionId ? sessions.find((s) => s.id === currentSessionId)?.started_at : undefined
  const logs = exerciseLogs(exerciseKey, sets, sessions).filter(
    (l) => l.sessionId !== currentSessionId && (cur === undefined || l.startedAt < cur),
  )
  // Bei Tagen mit Variante zuerst die gleiche Variante, sonst die andere.
  const same = variant?.current ? logs.filter((l) => variant.of(l.sessionId) === variant.current) : []
  return (same.length ? same : logs).at(-1) ?? null
}

/** Ganze Tage zwischen zwei Zeitpunkten nach Kalendertag (nicht nach 24-h-Fenstern). */
export function daysBetween(fromIso: string, to: Date): number {
  const a = new Date(fromIso)
  const d0 = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const d1 = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((d1 - d0) / DAY_MS)
}

export type Trend = 'better' | 'same' | 'worse'

/** Vergleich zweier Saetze ueber das geschaetzte 1RM (Toleranz 0,5 %). */
export function compareSets(now: { weight: number; reps: number }, before: { weight_kg: number; reps: number }): Trend {
  const a = epley(now.weight, now.reps)
  const b = epley(before.weight_kg, before.reps)
  if (a > b * 1.005) return 'better'
  if (a < b * 0.995) return 'worse'
  return 'same'
}

export interface ExercisePoint {
  sessionId: string
  date: string // ISO
  e1rm: number // bester Satz der Einheit
  volume: number
  topWeight: number
  hardSets: number
}

export function exerciseHistory(exerciseKey: string, sets: WorkoutSetRow[], sessions: SessionLike[]): ExercisePoint[] {
  return exerciseLogs(exerciseKey, sets, sessions).map((l) => ({
    sessionId: l.sessionId,
    date: l.startedAt,
    e1rm: Math.max(...l.sets.map((s) => epley(s.weight_kg, s.reps))),
    volume: volumeOf(l.sets),
    topWeight: Math.max(...l.sets.map((s) => s.weight_kg)),
    hardSets: hardSetCount(l.sets),
  }))
}

export interface PersonalRecord {
  exerciseKey: string
  e1rm: number
  weight: number
  reps: number
  date: string
}

/** Bestes geschaetztes 1RM je Uebung (Aufwaermsaetze zaehlen nicht). Bei Gleichstand gilt der fruehere Satz. */
export function personalRecords(sets: WorkoutSetRow[], sessions: SessionLike[], plan: Plan): PersonalRecord[] {
  const at = startOf(sessions)
  const best = new Map<string, PersonalRecord>()
  for (const s of [...sets].sort((a, b) => a.logged_at.localeCompare(b.logged_at))) {
    if (!work(s) || !plan.exercises[s.exercise_key] || plan.exercises[s.exercise_key].unit === 'sec' || !at.has(s.session_id)) continue
    const e = epley(s.weight_kg, s.reps)
    const cur = best.get(s.exercise_key)
    if (e > 0 && (!cur || e > cur.e1rm + 1e-9))
      best.set(s.exercise_key, {
        exerciseKey: s.exercise_key,
        e1rm: e,
        weight: s.weight_kg,
        reps: s.reps,
        date: at.get(s.session_id)!.toISOString(),
      })
  }
  return [...best.values()].sort((a, b) => b.date.localeCompare(a.date))
}

export interface WeightPoint {
  date: string // YYYY-MM-DD
  kg: number
  avg7: number // Mittel der Messungen der letzten 7 Tage bis einschliesslich dieses Tages
}

export function bodyweightSeries(rows: BodyweightRow[]): WeightPoint[] {
  const sorted = [...rows].sort((a, b) => a.measured_on.localeCompare(b.measured_on))
  const t = (d: string) => new Date(`${d}T00:00:00Z`).getTime()
  return sorted.map((r) => {
    const win = sorted.filter((x) => t(x.measured_on) <= t(r.measured_on) && t(x.measured_on) > t(r.measured_on) - 7 * DAY_MS)
    return {
      date: r.measured_on,
      kg: r.weight_kg,
      avg7: Math.round((win.reduce((s, x) => s + x.weight_kg, 0) / win.length) * 100) / 100,
    }
  })
}

/** Deutsche Zahl mit hoechstens einer Nachkommastelle. */
export const fmtKg = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
export const fmtInt = (n: number) => Math.round(n).toLocaleString('de-DE')

export const MUSCLE_NAMES: Record<string, string> = {
  chest: 'Brust',
  back_mid: 'Mittlerer Rücken',
  lats: 'Latissimus',
  traps: 'Trapez',
  rear_delts: 'Hintere Schulter',
  side_delts: 'Seitliche Schulter',
  front_delts: 'Vordere Schulter',
  biceps: 'Bizeps',
  triceps: 'Trizeps',
  quads: 'Quadrizeps',
  hamstrings: 'Beinbeuger',
  calves: 'Waden',
}
