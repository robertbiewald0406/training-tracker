import { useState, type ReactNode } from 'react'
import { plan } from '../lib/plan'
import { quoteToShow, type PendingQuote } from '../lib/quotes'
import { useLocalData } from '../lib/useLocalData'
import { Home } from './Home'
import { QuoteCard } from './QuoteCard'
import { Workout } from './Workout'

/** Offene Einheit (ended_at = null) -> Workout (Wiederaufnahme), sonst Startseite. */
export function Logger({ extras }: { extras?: ReactNode }) {
  const { sessions, sets, loaded } = useLocalData()
  // Nur im Speicher: nach einem Neuladen (Wiederaufnahme) gibt es kein Zitat mehr.
  const [pending, setPending] = useState<PendingQuote | null>(null)
  if (!loaded) return null
  const planKeys = new Set(plan.days.map((d) => d.key))
  const active = sessions
    .filter((s) => s.ended_at === null && planKeys.has(s.day_key))
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
  if (!active) return <Home sessions={sessions} extras={extras} onQuote={setPending} />
  const quote = quoteToShow(active.id, pending)
  if (quote) return <QuoteCard quote={quote} onGo={() => setPending(null)} />
  return <Workout key={active.id} session={active} sessions={sessions} sets={sets} />
}
