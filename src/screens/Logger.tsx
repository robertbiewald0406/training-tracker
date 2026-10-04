import type { ReactNode } from 'react'
import { plan } from '../lib/plan'
import { useLocalData } from '../lib/useLocalData'
import { Home } from './Home'
import { Workout } from './Workout'

/** Offene Einheit (ended_at = null) -> Workout (Wiederaufnahme), sonst Startseite. */
export function Logger({ extras }: { extras?: ReactNode }) {
  const { sessions, sets, loaded } = useLocalData()
  if (!loaded) return null
  const planKeys = new Set(plan.days.map((d) => d.key))
  const active = sessions
    .filter((s) => s.ended_at === null && planKeys.has(s.day_key))
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
  return active ? (
    <Workout key={active.id} session={active} sessions={sessions} sets={sets} />
  ) : (
    <Home sessions={sessions} extras={extras} />
  )
}
