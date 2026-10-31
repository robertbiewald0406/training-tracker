import { epley, hardSetCount, MUSCLE_NAMES, setsInRange, UNCOUNTED_MUSCLES } from './stats'
import { describeSessionAdjustment, GRUND_TEXT } from './adjust'
import type { Plan } from './plan'
import type { BodyweightRow, SessionAdjustmentRow, WorkoutSetRow } from './types'

// Wochenbericht "Deine Woche": reine Auswertung der lokalen Daten, Woche = Montag bis Sonntag in Europe/Berlin.
// Dieselbe Definition wie spaeter serverseitig (Stufe 4), unabhaengig von der Zeitzone des Geraets.

export const TZ = 'Europe/Berlin'
/** Unterschiede unter diesem Anteil des Vergleichswerts gelten als "stabil". */
export const STABLE_PCT = 0.03
/** Nur Arbeitssaetze bis zu dieser Wiederholungszahl gehen in das geschaetzte 1RM ein. */
export const E1RM_MAX_REPS = 10
/** Vergleichswert: Schnitt der besten Wochenwerte der letzten BASELINE_WEEKS Wochen, mind. BASELINE_MIN davon mit Daten. */
export const BASELINE_WEEKS = 4
export const BASELINE_MIN = 2

/** Zielbereich harter Saetze pro Woche je primaerem Muskel (Richtwerte, hier anpassen). */
export const MUSCLE_TARGETS: Record<string, { min: number; max: number }> = {
  chest: { min: 10, max: 16 },
  back_mid: { min: 8, max: 14 },
  lats: { min: 6, max: 12 },
  traps: { min: 3, max: 8 },
  rear_delts: { min: 6, max: 12 },
  side_delts: { min: 8, max: 14 },
  front_delts: { min: 2, max: 6 },
  biceps: { min: 8, max: 14 },
  triceps: { min: 8, max: 14 },
  quads: { min: 8, max: 14 },
  hamstrings: { min: 8, max: 14 },
  calves: { min: 8, max: 14 },
  adductors: { min: 4, max: 8 },
  abductors: { min: 4, max: 8 },
}
const MUSCLE_LABELS = MUSCLE_NAMES

// ---------- Zeit (Europe/Berlin) ----------

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})
function parts(d: Date) {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, Number(x.value)]))
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second }
}

/** Versatz von Berlin zu UTC in ms zu einem Zeitpunkt (3.600.000 im Winter, 7.200.000 im Sommer). */
export function berlinOffsetMs(d: Date): number {
  const p = parts(d)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(d.getTime() / 1000) * 1000
}

