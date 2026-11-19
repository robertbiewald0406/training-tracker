import type { Exercise, Plan } from './plan'
import { MUSCLE_NAMES } from './stats'

// Katalog, Suche und Tastatursteuerung des ExercisePicker. Reine Funktionen, ohne UI.

/** Reihenfolge der Muskelgruppen in Listen und Filtern (Oberkoerper vorn, dann Beine). */
export const MUSCLE_ORDER = [
  'chest', 'front_delts', 'side_delts', 'rear_delts', 'triceps', 'biceps', 'lats', 'back_mid', 'traps',
  'quads', 'hamstrings', 'adductors', 'abductors', 'calves',
]
export const muscleLabel = (m: string) => MUSCLE_NAMES[m] ?? m
const muscleRank = (m: string) => {
  const i = MUSCLE_ORDER.indexOf(m)
  return i < 0 ? MUSCLE_ORDER.length : i
}

/** Kleinschreibung ohne Akzente: "Rücken" -> "rucken", "Fuß" -> "fuss". */
export const fold = (s: string) =>
  s.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '')
/** Umlaute als Doppelbuchstaben: "Rücken" -> "ruecken". So findet auch "ruecken" den Rücken. */
export const foldExpanded = (s: string) =>
  s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '')
const variants = (s: string) => [fold(s), foldExpanded(s)]

/** Gerätegruppe für den Filter: "Plate-Loaded oder MTS" -> "Plate-Loaded", "Kurzhanteln, Schrägbank" -> "Kurzhanteln". */
export function equipmentGroup(equipment: string): string {
  if (/Kabel/i.test(equipment)) return 'Kabelzug'
  if (/Kurzhantel/i.test(equipment)) return 'Kurzhanteln'
  if (/Plate/i.test(equipment)) return 'Plate-Loaded'
  if (/Stack/i.test(equipment)) return 'Stack'
  if (/Maschine/i.test(equipment)) return 'Maschine'
  return equipment.split(/[ ,]/)[0] || equipment
}

export interface Entry {
  key: string
  ex: Exercise
  muscle: string
  muscleLabel: string
  group: string // Gerätegruppe
  nameHay: string[]
  hay: string[] // Name, Gerät, Aufsatz, Muskelgruppe (deutsche Bezeichnung)
}

/** Alle Übungen, die nicht stillgelegt sind (auch solche, die in keinem Tag stehen), ohne `exclude`. */
export function catalog(plan: Plan, exclude: string[] = []): Entry[] {
  const skip = new Set(exclude)
  return Object.entries(plan.exercises)
    .filter(([key, ex]) => !ex.retired && !skip.has(key))
    .map(([key, ex]) => {
      const label = muscleLabel(ex.primary_muscle)
      const all = `${ex.name} ${ex.equipment} ${ex.attachment} ${label}` // nur, was auch angezeigt wird
      return {
        key, ex, muscle: ex.primary_muscle, muscleLabel: label, group: equipmentGroup(ex.equipment),
        nameHay: variants(ex.name), hay: variants(all),
      }
    })
}

export const muscleOptions = (plan: Plan, exclude: string[] = []) =>
  [...new Set(catalog(plan, exclude).map((e) => e.muscle))]
    .sort((a, b) => muscleRank(a) - muscleRank(b) || muscleLabel(a).localeCompare(muscleLabel(b), 'de'))
    .map((m) => ({ value: m, text: muscleLabel(m) }))

export const equipmentOptions = (plan: Plan, exclude: string[] = []) =>
  [...new Set(catalog(plan, exclude).map((e) => e.group))].sort((a, b) => a.localeCompare(b, 'de')).map((g) => ({ value: g, text: g }))

export interface SearchOptions {
  query?: string
  muscle?: string | null
  equipment?: string | null
  exclude?: string[]
  /** Aktuelle Übung: ihre Alternativen stehen ohne Eingabe zuerst. */
  current?: string | null
}
export interface Result {
  key: string
  /** 'alternativen', sonst der Muskel (ohne Eingabe, für Zwischenüberschriften); leer bei einer Suche. */
  group: string
}

const hit = (hay: string[], word: string) => variants(word).some((w) => hay.some((h) => h.includes(w)))

