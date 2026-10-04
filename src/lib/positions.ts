import { deleteMeta, listMetaKeys } from './db'
import { POSITION_PREFIX, stalePositionKeys } from './logger'

/**
 * Verwirft gemerkte Positionen, deren Session lokal nicht (mehr) existiert (oder beendet ist).
 * Andere meta-Eintraege (z. B. zuletzt gezeigte Zitate) bleiben unberuehrt. Liefert die verworfenen Keys.
 */
export async function pruneStalePositions(
  sessions: { id: string; ended_at: string | null; day_key: string; started_at: string }[],
): Promise<string[]> {
  const stale = stalePositionKeys(await listMetaKeys(POSITION_PREFIX), sessions)
  for (const k of stale) await deleteMeta(k)
  return stale
}
