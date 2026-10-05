import { describe, expect, it } from 'vitest'
import { plan } from './plan'
import { weightUnit } from './logger'

describe('plan.json', () => {
  const keys = new Set(Object.keys(plan.exercises))

  it('Tage Mo bis Fr mit den neuen Schluesseln', () => {
    expect(plan.days.map((d) => [d.key, d.weekday])).toEqual([
      ['mo_brust', 1],
      ['di_ruecken', 2],
      ['mi_beine', 3],
      ['do_schultern', 4],
      ['fr_arme', 5],
    ])
  })
  it('alle exercise_keys der Tage existieren', () => {
    for (const d of plan.days) for (const it of d.items) expect(keys.has(it.exercise_key), `${d.key}: ${it.exercise_key}`).toBe(true)
  })
  it('alle alternatives existieren', () => {
    for (const [k, ex] of Object.entries(plan.exercises))
      for (const a of ex.alternatives) expect(keys.has(a), `${k} -> ${a}`).toBe(true)
  })
  it('Rotation nur am Beintag, Varianten der Items sind gueltig', () => {
    expect(plan.days.filter((d) => d.rotation).map((d) => d.key)).toEqual(['mi_beine'])
    const legs = plan.days.find((d) => d.key === 'mi_beine')!
    expect(legs.rotation!.variants).toEqual(['A', 'B'])
    for (const d of plan.days) for (const it of d.items) if (it.variant) expect(d.rotation!.variants).toContain(it.variant)
  })
  it('Zeit-, Koerpergewichts- und einseitige Uebungen sind markiert', () => {
    for (const k of ['plank', 'side_plank']) expect(plan.exercises[k].unit).toBe('sec')
    for (const k of ['plank', 'side_plank', 'hanging_knee_raise']) expect(plan.exercises[k].bodyweight).toBe(true)
    for (const k of ['cable_lateral_raise', 'hs_iso_row', 'cable_pallof_press', 'side_plank'])
      expect(plan.exercises[k].unilateral).toBe(true)
  })
  it('Bauch/Rumpf nur an den Beintagen (Freitag hoechstens eine Uebung)', () => {
    const core = new Set(['plank', 'side_plank', 'cable_pallof_press', 'hanging_knee_raise'])
    for (const d of plan.days.filter((d) => !['mi_beine', 'fr_arme'].includes(d.key)))
      expect(d.items.filter((i) => core.has(i.exercise_key)), d.key).toEqual([])
    const legs = plan.days.find((d) => d.key === 'mi_beine')!
    for (const v of ['A', 'B']) expect(legs.items.filter((i) => i.variant === v && core.has(i.exercise_key)).length).toBeGreaterThan(0)
    expect(plan.days.find((d) => d.key === 'fr_arme')!.items.filter((i) => core.has(i.exercise_key))).toHaveLength(1)
  })
  it('Adduktoren nur im Quad-Tag A, Abduktoren nur im Hamstring-Tag B', () => {
    const legs = plan.days.find((d) => d.key === 'mi_beine')!
    const has = (k: string, v: string) => legs.items.some((i) => i.exercise_key === k && i.variant === v)
    expect(has('adductor_machine', 'A')).toBe(true)
    expect(has('adductor_machine', 'B')).toBe(false)
    expect(has('abductor_machine', 'B')).toBe(true)
    expect(has('abductor_machine', 'A')).toBe(false)
  })
  it('MTS Chest Press ersetzt die Brustpresse, hs_chest_press bleibt nur als Definition', () => {
    const inDays = plan.days.flatMap((d) => d.items.map((i) => i.exercise_key))
    expect(inDays).toContain('mts_chest_press')
    expect(inDays).not.toContain('hs_chest_press')
    expect(plan.exercises.hs_chest_press.retired).toBe(true)
    expect(plan.exercises.mts_chest_press.equipment).toBe('Stack')
    expect(plan.exercises.hs_incline_press.alternatives).toEqual(['mts_chest_press'])
    const item = plan.days[0].items.find((i) => i.exercise_key === 'mts_chest_press')!
    expect([item.sets, item.rep_min, item.rep_max, item.rest_sec]).toEqual([3, 8, 10, 120])
  })
  it('Gewichtsbeschriftung richtet sich nach equipment', () => {
    expect(weightUnit(plan.exercises.mts_chest_press)).toBe('kg Stack')
    expect(weightUnit(plan.exercises.hs_chest_press)).toBe('kg Platten pro Seite')
    expect(weightUnit(plan.exercises.hs_incline_press)).toBe('kg Platten pro Seite')
  })
})
