import { describe, expect, it } from 'vitest'
import { plan } from './plan'

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
})
