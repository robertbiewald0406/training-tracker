import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ExercisePicker } from './ExercisePicker'

describe('ExercisePicker (Markup)', () => {
  const html = renderToStaticMarkup(<ExercisePicker label="Tauschen gegen" value={null} onChange={() => {}} currentKey="seated_calf_raise" excludeKeys={['hack_squat']} />)
  it('Combobox mit Listbox nach ARIA', () => {
    expect(html).toMatch(/role="combobox"/)
    expect(html).toMatch(/aria-expanded="false"/)
    expect(html).toMatch(/aria-autocomplete="list"/)
    const list = html.match(/aria-controls="([^"]+)"/)![1]
    expect(html).toContain(`id="${list}"`)
    expect(html).toMatch(/role="listbox"[^>]*hidden/)
    expect(html).toMatch(/<label[^>]*>Tauschen gegen<\/label>/)
  })
  it('Eingabefeld und Optionen mindestens 56 px hoch (min-h-14), Filter vorhanden', () => {
    expect(html).toMatch(/min-h-14[^"]*"[^>]*role="combobox"|role="combobox"[^>]*min-h-14/)
    expect((html.match(/role="option"/g) ?? []).length).toBeGreaterThan(20)
    for (const o of html.match(/<div id="[^"]*-opt-\d+" role="option"[^>]*>/g) ?? []) expect(o).toContain('min-h-14')
    expect(html).toContain('aria-label="Muskelgruppe"')
    expect(html).toContain('aria-label="Gerät"')
  })
  it('zeigt Name, Gerät und Hauptmuskel je Treffer, Alternativen zuerst, ausgeschlossene nicht', () => {
    expect(html).toContain('Alternativen')
    expect(html.indexOf('Wadenheben stehend')).toBeLessThan(html.indexOf('Hammer Strength Incline Press'))
    expect(html).toContain('Maschine · Waden')
    expect(html).not.toContain('Hacksquat')
    expect(html).not.toContain('Plank')
  })
  it('mit gewählter Übung steht ihr Name im Feld und die Zusammenfassung darunter', () => {
    const sel = renderToStaticMarkup(<ExercisePicker label="x" value="lat_pulldown_wide" onChange={() => {}} />)
    expect(sel).toContain('value="Latzug breit"')
    expect(sel).toContain('Kabelzug · Latissimus')
  })
})
