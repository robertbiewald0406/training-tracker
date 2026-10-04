import { useEffect, useRef, useState } from 'react'
import { Button } from './Button'
import { Card } from './Card'
import { Stopwatch } from './icons'

interface Props {
  endsAt: number // ms-Zeitstempel: der Timer laeuft ueber die Endzeit und bleibt im Hintergrund korrekt
  onAdjust: (deltaMs: number) => void
  onSkip: () => void
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export function RestTimer({ endsAt, onAdjust, onSkip }: Props) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000))
  const wasRunning = useRef(left > 0)
  useEffect(() => {
    if (left > 0) wasRunning.current = true
    else if (wasRunning.current) {
      wasRunning.current = false
      navigator.vibrate?.(300)
    }
  }, [left])

  // Fest am oberen Rand (kein Layout-Sprung beim Start), ruhiger Kartengrund hinter der Zahl.
  const adj = 'num !min-h-14 !w-24 shrink-0 !px-0 !text-xl'
  return (
    <div className="fixed inset-x-2 top-2 z-30 mx-auto max-w-md">
      <Card tone="baby" className="space-y-3 p-3" role="timer" aria-label={left > 0 ? 'Pause' : 'Pause vorbei'}>
        <div className="flex items-center gap-2">
          <Button className={adj} onClick={() => onAdjust(-15_000)} aria-label="15 Sekunden weniger">
            −15
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <p className="flex items-center justify-center gap-1 text-base font-bold uppercase">
              <Stopwatch className="size-5" /> {left > 0 ? 'Pause' : 'Weiter!'}
            </p>
            <p className="num text-6xl leading-none">{fmt(left)}</p>
          </div>
          <Button
            className={adj}
            onClick={() => onAdjust(Math.max(endsAt, Date.now()) - endsAt + 15_000)}
            aria-label="15 Sekunden mehr"
          >
            +15
          </Button>
        </div>
        <Button variant="primary" onClick={onSkip}>
          {left > 0 ? 'Überspringen' : 'Weiter'}
        </Button>
      </Card>
    </div>
  )
}
