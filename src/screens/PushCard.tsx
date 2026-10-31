import { useEffect, useState } from 'react'
import { disablePush, enablePush, isPushEnabled, PUSH_MESSAGES, pushAvailability } from '../lib/push'
import { supabase } from '../lib/supabase'
import { Card } from '../ui/Card'
import { Toggle } from '../ui/Toggle'

/** Einstellungen: Push-Nachricht mit der Kurzfassung der Woche, sonntags 18 Uhr. Der Bericht selbst ist in der App. */
export function PushCard() {
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const avail = pushAvailability()

  useEffect(() => {
    void isPushEnabled().then(setOn)
  }, [])

  async function toggle(next: boolean) {
    setBusy(true)
    setError(null)
    try {
      if (next) await enablePush(supabase)
      else await disablePush(supabase)
      setOn(await isPushEnabled())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setOn(await isPushEnabled())
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="text-2xl">Wochenbericht per Push</h2>
      <p className="text-base">
        Sonntag um 18 Uhr eine kurze Nachricht mit der Zusammenfassung deiner Woche. Die Details öffnen sich in der App.
      </p>
      {avail.ok || on ? (
        <div className="flex">
          <Toggle
            label={on ? 'An' : 'Aus'}
            checked={on}
            onChange={(v) => !busy && void toggle(v)}
          />
        </div>
      ) : (
        <p role="note" className="border-[3px] border-ink bg-baby px-3 py-2 text-base">
          {PUSH_MESSAGES[avail.reason]}
        </p>
      )}
      {error && (
        <p role="alert" className="border-[3px] border-ink bg-err px-3 py-2 text-base text-white">
          {error}
        </p>
      )}
    </Card>
  )
}
