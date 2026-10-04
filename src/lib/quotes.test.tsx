import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import quotesJson from '../data/quotes.json'
import { QuoteCard } from '../screens/QuoteCard'
import {
  FALLBACK_QUOTE,
  QUOTES,
  RECENT_LIMIT,
  normalizeQuotes,
  pickQuote,
  quoteCredit,
  quoteToShow,
  type Quote,
} from './quotes'

// Deterministischer Zufall (LCG), damit die Tests stabil sind.
function seeded(seed: number) {
  let s = seed
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296
}
const q = (text: string, extra: Partial<Quote> = {}): Quote => ({
  text, author: '', source: '', verified: 'original', ...extra,
})

describe('quotes.json', () => {
  it('hat 100 gueltige Eintraege mit allen Feldern', () => {
    expect(Array.isArray(quotesJson)).toBe(true)
    expect(quotesJson).toHaveLength(100)
    expect(QUOTES).toHaveLength(100)
    for (const e of quotesJson as Record<string, unknown>[]) {
      expect(Object.keys(e).sort()).toEqual(['author', 'source', 'text', 'verified'])
      expect(['belegt', 'zugeschrieben', 'original']).toContain(e.verified)
    }
  })
})

describe('Auswahl', () => {
  it('keine Wiederholung innerhalb der letzten 30', () => {
    const rng = seeded(42)
    let recent: string[] = []
    const shown: string[] = []
    for (let i = 0; i < 400; i++) {
      const r = pickQuote(QUOTES, recent, rng)
      expect(shown.slice(-RECENT_LIMIT)).not.toContain(r.quote.text)
      shown.push(r.quote.text)
      recent = r.recent
      expect(recent.length).toBeLessThanOrEqual(RECENT_LIMIT)
    }
  })
  it('kleine Liste: vermeidet zumindest das zuletzt gezeigte Zitat', () => {
    const list = [q('a'), q('b')]
    let recent: string[] = []
    let last = ''
    for (let i = 0; i < 20; i++) {
      const r = pickQuote(list, recent, seeded(i + 1))
      expect(r.quote.text).not.toBe(last)
      last = r.quote.text
      recent = r.recent
    }
    expect(pickQuote([q('nur eins')], ['nur eins']).quote.text).toBe('nur eins')
  })
  it('leere Liste und kaputte recent-Liste: Fallback statt Absturz', () => {
    expect(pickQuote([], []).quote).toEqual(FALLBACK_QUOTE)
    expect(pickQuote([], undefined).quote).toEqual(FALLBACK_QUOTE)
    expect(pickQuote([q('x')], { kaputt: true }).quote.text).toBe('x')
    expect(pickQuote([q('x')], [1, null, 'y']).recent).toEqual(['y', 'x'])
    expect(normalizeQuotes(null)).toEqual([])
    expect(normalizeQuotes({})).toEqual([])
  })
  it('fehlende Felder werden ergaenzt, Eintraege ohne Text verworfen', () => {
    const out = normalizeQuotes([{ text: 'A' }, { author: 'X' }, null, 5, { text: '  ' }, { text: 'B', author: 'Y' }])
    expect(out).toEqual([
      { text: 'A', author: '', source: '', verified: 'original' },
      { text: 'B', author: 'Y', source: '', verified: 'zugeschrieben' }, // unbekannte Herkunft nie als belegt
    ])
  })
})

describe('Wiederaufnahme', () => {
  const pending = { sessionId: 's1', quote: q('Los!') }
  it('Zitat nur direkt nach dem Start dieser Einheit', () => {
    expect(quoteToShow('s1', pending)?.text).toBe('Los!')
  })
  it('bei Wiederaufnahme (kein Pending) oder anderer Einheit kein Zitat', () => {
    expect(quoteToShow('s1', null)).toBeNull()
    expect(quoteToShow('s2', pending)).toBeNull()
    expect(quoteToShow(null, pending)).toBeNull()
  })
})

describe('Darstellung je verified-Wert', () => {
  const html = (x: Quote) => renderToStaticMarkup(<QuoteCard quote={x} onGo={() => {}} />)

  it('belegt: Autor und Quelle, kein Etikett', () => {
    const h = html(q('Text', { author: 'Arnold', source: 'Pumping Iron (1977)', verified: 'belegt' }))
    expect(h).toContain('Arnold')
    expect(h).toContain('Pumping Iron (1977)')
    expect(h).not.toContain('zugeschrieben')
  })
  it('belegt ohne Quelle: nur Autor', () => {
    const h = html(q('Text', { author: 'Lee', verified: 'belegt' }))
    expect(h).toContain('Lee')
  })
  it('zugeschrieben: Autor und Etikett', () => {
    const h = html(q('Text', { author: 'Ronnie', source: 'egal', verified: 'zugeschrieben' }))
    expect(h).toContain('Ronnie')
    expect(h).toContain('zugeschrieben')
    expect(h).not.toContain('egal')
  })
  it('original: nur die Wortmarke, ohne Etikett und ohne Personennamen', () => {
    const h = html(q('Text', { author: 'Max Mustermann', source: 'Buch', verified: 'original' }))
    expect(h).toContain('aria-label="Lift Heavy"')
    expect(h).not.toContain('Max Mustermann')
    expect(h).not.toContain('Buch')
    expect(h).not.toContain('zugeschrieben')
    expect(quoteCredit(q('T', { author: 'Lift Heavy' }))).toEqual({ kind: 'original' })
  })
  it('zeigt Zitat und Button "Los" (min. 56 px hoch)', () => {
    const h = html(q('Heavy today.'))
    expect(h).toContain('Heavy today.')
    expect(h).toMatch(/min-h-14[^>]*>Los</)
  })
})
