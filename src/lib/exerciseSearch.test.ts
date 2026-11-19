import { describe, expect, it } from 'vitest'
import {
  catalog, equipmentGroup, equipmentOptions, fold, foldExpanded, handleKey, initialPicker, muscleOptions, searchExercises,
  typeQuery, type PickerState,
} from './exerciseSearch'
import { plan } from './plan'

const keys = (o: Parameters<typeof searchExercises>[1]) => searchExercises(plan, o).map((r) => r.key)

describe('Katalog', () => {
  it('enthält alle aktiven Übungen, auch die in keinem Tag, und nie stillgelegte', () => {
    const all = catalog(plan).map((e) => e.key)
    const active = Object.entries(plan.exercises).filter(([, e]) => !e.retired).map(([k]) => k)
    expect(all.sort()).toEqual(active.sort())
    const inDay = new Set(plan.days.flatMap((d) => d.items.map((i) => i.exercise_key)))
    const outside = active.filter((k) => !inDay.has(k))
    expect(outside.length).toBeGreaterThan(0)
    for (const k of outside) expect(all).toContain(k)
    for (const [k, e] of Object.entries(plan.exercises)) if (e.retired) expect(all, k).not.toContain(k)
  })
  it('exclude blendet Übungen aus (z. B. die schon im Tag stehen)', () => {
    const k = keys({ exclude: ['hack_squat', 'leg_extension'] })
    expect(k).not.toContain('hack_squat')
    expect(k).not.toContain('leg_extension')
    expect(k).toContain('lying_leg_curl')
  })
})

describe('Suche', () => {
  it('Groß-/Kleinschreibung und Umlaute sind egal (auch ue/oe/ae und ß)', () => {
    expect(fold('Rücken Fuß')).toBe('rucken fuss')
    expect(foldExpanded('Rücken Fuß')).toBe('ruecken fuss')
    const base = keys({ query: 'Rücken' })
    expect(base.length).toBeGreaterThan(0)
    for (const q of ['rücken', 'RÜCKEN', 'rucken', 'ruecken', 'Ruecken']) expect(keys({ query: q }), q).toEqual(base)
    expect(keys({ query: 'schragbank' })).toEqual(keys({ query: 'Schrägbank' }))
    expect(keys({ query: 'schraegbank' })).toEqual(keys({ query: 'Schrägbank' }))
    expect(keys({ query: 'brusthohe' })).toContain('fly_machine') // Aufsatz "Griffe auf Brusthöhe"
    expect(keys({ query: 'brusthoehe' })).toContain('fly_machine')
  })
  it('findet Teilwörter in Name, Gerät, Aufsatz und Muskelgruppe', () => {
    expect(keys({ query: 'Latzug' })).toEqual(['lat_pulldown_wide'])
    expect(keys({ query: 'latz' })).toContain('lat_pulldown_wide')
    expect(keys({ query: 'Kabel' })).toEqual(expect.arrayContaining(['cable_curl_bar', 'face_pull_rope', 'lf_shoulder_press']))
    expect(keys({ query: 'Hammer' })).toEqual(expect.arrayContaining(['hs_incline_press', 'hs_calf_machine', 'cable_hammer_curl_rope']))
    const biceps = keys({ query: 'Bizeps' })
    expect(biceps.sort()).toEqual(Object.entries(plan.exercises).filter(([, e]) => !e.retired && e.primary_muscle === 'biceps').map(([k]) => k).sort())
    expect(keys({ query: 'Seil' })).toEqual(expect.arrayContaining(['face_pull_rope', 'cable_hammer_curl_rope'])) // Aufsatz
    expect(keys({ query: 'plate' })).toEqual(expect.arrayContaining(['hack_squat', 'hs_low_row'])) // Gerät
  })
  it('mehrere Wörter müssen alle vorkommen', () => {
    expect(keys({ query: 'kabel seil' }).sort()).toEqual(['cable_hammer_curl_rope', 'cable_overhead_tricep_rope', 'face_pull_rope'])
    expect(keys({ query: 'hammer bizeps' })).toEqual(['cable_hammer_curl_rope'].filter((k) => keys({ query: 'hammer bizeps' }).includes(k)))
    expect(keys({ query: 'latzug unsinn' })).toEqual([])
  })
  it('stillgelegte Übungen werden nie gefunden, auch nicht über Namen oder Muskel', () => {
    for (const q of ['plank', 'dead bug', 'beinheben', 'russian', 'bauch', 'brustpresse', 'pallof', 'side plank'])
      for (const k of keys({ query: q })) expect(plan.exercises[k].retired, `${q} -> ${k}`).toBeFalsy()
    expect(keys({ query: 'hs_chest_press' })).toEqual([])
    expect(keys({ query: 'Chest Press' })).toEqual(['mts_chest_press'])
  })
  it('Treffer im Namen stehen vor Treffern in Gerät oder Muskel', () => {
    const k = keys({ query: 'curl' })
    // Name enthält "curl": zuerst; "Maschine"-Treffer ohne Namen-Treffer danach
    const inName = (key: string) => fold(plan.exercises[key].name).includes('curl')
    expect(k.slice(0, k.filter(inName).length).every(inName)).toBe(true)
    const m = keys({ query: 'maschine' })
    expect(inNameFirst(m, 'maschine')).toBe(true)
  })
  it('leere Suche und Leerzeichen liefern den ganzen Katalog', () => {
    expect(keys({ query: '   ' }).length).toBe(catalog(plan).length)
  })
})
const inNameFirst = (list: string[], word: string) => {
  const inName = (k: string) => fold(plan.exercises[k].name).includes(word)
  const n = list.filter(inName).length
  return list.slice(0, n).every(inName)
}

