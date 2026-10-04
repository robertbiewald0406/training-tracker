import type { SupabaseClient } from '@supabase/supabase-js'
import { applyRemote, removeMissing, removeMissingSessions } from './db'
import type { StoreName } from './types'

// Supabase liefert hoechstens 1000 Zeilen pro Abfrage (oft weniger, je nach Projekt-Limit).
export const PAGE = 1000
// Reihenfolge beim Pull. Entfernen (nach vollstaendigem Pull) erst workout_set, dann session, dann bodyweight.
const PULL_ORDER: StoreName[] = ['session', 'workout_set', 'bodyweight']

export interface PullResult {
  completed: StoreName[] // Tabellen, die vollstaendig (alle Seiten, kein Fehler) abgerufen wurden
  errors: string[] // "<tabelle> laden: <meldung>"
  conflicts: string[] // lokal erhaltene Einheiten, die remote fehlen, aber ungesendete Saetze haben
  removed: number
}

/**
 * Holt alle Zeilen seitenweise (range, stabil sortiert nach id) bis eine Seite leer ist und uebernimmt sie ueber
 * applyRemote (ueberschreibt nie pending oder Tombstones). Nur fuer vollstaendig geladene Tabellen werden danach
 * lokale, synchronisierte Zeilen entfernt, die remote nicht mehr existieren.
 * Aufrufer: erst ausstehende Uploads senden, dann pullen (siehe syncNow).
 */
export async function pullAll(client: SupabaseClient): Promise<PullResult> {
  const result: PullResult = { completed: [], errors: [], conflicts: [], removed: 0 }
  const ids = new Map<StoreName, Set<string>>()

  for (const store of PULL_ORDER) {
    const seen = new Set<string>()
    try {
      for (let from = 0; ; ) {
        const { data, error } = await client
          .from(store)
          .select('*')
          .order('id')
          .range(from, from + PAGE - 1)
        if (error) throw new Error(error.message)
        if (!data || data.length === 0) break // erst eine leere Seite beendet den Pull (Server darf weniger liefern)
        await applyRemote(store, data as any[])
        for (const r of data as { id: string }[]) seen.add(r.id)
        from += data.length
      }
      ids.set(store, seen)
      result.completed.push(store)
    } catch (e) {
      result.errors.push(`${store} laden: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  try {
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
