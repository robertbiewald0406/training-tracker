import { useEffect, useRef, useState } from 'react'
import { Button } from './Button'
import { Card } from './Card'
import { getSettings } from '../lib/settings'
import { playEndSignal } from '../lib/signal'
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
      playEndSignal(getSettings())
    }
  }, [left])

  // Fest am oberen Rand (kein Layout-Sprung beim Start), eine schlanke Zeile auf ruhigem Kartengrund.
  const adj = 'num !min-h-14 !w-14 shrink-0 !px-0 !text-base'
  return (
    <div className="fixed inset-x-2 top-[calc(0.5rem+env(safe-area-inset-top))] z-30 mx-auto max-w-md">
      <Card tone="baby" className="p-2" role="timer" aria-label={left > 0 ? 'Pause' : 'Pause vorbei'}>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 pl-1">
            <p className="flex items-center gap-1 text-sm font-bold uppercase leading-none">
              <Stopwatch className="size-4" /> {left > 0 ? 'Pause' : 'Weiter!'}
            </p>
            <p className="num text-4xl leading-none">{fmt(left)}</p>
          </div>
          <Button className={adj} onClick={() => onAdjust(-15_000)} aria-label="15 Sekunden weniger">
            −15
          </Button>
          <Button
            className={adj}
            onClick={() => onAdjust(Math.max(endsAt, Date.now()) - endsAt + 15_000)}
            aria-label="15 Sekunden mehr"
          >
            +15
          </Button>
          <Button className="!w-auto shrink-0 !px-3 !text-base" onClick={onSkip}>
            Weiter
          </Button>
        </div>
      </Card>
    </div>
  )
}
