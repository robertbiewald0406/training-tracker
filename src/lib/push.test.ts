import { afterEach, describe, expect, it, vi } from 'vitest'
import functionSource from '../../supabase/functions/weekly-push/index.ts?raw'
import {
  buildMessage,
  isGone,
  payloadFor,
  PLANNED_DAYS,
  sameSecret,
  shouldSend,
  type WeeklyReport,
} from '../../supabase/functions/weekly-push/message'
import { disablePush, enablePush, isValidVapidPublicKey, pushAvailability, toRow, urlBase64ToBytes, type PushEnv } from './push'
import { DEFAULT_PAYLOAD, parsePushPayload, targetUrl } from './pushPayload'

const report = (o: Partial<WeeklyReport> = {}): WeeklyReport => ({
  week_start: '2026-10-19', week_end: '2026-10-25', training_days: 4, sessions: 4, better: 3, stable: 5, below: 1, fresh: 2,
  records: 2, skipped: 1, swapped: 1, top_reason: 'zeit', bodyweight_avg: 82.4, bodyweight_prev_avg: 83, ...o,
})

describe('Push-Nachricht (Kurzfassung)', () => {
  it('nur Anzahlen, ohne Uebungsnamen, Gewichte und Koerpergewicht', () => {
    const m = buildMessage(report())
    expect(m.title).toBe('Deine Woche')
    expect(m.body).toBe('4 von 5 Tagen trainiert · 3 besser, 5 stabil, 1 darunter · 2 neue Bestwerte · 2 Übungen angepasst. Details in der App.')
    expect(m.body).not.toMatch(/kg|82|83/)
    expect(m.body.length).toBeLessThanOrEqual(200)
    expect(PLANNED_DAYS).toBe(5)
  })
  it('laesst leere Teile weg und uebertreibt nicht', () => {
    expect(buildMessage(report({ training_days: 0, better: 0, stable: 0, below: 0, records: 0, skipped: 0, swapped: 0 })).body).toBe(
      'Diese Woche kein Training erfasst. Details in der App.',
    )
    expect(buildMessage(report({ training_days: 1, better: 0, stable: 2, below: 0, records: 1, skipped: 0, swapped: 0 })).body).toBe(
      '1 von 5 Tagen trainiert · 0 besser, 2 stabil · 1 neuer Bestwert. Details in der App.',
    )
    expect(buildMessage(report({ better: 0, stable: 0, below: 0, fresh: 3, records: 0, skipped: 1, swapped: 0 })).body).toBe(
      '4 von 5 Tagen trainiert · 1 Übung angepasst. Details in der App.',
    )
  })
  it('Abo je Woche nur einmal, ausser force', () => {
    expect(shouldSend(null, '2026-10-19', false)).toBe(true)
    expect(shouldSend('2026-10-12', '2026-10-19', false)).toBe(true)
    expect(shouldSend('2026-10-19', '2026-10-19', false)).toBe(false)
    expect(shouldSend('2026-10-19', '2026-10-19', true)).toBe(true)
  })
  it('404 und 410 loeschen das Abo, andere Fehler nicht', () => {
    expect([404, 410, 500, 429, undefined].map(isGone)).toEqual([true, true, false, false, false])
  })
  it('Passwort-Vergleich', () => {
    expect(sameSecret('abc', 'abc')).toBe(true)
    expect(sameSecret('abc', 'abd')).toBe(false)
    expect(sameSecret('abc', 'abcd')).toBe(false)
    expect(sameSecret('', 'x')).toBe(false)
  })
  it('Payload der Funktion wird vom Service Worker gelesen', () => {
    const p = parsePushPayload(JSON.stringify(payloadFor(report())))
    expect(p).toMatchObject({ title: 'Deine Woche', url: './', tag: 'weekly-report' })
    expect(p.body).toMatch(/Details in der App/)
  })
})

