import type { Session } from '@supabase/supabase-js'

type StorageLike = Pick<Storage, 'length' | 'key' | 'getItem'>

/** Die von supabase-js lokal gespeicherte Sitzung (Schluessel sb-<projekt>-auth-token), auch mit abgelaufenem Token. */
export function readStoredSession(storage: StorageLike): Session | null {
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)
      if (!k || !/^sb-.+-auth-token$/.test(k)) continue
      const v = JSON.parse(storage.getItem(k) ?? 'null')
      if (v && typeof v.refresh_token === 'string' && typeof v.user?.id === 'string') return v as Session
    }
  } catch {
    /* kaputter Speicher: wie nicht angemeldet behandeln */
  }
  return null
}

/** Netzwerkfehler (kein Verbindungsproblem der Anmeldedaten selbst). */
export function isNetworkish(error: { name?: string; message?: string; status?: number } | null | undefined): boolean {
  if (!error) return false
  return (
    error.name === 'AuthRetryableFetchError' ||
    error.status === 0 ||
    /failed to fetch|network|load failed|fetch/i.test(error.message ?? '')
  )
}

/**
 * Offline-Start: supabase-js liefert ohne Netz keine Sitzung, sobald der Token (ca. 1 Stunde) abgelaufen ist, weil
 * das Erneuern scheitert. Die Daten liegen lokal, also bleibt der Nutzer angemeldet, solange die gespeicherte Sitzung
 * existiert und der Fehler nur das Netz betrifft. Eine abgemeldete oder widerrufene Sitzung ist lokal entfernt und
 * wird deshalb nie wiederbelebt. Synchronisieren braucht weiter eine gueltige Sitzung (siehe Pull/Sync).
 */
export function resolveSession(
  session: Session | null,
  error: { name?: string; message?: string; status?: number } | null | undefined,
  storage: StorageLike,
  online: boolean,
): Session | null {
  if (session) return session
  if (!online || isNetworkish(error)) return readStoredSession(storage)
  return null
}

export const SESSION_TIMEOUT_MS = 2500

/**
 * Sitzung fuer den App-Start. Blockiert nie auf das Netz: supabase-js versucht bei abgelaufenem Token das Erneuern
 * mit vielen Wiederholungen und wuerde die App offline lange leer lassen. Ohne Netz wird die gespeicherte Sitzung
 * sofort benutzt, sonst hoechstens SESSION_TIMEOUT_MS gewartet.
 */
export async function loadInitialSession(
  auth: { getSession: () => Promise<{ data: { session: Session | null }; error?: { name?: string; message?: string; status?: number } | null }> },
  storage: StorageLike,
  online: boolean,
  timeoutMs: number = SESSION_TIMEOUT_MS,
): Promise<Session | null> {
  if (!online) {
    const stored = readStoredSession(storage)
    if (stored) return stored
  }
  const timeout = new Promise<{ data: { session: null }; error: { name: string; message: string } }>((resolve) =>
    setTimeout(() => resolve({ data: { session: null }, error: { name: 'AuthRetryableFetchError', message: 'timeout' } }), timeoutMs),
  )
  try {
    const { data, error } = await Promise.race([auth.getSession(), timeout])
    return resolveSession(data.session, error, storage, online)
  } catch (e) {
    return resolveSession(null, e as { message?: string }, storage, online)
  }
}
