import type { Exercise, Plan, PlanDay, PlanItem } from './plan'
import type { Side, WorkoutSetRow } from './types'

interface SessionLike {
  id: string
  day_key: string
  started_at: string
  ended_at: string | null
}
type SetLike = WorkoutSetRow

const DAY_MS = 86_400_000

export const POSITION_PREFIX = 'position:'

/** Offene Einheit (ended_at = null, Tag aus dem Plan); bei mehreren die neueste. Keine offene Einheit = Startseite. */
export function activeSession<T extends SessionLike>(sessions: T[], plan: Plan): T | undefined {
  return sessions
    .filter((s) => s.ended_at === null && planDayForKey(s.day_key, plan))
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
}

/** Gemerkte Positionen (meta-Keys "position:<sessionId>"), deren Session lokal fehlt oder beendet ist. */
export function stalePositionKeys(metaKeys: string[], sessions: SessionLike[]): string[] {
  const open = new Set(sessions.filter((s) => s.ended_at === null).map((s) => s.id))
  return metaKeys.filter((k) => k.startsWith(POSITION_PREFIX) && !open.has(k.slice(POSITION_PREFIX.length)))
}

/** day_key einer Einheit gehoert zum Plan-Tag: exakt oder (Tage mit Rotation) Praefix "<key>_<variante>". */
export function dayKeyMatches(dayKey: string, day: PlanDay): boolean {
  if (dayKey === day.key) return true
  return Boolean(day.rotation) && day.rotation!.variants.some((v) => dayKey === `${day.key}_${v.toLowerCase()}`)
}

export function planDayForKey(dayKey: string, plan: Plan): PlanDay | undefined {
  return plan.days.find((d) => dayKeyMatches(dayKey, d))
}

/** day_key, unter dem eine Einheit gespeichert wird (mit Variante: "mi_beine_a"). */
export function sessionDayKey(day: PlanDay, variant: string | null): string {
  return day.rotation && variant ? `${day.key}_${variant.toLowerCase()}` : day.key
}

/** Variante einer gespeicherten Einheit ("mi_beine_b" -> "B"); null ohne Rotation oder Variante. */
export function variantOfKey(dayKey: string, plan: Plan): string | null {
  const day = planDayForKey(dayKey, plan)
  if (!day?.rotation || dayKey === day.key) return null
  return day.rotation.variants.find((v) => dayKey === `${day.key}_${v.toLowerCase()}`) ?? null
}

/** Variante nach Paritaet: gerade Zahl abgeschlossener Einheiten dieses Tages = erste (A), ungerade = zweite (B). */
export function defaultVariant(day: PlanDay, sessions: SessionLike[]): string | null {
  if (!day.rotation) return null
  const done = sessions.filter((s) => s.ended_at !== null && dayKeyMatches(s.day_key, day)).length
  const vs = day.rotation.variants
  return vs[done % vs.length]
}

export function otherVariant(day: PlanDay, variant: string): string {
  const vs = day.rotation!.variants
  return vs[(vs.indexOf(variant) + 1) % vs.length]
}

/** Kurzes Etikett ohne Klammerzusatz ("Vorne (Quads)" -> "Vorne"). */
export const variantShort = (day: PlanDay, v: string) => (day.rotation?.labels[v] ?? v).replace(/\s*\(.*\)\s*$/, '')

/** Tag mit nur den Uebungen der Variante (Items ohne variant immer). Positionen beziehen sich auf diese Liste. */
export function dayForVariant(day: PlanDay, variant: string | null): PlanDay {
  if (!day.rotation) return day
  return { ...day, items: day.items.filter((i) => !i.variant || i.variant === variant) }
}

/** Plan-Tag zu einer gespeicherten Einheit (mit Variante gefiltert). */
export function resolveSessionDay(dayKey: string, plan: Plan): PlanDay | undefined {
  const day = planDayForKey(dayKey, plan)
  return day && dayForVariant(day, variantOfKey(dayKey, plan))
}

