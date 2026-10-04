import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, normalizeSettings } from './settings'
import { playEndSignal, type SignalEnv } from './signal'
import { wakeLockController, type WakeEnv } from './useWakeLock'

const env = (canVibrate = true) => {
  const calls: string[] = []
  const e: SignalEnv = {
    beep: () => void calls.push('beep'),
    canVibrate: () => canVibrate,
    vibrate: () => void calls.push('vibrate'),
  }
  return { e, calls }
}

describe('Signal am Pausenende', () => {
  it('Ton und Vibration an: beides', () => {
    const { e, calls } = env()
    playEndSignal({ sound: true, vibration: true }, e)
    expect(calls).toEqual(['beep', 'vibrate'])
  })
  it('Ton und Vibration sind einzeln abschaltbar', () => {
    let x = env()
    playEndSignal({ sound: false, vibration: true }, x.e)
    expect(x.calls).toEqual(['vibrate'])
    x = env()
    playEndSignal({ sound: true, vibration: false }, x.e)
    expect(x.calls).toEqual(['beep'])
    x = env()
    playEndSignal({ sound: false, vibration: false }, x.e)
    expect(x.calls).toEqual([])
  })
  it('Vibration nur, wo unterstuetzt', () => {
    const { e, calls } = env(false)
    playEndSignal({ sound: true, vibration: true }, e)
    expect(calls).toEqual(['beep'])
  })
  it('Fehler im Signal werfen nie', () => {
    const e: SignalEnv = { beep: () => { throw new Error('x') }, canVibrate: () => true, vibrate: () => {} }
    expect(() => playEndSignal({ sound: true, vibration: true }, e)).not.toThrow()
  })
  it('Einstellungen: Standard an, kaputte Werte fallen auf Standard', () => {
    expect(DEFAULT_SETTINGS).toEqual({ sound: true, vibration: true })
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings({ sound: false, vibration: 'ja' })).toEqual({ sound: false, vibration: true })
  })
})

describe('Wake Lock', () => {
  function setup(supported = true) {
    const listeners: (() => void)[] = []
    const releaseCbs: (() => void)[][] = []
    const locks: { released: boolean; release: ReturnType<typeof vi.fn> }[] = []
    const request = vi.fn(async () => {
      const cbs: (() => void)[] = []
      const lock = {
        released: false,
        release: vi.fn(async () => void (lock.released = true)),
        addEventListener: (_: 'release', cb: () => void) => void cbs.push(cb),
      }
      locks.push(lock)
      releaseCbs.push(cbs)
      return lock
    })
    const doc = {
      visibilityState: 'visible',
      addEventListener: (_: 'visibilitychange', cb: () => void) => void listeners.push(cb),
      removeEventListener: (_: 'visibilitychange', cb: () => void) => void listeners.splice(listeners.indexOf(cb), 1),
    }
    const w: WakeEnv = { nav: supported ? { wakeLock: { request } } : {}, doc }
    const tick = () => new Promise((r) => setTimeout(r, 0))
    return { w, doc, listeners, request, locks, releaseCbs, tick }
  }

  it('fordert beim Start an und nicht doppelt, solange die Sperre gehalten wird', async () => {
    const s = setup()
    const c = wakeLockController(s.w)
    c.start()
    await s.tick()
    s.listeners.forEach((l) => l()) // visibilitychange mit vorhandener Sperre
    await s.tick()
    expect(s.request).toHaveBeenCalledTimes(1)
  })
  it('fordert bei visibilitychange erneut an, wenn das System die Sperre freigegeben hat', async () => {
    const s = setup()
    const c = wakeLockController(s.w)
    c.start()
    await s.tick()
    s.locks[0].released = true // iOS gibt die Sperre im Hintergrund frei
    s.releaseCbs[0].forEach((cb) => cb())
    s.doc.visibilityState = 'hidden'
    s.listeners.forEach((l) => l())
    await s.tick()
    expect(s.request).toHaveBeenCalledTimes(1) // im Hintergrund nicht
    s.doc.visibilityState = 'visible'
    s.listeners.forEach((l) => l())
    await s.tick()
    expect(s.request).toHaveBeenCalledTimes(2)
  })
  it('stop gibt die Sperre frei und meldet den Listener ab; ohne API passiert nichts', async () => {
    const s = setup()
    const c = wakeLockController(s.w)
    c.start()
    await s.tick()
    c.stop()
    expect(s.locks[0].release).toHaveBeenCalled()
    expect(s.listeners).toHaveLength(0)
    const n = setup(false)
    const c2 = wakeLockController(n.w)
    c2.start()
    await n.tick()
    expect(n.request).not.toHaveBeenCalled()
  })
})