describe('Service-Worker-Payload', () => {
  it('robust gegen leer, kaputt und zu lang', () => {
    expect(parsePushPayload(null)).toEqual(DEFAULT_PAYLOAD)
    expect(parsePushPayload('')).toEqual(DEFAULT_PAYLOAD)
    expect(parsePushPayload('Hallo').body).toBe('Hallo')
    expect(parsePushPayload('{"title":5,"body":"  "}')).toEqual(DEFAULT_PAYLOAD)
    expect(parsePushPayload(JSON.stringify({ body: 'x'.repeat(500) })).body).toHaveLength(200)
  })
  it('Ziel nur innerhalb der App', () => {
    const scope = 'https://x.github.io/training-tracker/'
    expect(targetUrl('./', scope)).toBe(scope)
    expect(targetUrl('./?tab=verlauf', scope)).toBe(`${scope}?tab=verlauf`)
    expect(targetUrl('https://evil.example/', scope)).toBe(scope)
    expect(targetUrl('//evil.example/x', scope)).toBe(scope)
    expect(targetUrl('/other/', scope)).toBe(scope)
  })
})

// Ein echter VAPID-Schluessel (P-256): oeffentlich 65 Byte, privat 32 Byte.
const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
const b64url = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const PUBLIC = b64url(await crypto.subtle.exportKey('raw', pair.publicKey))
const PRIVATE = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d as string

describe('VAPID-Schluessel', () => {
  it('oeffentlicher Schluessel gueltig, privater und Unsinn abgelehnt', () => {
    expect(PUBLIC).toHaveLength(87)
    expect(PRIVATE).toHaveLength(43)
    expect(isValidVapidPublicKey(PUBLIC)).toBe(true)
    expect(isValidVapidPublicKey(PRIVATE)).toBe(false)
    expect(isValidVapidPublicKey('')).toBe(false)
    expect(isValidVapidPublicKey(`${'A'.repeat(86)}!`)).toBe(false)
    expect(isValidVapidPublicKey('A'.repeat(87))).toBe(false) // beginnt nicht mit 0x04
  })
  it('Umwandlung base64url -> Bytes', () => {
    expect(urlBase64ToBytes(PUBLIC)).toHaveLength(65)
    expect([...urlBase64ToBytes('AQID')]).toEqual([1, 2, 3])
  })
})

const env = (o: Partial<PushEnv> = {}): PushEnv => ({
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5, standalone: true, hasApi: true,
  permission: 'default', vapidKey: PUBLIC, ...o,
})