/** Plan-Tag nach Wochentag des Geraets (1 = Montag ... 5 = Freitag). Samstag/Sonntag: null (Lauftag). */
export function planDayForDate(date: Date, plan: Plan): PlanDay | null {
  const wd = date.getDay() // 0 = Sonntag
  if (wd === 0 || wd === 6) return null
  return plan.days.find((d) => d.weekday === wd) ?? null
}

/** Montag 00:00 (lokal) der Woche von `date`. */
export function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

/** Wochenuebersicht Mo-Fr: erledigt = in dieser Woche gestartete Einheit des Tages mit ended_at. */
export function weekOverview(plan: Plan, sessions: SessionLike[], now: Date) {
  const start = weekStart(now).getTime()
  const end = start + 7 * DAY_MS
  return plan.days.map((day) => ({
    day,
    done: sessions.some((s) => {
      const t = new Date(s.started_at).getTime()
      return dayKeyMatches(s.day_key, day) && s.ended_at !== null && t >= start && t < end
    }),
  }))
}

/** Ramp-up: aktiv ohne Plan-Einheit oder innerhalb von weeks*7 Tagen ab der ersten Plan-Einheit. weeks = 0: aus. */
export function isRampUp(now: Date, sessions: SessionLike[], plan: Plan): boolean {
  if (!(plan.ramp_up.weeks > 0)) return false
  const times = sessions.filter((s) => planDayForKey(s.day_key, plan)).map((s) => new Date(s.started_at).getTime())
  if (!times.length) return true
  return now.getTime() < Math.min(...times) + plan.ramp_up.weeks * 7 * DAY_MS
}

/** Satzzahl: im Ramp-up ein Satz weniger (mindestens min_sets), nie mehr als geplant. */
export function setsFor(item: PlanItem, rampUp: boolean, plan: Plan): number {
  if (!rampUp) return item.sets
  return Math.min(item.sets, Math.max(plan.ramp_up.min_sets, item.sets - plan.ramp_up.sets_minus))
}

const byTime = (a: SetLike, b: SetLike) => a.logged_at.localeCompare(b.logged_at)

/**
 * Vorbelegung: letzter Arbeitssatz derselben Uebung (und Seite). Zuerst aus der laufenden Einheit,
 * sonst aus der letzten frueheren Einheit. Aufwaermsaetze zaehlen nicht.
 */
export function prefill(
  exerciseKey: string,
  side: Side,
  sets: SetLike[],
  sessions: SessionLike[],
  currentSessionId: string | null,
  variant: { current: string | null; of: (sessionId: string) => string | null } | null = null,
): { weight_kg: number; reps: number } | null {
  const mine = sets.filter((s) => s.exercise_key === exerciseKey && s.side === side && !s.is_warmup)
  const pick = (list: SetLike[]) => (list.length ? [...list].sort(byTime).at(-1)! : null)

  const cur = pick(mine.filter((s) => s.session_id === currentSessionId))
  if (cur) return { weight_kg: cur.weight_kg, reps: cur.reps }

  const startedAt = new Map(sessions.map((s) => [s.id, s.started_at]))
  let earlier = mine.filter((s) => s.session_id !== currentSessionId && startedAt.has(s.session_id))
  // Zuerst die gleiche Variante, sonst die andere.
  if (variant?.current) {
    const same = earlier.filter((s) => variant.of(s.session_id) === variant.current)
    if (same.length) earlier = same
  }
  const lastSession = [...new Set(earlier.map((s) => s.session_id))].sort((a, b) =>
    startedAt.get(a)!.localeCompare(startedAt.get(b)!),
  ).at(-1)
  const prev = lastSession ? pick(earlier.filter((s) => s.session_id === lastSession)) : null
  return prev ? { weight_kg: prev.weight_kg, reps: prev.reps } : null
}

