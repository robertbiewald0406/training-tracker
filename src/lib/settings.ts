import { getMeta, setMeta } from './db'

export interface Settings {
  sound: boolean // Ton am Pausenende
  vibration: boolean // Vibration am Pausenende (nur wo unterstuetzt)
}
export const DEFAULT_SETTINGS: Settings = { sound: true, vibration: true }
const KEY = 'settings' // lokaler Store meta, nie synchronisiert

export function normalizeSettings(raw: unknown): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    sound: typeof r.sound === 'boolean' ? r.sound : DEFAULT_SETTINGS.sound,
    vibration: typeof r.vibration === 'boolean' ? r.vibration : DEFAULT_SETTINGS.vibration,
  }
}

let current: Settings = DEFAULT_SETTINGS
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export const getSettings = () => current
export function subscribeSettings(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}
export async function loadSettings() {
  try {
    current = normalizeSettings(await getMeta(KEY))
  } catch {
    current = DEFAULT_SETTINGS
  }
  emit()
}
export async function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch }
  emit()
  await setMeta(KEY, current)
}
