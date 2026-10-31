// Inhalt einer Push-Nachricht und Ziel beim Antippen. Reine Funktionen, vom Service Worker (src/sw.ts) genutzt.

export interface PushPayload {
  title: string
  body: string
  url: string // relativ zum Scope der App
  tag: string
}

export const DEFAULT_PAYLOAD: PushPayload = { title: 'MuscleBrain', body: 'Neue Nachricht', url: './', tag: 'musclebrain' }
const MAX_BODY = 200

/** Liest den Text einer Push-Nachricht; unlesbar oder leer ergibt eine neutrale Standardnachricht, nie einen Fehler. */
export function parsePushPayload(text: string | null | undefined): PushPayload {
  if (!text) return DEFAULT_PAYLOAD
  try {
    const raw = JSON.parse(text) as Record<string, unknown>
    const str = (v: unknown, fallback: string, max: number) =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback
    return {
      title: str(raw.title, DEFAULT_PAYLOAD.title, 80),
      body: str(raw.body, DEFAULT_PAYLOAD.body, MAX_BODY),
      url: str(raw.url, DEFAULT_PAYLOAD.url, 200),
      tag: str(raw.tag, DEFAULT_PAYLOAD.tag, 40),
    }
  } catch {
    return { ...DEFAULT_PAYLOAD, body: text.trim().slice(0, MAX_BODY) || DEFAULT_PAYLOAD.body }
  }
}

/** Ziel beim Antippen: nur Adressen innerhalb des App-Scopes, sonst der Start der App. */
export function targetUrl(url: string, scope: string): string {
  try {
    const u = new URL(url, scope)
    return u.href.startsWith(scope) ? u.href : scope
  } catch {
    return scope
  }
}
