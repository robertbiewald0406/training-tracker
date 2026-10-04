import { registerSW } from 'virtual:pwa-register'

interface PwaState {
  needRefresh: boolean // neue Version ist geladen und wartet
  persisted: boolean | null // Speicher als "dauerhaft" bestaetigt? null = unbekannt
}
let state: PwaState = { needRefresh: false, persisted: null }
const listeners = new Set<() => void>()
const set = (p: Partial<PwaState>) => {
  state = { ...state, ...p }
  listeners.forEach((l) => l())
}
export const getPwaState = () => state
export function subscribePwa(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

let updateSW: ((reload?: boolean) => Promise<void>) | null = null

/** Neue Version sofort aktivieren und neu laden (nur auf Wunsch des Nutzers). */
export const applyUpdate = () => void updateSW?.(true)

/**
 * Service Worker registrieren (nur im Build aktiv), nach dem Zurueckkehren in die App nach Updates suchen
 * und dauerhaften Speicher anfragen. Das Ergebnis wird nie vorausgesetzt: ohne Zusage laeuft alles weiter.
 */
export function initPwa() {
  try {
    updateSW = registerSW({
      onNeedRefresh: () => set({ needRefresh: true }),
      onRegisteredSW(_url, reg) {
        if (!reg) return
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update().catch(() => {})
        })
      },
    })
  } catch {
    /* kein Service Worker moeglich (z. B. privater Modus): die App laeuft trotzdem */
  }
  void requestPersistence()
}

export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return
    const already = (await navigator.storage.persisted?.()) ?? false
    set({ persisted: already || (await navigator.storage.persist()) })
  } catch {
    set({ persisted: null })
  }
}
