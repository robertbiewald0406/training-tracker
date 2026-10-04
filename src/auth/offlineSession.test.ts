import { describe, expect, it } from 'vitest'
import { isNetworkish, loadInitialSession, readStoredSession, resolveSession } from './offlineSession'

const store = (entries: Record<string, string>) => {
  const keys = Object.keys(entries)
  return { length: keys.length, key: (i: number) => keys[i] ?? null, getItem: (k: string) => entries[k] ?? null }
}
const stored = { access_token: 'abgelaufen', refresh_token: 'r', expires_at: 1, user: { id: 'u1', email: 'a@b.c' } }
const withSession = () => store({ 'sb-abcdef-auth-token': JSON.stringify(stored), anderes: 'x' })
const none = () => store({ anderes: 'x' })

describe('Offline-Start mit abgelaufenem Token', () => {
  it('liest die gespeicherte Sitzung auch mit abgelaufenem Token', () => {
    expect(readStoredSession(withSession())?.user.id).toBe('u1')
    expect(readStoredSession(none())).toBeNull()
    expect(readStoredSession(store({ 'sb-x-auth-token': '{kaputt' }))).toBeNull()
    expect(readStoredSession(store({ 'sb-x-auth-token': JSON.stringify({ user: {} }) }))).toBeNull()
  })
  it('Netzfehler beim Erneuern: Nutzer bleibt angemeldet (lokale Daten nutzbar)', () => {
    const err = { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 }
    expect(resolveSession(null, err, withSession(), false)?.user.id).toBe('u1')
    expect(resolveSession(null, err, withSession(), true)?.user.id).toBe('u1')
  })
  it('ohne Netz auch ohne Fehlerobjekt', () => {
    expect(resolveSession(null, null, withSession(), false)?.user.id).toBe('u1')
  })
  it('echte Sitzung hat Vorrang', () => {
    const real = { user: { id: 'neu' } } as any
    expect(resolveSession(real, null, withSession(), false)).toBe(real)
  })
  it('online ohne gespeicherte Sitzung oder bei widerrufener Anmeldung: nicht angemeldet', () => {
    expect(resolveSession(null, null, none(), true)).toBeNull()
    expect(resolveSession(null, null, none(), false)).toBeNull() // abgemeldet = Eintrag entfernt, nichts wiederbelebt
    // Server lehnt die Anmeldung ab (kein Netzfehler): Gespeichertes wird nicht benutzt
    expect(resolveSession(null, { name: 'AuthApiError', message: 'Invalid Refresh Token', status: 400 }, withSession(), true)).toBeNull()
  })
  it('Netzfehler erkennen', () => {
    expect(isNetworkish({ name: 'AuthRetryableFetchError' })).toBe(true)
    expect(isNetworkish({ message: 'TypeError: Failed to fetch' })).toBe(true)
    expect(isNetworkish({ name: 'AuthApiError', message: 'Invalid login', status: 400 })).toBe(false)
    expect(isNetworkish(null)).toBe(false)
  })
})

describe('App-Start blockiert nie auf das Netz', () => {
  const hanging = { getSession: () => new Promise<never>(() => {}) } // wie supabase-js beim Erneuern ohne Netz
  it('ohne Netz: gespeicherte Sitzung sofort, getSession wird gar nicht gewartet', async () => {
    const t0 = Date.now()
    const s = await loadInitialSession(hanging, withSession(), false, 10_000)
    expect(s?.user.id).toBe('u1')
    expect(Date.now() - t0).toBeLessThan(200)
  })
  it('haengendes getSession bei vermeintlichem Netz: nach dem Timeout gespeicherte Sitzung', async () => {
    const s = await loadInitialSession(hanging, withSession(), true, 50)
    expect(s?.user.id).toBe('u1')
  })
  it('schnelle echte Sitzung bleibt unveraendert; ohne Sitzung und ohne Speicher: null', async () => {
    const real = { user: { id: 'echt' } } as any
    expect(await loadInitialSession({ getSession: async () => ({ data: { session: real } }) }, none(), true, 50)).toBe(real)
    expect(await loadInitialSession({ getSession: async () => ({ data: { session: null } }) }, none(), true, 50)).toBeNull()
  })
  it('werfendes getSession: Netzfehler = gespeicherte Sitzung, sonst null', async () => {
    const boom = { getSession: async () => { throw new TypeError('Failed to fetch') } }
    expect((await loadInitialSession(boom, withSession(), true, 50))?.user.id).toBe('u1')
    expect(await loadInitialSession(boom, none(), true, 50)).toBeNull()
  })
})