/** Variantenabgleich fuer Vorbelegung und "Letztes Mal": aktuelle Variante plus Zuordnung Einheit -> Variante. */
export function variantMatch(current: string | null, sessions: SessionLike[], plan: Plan) {
  const byId = new Map(sessions.map((s) => [s.id, variantOfKey(s.day_key, plan)]))
  return { current, of: (id: string) => byId.get(id) ?? null }
}

/** Beschriftung des Gewichtsfelds nach equipment: Plate-Loaded = Platten pro Seite, Stack/Kabel/Maschine = Stack. */
export function weightUnit(ex: Exercise): string {
  const t = `${ex.equipment} ${ex.attachment}`
  if (/Kurzhantel/i.test(t)) return 'kg pro Hand'
  if (/Plate/i.test(ex.equipment)) return 'kg Platten pro Seite'
  if (/Stack|Kabel|Maschine/i.test(ex.equipment)) return 'kg Stack'
  return 'kg'
}

/** Anzeige-Einheit einer Uebung: Zeituebungen in Sekunden, sonst Wiederholungen. */
export const repsUnit = (ex: Exercise) => (ex.unit === 'sec' ? 's' : 'Wdh.')
export const isTimed = (ex: Exercise) => ex.unit === 'sec'

/**
 * Startwerte des Satz-Editors: letzter Satz (prefill), sonst bei Koerpergewicht/Zeit Zusatzgewicht 0
 * (Zeituebung: Dauer = untere Grenze), sonst leer.
 */
export function startValues(
  ex: Exercise,
  item: PlanItem,
  prefilled: { weight_kg: number; reps: number } | null,
): { weight_kg: number; reps: number | null } | null {
  if (prefilled) return prefilled
  if (ex.bodyweight || isTimed(ex)) return { weight_kg: 0, reps: isTimed(ex) ? item.rep_min : null }
  return null
}

/** Naechste set_no fuer eine Uebung in der Einheit (Aufwaermsaetze zaehlen mit, links/rechts teilen sich eine). */
export function nextSetNo(sets: SetLike[], sessionId: string, exerciseKey: string): number {
  const nos = sets.filter((s) => s.session_id === sessionId && s.exercise_key === exerciseKey).map((s) => s.set_no)
  return nos.length ? Math.max(...nos) + 1 : 1
}

/**
 * Erledigte Arbeitssaetze in einer Satzliste (Aufwaermsaetze zaehlen nicht).
 * Einseitig: ein Satz zaehlt erst, wenn links und rechts da sind.
 */
export function workingSetCount(sets: SetLike[], unilateral: boolean): number {
  const work = sets.filter((s) => !s.is_warmup)
  if (!unilateral) return work.length
  const sides = new Map<string, Set<Side>>()
  for (const s of work) {
    const k = `${s.exercise_key}#${s.set_no}`
    sides.set(k, (sides.get(k) ?? new Set()).add(s.side))
  }
  return [...sides.values()].filter((v) => v.has('left') && v.has('right')).length
}

/** Einseitig: Wurde links gespeichert, fehlt aber rechts, liefert das die offene rechte Seite. */
export function pendingRightSide(
  sets: SetLike[],
  sessionId: string,
  exerciseKey: string,
): { setNo: number; isWarmup: boolean; weight_kg: number; reps: number } | null {
  const mine = sets.filter((s) => s.session_id === sessionId && s.exercise_key === exerciseKey)
  const lefts = mine.filter((s) => s.side === 'left').sort((a, b) => b.set_no - a.set_no)
  for (const l of lefts) {
    if (!mine.some((s) => s.side === 'right' && s.set_no === l.set_no))
      return { setNo: l.set_no, isWarmup: l.is_warmup, weight_kg: l.weight_kg, reps: l.reps }
  }
  return null
}

