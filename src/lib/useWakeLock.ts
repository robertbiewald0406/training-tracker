import { useEffect } from 'react'

/** Haelt den Bildschirm wach, solange `active`. Holt die Sperre nach Tab-Wechsel zurueck. Fehlt die API: kein Effekt. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let stopped = false
    const acquire = async () => {
      try {
        const l = await navigator.wakeLock.request('screen')
        if (stopped) void l.release()
        else lock = l
      } catch {
        /* z. B. Akkusparmodus oder Tab im Hintergrund */
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }
    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [active])
}
