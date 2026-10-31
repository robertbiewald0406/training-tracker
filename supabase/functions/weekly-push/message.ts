// Reine Logik der Edge Function "weekly-push" (ohne Deno-Funktionen, damit sie in den Tests laeuft).

/** Antwort der Datenbankfunktion weekly_report() (Migration 003). */
export interface WeeklyReport {
  week_start: string // Montag, YYYY-MM-DD
  week_end: string
  training_days: number
  sessions: number
  better: number
  stable: number
  below: number
  fresh: number
  records: number
  skipped: number
  swapped: number
  top_reason: string | null
  bodyweight_avg: number | null
  bodyweight_prev_avg: number | null
}

/** Geplante Trainingstage pro Woche (Mo bis Fr, siehe plan.json). */
export const PLANNED_DAYS = 5
export const TITLE = 'Deine Woche'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Kurze Zusammenfassung fuer die Push-Nachricht: nur Anzahlen, ohne Uebungsnamen, Gewichte und Koerpergewicht
 * (die Nachricht kann auf dem Sperrbildschirm stehen). Details oeffnen sich in der App.
 */
export function buildMessage(r: WeeklyReport): { title: string; body: string } {
  const parts: string[] = []
  parts.push(
    r.training_days === 0 ? 'Diese Woche kein Training erfasst' : `${r.training_days} von ${PLANNED_DAYS} Tagen trainiert`,
  )
  const compared = r.better + r.stable + r.below
  if (compared > 0) {
    parts.push(`${r.better} besser, ${r.stable} stabil${r.below ? `, ${r.below} darunter` : ''}`)
  }
  if (r.records > 0) parts.push(plural(r.records, 'neuer Bestwert', 'neue Bestwerte'))
  const adjusted = r.skipped + r.swapped
  if (adjusted > 0) parts.push(`${plural(adjusted, 'Übung', 'Übungen')} angepasst`)
  return { title: TITLE, body: `${parts.join(' · ')}. Details in der App.` }
}

/** Pro Abo nur einmal je Woche senden, ausser `force` (manueller Test). */
export function shouldSend(lastWeekSent: string | null, weekStart: string, force: boolean): boolean {
  return force || lastWeekSent !== weekStart
}

/** Der Push-Dienst meldet 404 oder 410, wenn das Abo nicht mehr gilt: Eintrag loeschen. */
export const isGone = (statusCode: unknown) => statusCode === 404 || statusCode === 410

/** Vergleich ohne fruehen Abbruch (Passwort des Aufrufers gegen das Secret). */
export function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Inhalt der Push-Nachricht, wie ihn der Service Worker erwartet (src/lib/pushPayload.ts). */
export function payloadFor(r: WeeklyReport) {
  const m = buildMessage(r)
  return { title: m.title, body: m.body, url: './', tag: 'weekly-report' }
}