describe('Verfuegbarkeit des Schalters', () => {
  it('iPhone nur als installierte App', () => {
    expect(pushAvailability(env())).toEqual({ ok: true })
    expect(pushAvailability(env({ standalone: false }))).toEqual({ ok: false, reason: 'ios-not-installed' })
    expect(pushAvailability(env({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', maxTouchPoints: 5, standalone: false }))).toEqual({ ok: false, reason: 'ios-not-installed' }) // iPad im Desktop-Modus
  })
  it('Desktop braucht keine Installation', () => {
    expect(pushAvailability(env({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', maxTouchPoints: 0, standalone: false }))).toEqual({ ok: true })
  })
  it('ohne Schluessel, ohne API, blockiert', () => {
    expect(pushAvailability(env({ vapidKey: '' }))).toEqual({ ok: false, reason: 'not-configured' })
    expect(pushAvailability(env({ vapidKey: PRIVATE }))).toEqual({ ok: false, reason: 'not-configured' })
    expect(pushAvailability(env({ hasApi: false }))).toEqual({ ok: false, reason: 'no-api' })
    expect(pushAvailability(env({ permission: 'denied' }))).toEqual({ ok: false, reason: 'denied' })
  })
})

describe('Ein- und Ausschalten', () => {
  const stubBrowser = (opts: { permission?: NotificationPermission; existing?: boolean } = {}) => {
    const sub = {
      endpoint: 'https://push.example/abc',
      toJSON: () => ({ keys: { p256dh: 'PK', auth: 'AK' } }),
      unsubscribe: vi.fn(async () => true),
    }
    const pm = {
      getSubscription: vi.fn(async () => (opts.existing ? sub : null)),
      subscribe: vi.fn(async () => sub),
    }
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ pushManager: pm }) } })
    vi.stubGlobal('Notification', { requestPermission: vi.fn(async () => opts.permission ?? 'granted') })
    return { sub, pm }
  }
  const client = (error: { message: string } | null = null) => {
    const calls: any[] = []
    const c = {
      from: (table: string) => ({
        upsert: async (row: any, o: any) => (calls.push({ op: 'upsert', table, row, o }), { error }),
        delete: () => ({ eq: async (col: string, v: string) => (calls.push({ op: 'delete', table, col, v }), { error }) }),
      }),
    }
    return { c: c as any, calls }
  }
  afterEach(() => vi.unstubAllGlobals())

  it('Einschalten: Erlaubnis, Abo mit dem oeffentlichen Schluessel, Eintrag ueber endpoint', async () => {
    const { sub, pm } = stubBrowser()
    const { c, calls } = client()
    await enablePush(c, env())
    expect(pm.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) })
    expect(calls).toEqual([
      { op: 'upsert', table: 'push_subscription', row: { endpoint: sub.endpoint, p256dh: 'PK', auth: 'AK', user_agent: expect.any(String) }, o: { onConflict: 'endpoint' } },
    ])
    expect(Object.keys(calls[0].row)).not.toContain('user_id') // user_id setzt die Datenbank
  })
  it('vorhandenes Abo wird wiederverwendet', async () => {
    const { pm } = stubBrowser({ existing: true })
    await enablePush(client().c, env())
    expect(pm.subscribe).not.toHaveBeenCalled()
  })
  it('Erlaubnis verweigert: Fehlermeldung, nichts gespeichert', async () => {
    stubBrowser({ permission: 'denied' })
    const { c, calls } = client()
    await expect(enablePush(c, env())).rejects.toThrow(/blockiert/)
    expect(calls).toEqual([])
  })
  it('Speichern schlaegt fehl: Abo wird wieder beendet', async () => {
    const { sub } = stubBrowser()
    await expect(enablePush(client({ message: 'boom' }).c, env())).rejects.toThrow(/boom/)
    expect(sub.unsubscribe).toHaveBeenCalled()
  })
  it('nicht verfuegbar (iPhone ohne Installation): keine Anfrage', async () => {
    stubBrowser()
    const { c, calls } = client()
    await expect(enablePush(c, env({ standalone: false }))).rejects.toThrow(/Home-Bildschirm/)
    expect(calls).toEqual([])
  })
  it('Ausschalten: Eintrag loeschen, dann Abo beenden', async () => {
    const { sub } = stubBrowser({ existing: true })
    const { c, calls } = client()
    await disablePush(c)
    expect(calls).toEqual([{ op: 'delete', table: 'push_subscription', col: 'endpoint', v: sub.endpoint }])
    expect(sub.unsubscribe).toHaveBeenCalled()
  })
  it('Ausschalten: schlaegt das Loeschen fehl, bleibt das Abo bestehen', async () => {
    const { sub } = stubBrowser({ existing: true })
    await expect(disablePush(client({ message: 'nope' }).c)).rejects.toThrow(/nope/)
    expect(sub.unsubscribe).not.toHaveBeenCalled()
  })
  it('toRow verlangt beide Schluessel', () => {
    expect(() => toRow({ endpoint: 'x', toJSON: () => ({ keys: { p256dh: 'a' } }) }, 'ua')).toThrow()
  })
})

describe('Geheimnisse', () => {
  const files = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  it('der private Schluessel kommt nirgends im Frontend-Code vor', () => {
    for (const [path, text] of Object.entries(files)) {
      if (path.endsWith('push.test.ts')) continue
      expect(text, path).not.toMatch(/VAPID_PRIVATE|CRON_SECRET|SERVICE_ROLE|BEGIN (EC )?PRIVATE KEY/)
    }
  })
  it('die Edge Function liest alle Geheimnisse nur aus der Umgebung', () => {
    expect(functionSource).toMatch(/secret\('VAPID_PRIVATE_KEY'\)/)
    expect(functionSource).toMatch(/secret\('SUPABASE_SERVICE_ROLE_KEY'\)/)
    expect(functionSource).toMatch(/Deno\.env\.get\(name\)/)
    expect(functionSource).not.toMatch(/eyJ[A-Za-z0-9_-]{8,}|sb_secret_|[A-Za-z0-9_-]{43}=?['"`]/)
    expect(functionSource).toMatch(/x-cron-secret/)
    expect(functionSource).toMatch(/401/)
  })
})
