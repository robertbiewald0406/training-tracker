import { useState } from 'react'
import { formatNumber, parseNumber } from '../lib/logger'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Segmented } from '../ui/Segmented'
import { Stepper } from '../ui/Stepper'
import { Toggle } from '../ui/Toggle'
import { Flame } from '../ui/icons'

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
  weightUnit: string
  saveLabel: string
  busy: boolean
  onSave: (v: SetValues) => void
  onCancel?: () => void
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
      <Segmented label="Schrittweite in kg" options={STEPS} value={p.stepKg} onChange={p.onStepKg} />
      <Stepper
        label="Wiederholungen"
        unit="Wiederholungen"
        inputMode="numeric"
        value={reps}
        onValue={setReps}
        onMinus={() => bumpReps(-1)}
        onPlus={() => bumpReps(1)}
      />
      <div className="flex gap-3">
        <Toggle label="Aufwärmsatz" checked={warmup} onChange={setWarmup} />
        <Toggle label="Bis Versagen" checked={failure} onChange={setFailure} icon={<Flame className="size-5 shrink-0" />} />
      </div>
      {p.rampUp && <p className="text-base">Wiedereinstieg: Nicht bis Versagen empfohlen.</p>}
      <Button variant="primary" disabled={!valid || p.busy} onClick={() => valid && p.onSave({ weight: w, reps: r, warmup, failure })}>
        {p.saveLabel}
      </Button>
      {p.onCancel && <Button onClick={p.onCancel}>Abbrechen</Button>}
    </Card>
  )
}
