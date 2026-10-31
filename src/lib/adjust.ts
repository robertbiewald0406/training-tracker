import { dayForVariant, planDayForKey, setsByPosition, variantOfKey, type Position } from './logger'
import type { Plan, PlanDay, PlanItem } from './plan'
import type { AdjustGrund, AdjustTyp, PlanOverrideRow, SessionAdjustmentRow, WorkoutSetRow } from './types'

// Anpassungen von Plan-Tagen: "nur heute" (session_adjustment, nur diese Einheit) und "dauerhaft"
// (plan_override, wird beim Laden ueber plan.json gelegt). plan.json selbst bleibt unveraendert.

export interface Adjust {
  typ: AdjustTyp
  original_key: string
  neuer_key: string | null
  position: number | null
}

export const GRUENDE: { value: AdjustGrund; text: string }[] = [
  { value: 'schmerz', text: 'Schmerz' },
  { value: 'geraet_belegt', text: 'Gerät belegt' },
  { value: 'zeit', text: 'Zeit' },
  { value: 'anderes', text: 'Anderes' },
]
export const GRUND_TEXT: Record<AdjustGrund, string> = {
  schmerz: 'Schmerz',
  geraet_belegt: 'Gerät belegt',
  zeit: 'Zeit',
  anderes: 'Anderes',
}
export const NOTE_MAX = 200

/**
 * Legt Anpassungen der Reihe nach auf eine Uebungsliste (Positionen beziehen sich auf die Liste zum Zeitpunkt der
 * Anpassung). Unbekannte oder stillgelegte Zieluebungen, Doppelte und Anpassungen an fehlenden Uebungen werden ignoriert.
 */
export function applyAdjustments(items: PlanItem[], list: Adjust[], plan: Plan): PlanItem[] {
  let out = items.slice()
  for (const a of list) {
    const i = out.findIndex((x) => x.exercise_key === a.original_key)
    if (i < 0) continue
    if (a.typ === 'auslassen') out.splice(i, 1)
    else if (a.typ === 'tauschen') {
      const to = a.neuer_key
      if (!to || !plan.exercises[to] || plan.exercises[to].retired || out.some((x) => x.exercise_key === to)) continue
      out[i] = { ...out[i], exercise_key: to }
    } else if (a.position !== null) {
      const [it] = out.splice(i, 1)
      out.splice(Math.max(0, Math.min(out.length, a.position)), 0, it)
    }
  }
  return out
}

const byCreated = (a: PlanOverrideRow, b: PlanOverrideRow) => a.created_at.localeCompare(b.created_at)
const byLogged = (a: SessionAdjustmentRow, b: SessionAdjustmentRow) => a.logged_at.localeCompare(b.logged_at)

/**
 * Wirksamer Tag: Plan-Tag (mit Variante) + dauerhafte Anpassungen dieses Tages + "nur heute"-Anpassungen der Einheit.
 * Dauerhafte Anpassungen einer Einheit stehen schon in plan_override und werden nicht doppelt angewendet.
 */
export function effectiveDay(
  day: PlanDay,
  variant: string | null,
  plan: Plan,
  overrides: PlanOverrideRow[],
  adjustments: SessionAdjustmentRow[] = [],
): PlanDay {
  const base = dayForVariant(day, variant)
  const perm = overrides.filter((o) => o.day_key === day.key).sort(byCreated)
  const today = adjustments.filter((a) => !a.dauerhaft).sort(byLogged)
  const items = applyAdjustments(applyAdjustments(base.items, perm.map(toAdjust), plan), today, plan)
  return { ...base, items }
}

const toAdjust = (r: { typ: AdjustTyp; neuer_key: string | null; position: number | null } & ({ exercise_key: string } | { original_key: string })): Adjust => ({
  typ: r.typ,
  original_key: 'exercise_key' in r ? r.exercise_key : r.original_key,
  neuer_key: r.neuer_key,
  position: r.position,
})

/** Wirksamer Tag einer gespeicherten Einheit; undefined, wenn der Plan-Tag nicht mehr existiert. */
export function effectiveSessionDay(
  session: { id: string; day_key: string },
  plan: Plan,
  overrides: PlanOverrideRow[],
  adjustments: SessionAdjustmentRow[],
): PlanDay | undefined {
  const day = planDayForKey(session.day_key, plan)
  if (!day) return undefined
  return effectiveDay(
    day,
    variantOfKey(session.day_key, plan),
    plan,
    overrides,
    adjustments.filter((a) => a.session_id === session.id),
  )
}

/** Zielposition fuer "Nach oben" / "Nach unten"; null am Rand der Liste. */
export function moveTarget(items: PlanItem[], key: string, dir: 'up' | 'down'): number | null {
  const i = items.findIndex((x) => x.exercise_key === key)
  if (i < 0) return null
  const to = dir === 'up' ? i - 1 : i + 1
  return to < 0 || to >= items.length ? null : to
}

