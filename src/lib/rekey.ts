import { getDb, notifyDb } from './db'
import type { LocalRow } from './types'

/** Lokale Saetze (ohne Tombstones) einer Uebung, aelteste zuerst. Fuer die Vorschau vor dem Umschluesseln. */
export async function setsOfExercise(exerciseKey: string): Promise<LocalRow<'workout_set'>[]> {
  const db = await getDb()
  const all = (await db.getAll('workout_set')) as LocalRow<'workout_set'>[]
  return all.filter((s) => s.exercise_key === exerciseKey && !s._deleted).sort((a, b) => a.logged_at.localeCompare(b.logged_at))
}

/**
 * Stellt alle lokalen Saetze von `from` auf `to` um (Dev-Werkzeug). Nur exercise_key aendert sich, das Gewicht
 * bleibt wie es ist. Betroffene Saetze werden pending (der Sync schreibt sie per Upsert nach Supabase), _v steigt.
 * Alles in einer Transaktion. Liefert die Anzahl umgestellter Saetze.
 */
export async function rekeyExercise(from: string, to: string): Promise<number> {
  if (from === to) return 0
  const db = await getDb()
  const tx = db.transaction('workout_set', 'readwrite')
  const os = tx.objectStore('workout_set')
  let n = 0
  for (const s of (await os.getAll()) as LocalRow<'workout_set'>[]) {
    if (s.exercise_key !== from || s._deleted) continue
    await os.put({ ...s, exercise_key: to, _sync: 'pending', _v: s._v + 1, _error: undefined })
    n++
  }
  await tx.done
  if (n) notifyDb()
  return n
}