export interface BuildSetInput {
  sessionId: string
  exerciseKey: string
  setNo: number
  weight_kg: number
  reps: number
  warmup: boolean
  failure: boolean // "Bis Versagen": rir = 0, sonst null
  side: Side
  now?: Date
}
export function buildSetRow(i: BuildSetInput): WorkoutSetRow {
  return {
    id: crypto.randomUUID(),
    session_id: i.sessionId,
    exercise_key: i.exerciseKey,
    set_no: i.setNo,
    weight_kg: Math.round(i.weight_kg * 100) / 100,
    reps: i.reps,
    rir: i.failure ? 0 : null,
    is_warmup: i.warmup,
    side: i.side,
    logged_at: (i.now ?? new Date()).toISOString(),
    note: null,
  }
}

export interface Position {
  itemIdx: number
  chosen: Record<number, string> // gewaehlte Variante je Plan-Position (Hauptuebung oder Alternative)
  assign: Record<string, number> // Satz-id -> Plan-Position (Alternativen sind teils selbst Plan-Uebungen)
  restEndsAt?: number // Pausentimer (ms-Zeitstempel)
}

/** Ohne gespeicherte Zuordnung: erste Position mit passendem Hauptschluessel, sonst erste mit passender Alternative. */
function heuristicIdx(day: PlanDay, plan: Plan, key: string): number {
  const own = day.items.findIndex((i) => i.exercise_key === key)
  if (own >= 0) return own
  return day.items.findIndex((i) => plan.exercises[i.exercise_key].alternatives.includes(key))
}

/** Saetze der Einheit je Plan-Position (nach gespeicherter Zuordnung, sonst Heuristik). */
export function setsByPosition(
  day: PlanDay,
  plan: Plan,
  sets: SetLike[],
  sessionId: string,
  assign: Record<string, number> = {},
): SetLike[][] {
  const out: SetLike[][] = day.items.map(() => [])
  for (const s of sets) {
    if (s.session_id !== sessionId) continue
    const idx = assign[s.id] ?? heuristicIdx(day, plan, s.exercise_key)
    if (idx >= 0 && idx < out.length) out[idx].push(s)
  }
  return out
}

/** Erledigte Arbeitssaetze an Position idx (beruecksichtigt einseitige Paare). */
export function positionDone(day: PlanDay, plan: Plan, positionSets: SetLike[], idx: number): number {
  const used = positionSets.slice().sort(byTime).at(-1)?.exercise_key ?? day.items[idx].exercise_key
  return workingSetCount(positionSets, Boolean(plan.exercises[used].unilateral))
}

/** Position aus den gespeicherten Saetzen ableiten (erste noch nicht fertige Uebung). */
export function derivePosition(
  day: PlanDay,
  sets: SetLike[],
  sessionId: string,
  rampUp: boolean,
  plan: Plan,
  assign: Record<string, number> = {},
): Position {
  const per = setsByPosition(day, plan, sets, sessionId, assign)
  const chosen: Record<number, string> = {}
  let itemIdx = day.items.length
  day.items.forEach((item, idx) => {
    const last = per[idx].slice().sort(byTime).at(-1)
    if (last) chosen[idx] = last.exercise_key
    if (positionDone(day, plan, per[idx], idx) < setsFor(item, rampUp, plan) && itemIdx === day.items.length)
      itemIdx = idx
  })
  return { itemIdx, chosen, assign }
}

/** Gespeicherte Position hat Vorrang (Nutzer war evtl. bewusst bei einer anderen Uebung), sonst abgeleitet. */
export function resolvePosition(stored: Position | undefined, derived: Position, itemCount: number): Position {
  if (!stored || stored.itemIdx < 0 || stored.itemIdx > itemCount) return derived
  return {
    ...derived,
    ...stored,
    chosen: { ...derived.chosen, ...stored.chosen },
    assign: { ...derived.assign, ...stored.assign },
  }
}

/** Zahl aus Eingabe ("42,5" oder "42.5"); leer/ungueltig = null. */
export function parseNumber(v: string): number | null {
  const n = Number(v.trim().replace(',', '.'))
  return v.trim() === '' || !Number.isFinite(n) ? null : n
}
export const formatNumber = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')