/** Auswahl beim Tauschen: zuerst die Alternativen der Uebung, dann der restliche Katalog. Ohne stillgelegte und ohne Uebungen, die schon im Tag stehen. */
export function swapChoices(plan: Plan, items: PlanItem[], key: string): { alternatives: string[]; others: string[] } {
  const inDay = new Set(items.map((i) => i.exercise_key))
  const ok = (k: string) => Boolean(plan.exercises[k]) && !plan.exercises[k].retired && !inDay.has(k) && k !== key
  const alternatives = (plan.exercises[key]?.alternatives ?? []).filter(ok)
  const others = Object.keys(plan.exercises)
    .filter((k) => ok(k) && !alternatives.includes(k))
    .sort((a, b) => plan.exercises[a].name.localeCompare(plan.exercises[b].name, 'de'))
  return { alternatives, others }
}

/**
 * Ordnet jeden Satz der Einheit ausdruecklich seiner Position zu (auch die, die nur ueber die Alternativen-Heuristik
 * zugeordnet waeren). Vor remapPosition aufrufen, damit Saetze einer ausgelassenen oder getauschten Uebung nicht ueber
 * die Heuristik an einer neuen Position landen.
 */
export function withFullAssign(pos: Position, day: PlanDay, plan: Plan, sets: WorkoutSetRow[], sessionId: string): Position {
  const assign = { ...pos.assign }
  setsByPosition(day, plan, sets, sessionId, pos.assign).forEach((list, idx) => {
    for (const s of list) assign[s.id] = idx
  })
  return { ...pos, assign }
}

/**
 * Position der laufenden Einheit nach einer Aenderung der Uebungsliste neu zuordnen (Uebungen werden ueber ihren Key
 * wiedergefunden). Saetze einer ausgelassenen oder getauschten Uebung gehoeren zu keiner Position mehr (bleiben aber
 * gespeichert und zaehlen in der Statistik). `follow`: Key, dem die aktuelle Position folgt, wenn die bisherige Uebung fehlt.
 */
export function remapPosition(pos: Position, oldItems: PlanItem[], newItems: PlanItem[], follow?: string): Position {
  const map = oldItems.map((o) => newItems.findIndex((n) => n.exercise_key === o.exercise_key))
  const chosen: Record<number, string> = {}
  for (const [i, k] of Object.entries(pos.chosen)) if (map[Number(i)] >= 0) chosen[map[Number(i)]] = k
  const assign: Record<string, number> = {}
  for (const [id, i] of Object.entries(pos.assign)) assign[id] = i >= 0 && i < map.length ? map[i] : -1
  let itemIdx = newItems.length
  if (pos.itemIdx < oldItems.length) {
    const at = map[pos.itemIdx]
    const fi = follow ? newItems.findIndex((n) => n.exercise_key === follow) : -1
    itemIdx = at >= 0 ? at : fi >= 0 ? fi : Math.min(pos.itemIdx, newItems.length)
  }
  return { ...pos, itemIdx, chosen, assign }
}

const clean = (note: string | null | undefined) => {
  const t = (note ?? '').trim().slice(0, NOTE_MAX)
  return t === '' ? null : t
}

export interface BuildAdjustmentInput {
  sessionId: string
  typ: AdjustTyp
  original_key: string
  neuer_key?: string | null
  position?: number | null
  grund?: AdjustGrund | null
  note?: string | null
  dauerhaft: boolean
  now?: Date
}
export function buildAdjustment(i: BuildAdjustmentInput): SessionAdjustmentRow {
  return {
    id: crypto.randomUUID(),
    session_id: i.sessionId,
    typ: i.typ,
    original_key: i.original_key,
    neuer_key: i.typ === 'tauschen' ? (i.neuer_key ?? null) : null,
    position: i.typ === 'reihenfolge' ? (i.position ?? null) : null,
    grund: i.grund ?? null,
    note: clean(i.note),
    dauerhaft: i.dauerhaft,
    logged_at: (i.now ?? new Date()).toISOString(),
  }
}

export function buildOverride(i: {
  dayKey: string
  typ: AdjustTyp
  exercise_key: string
  neuer_key?: string | null
  position?: number | null
  now?: Date
}): PlanOverrideRow {
  return {
    id: crypto.randomUUID(),
    day_key: i.dayKey,
    typ: i.typ,
    exercise_key: i.exercise_key,
    neuer_key: i.typ === 'tauschen' ? (i.neuer_key ?? null) : null,
    position: i.typ === 'reihenfolge' ? (i.position ?? null) : null,
    created_at: (i.now ?? new Date()).toISOString(),
  }
}

/** Kurzbeschreibung einer Anpassung ("Hack Squat ausgelassen", "A getauscht gegen B", "A nach Position 2"). */
export function describeAdjust(a: Adjust, plan: Plan): string {
  const name = (k: string | null) => (k && plan.exercises[k]?.name) || k || '?'
  if (a.typ === 'auslassen') return `${name(a.original_key)} ausgelassen`
  if (a.typ === 'tauschen') return `${name(a.original_key)} getauscht gegen ${name(a.neuer_key)}`
  return `${name(a.original_key)} auf Position ${(a.position ?? 0) + 1}`
}

export function describeOverride(o: PlanOverrideRow, plan: Plan): { day: string; text: string } {
  return {
    day: plan.days.find((d) => d.key === o.day_key)?.name ?? o.day_key,
    text: describeAdjust(toAdjust(o), plan),
  }
}

export const describeSessionAdjustment = (a: SessionAdjustmentRow, plan: Plan) => describeAdjust(toAdjust(a), plan)
