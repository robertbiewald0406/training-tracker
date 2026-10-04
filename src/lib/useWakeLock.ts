import { useEffect } from 'react'

interface LockLike {
  released: boolean
  release: () => Promise<void>
  addEventListener: (type: 'release', cb: () => void) => void
}
export interface WakeEnv {
  nav: { wakeLock?: { request: (t: 'screen') => Promise<LockLike> } }
  doc: {
    visibilityState: string
    addEventListener: (t: 'visibilitychange', cb: () => void) => void
    removeEventListener: (t: 'visibilitychange', cb: () => void) => void
  }
}

/**
 * Haelt den Bildschirm wach. Beim Zurueckkehren in die App (visibilitychange) wird die Sperre erneut angefordert,
 * falls sie fehlt oder vom System freigegeben wurde. Fehlt die API: kein Effekt.
 */
export function wakeLockController(env: WakeEnv) {
  let lock: LockLike | null = null
  let stopped = false
  let requesting = false
  const acquire = async () => {
    if (!env.nav.wakeLock || stopped || requesting || (lock && !lock.released)) return
    requesting = true
    try {
      const l = await env.nav.wakeLock.request('screen')
      if (stopped) void l.release()
      else {
        lock = l
        l.addEventListener('release', () => {
          if (lock === l) lock = null
        })
      }
    } catch {
      /* z. B. Akkusparmodus oder Tab im Hintergrund */
    } finally {
      requesting = false
    }
  }
  const onVisible = () => {
    if (env.doc.visibilityState === 'visible') void acquire()
  }
  return {
    start() {
      void acquire()
      env.doc.addEventListener('visibilitychange', onVisible)
    },
    stop() {
      stopped = true
      env.doc.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    },
    acquire,
  }
}

export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    const c = wakeLockController({ nav: navigator as unknown as WakeEnv['nav'], doc: document })
    c.start()
    return () => c.stop()
  }, [active])
}
