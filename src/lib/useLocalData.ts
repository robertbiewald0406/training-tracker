import { useEffect, useState } from 'react'
import { getAll, subscribeDb } from './db'
import type { LocalRow } from './types'

interface Data {
  sessions: LocalRow<'session'>[]
  sets: LocalRow<'workout_set'>[]
  loaded: boolean
}

/** Liest Einheiten und Saetze aus IndexedDB und aktualisiert sich bei jeder lokalen Aenderung. */
export function useLocalData(): Data {
  const [data, setData] = useState<Data>({ sessions: [], sets: [], loaded: false })
  useEffect(() => {
    let alive = true
    let seq = 0
    const load = async () => {
      const mine = ++seq
      const [sessions, sets] = await Promise.all([getAll('session'), getAll('workout_set')])
      if (alive && mine === seq) setData({ sessions, sets, loaded: true })
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