describe('Ohne Eingabe und Filter', () => {
  it('Alternativen der aktuellen Übung zuerst, danach alles nach Muskelgruppe', () => {
    const r = searchExercises(plan, { current: 'seated_calf_raise' })
    const alt = plan.exercises.seated_calf_raise.alternatives.filter((k) => !plan.exercises[k].retired)
    expect(r.slice(0, alt.length).map((x) => x.key).sort()).toEqual([...alt].sort())
    expect(r.slice(0, alt.length).every((x) => x.group === 'alternativen')).toBe(true)
    const rest = r.slice(alt.length)
    expect(rest.every((x) => x.group !== 'alternativen')).toBe(true)
    // nach Muskelgruppe sortiert: Brust vor Beinen vor Waden
    const order = rest.map((x) => x.group)
    expect(order.indexOf('chest')).toBeLessThan(order.indexOf('quads'))
    expect(order.indexOf('quads')).toBeLessThan(order.indexOf('calves'))
    expect(new Set(r.map((x) => x.key)).size).toBe(r.length) // keine Doppelten
  })
  it('Alternativen, die schon im Tag stehen, werden nicht zusätzlich angeboten', () => {
    const r = searchExercises(plan, { current: 'seated_calf_raise', exclude: ['hs_calf_machine'] })
    expect(r.map((x) => x.key)).not.toContain('hs_calf_machine')
  })
  it('Filter Muskelgruppe und Gerät, auch zusammen mit der Suche', () => {
    expect(keys({ muscle: 'calves' }).sort()).toEqual(['hs_calf_machine', 'seated_calf_raise', 'standing_calf_raise'])
    const cable = keys({ equipment: 'Kabelzug' })
    expect(cable.length).toBeGreaterThan(5)
    for (const k of cable) expect(equipmentGroup(plan.exercises[k].equipment)).toBe('Kabelzug')
    expect(keys({ muscle: 'triceps', equipment: 'Kabelzug' }).sort()).toEqual(['cable_overhead_tricep_rope', 'pushdown_straight_bar', 'pushdown_vgrip'])
    expect(keys({ query: 'pushdown', equipment: 'Maschine' })).toEqual([])
  })
  it('Filteroptionen: nur Muskeln und Geräte, die es noch gibt', () => {
    const muscles = muscleOptions(plan).map((o) => o.value)
    expect(muscles[0]).toBe('chest')
    for (const m of ['abs', 'core', 'obliques']) expect(muscles).not.toContain(m)
    expect(equipmentOptions(plan).map((o) => o.value)).toEqual(expect.arrayContaining(['Kabelzug', 'Maschine', 'Plate-Loaded', 'Stack', 'Kurzhanteln']))
    expect(muscleOptions(plan, ['hs_calf_machine', 'seated_calf_raise', 'standing_calf_raise']).map((o) => o.value)).not.toContain('calves')
  })
})

