import type { SupabaseClient } from '@supabase/supabase-js'
import { applyRemote, removeMissing, removeMissingSessions, syncedLocalIds } from './db'
import type { StoreName } from './types'

// Supabase liefert hoechstens 1000 Zeilen pro Abfrage (oft weniger, je nach Projekt-Limit).
export const PAGE = 1000
// Schutzbremse des Abgleichs. Entfernen wuerde eine Tabelle MEHR als BRAKE_MIN_ROWS Zeilen UND mehr als
// BRAKE_MAX_FRACTION der lokal synchronisierten Zeilen betreffen, oder liefert der Pull 0 Zeilen trotz lokaler
// synchronisierter Zeilen, wird nichts entfernt, bis der Nutzer bestaetigt.
export const BRAKE_MAX_FRACTION = 0.2
export const BRAKE_MIN_ROWS = 10
export const AUTH_EXPIRED_MESSAGE = 'Anmeldung abgelaufen, bitte neu einloggen'
const STORE_LABEL: Record<StoreName, string> = {
  session: 'Einheiten',
  workout_set: 'Sätze',
  bodyweight: 'Körpergewicht',
}
// Reihenfolge beim Pull. Entfernen (nach vollstaendigem Pull) erst workout_set, dann session, dann bodyweight.
const PULL_ORDER: StoreName[] = ['session', 'workout_set', 'bodyweight']

export type BrakeReason = 'zero' | 'mass'

/** Entscheidet, ob der Abgleich einer Tabelle angehalten wird. */
export function reconcileBrake(local: number, missing: number, remoteRows: number): BrakeReason | null {
  if (local > 0 && remoteRows === 0) return 'zero'
  if (missing > BRAKE_MIN_ROWS && missing / local > BRAKE_MAX_FRACTION) return 'mass'
  return null
}

/** Sitzung vorhanden und Token nicht abgelaufen; bei Bedarf wird vorher erneuert. */
export async function ensureValidSession(client: SupabaseClient): Promise<boolean> {
  const valid = (s: { expires_at?: number } | null | undefined) =>
    !!s && typeof s.expires_at === 'number' && s.expires_at * 1000 > Date.now() + 10_000
  try {
    const session = (await client.auth.getSession()).data.session
    if (valid(session)) return true
    if (!session) return false
    const r = await client.auth.refreshSession()
    return !r.error && valid(r.data.session)
  } catch {
    return false
  }
}

/** 401, JWT- und Token-Meldungen (z. B. "JWT expired") zaehlen als Anmeldeproblem. */
export function isAuthError(e: { message?: string; status?: number; code?: string } | null | undefined): boolean {
  if (!e) return false
  return (
    e.status === 401 ||
    e.code === 'PGRST301' ||
    e.code === 'PGRST302' ||
    /jwt|token|not authenticated|unauthori[sz]ed|auth session missing/i.test(e.message ?? '')
  )
}

export interface PullResult {
  completed: StoreName[] // Tabellen, die vollstaendig (alle Seiten, kein Fehler) abgerufen wurden
  errors: string[] // "<tabelle> laden: <meldung>"
  conflicts: string[] // lokal erhaltene Einheiten, die remote fehlen, aber ungesendete Saetze haben
  removed: number
  authExpired: boolean // Abgleich uebersprungen, weil die Anmeldung fehlt oder abgelaufen ist
  held: { total: number; text: string } | null // Schutzbremse hat angehalten, nichts wurde entfernt
}

/**
 * Holt alle Zeilen seitenweise (range, stabil sortiert nach id) bis eine Seite leer ist und uebernimmt sie ueber
 * applyRemote (ueberschreibt nie pending oder Tombstones). Nur wenn eine gueltige Sitzung vorliegt UND eine Tabelle
 * vollstaendig geladen wurde, werden lokale, synchronisierte Zeilen entfernt, die remote nicht mehr existieren.
 * Bei abgelaufener Anmeldung liefert RLS evtl. eine leere Liste ohne Fehler: dann wird nichts entfernt (Hinzufuegen
 * laeuft weiter). Die Schutzbremse haelt grosse Abgleiche an, ausser `force` (nach Bestaetigung) ist gesetzt.
 * Aufrufer: erst ausstehende Uploads senden, dann pullen (siehe syncNow).
 */
export async function pullAll(client: SupabaseClient, opts: { force?: boolean } = {}): Promise<PullResult> {
  const result: PullResult = { completed: [], errors: [], conflicts: [], removed: 0, authExpired: false, held: null }
  const ids = new Map<StoreName, Set<string>>()
  let authBad = !(await ensureValidSession(client))

  for (const store of PULL_ORDER) {
    const seen = new Set<string>()
    try {
      for (let from = 0; ; ) {
        const { data, error } = await client
          .from(store)
          .select('*')
          .order('id')
          .range(from, from + PAGE - 1)
        if (error) {
          if (isAuthError(error)) authBad = true
          throw new Error(error.message)
        }
        if (!data || data.length === 0) break // erst eine leere Seite beendet den Pull (Server darf weniger liefern)
        await applyRemote(store, data as any[])
        for (const r of data as { id: string }[]) seen.add(r.id)
        from += data.length
      }
      ids.set(store, seen)
      result.completed.push(store)
    } catch (e) {
      if (!authBad) result.errors.push(`${store} laden: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Sitzung kann waehrend des Pulls ablaufen: vor dem Entfernen erneut pruefen.
  if (!authBad) authBad = !(await ensureValidSession(client))
  if (authBad) {
    result.authExpired = true
    result.errors.push(AUTH_EXPIRED_MESSAGE)
    return result // nichts entfernen
  }

  try {
    // Schutzbremse: erst fuer alle vollstaendig geladenen Tabellen pruefen, dann (nur wenn frei) entfernen.
    if (!opts.force) {
      const lines: string[] = []
      let total = 0
      for (const store of PULL_ORDER) {
        const remoteIds = ids.get(store)
        if (!remoteIds) continue
        const local = await syncedLocalIds(store)
        const missing = local.filter((id) => !remoteIds.has(id)).length
        const why = reconcileBrake(local.length, missing, remoteIds.size)
        if (!why) continue
        total += missing
        lines.push(
          why === 'zero'
            ? `${STORE_LABEL[store]}: Supabase lieferte 0 Zeilen, lokal sind ${local.length} synchronisiert`
            : `${STORE_LABEL[store]}: ${missing} von ${local.length} würden entfernt`,
        )
      }
      if (lines.length) {
        result.held = { total, text: `Abgleich angehalten, nichts wurde gelöscht. ${lines.join('; ')}.` }
        return result
      }
    }
    const sets = ids.get('workout_set')
    if (sets) result.removed += (await removeMissing('workout_set', sets)).length
    const sessions = ids.get('session')
    if (sessions) {
      const { removed, conflicts } = await removeMissingSessions(sessions)
      result.removed += removed.length
      for (const s of conflicts)
        result.conflicts.push(
          `Konflikt: Einheit vom ${new Date(s.started_at).toLocaleDateString('de-DE')} fehlt in Supabase, ` +
            `hat aber noch nicht gesendete Sätze. Sie bleibt lokal erhalten.`,
        )
    }
    const bw = ids.get('bodyweight')
    if (bw) result.removed += (await removeMissing('bodyweight', bw)).length
  } catch (e) {
    result.errors.push(`Abgleich: ${e instanceof Error ? e.message : String(e)}`)
  }
  return result
}
