import { useEffect, useState } from 'react'
import { getAll, subscribeDb } from './db'
import type { LocalRow } from './types'

interface Data {
  sessions: LocalRow<'session'>[]
  sets: LocalRow<'workout_set'>[]
  bodyweight: LocalRow<'bodyweight'>[]
  adjustments: LocalRow<'session_adjustment'>[]
  overrides: LocalRow<'plan_override'>[]
  loaded: boolean
}

/** Liest Einheiten, Saetze und Koerpergewicht aus IndexedDB und aktualisiert sich bei jeder lokalen Aenderung. */
export function useLocalData(): Data {
  const [data, setData] = useState<Data>({ sessions: [], sets: [], bodyweight: [], adjustments: [], overrides: [], loaded: false })
  useEffect(() => {
    let alive = true
    let seq = 0
    const load = async () => {
      const mine = ++seq
      const [sessions, sets, bodyweight, adjustments, overrides] = await Promise.all([
        getAll('session'),
        getAll('workout_set'),
        getAll('bodyweight'),
        getAll('session_adjustment'),
        getAll('plan_override'),
      ])
      if (alive && mine === seq) setData({ sessions, sets, bodyweight, adjustments, overrides, loaded: true })
    }
    void load()
    const off = subscribeDb(() => void load())
    return () => {
      alive = false
      off()
    }
  }, [])
  return data
}
