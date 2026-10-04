import quotesJson from '../data/quotes.json'

export type Verified = 'belegt' | 'zugeschrieben' | 'original'
export interface Quote {
  text: string
  author: string
  source: string
  verified: Verified
}

export const RECENT_LIMIT = 30
export const RECENT_KEY = 'quotes:recent' // lokaler Store meta, wird nie synchronisiert

// Greift, wenn die Liste leer oder unbrauchbar ist: ohne Personennamen, nur die Wortmarke als Urheber.
export const FALLBACK_QUOTE: Quote = { text: 'Zeit zu heben.', author: '', source: '', verified: 'original' }

const VERIFIED = new Set<string>(['belegt', 'zugeschrieben', 'original'])
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Macht aus beliebigem JSON eine sichere Liste. Eintraege ohne Text fallen weg, fehlende Felder werden leer. */
export function normalizeQuotes(raw: unknown): Quote[] {
  if (!Array.isArray(raw)) return []
  const out: Quote[] = []
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue
    const r = e as Record<string, unknown>
    const text = str(r.text)
    if (!text) continue
    const author = str(r.author)
    // Unbekannte Herkunft nie als belegt ausgeben: mit Autor "zugeschrieben", ohne Autor "original".
    const verified = (VERIFIED.has(str(r.verified)) ? str(r.verified) : author ? 'zugeschrieben' : 'original') as Verified
    out.push({ text, author, source: str(r.source), verified })
  }
  return out
}

export const QUOTES: Quote[] = normalizeQuotes(quotesJson)

/**
 * Zufaelliges Zitat, keines der letzten 30 gezeigten (nach Text). Ist die Liste kleiner, wird mindestens
 * das zuletzt gezeigte vermieden. Leere Liste: FALLBACK_QUOTE. Liefert die aktualisierte Liste der letzten.
 */
export function pickQuote(
  quotes: Quote[],
  recent: unknown,
  rng: () => number = Math.random,
): { quote: Quote; recent: string[] } {
  const prev = Array.isArray(recent) ? recent.filter((t): t is string => typeof t === 'string') : []
  if (!quotes.length) return { quote: FALLBACK_QUOTE, recent: prev.slice(-RECENT_LIMIT) }
  let pool = quotes.filter((q) => !prev.includes(q.text))
  if (!pool.length) pool = quotes.filter((q) => q.text !== prev.at(-1))
  if (!pool.length) pool = quotes
  const quote = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]
  return { quote, recent: [...prev.filter((t) => t !== quote.text), quote.text].slice(-RECENT_LIMIT) }
}

export type Credit =
  | { kind: 'belegt'; author: string; source: string }
  | { kind: 'zugeschrieben'; author: string }
  | { kind: 'original' }

/** Darstellung nach verified: belegt = Autor + Quelle, zugeschrieben = Autor + Etikett, original = nur Wortmarke. */
export function quoteCredit(q: Quote): Credit {
  if (q.verified === 'belegt' && q.author) return { kind: 'belegt', author: q.author, source: q.source }
  if (q.verified === 'zugeschrieben' && q.author) return { kind: 'zugeschrieben', author: q.author }
  return { kind: 'original' } // original (oder ohne Autor): keine Personennamen
}

export interface PendingQuote {
  sessionId: string
  quote: Quote
}

/** Zitat nur direkt nach "Einheit starten". Bei Wiederaufnahme (kein Pending im Speicher) kein Zitat. */
export function quoteToShow(activeSessionId: string | null, pending: PendingQuote | null): Quote | null {
  return activeSessionId && pending && pending.sessionId === activeSessionId ? pending.quote : null
}
