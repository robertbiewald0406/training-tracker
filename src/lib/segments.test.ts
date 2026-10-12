import { describe, expect, it } from 'vitest'
import { encodeSegment, parseSegment, segText, suggestSegment } from './segments'
import { buildSetRow } from './logger'
import { volumeOf } from './stats'
import type { WorkoutSetRow } from './types'

const base = { sessionId: 's', exerciseKey: 'hack_squat', setNo: 1, weight_kg: 100, reps: 8, warmup: false, failure: false, side: 'both' as const }

describe('zweites Segment (Drop/Aufstock/Backoff)', () => {
  it('Encode/Parse sind umkehrbar, Fremdes und Defektes ergibt null', () => {
    const seg = { kind: 'drop' as const, weight_kg: 62.5, reps: 10 }
    expect(encodeSegment(seg)).toBe('seg:drop|62.5|10')
    expect(parseSegment(encodeSegment(seg))).toEqual(seg)
    for (const n of [null, undefined, '', 'freier Text', 'seg:x|1|1', 'seg:drop|1|0', 'seg:drop|a|3']) expect(parseSegment(n)).toBeNull()
  })
  it('Satz bleibt eine Zeile, das Segment steht in note', () => {
    expect(buildSetRow(base).note).toBeNull()
    const row = buildSetRow({ ...base, segment: { kind: 'backoff', weight_kg: 85, reps: 12 } })
    expect(row.weight_kg).toBe(100)
    expect(row.note).toBe('seg:backoff|85|12')
  })
  it('Volumen zaehlt das zweite Segment mit, Saetze nicht doppelt', () => {
    const mk = (note: string | null) => ({ ...buildSetRow({ ...base, segment: parseSegment(note) }) }) as WorkoutSetRow
    expect(volumeOf([mk(null)])).toBe(800)
    expect(volumeOf([mk('seg:drop|80|10')])).toBe(800 + 800)
  })
  it('Vorschlaege und Anzeige', () => {
    expect(suggestSegment('drop', 100, 8, 2.5)).toEqual({ kind: 'drop', weight_kg: 80, reps: 8 })
    expect(suggestSegment('backoff', 100, 8, 2.5)).toEqual({ kind: 'backoff', weight_kg: 85, reps: 8 })
    expect(suggestSegment('topup', 100, 8, 2.5)).toEqual({ kind: 'topup', weight_kg: 102.5, reps: 8 })
    expect(segText('seg:drop|80|10', String)).toBe(' + Dropsatz 80 × 10')
    expect(segText(null, String)).toBe('')
  })
})
