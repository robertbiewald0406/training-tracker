import { useEffect, useState } from 'react'
import { activeSession } from '../lib/logger'
import { plan } from '../lib/plan'
import { pruneStalePositions } from '../lib/positions'
import { quoteToShow, type PendingQuote } from '../lib/quotes'
import { useLocalData } from '../lib/useLocalData'
import { Home } from './Home'
import { QuoteCard } from './QuoteCard'
import { Workout } from './Workout'

/** Offene Einheit (ended_at = null) -> Workout (Wiederaufnahme), sonst Startseite. */
export function Logger() {
  const { sessions, sets, loaded } = useLocalData()
  // Nur im Speicher: nach einem Neuladen (Wiederaufnahme) gibt es kein Zitat mehr.
  const [pending, setPending] = useState<PendingQuote | null>(null)
  // Beim Start: gemerkte Positionen ohne lokale (offene) Session verwerfen.
  useEffect(() => {
    if (loaded) void pruneStalePositions(sessions)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])
  if (!loaded) return null
  const active = activeSession(sessions, plan)
  if (!active) return <Home sessions={sessions} sets={sets} onQuote={setPending} />
  const quote = quoteToShow(active.id, pending)
  if (quote) return <QuoteCard quote={quote} onGo={() => setPending(null)} />
  return <Workout key={active.id} session={active} sessions={sessions} sets={sets} />
}
