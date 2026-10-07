import { describe, expect, it } from 'vitest'
import { plan } from './plan'
import { weightUnit } from './logger'
import { renderToStaticMarkup } from 'react-dom/server'
import { Warning } from '../ui/Warning'

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
    for (const k of ['plank', 'side_plank', 'hanging_knee_raise', 'captain_chair_leg_raise', 'dead_bug'])
      expect(plan.exercises[k].bodyweight).toBe(true)
    for (const k of ['cable_lateral_raise', 'hs_iso_row', 'cable_pallof_press', 'side_plank'])
      expect(plan.exercises[k].unilateral).toBe(true)
  })
  it('stillgelegte Uebungen stehen in keinem Tag und in keinen alternatives aktiver Uebungen', () => {
    const retired = Object.entries(plan.exercises).filter(([, e]) => e.retired).map(([k]) => k)
    for (const k of ['hs_chest_press', 'plank', 'side_plank', 'cable_pallof_press', 'hanging_knee_raise']) expect(retired).toContain(k)
    for (const d of plan.days) for (const it of d.items) expect(retired, `${d.key}: ${it.exercise_key}`).not.toContain(it.exercise_key)
    for (const [k, e] of Object.entries(plan.exercises))
      if (!e.retired) for (const a of e.alternatives) expect(retired, `${k} -> ${a}`).not.toContain(a)
  })
  it('Bauch: Mo Beinheben + Dead Bug, Fr Beinheben, Beintage ohne Bauch', () => {
    const day = (k: string) => plan.days.find((d) => d.key === k)!
    const tail = (k: string, n: number) => day(k).items.slice(-n).map((i) => [i.exercise_key, i.sets, i.rep_min, i.rep_max, i.rest_sec])
    expect(tail('mo_brust', 2)).toEqual([
      ['captain_chair_leg_raise', 3, 10, 15, 60],
      ['dead_bug', 3, 8, 12, 60],
    ])
    expect(tail('fr_arme', 1)).toEqual([['captain_chair_leg_raise', 3, 10, 15, 60]])
    const core = ['captain_chair_leg_raise', 'dead_bug']
    for (const k of ['di_ruecken', 'mi_beine', 'do_schultern'])
      expect(day(k).items.filter((i) => core.includes(i.exercise_key)), k).toEqual([])
    expect(plan.exercises.captain_chair_leg_raise.alternatives).toEqual(['dead_bug'])
    expect(plan.exercises.dead_bug.alternatives).toEqual(['captain_chair_leg_raise'])
  })
  it('Adduktoren und Abduktoren stehen in beiden Beinvarianten', () => {
    const legs = plan.days.find((d) => d.key === 'mi_beine')!
    for (const k of ['adductor_machine', 'abductor_machine'])
      for (const v of ['A', 'B']) expect(legs.items.some((i) => i.exercise_key === k && i.variant === v), `${k} ${v}`).toBe(true)
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
  it('Warnhinweis erscheint nur bei Uebungen mit warning', () => {
    const withW = Object.entries(plan.exercises).filter(([, e]) => e.warning)
    expect(withW.map(([k]) => k).sort()).toEqual(['captain_chair_leg_raise', 'dead_bug'])
    for (const [k, e] of Object.entries(plan.exercises)) {
      const html = renderToStaticMarkup(<Warning text={e.warning} />)
      if (e.warning) expect(html, k).toContain(e.warning)
      else expect(html, k).toBe('')
    }
  })
})
