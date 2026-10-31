import { describe, expect, it } from 'vitest'
// @ts-ignore node:fs (kein @types/node im Projekt); Vitest liefert CSS-Dateien per ?raw leer, deshalb direkt lesen
import { readFileSync } from 'node:fs'

// Kontrast der Farb-Tokens (Dusk) in hell und dunkel: normaler Text mind. 4,5:1, grosse Schrift/Akzent mind. 3:1.

const css = readFileSync('src/index.css', 'utf8') as string
const [lightPart, darkPart] = css.split('@media (prefers-color-scheme: dark)')
const parse = (text: string) =>
  Object.fromEntries([...text.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]))
const light = parse(lightPart)
const dark = { ...light, ...parse(darkPart) } // dunkel ueberschreibt nur, was es neu festlegt

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

for (const [name, p] of [['hell', light], ['dunkel', dark]] as const) {
  describe(`Dusk ${name}`, () => {
    it('alle Tokens sind festgelegt', () => {
      for (const k of ['sky-top', 'sky-bottom', 'card', 'ink', 'accent', 'mark', 'alt', 'info', 'warn', 'ok', 'err', 'shade'])
        expect(p[k], k).toMatch(/^#[0-9a-f]{6}$/)
    })
    it('Text (ink) auf Hintergrund, Karte und allen Flaechen mind. 4,5:1', () => {
      for (const k of ['sky-top', 'sky-bottom', 'card', 'mark', 'alt', 'info', 'warn', 'ok'])
        expect(ratio(p.ink, p[k]), `ink auf ${k}`).toBeGreaterThanOrEqual(4.5)
    })
    it('weisser Text auf Fehler mind. 4,5:1', () => {
      expect(ratio('#ffffff', p.err)).toBeGreaterThanOrEqual(4.5)
    })
    it('Akzent (Wortmarke, Symbole) auf Karte und Hintergrund mind. 3:1, Akzent als Flaeche trennt sich von der Karte', () => {
      expect(ratio(p.accent, p.card)).toBeGreaterThanOrEqual(3)
      expect(ratio(p.accent, p['sky-top'])).toBeGreaterThanOrEqual(3)
    })
  })
}

describe('Dusk Aufbau', () => {
  it('Dunkel legt Hintergrund, Karte, Text und Flaechen neu fest', () => {
    const d = parse(darkPart)
    for (const k of ['sky-top', 'sky-bottom', 'card', 'ink', 'accent', 'mark', 'alt', 'info', 'warn', 'ok', 'err'])
      expect(d[k], k).toBeDefined()
  })
  it('keine alten Farben mehr (Pink, Tuerkis, Babyblau, Neon, Indigo)', () => {
    for (const old of ['#e91e8c', '#00b7c3', '#8fd8f5', '#ff5cb8', '#2b1b4d', '#bde8fa', '#ffd1e8'])
      expect(css.toLowerCase(), old).not.toContain(old)
  })
})
