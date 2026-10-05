import { getDb, countPending, notifyDb } from './lib/db'
import { rekeyExercise, setsOfExercise } from './lib/rekey'
import { refreshPending, syncNow } from './lib/sync'
import { supabase } from './lib/supabase'
import { Button } from './ui/Button'
import { Card } from './ui/Card'

// Nur in `npm run dev` sichtbar (siehe App.tsx).
export function DevTools() {
  // Leert nur IndexedDB, nie Supabase. Warnt bei ungesyncten Eintraegen (sonst waeren sie endgueltig weg).
  async function clearLocal() {
    const pending = await countPending()
    const warn = pending > 0 ? `ACHTUNG: ${pending} Eintraege sind noch nicht synchronisiert und gehen verloren!\n\n` : ''
    if (!window.confirm(`${warn}Alle lokalen Daten (IndexedDB) loeschen? Supabase bleibt unveraendert.`)) return
    const db = await getDb()
    const stores = ['session', 'workout_set', 'bodyweight'] as const
    const tx = db.transaction([...stores], 'readwrite')
    await Promise.all(stores.map((s) => tx.objectStore(s).clear()))
    await tx.done
    await refreshPending()
    notifyDb()
  }
  // Alte Brustpresse (Plate-Loaded) auf die MTS Chest Press umschluesseln. Gewicht bleibt unveraendert.
  async function rekeyChestPress() {
    const from = 'hs_chest_press'
    const to = 'mts_chest_press'
    const sets = await setsOfExercise(from)
    if (!sets.length) return window.alert(`Keine lokalen Sätze unter ${from}.`)
    const list = sets
      .map((x) => `${new Date(x.logged_at).toLocaleDateString('de-DE')}: ${x.weight_kg} kg × ${x.reps}${x.is_warmup ? ' (Aufwärmen)' : ''}`)
      .join('\n')
    if (!window.confirm(`${sets.length} Sätze von ${from} auf ${to} umstellen? Das Gewicht bleibt unverändert.\n\n${list}`)) return
    const n = await rekeyExercise(from, to)
    await refreshPending()
    void syncNow(supabase)
    window.alert(`${n} Sätze umgestellt. Sie werden jetzt synchronisiert.`)
  }
  return (
    <Card className="space-y-3 border-dashed">
      <h2 className="text-2xl">Dev</h2>
      <Button variant="primary" onClick={() => void clearLocal()}>
        Lokale Daten löschen
      </Button>
      <Button onClick={() => void rekeyChestPress()}>Übung umschlüsseln</Button>
    </Card>
  )
}
