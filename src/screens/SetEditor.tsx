import { useState } from 'react'
import { formatNumber, parseNumber } from '../lib/logger'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Segmented } from '../ui/Segmented'
import { Stepper } from '../ui/Stepper'
import { Toggle } from '../ui/Toggle'
import { compareSets, fmtKg, type Trend } from '../lib/stats'
import { ArrowDown, ArrowUp, Flame } from '../ui/icons'

export interface SetValues {
  weight: number
  reps: number
  warmup: boolean
  failure: boolean
}

interface Props {
  title: string
  initial: { weight_kg: number; reps: number } | null
  initialFlags?: { warmup: boolean; failure: boolean }
  stepKg: number
  onStepKg: (n: number) => void
  rampUp: boolean
  reference?: { weight_kg: number; reps: number; label: string } | null // Satz vom letzten Mal
  weightUnit: string
  saveLabel: string
  busy: boolean
  onSave: (v: SetValues) => void
  onCancel?: () => void
}

const TREND_TEXT: Record<Trend, string> = {
  better: 'Besser als letztes Mal',
  same: 'Wie letztes Mal',
  worse: 'Unter letztem Mal',
}

const STEPS = [
  { value: 1, text: '1' },
  { value: 2.5, text: '2,5' },
  { value: 5, text: '5' },
]

// Gewicht und Wiederholungen: per +/- oder direkt eintippen. Der Parent setzt per `key` zurueck.
export function SetEditor(p: Props) {
  const [weight, setWeight] = useState(p.initial ? formatNumber(p.initial.weight_kg) : '')
  const [reps, setReps] = useState(p.initial ? String(p.initial.reps) : '')
  const [warmup, setWarmup] = useState(p.initialFlags?.warmup ?? false)
  const [failure, setFailure] = useState(p.initialFlags?.failure ?? false)

  const w = parseNumber(weight)
  const r = parseNumber(reps)
  const valid = w !== null && w >= 0 && r !== null && Number.isInteger(r) && r >= 1

  const bumpWeight = (dir: 1 | -1) =>
    setWeight(formatNumber(Math.max(0, Math.round(((w ?? 0) + dir * p.stepKg) * 100) / 100)))
  const bumpReps = (dir: 1 | -1) => setReps(String(Math.max(1, Math.round(r ?? 0) + dir)))

  return (
    <Card className="space-y-4">
      <h2 className="text-2xl">{p.title}</h2>
      <Stepper
        label="Gewicht"
        unit={p.weightUnit}
        inputMode="decimal"
        value={weight}
        onValue={setWeight}
        onMinus={() => bumpWeight(-1)}
        onPlus={() => bumpWeight(1)}
      />
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-base">Schritt in kg</span>
        <div className="flex-1">
          <Segmented label="Schrittweite in kg" options={STEPS} value={p.stepKg} onChange={p.onStepKg} />
        </div>
      </div>
      <Stepper
        label="Wiederholungen"
        unit="Wiederholungen"
        inputMode="numeric"
        value={reps}
        onValue={setReps}
        onMinus={() => bumpReps(-1)}
        onPlus={() => bumpReps(1)}
      />
      {p.reference && w !== null && r !== null && r >= 1 && (
        <p className="num flex flex-wrap items-center justify-center gap-x-2 border-[3px] border-ink bg-baby px-3 py-2 text-base">
          {(() => {
            const t = compareSets({ weight: w, reps: r }, p.reference)
            return (
              <span className="inline-flex items-center gap-1 font-bold">
                {t === 'better' && <ArrowUp className="size-4" />}
                {t === 'worse' && <ArrowDown className="size-4" />}
                {TREND_TEXT[t]}
              </span>
            )
          })()}
          <span>
            ({p.reference.label}: {fmtKg(p.reference.weight_kg)} kg × {p.reference.reps})
          </span>
        </p>
      )}
      <div className="flex gap-3">
        <Toggle label="Aufwärmsatz" checked={warmup} onChange={setWarmup} />
        <Toggle label="Bis Versagen" checked={failure} onChange={setFailure} icon={<Flame className="size-5 shrink-0" />} />
      </div>
      {p.rampUp && <p className="text-base">Wiedereinstieg: Nicht bis Versagen empfohlen.</p>}
      {/* Klebt am unteren Rand (ueber der Tab-Leiste), damit Speichern bei langen Karten immer erreichbar bleibt. */}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-1 bg-card px-1 pt-1">
        <Button variant="primary" disabled={!valid || p.busy} onClick={() => valid && p.onSave({ weight: w, reps: r, warmup, failure })}>
          {p.saveLabel}
        </Button>
      </div>
      {p.onCancel && <Button onClick={p.onCancel}>Abbrechen</Button>}
    </Card>
  )
}
