import type { Settings } from './settings'

// Web Audio darf auf iOS erst nach einer Nutzergeste starten: beim ersten Tap der Einheit freischalten.
let ctx: AudioContext | null = null

export function unlockAudio() {
  try {
    const AC: typeof AudioContext | undefined =
      typeof window === 'undefined' ? undefined : window.AudioContext ?? (window as any).webkitAudioContext
    if (!AC) return
    ctx ??= new AC()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    /* kein Ton moeglich, die App laeuft trotzdem */
  }
}

/** Drei kurze Toene. Ohne freigeschaltetes Audio passiert nichts. */
function beep() {
  if (!ctx || ctx.state !== 'running') return
  const t0 = ctx.currentTime
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    const t = t0 + i * 0.25
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.2)
  }
}

export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

export interface SignalEnv {
  beep: () => void
  canVibrate: () => boolean
  vibrate: (pattern: number[]) => void
}
const realEnv: SignalEnv = {
  beep,
  canVibrate,
  vibrate: (p) => void navigator.vibrate(p),
}

/** Signal am Pausenende. Ton und Vibration sind einzeln abschaltbar; Vibration nur, wo unterstuetzt. */
export function playEndSignal(settings: Settings, env: SignalEnv = realEnv) {
  try {
    if (settings.sound) env.beep()
    if (settings.vibration && env.canVibrate()) env.vibrate([200, 100, 200])
  } catch {
    /* Signal ist nie wichtiger als die App */
  }
}
