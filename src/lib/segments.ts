// Zweites Segment eines Satzes (Dropsatz, Aufstocksatz, Backoff-Satz). Ein Satz bleibt eine Zeile in workout_set:
// weight_kg/reps = erstes Segment, das zweite steht in `note` als "seg:<typ>|<kg>|<wdh>" (kein Schema-Umbau,
// wird synchronisiert und gesichert wie jede Zeile).
export type SegmentKind = 'drop' | 'topup' | 'backoff'
export interface Segment {
  kind: SegmentKind
  weight_kg: number
  reps: number
}

export const SEGMENT_LABEL: Record<SegmentKind, string> = {
  drop: 'Dropsatz',
  topup: 'Aufstocksatz',
  backoff: 'Backoff-Satz',
}
export const SEGMENT_KINDS = Object.keys(SEGMENT_LABEL) as SegmentKind[]

const RE = /^seg:(drop|topup|backoff)\|(\d+(?:\.\d+)?)\|(\d+)$/

export function encodeSegment(s: Segment): string {
  return `seg:${s.kind}|${Math.round(s.weight_kg * 100) / 100}|${s.reps}`
}

/** Liest das zweite Segment aus der Notiz; alles andere (null, freier Text, defekt) ergibt null. */
export function parseSegment(note: string | null | undefined): Segment | null {
  const m = note ? RE.exec(note) : null
  if (!m) return null
  const reps = Number(m[3])
  return reps >= 1 ? { kind: m[1] as SegmentKind, weight_kg: Number(m[2]), reps } : null
}

/** Vorschlag fuer das zweite Segment aus dem ersten (Drop: -20 %, Backoff: -15 %, Aufstocken: +Schritt). */
export function suggestSegment(kind: SegmentKind, weight: number, reps: number, step: number): Segment {
  const round = (x: number) => Math.max(0, Math.round(x / step) * step)
  const w = kind === 'topup' ? weight + step : round(weight * (kind === 'drop' ? 0.8 : 0.85))
  return { kind, weight_kg: Math.round(w * 100) / 100, reps }
}

/** Anzeige des zweiten Segments, z. B. " + Dropsatz 40 × 8" (leer ohne Segment). */
export function segText(note: string | null | undefined, fmt: (n: number) => string): string {
  const seg = parseSegment(note)
  return seg ? ` + ${SEGMENT_LABEL[seg.kind]} ${fmt(seg.weight_kg)} × ${seg.reps}` : ''
}