describe('Tastatursteuerung', () => {
  const list = ['a', 'b', 'c']
  const press = (s: PickerState, ...ks: string[]) => ks.reduce((st, k) => handleKey(st, k, list).state, s)
  it('Pfeil runter öffnet die Liste und markiert den ersten Treffer, weitere gehen herum', () => {
    let s = initialPicker()
    s = press(s, 'ArrowDown')
    expect(s).toMatchObject({ open: true, active: 0 })
    s = press(s, 'ArrowDown', 'ArrowDown')
    expect(s.active).toBe(2)
    expect(press(s, 'ArrowDown').active).toBe(0)
  })
  it('Pfeil hoch geht rückwärts und springt vom ersten zum letzten', () => {
    let s = typeQuery(initialPicker(), 'x')
    expect(s).toMatchObject({ open: true, active: 0 })
    expect(press(s, 'ArrowUp').active).toBe(2)
    expect(press(initialPicker(), 'ArrowUp')).toMatchObject({ open: true, active: 2 })
  })
  it('Pos1 und Ende springen an den Rand, nur bei offener Liste', () => {
    const s = press(typeQuery(initialPicker(), 'x'), 'ArrowDown')
    expect(press(s, 'End').active).toBe(2)
    expect(press(press(s, 'End'), 'Home').active).toBe(0)
    expect(handleKey(initialPicker(), 'Home', list).handled).toBe(false)
  })
  it('Enter wählt den markierten Treffer und schließt die Liste', () => {
    const s = press(typeQuery(initialPicker(), 'x'), 'ArrowDown')
    const r = handleKey(s, 'Enter', list)
    expect(r.picked).toBe('b')
    expect(r.state.open).toBe(false)
    expect(r.handled).toBe(true)
  })
  it('Enter ohne Markierung oder bei geschlossener Liste wählt nichts', () => {
    const noPick = handleKey({ query: '', open: true, active: -1 }, 'Enter', list)
    expect(noPick.picked).toBeUndefined()
    expect(noPick.handled).toBe(true) // offene Liste: Enter schickt kein Formular ab
    const closed = handleKey(initialPicker(), 'Enter', list)
    expect(closed.picked).toBeUndefined()
    expect(closed.handled).toBe(false)
    expect(handleKey({ query: 'x', open: true, active: 5 }, 'Enter', list).picked).toBeUndefined()
  })
  it('Escape schließt die Liste, ein weiteres leert die Eingabe, dann nichts mehr', () => {
    let s: PickerState = { query: 'lat', open: true, active: 1 }
    s = handleKey(s, 'Escape', list).state
    expect(s).toMatchObject({ open: false, active: -1, query: 'lat' })
    s = handleKey(s, 'Escape', list).state
    expect(s.query).toBe('')
    expect(handleKey(s, 'Escape', list).handled).toBe(false)
  })
  it('Tab schließt die Liste, ohne die Taste zu schlucken; ohne Treffer bleibt nichts markiert', () => {
    const r = handleKey({ query: '', open: true, active: 1 }, 'Tab', list)
    expect(r.state.open).toBe(false)
    expect(r.handled).toBe(false)
    expect(handleKey(initialPicker(), 'ArrowDown', []).state).toMatchObject({ open: true, active: -1 })
  })
  it('andere Tasten bleiben unberührt', () => {
    const s = typeQuery(initialPicker(), 'x')
    expect(handleKey(s, 'a', list)).toEqual({ state: s, handled: false })
  })
})