const pad = (n: number) => String(n).padStart(2, '0')
/** Kalendertag in Berlin als YYYY-MM-DD. */
export function berlinDay(d: Date): string {
  const p = parts(d)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`
}
export function addDays(day: string, n: number): string {
  const t = new Date(`${day}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
/** Wochentag eines Kalendertags, 0 = Montag ... 6 = Sonntag. */
export const weekdayIndex = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7
/** Zeitpunkt, an dem der Kalendertag in Berlin beginnt (0:00 Uhr Ortszeit). */
export function berlinMidnight(day: string): Date {
  const utc = new Date(`${day}T00:00:00Z`).getTime()
  const first = utc - berlinOffsetMs(new Date(utc))
  return new Date(utc - berlinOffsetMs(new Date(first)))
}
/** Montag 0:00 Uhr (Berlin) der Woche, in der `d` liegt. */
export function berlinWeekStart(d: Date): Date {
  const day = berlinDay(d)
  return berlinMidnight(addDays(day, -weekdayIndex(day)))
}
/** Ende der Woche (naechster Montag 0:00 Uhr, Berlin), exklusiv. */
export function berlinWeekEnd(weekStart: Date): Date {
  return berlinMidnight(addDays(berlinDay(weekStart), 7))
}
export const shiftWeek = (weekStart: Date, weeks: number) => berlinMidnight(addDays(berlinDay(weekStart), 7 * weeks))
export const isBerlinSunday = (d: Date) => weekdayIndex(berlinDay(d)) === 6

/** ISO-Kalenderwoche der Woche (Donnerstag der Woche bestimmt das Jahr). */
export function isoWeek(weekStart: Date): { year: number; week: number } {
  const thu = new Date(`${addDays(berlinDay(weekStart), 3)}T00:00:00Z`)
  const year = thu.getUTCFullYear()
  const jan1 = Date.UTC(year, 0, 1)
  return { year, week: Math.floor((thu.getTime() - jan1) / 86_400_000 / 7) + 1 }
}

const DE_MONTHS = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.']
const fmtDay = (day: string, withMonth: boolean) => {
  const [, m, d] = day.split('-').map(Number)
  return withMonth ? `${d}. ${DE_MONTHS[m - 1]}` : `${d}.`
}
/** "KW 43 · 19. – 25. Okt. 2026" */
export function weekLabel(weekStart: Date): string {
  const a = berlinDay(weekStart)
  const b = addDays(a, 6)
  const { week } = isoWeek(weekStart)
  const sameMonth = a.slice(5, 7) === b.slice(5, 7)
  return `KW ${week} · ${fmtDay(a, !sameMonth)} – ${fmtDay(b, true)} ${b.slice(0, 4)}`
}

/** Die juengste Woche, fuer die ein Bericht gezeigt wird: am Sonntag (Berlin) die laufende, sonst die letzte volle Woche. */
export function latestReportWeek(now: Date): Date {
  const cur = berlinWeekStart(now)
  return isBerlinSunday(now) ? cur : shiftWeek(cur, -1)
}

// ---------- Auswertung ----------

interface SessionLike {
  id: string
  day_key: string
  started_at: string
}

export interface ProgressRow {
  key: string
  name: string
  current: number // bestes geschaetztes 1RM der Woche (kg)
  baseline: number | null // Schnitt der besten Wochenwerte der Vorwochen
  pct: number | null // (current - baseline) / baseline
  status: 'besser' | 'stabil' | 'darunter' | 'neu'
}
export interface RecordRow {
  key: string
  name: string
  e1rm: number
  previous: number
}
export interface MuscleRow {
  muscle: string
  label: string
  sets: number
  min: number
  max: number
  status: 'darunter' | 'im Bereich' | 'darueber'
}
export interface AdjustmentRow {
  id: string
  weekday: string // Mo ... So (Tag der Einheit)
  text: string
  typ: 'auslassen' | 'tauschen'
  grund: string | null
  note: string | null
  dauerhaft: boolean
}
export interface BodyweightSummary {
  avg: number | null // Mittel der Messungen der letzten 7 Tage bis Wochenende
  prevAvg: number | null // dasselbe eine Woche frueher
  delta: number | null
}
export interface WeekReport {
  weekStart: Date
  weekEnd: Date
  label: string
  trainingDays: { count: number; planned: number; weekdays: string[]; sessions: number }
  progress: { better: ProgressRow[]; stable: ProgressRow[]; below: ProgressRow[]; fresh: ProgressRow[] }
  records: RecordRow[]
  muscles: MuscleRow[]
  adjustments: AdjustmentRow[]
  bodyweight: BodyweightSummary
  sentences: Record<'training' | 'progress' | 'records' | 'muscles' | 'adjustments' | 'bodyweight', string>
}

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const round1 = (n: number) => Math.round(n * 10) / 10
const de1 = (n: number) => String(round1(n)).replace('.', ',')

/** Geschaetztes 1RM des Satzes (Epley): Arbeitssatz, bis E1RM_MAX_REPS Wdh., keine Zeituebung. Zaehlt nur das erste Segment (weight_kg/reps), nie das zweite aus note. */
function e1rmOf(s: WorkoutSetRow, plan: Plan): number {
  if (s.is_warmup || s.reps > E1RM_MAX_REPS || plan.exercises[s.exercise_key]?.unit === 'sec') return 0
  return epley(s.weight_kg, s.reps)
}

function bestByExercise(sets: WorkoutSetRow[], plan: Plan): Map<string, number> {
  const out = new Map<string, number>()
  for (const s of sets) {
    const e = e1rmOf(s, plan)
    if (e > 0 && e > (out.get(s.exercise_key) ?? 0)) out.set(s.exercise_key, e)
  }
  return out
}

/** Mittel der Koerpergewichtsmessungen der 7 Tage bis einschliesslich `endDay`; null ohne Messung. */
export function bodyweightAvg7(rows: BodyweightRow[], endDay: string): number | null {
  const from = addDays(endDay, -7)
  const win = rows.filter((r) => r.measured_on > from && r.measured_on <= endDay)
  return win.length ? win.reduce((s, r) => s + r.weight_kg, 0) / win.length : null
}

export function buildWeekReport(i: {
  plan: Plan
  sessions: SessionLike[]
  sets: WorkoutSetRow[]
  adjustments: SessionAdjustmentRow[]
  bodyweight: BodyweightRow[]
  weekStart: Date
}): WeekReport {
  const { plan, sessions, sets, adjustments, bodyweight } = i
  const start = i.weekStart
  const end = berlinWeekEnd(start)
  const nameOf = (k: string) => plan.exercises[k]?.name ?? k

  const inWeek = setsInRange(sets, sessions, start, end)
  const work = inWeek.filter((s) => !s.is_warmup)

  // Trainingstage: Berlin-Kalendertage mit mindestens einer Einheit, die Arbeitssaetze hat.
  const sessionWithSets = new Set(work.map((s) => s.session_id))
  const trained = sessions.filter(
    (s) => sessionWithSets.has(s.id) && new Date(s.started_at) >= start && new Date(s.started_at) < end,
  )
  const dayIdx = [...new Set(trained.map((s) => weekdayIndex(berlinDay(new Date(s.started_at)))))].sort((a, b) => a - b)
  const trainingDays = { count: dayIdx.length, planned: plan.days.length, weekdays: dayIdx.map((d) => WD[d]), sessions: trained.length }

  // Fortschritt: bestes 1RM der Woche gegen den Schnitt der besten Wochenwerte der Vorwochen.
  const weekBest = bestByExercise(work, plan)
  const prior = Array.from({ length: BASELINE_WEEKS }, (_, k) => {
    const from = shiftWeek(start, -(k + 1))
    return bestByExercise(setsInRange(sets, sessions, from, shiftWeek(start, -k)), plan)
  })
  const progress: WeekReport['progress'] = { better: [], stable: [], below: [], fresh: [] }
  for (const [key, current] of weekBest) {
    const vals = prior.map((m) => m.get(key)).filter((v): v is number => v !== undefined)
    if (vals.length < BASELINE_MIN) {
      progress.fresh.push({ key, name: nameOf(key), current, baseline: null, pct: null, status: 'neu' })
      continue
    }
    const baseline = vals.reduce((a, b) => a + b, 0) / vals.length
    const pct = (current - baseline) / baseline
    const status = pct >= STABLE_PCT - 1e-9 ? 'besser' : pct <= -STABLE_PCT + 1e-9 ? 'darunter' : 'stabil'
    const row: ProgressRow = { key, name: nameOf(key), current, baseline, pct, status }
    ;(status === 'besser' ? progress.better : status === 'darunter' ? progress.below : progress.stable).push(row)
  }
  progress.better.sort((a, b) => b.pct! - a.pct!)
  progress.below.sort((a, b) => a.pct! - b.pct!)
  progress.stable.sort((a, b) => a.name.localeCompare(b.name, 'de'))
  progress.fresh.sort((a, b) => a.name.localeCompare(b.name, 'de'))

  // Neue Rekorde: bestes 1RM der Woche liegt ueber allem davor (es muss etwas davor geben).
  const before = bestByExercise(
    setsInRange(sets, sessions, new Date(0), start),
    plan,
  )
  const records: RecordRow[] = []
  for (const [key, e1rm] of weekBest) {
    const previous = before.get(key)
    if (previous !== undefined && e1rm > previous + 1e-9) records.push({ key, name: nameOf(key), e1rm, previous })
  }
  records.sort((a, b) => b.e1rm / b.previous - a.e1rm / a.previous)

  // Saetze pro Muskel: harte Saetze nach primary_muscle, Zielbereich je Muskel; Bauch zaehlt nicht.
  const activeMuscles = new Set<string>()
  for (const d of plan.days) for (const it of d.items) activeMuscles.add(plan.exercises[it.exercise_key].primary_muscle)
  const by = new Map<string, WorkoutSetRow[]>()
  for (const s of work) {
    const m = plan.exercises[s.exercise_key]?.primary_muscle
    if (m && !UNCOUNTED_MUSCLES.has(m)) by.set(m, [...(by.get(m) ?? []), s])
  }
  const muscles: MuscleRow[] = Object.keys(MUSCLE_TARGETS)
    .filter((m) => activeMuscles.has(m) || by.has(m))
    .map((m) => {
      const n = by.has(m) ? hardSetCount(by.get(m)!) : 0
      const t = MUSCLE_TARGETS[m]
      return { muscle: m, label: MUSCLE_LABELS[m] ?? m, sets: n, min: t.min, max: t.max, status: n < t.min ? 'darunter' : n > t.max ? 'darueber' : 'im Bereich' } as MuscleRow
    })

  // Ausgelassen und getauscht (mit Grund). Verschieben zaehlt nicht.
  const sessionById = new Map(sessions.filter((s) => new Date(s.started_at) >= start && new Date(s.started_at) < end).map((s) => [s.id, s]))
  const adj: AdjustmentRow[] = adjustments
    .filter((a) => a.typ !== 'reihenfolge' && sessionById.has(a.session_id))
    .sort((a, b) => a.logged_at.localeCompare(b.logged_at))
    .map((a) => ({
      id: a.id,
      weekday: WD[weekdayIndex(berlinDay(new Date(sessionById.get(a.session_id)!.started_at)))],
      text: describeSessionAdjustment(a, plan),
      typ: a.typ as 'auslassen' | 'tauschen',
      grund: a.grund ? GRUND_TEXT[a.grund] : null,
      note: a.note,
      dauerhaft: a.dauerhaft,
    }))

  // Koerpergewicht: 7-Tage-Mittel zum Wochenende gegen eine Woche frueher.
  const lastDay = addDays(berlinDay(start), 6)
  const avg = bodyweightAvg7(bodyweight, lastDay)
  const prevAvg = bodyweightAvg7(bodyweight, addDays(lastDay, -7))
  const bw: BodyweightSummary = { avg, prevAvg, delta: avg !== null && prevAvg !== null ? avg - prevAvg : null }

  const report: WeekReport = {
    weekStart: start,
    weekEnd: end,
    label: weekLabel(start),
    trainingDays,
    progress,
    records,
    muscles,
    adjustments: adj,
    bodyweight: bw,
    sentences: { training: '', progress: '', records: '', muscles: '', adjustments: '', bodyweight: '' },
  }
  report.sentences = summarize(report)
  return report
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Ein kurzer, sachlicher Satz je Abschnitt: sagt, was die Zahlen bedeuten, ohne zu uebertreiben. */
export function summarize(r: WeekReport): WeekReport['sentences'] {
  const t = r.trainingDays
  const training =
    t.count === 0
      ? 'In dieser Woche ist kein Training erfasst.'
      : `${t.count} von ${t.planned} geplanten Tagen trainiert${t.sessions > t.count ? ` (${t.sessions} Einheiten)` : ''}.`

  const p = r.progress
  const compared = p.better.length + p.stable.length + p.below.length
  const progress =
    compared === 0
      ? p.fresh.length
        ? 'Noch zu wenige Vorwochen für einen Vergleich.'
        : 'Keine Arbeitssätze bis 10 Wiederholungen für einen Vergleich.'
      : `Bei ${plural(p.better.length, 'Übung', 'Übungen')} liegt das geschätzte 1RM mindestens 3 % über dem Schnitt der letzten Wochen, ` +
        `bei ${p.stable.length} ist es etwa gleich` +
        (p.below.length ? `, bei ${p.below.length} mindestens 3 % darunter.` : '.')

  const records = r.records.length
    ? `${plural(r.records.length, 'neuer Bestwert', 'neue Bestwerte')} beim geschätzten 1RM.`
    : 'Keine neuen Bestwerte in dieser Woche.'

  const under = r.muscles.filter((m) => m.status === 'darunter')
  const over = r.muscles.filter((m) => m.status === 'darueber')
  const inRange = r.muscles.length - under.length - over.length
  const list = (rows: MuscleRow[]) => rows.map((m) => m.label).join(', ')
  const muscles =
    r.muscles.length === 0
      ? 'Keine Sätze erfasst.'
      : `${inRange} von ${r.muscles.length} Muskelgruppen im Zielbereich` +
        (under.length ? `; darunter: ${list(under)}` : '') +
        (over.length ? `; darüber: ${list(over)}` : '') +
        '.'

  const skipped = r.adjustments.filter((a) => a.typ === 'auslassen').length
  const swapped = r.adjustments.filter((a) => a.typ === 'tauschen').length
  const reasons = new Map<string, number>()
  for (const a of r.adjustments) if (a.grund) reasons.set(a.grund, (reasons.get(a.grund) ?? 0) + 1)
  const top = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0]
  const adjustments =
    skipped + swapped === 0
      ? 'Nichts ausgelassen oder getauscht.'
      : `${plural(skipped, 'Übung', 'Übungen')} ausgelassen, ${swapped} getauscht` + (top ? `; häufigster Grund: ${top[0]}.` : '.')

  const b = r.bodyweight
  const bodyweight =
    b.avg === null
      ? 'Keine Messung in den letzten 7 Tagen.'
      : `7-Tage-Mittel ${de1(b.avg)} kg` +
        (b.delta === null
          ? '.'
          : Math.abs(b.delta) < 0.2
            ? ', praktisch unverändert zur Vorwoche.'
            : `, ${de1(Math.abs(b.delta))} kg ${b.delta > 0 ? 'mehr' : 'weniger'} als eine Woche zuvor.`)

  return { training, progress, records, muscles, adjustments, bodyweight }
}
