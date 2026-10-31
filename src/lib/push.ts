import type { SupabaseClient } from '@supabase/supabase-js'

// Push-Nachrichten fuer den Wochenbericht: Schalter in den Einstellungen. Ein Abo gehoert zu einem Geraet und wird
// nicht mit den Trainingsdaten synchronisiert, sondern direkt in push_subscription geschrieben (nur online moeglich).
// Der oeffentliche VAPID-Schluessel ist kein Geheimnis. Der private Schluessel liegt nur als Supabase-Secret.

export const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim() ?? ''

export function urlBase64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Oeffentlicher VAPID-Schluessel = 65 Byte, beginnt mit 0x04. Faengt z. B. einen versehentlich eingetragenen privaten Schluessel (32 Byte) ab. */
export function isValidVapidPublicKey(key: string): boolean {
  if (!/^[A-Za-z0-9_-]{87}$/.test(key)) return false
  try {
    const b = urlBase64ToBytes(key)
    return b.length === 65 && b[0] === 4
  } catch {
    return false
  }
}

export type PushAvailability =
  | { ok: true }
  | { ok: false; reason: 'not-configured' | 'no-api' | 'ios-not-installed' | 'denied' }

export interface PushEnv {
  userAgent: string
  maxTouchPoints: number
  standalone: boolean // als App auf dem Home-Bildschirm geoeffnet
  hasApi: boolean // Service Worker, PushManager und Notification vorhanden
  permission: NotificationPermission | 'unsupported'
  vapidKey: string
}

export function browserEnv(): PushEnv {
  const w = typeof window === 'undefined' ? undefined : window
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  return {
    userAgent: nav?.userAgent ?? '',
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    standalone: Boolean((nav as { standalone?: boolean } | undefined)?.standalone) || Boolean(w?.matchMedia?.('(display-mode: standalone)').matches),
    hasApi: Boolean(nav && 'serviceWorker' in nav && w && 'PushManager' in w && 'Notification' in w),
    permission: w && 'Notification' in w ? Notification.permission : 'unsupported',
    vapidKey: VAPID_PUBLIC_KEY,
  }
}

const isIos = (e: PushEnv) => /iPhone|iPad|iPod/.test(e.userAgent) || (/Macintosh/.test(e.userAgent) && e.maxTouchPoints > 1)

/** Kann der Schalter benutzt werden? Auf dem iPhone nur, wenn die App zum Home-Bildschirm hinzugefuegt und von dort geoeffnet wurde. */
export function pushAvailability(e: PushEnv = browserEnv()): PushAvailability {
  if (!isValidVapidPublicKey(e.vapidKey)) return { ok: false, reason: 'not-configured' }
  if (isIos(e) && !e.standalone) return { ok: false, reason: 'ios-not-installed' }
  if (!e.hasApi) return { ok: false, reason: 'no-api' }
  if (e.permission === 'denied') return { ok: false, reason: 'denied' }
  return { ok: true }
}

export const PUSH_MESSAGES: Record<Exclude<PushAvailability, { ok: true }>['reason'], string> = {
  'not-configured': 'Push ist in dieser Version noch nicht eingerichtet.',
  'no-api': 'Dieses Gerät oder dieser Browser unterstützt keine Push-Nachrichten.',
  'ios-not-installed':
    'Auf dem iPhone geht das nur in der installierten App: In Safari auf "Teilen" tippen, "Zum Home-Bildschirm" wählen und die App von dort öffnen.',
  denied: 'Mitteilungen sind für diese App blockiert. In den iPhone-Einstellungen unter Mitteilungen wieder erlauben.',
}

async function registration() {
  return navigator.serviceWorker.ready
}

/** Ist auf diesem Geraet ein Abo aktiv? */
export async function isPushEnabled(): Promise<boolean> {
  try {
    if (!browserEnv().hasApi) return false
    return Boolean(await (await registration()).pushManager.getSubscription())
  } catch {
    return false
  }
}

/** Zeile fuer push_subscription aus einem Browser-Abo. */
export function toRow(sub: { endpoint: string; toJSON(): { keys?: Record<string, string> } }, userAgent: string) {
  const keys = sub.toJSON().keys ?? {}
  if (!keys.p256dh || !keys.auth) throw new Error('Abo ohne Schlüssel')
  return { endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: userAgent.slice(0, 200) }
}

/** Einschalten: Erlaubnis erfragen (nur im Tap des Nutzers aufrufen), Abo anlegen, in Supabase eintragen. */
export async function enablePush(client: SupabaseClient, env: PushEnv = browserEnv()): Promise<void> {
  const avail = pushAvailability(env)
  if (!avail.ok) throw new Error(PUSH_MESSAGES[avail.reason])
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error(PUSH_MESSAGES.denied)
  const reg = await registration()
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(env.vapidKey) }))
  const { error } = await client.from('push_subscription').upsert(toRow(sub, env.userAgent), { onConflict: 'endpoint' })
  if (error) {
    // Ohne Eintrag in Supabase bekommt das Geraet nichts: Abo wieder entfernen, damit der Schalter ehrlich "aus" zeigt.
    await sub.unsubscribe().catch(() => {})
    throw new Error(`Speichern fehlgeschlagen: ${error.message}`)
  }
}

/** Ausschalten: Eintrag in Supabase loeschen, dann das Abo im Browser beenden. */
export async function disablePush(client: SupabaseClient): Promise<void> {
  const sub = await (await registration()).pushManager.getSubscription()
  if (!sub) return
  const { error } = await client.from('push_subscription').delete().eq('endpoint', sub.endpoint)
  if (error) throw new Error(`Löschen fehlgeschlagen: ${error.message}`)
  await sub.unsubscribe()
}
