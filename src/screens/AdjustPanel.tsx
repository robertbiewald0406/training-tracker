import { useState } from 'react'
import { GRUENDE, NOTE_MAX } from '../lib/adjust'
import type { AdjustGrund } from '../lib/types'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ExercisePicker } from '../ui/ExercisePicker'
import { Segmented } from '../ui/Segmented'

export type AdjustAction = 'auslassen' | 'tauschen' | 'oben' | 'unten' | 'hinzufuegen'

export interface AdjustChoice {
  neuer_key: string | null // bei 'tauschen' die neue, bei 'hinzufuegen' die hinzugefuegte Uebung
  grund: AdjustGrund | null
  note: string
  dauerhaft: boolean
}

interface Props {
  action: AdjustAction
  exerciseName: string
  /** Aktuelle Übung (Alternativen zuerst) und Übungen, die nicht angeboten werden (schon im Tag). */
  currentKey: string | null
  excludeKeys: string[]
  allowPermanent: boolean // "Dauerhaft" nur, wenn die Uebung im Plan-Tag selbst steht (nicht nur heute eingetauscht)
  busy: boolean
  onConfirm: (c: AdjustChoice) => void
  onCancel: () => void
}

const TITLE: Record<AdjustAction, string> = {
  auslassen: 'Auslassen',
  tauschen: 'Tauschen',
  oben: 'Nach oben',
  unten: 'Nach unten',
  hinzufuegen: 'Übung hinzufügen',
}

const pick = (selected: boolean) => `${selected ? 'bg-mark' : 'bg-card'}`

/** Auswahl (Tauschen, Hinzufügen) per Suchfeld, optional Grund und Kommentar, und "Nur heute" oder "Dauerhaft im Plan". */
export function AdjustPanel({ action, exerciseName, currentKey, excludeKeys, allowPermanent, busy, onConfirm, onCancel }: Props) {
  const [to, setTo] = useState<string | null>(null)
  const [grund, setGrund] = useState<AdjustGrund | null>(null)
  const [note, setNote] = useState('')
  const [scope, setScope] = useState<'heute' | 'dauerhaft'>('heute')
  const needsPick = action === 'tauschen' || action === 'hinzufuegen'
  const canPick = !needsPick || to !== null

  return (
    <Card className="space-y-3" aria-label={`${TITLE[action]}: ${exerciseName}`}>
      <div>
        <h2 className="text-xl leading-tight">{TITLE[action]}</h2>
        <p className="text-base">{action === 'hinzufuegen' ? 'Kommt nach der aktuellen Übung dazu.' : exerciseName}</p>
      </div>

      {needsPick && (
        <ExercisePicker
          label={action === 'tauschen' ? 'Tauschen gegen' : 'Übung wählen'}
          value={to}
          onChange={setTo}
          excludeKeys={excludeKeys}
          currentKey={action === 'tauschen' ? currentKey : null}
          autoFocus
        />
      )}

      <div className="space-y-2">
        <p className="text-base">Grund (optional)</p>
        <div className="grid grid-cols-2 gap-2">
          {GRUENDE.map((g) => (
            <button
              key={g.value}
              type="button"
              aria-pressed={grund === g.value}
              onClick={() => setGrund(grund === g.value ? null : g.value)}
              className={`min-h-12 border-2 border-ink px-2 text-lg ${pick(grund === g.value)}`}
            >
              {g.text}
            </button>
          ))}
        </div>
        <label className="block text-base">
          Kommentar (optional)
          <input
            type="text"
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 min-h-14 w-full border-2 border-ink bg-card px-3 text-lg"
          />
        </label>
      </div>

      {allowPermanent ? (
        <Segmented
          label="Gültigkeit"
          options={[
            { value: 'heute', text: 'Nur heute' },
            { value: 'dauerhaft', text: 'Dauerhaft im Plan' },
          ]}
          value={scope}
          onChange={setScope}
        />
      ) : (
        <p className="text-base">Gilt nur heute (die Übung steht nur in dieser Einheit).</p>
      )}

      <Button
        variant="secondary"
        disabled={busy || !canPick}
        onClick={() => onConfirm({ neuer_key: to, grund, note, dauerhaft: allowPermanent && scope === 'dauerhaft' })}
      >
        Übernehmen
      </Button>
      <Button onClick={onCancel}>Abbrechen</Button>
    </Card>
  )
}