/**
 * Suche in Name, Gerät, Aufsatz und Hauptmuskel: Groß-/Kleinschreibung und Umlaute egal, jedes Wort der Eingabe muss
 * irgendwo vorkommen (Teilwörter genügen). Treffer im Namen stehen vor Treffern in Gerät, Aufsatz oder Muskel.
 * Ohne Eingabe: Alternativen der aktuellen Übung, danach alles nach Muskelgruppe und Name.
 */
export function searchExercises(plan: Plan, o: SearchOptions = {}): Result[] {
  const words = (o.query ?? '').split(/\s+/).filter(Boolean)
  const entries = catalog(plan, o.exclude).filter(
    (e) => (!o.muscle || e.muscle === o.muscle) && (!o.equipment || e.group === o.equipment),
  )
  const byOrder = (a: Entry, b: Entry) =>
    muscleRank(a.muscle) - muscleRank(b.muscle) || a.ex.name.localeCompare(b.ex.name, 'de')

  if (words.length) {
    const scored = entries
      .filter((e) => words.every((w) => hit(e.hay, w)))
      .map((e) => {
        const inName = words.every((w) => hit(e.nameHay, w))
        const starts = variants(words[0]).some((w) => e.nameHay.some((h) => h.startsWith(w) || h.includes(` ${w}`)))
        return { e, score: (inName ? 2 : 0) + (inName && starts ? 1 : 0) }
      })
    scored.sort((a, b) => b.score - a.score || byOrder(a.e, b.e))
    return scored.map(({ e }) => ({ key: e.key, group: '' }))
  }

  const alt = new Set(o.current ? (plan.exercises[o.current]?.alternatives ?? []) : [])
  const first = entries.filter((e) => alt.has(e.key)).sort(byOrder)
  const rest = entries.filter((e) => !alt.has(e.key)).sort(byOrder)
  return [...first.map((e) => ({ key: e.key, group: 'alternativen' })), ...rest.map((e) => ({ key: e.key, group: e.muscle }))]
}

// ---------- Tastatursteuerung (Combobox nach ARIA 1.2) ----------

export interface PickerState {
  query: string
  open: boolean
  active: number // Index in der Trefferliste, -1 = keiner
}
export const initialPicker = (query = ''): PickerState => ({ query, open: false, active: -1 })

/** Eingabe: Liste öffnen, ersten Treffer markieren. */
export const typeQuery = (s: PickerState, query: string): PickerState => ({ ...s, query, open: true, active: 0 })

export interface KeyResult {
  state: PickerState
  /** Gewählter Eintrag (Enter auf einem markierten Treffer). */
  picked?: string
  /** Die Taste wurde verarbeitet (Standardverhalten des Browsers unterdrücken). */
  handled: boolean
}

/**
 * Pfeiltasten bewegen die Markierung (springen am Ende herum), Pos1/Ende springen an den Rand, Enter wählt den
 * markierten Treffer, Escape schließt die Liste, ein weiteres Escape leert die Eingabe, Tab schließt.
 */
export function handleKey(s: PickerState, key: string, results: string[]): KeyResult {
  const n = results.length
  const move = (active: number): KeyResult => ({ state: { ...s, open: true, active }, handled: true })
  switch (key) {
    case 'ArrowDown':
      if (!n) return { state: { ...s, open: true }, handled: true }
      return move(!s.open || s.active < 0 ? 0 : (s.active + 1) % n)
    case 'ArrowUp':
      if (!n) return { state: { ...s, open: true }, handled: true }
      return move(!s.open || s.active < 0 ? n - 1 : (s.active - 1 + n) % n)
    case 'Home':
      return s.open && n ? move(0) : { state: s, handled: false }
    case 'End':
      return s.open && n ? move(n - 1) : { state: s, handled: false }
    case 'Enter':
      if (s.open && s.active >= 0 && s.active < n)
        return { state: { ...s, open: false }, picked: results[s.active], handled: true }
      return { state: s, handled: s.open } // offene Liste ohne Markierung: Enter schickt kein Formular ab
    case 'Escape':
      if (s.open) return { state: { ...s, open: false, active: -1 }, handled: true }
      if (s.query) return { state: { ...initialPicker(), query: '' }, handled: true }
      return { state: s, handled: false }
    case 'Tab':
      return { state: { ...s, open: false, active: -1 }, handled: false }
    default:
      return { state: s, handled: false }
  }
}
