import { describeOverride } from '../lib/adjust'
import { plan } from '../lib/plan'
import { supabase } from '../lib/supabase'
import { deleteAndSync } from '../lib/sync'
import { useLocalData } from '../lib/useLocalData'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

/** Einstellungen: dauerhafte Anpassungen des Plans (plan_override) mit "Zurücksetzen". plan.json bleibt unverändert. */
export function PlanOverridesCard() {
  const { overrides, loaded } = useLocalData()
  if (!loaded) return null
  const rows = [...overrides].sort((a, b) => a.created_at.localeCompare(b.created_at))

  async function reset(ids: string[], what: string) {
    if (!window.confirm(`${what} zurücksetzen? Der Plan gilt danach wieder wie in plan.json.`)) return
    for (const id of ids) await deleteAndSync(supabase, 'plan_override', id)
  }

  return (
    <Card className="space-y-3">
      <h2 className="text-2xl">Dauerhafte Anpassungen</h2>
      {rows.length === 0 ? (
        <p className="text-base">Keine. Der Plan gilt, wie er ist. Anpassungen "Dauerhaft im Plan" erscheinen hier.</p>
      ) : (
        <>
          <ul className="space-y-3">
            {rows.map((o) => {
              const d = describeOverride(o, plan)
              return (
                <li key={o.id} className="space-y-2 border-[3px] border-ink px-3 py-2">
                  <p className="text-base">
                    <strong>{d.day}:</strong> {d.text}
                  </p>
                  <Button onClick={() => void reset([o.id], 'Diese Anpassung')}>Zurücksetzen</Button>
                </li>
              )
            })}
          </ul>
          {rows.length > 1 && (
            <Button onClick={() => void reset(rows.map((o) => o.id), 'Alle Anpassungen')}>Alle zurücksetzen</Button>
          )}
        </>
      )}
    </Card>
  )
}
