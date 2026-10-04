import { getDb, countPending, notifyDb } from './lib/db'
import { refreshPending, saveAndSync } from './lib/sync'
import { supabase } from './lib/supabase'
import { Button } from './ui/Button'
import { Card } from './ui/Card'

// Nur in `npm run dev` sichtbar (siehe App.tsx). Eintraege sind als TESTDATEN markiert.
export function DevTools() {
  async function save() {
    const sessionId = crypto.randomUUID()
    const now = new Date().toISOString()
    await saveAndSync(supabase, 'session', {
      id: sessionId, day_key: 'test', started_at: now, ended_at: null, note: 'TESTDATEN',
    })
    await saveAndSync(supabase, 'workout_set', {
      id: crypto.randomUUID(), session_id: sessionId, exercise_key: 'hs_incline_press',
      set_no: 1, weight_kg: 40, reps: 8, rir: 2, is_warmup: false, side: 'both',
      logged_at: now, note: 'TESTDATEN',
    })
    await saveAndSync(supabase, 'bodyweight', {
      id: crypto.randomUUID(), measured_on: '2000-01-01', weight_kg: 80,
    })
  }
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
  return (
    <Card className="space-y-3 border-dashed">
      <h2 className="text-2xl">Dev</h2>
      <Button variant="baby" onClick={() => void save()}>
        Testdaten speichern
      </Button>
      <Button variant="primary" onClick={() => void clearLocal()}>
        Lokale Daten löschen
      </Button>
    </Card>
  )
}
