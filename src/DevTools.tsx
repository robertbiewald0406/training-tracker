import { getDb, countPending, notifyDb } from './lib/db'
import { refreshPending } from './lib/sync'
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
  return (
    <Card className="space-y-3 border-dashed">
      <h2 className="text-2xl">Dev</h2>
      <Button variant="primary" onClick={() => void clearLocal()}>
        Lokale Daten löschen
      </Button>
    </Card>
  )
}
