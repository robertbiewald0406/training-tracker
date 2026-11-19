import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  equipmentOptions,
  handleKey,
  initialPicker,
  muscleLabel,
  muscleOptions,
  searchExercises,
  typeQuery,
  type PickerState,
} from '../lib/exerciseSearch'
import { plan as defaultPlan, type Plan } from '../lib/plan'

interface Props {
  label: string
  /** Gewählte Übung (Key) oder null. */
  value: string | null
  onChange: (key: string | null) => void
  /** Nicht anbieten, z. B. Übungen, die schon im Tag stehen. */
  excludeKeys?: string[]
  /** Aktuelle Übung: ihre Alternativen stehen ohne Eingabe zuerst. */
  currentKey?: string | null
  plan?: Plan
  autoFocus?: boolean
}

const select =
  'min-h-12 min-w-0 flex-1 border-2 border-ink bg-card px-2 text-base text-ink'

/**
 * Auswahl einer Übung als Combobox: Suchfeld, darunter die Trefferliste (role combobox und listbox), Pfeiltasten,
 * Enter, Escape. Filter nach Muskelgruppe und Gerät. Zeigt alle nicht stillgelegten Übungen des Katalogs.
 */
export function ExercisePicker({ label, value, onChange, excludeKeys = [], currentKey = null, plan = defaultPlan, autoFocus }: Props) {
  const id = useId()
  const listId = `${id}-list`
  const optId = (i: number) => `${id}-opt-${i}`
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<PickerState>(() => initialPicker(value ? plan.exercises[value]?.name ?? '' : ''))
  const [muscle, setMuscle] = useState('')
  const [equipment, setEquipment] = useState('')
  const exclude = excludeKeys.join('|')

  // Mit gewählter Übung zeigt das Feld ihren Namen und sucht nicht danach; erst Tippen sucht wieder.
  const searching = value === null ? state.query : ''
  const results = useMemo(
    () => searchExercises(plan, { query: searching, muscle: muscle || null, equipment: equipment || null, exclude: excludeKeys, current: currentKey }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, searching, muscle, equipment, exclude, currentKey],
  )
  const keys = results.map((r) => r.key)

  useEffect(() => {
    if (state.open && state.active >= 0) document.getElementById(optId(state.active))?.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.active, state.open])

  const pick = (key: string) => {
    onChange(key)
    setState({ query: plan.exercises[key].name, open: false, active: -1 })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const r = handleKey(state, e.key, keys)
    if (r.handled) e.preventDefault()
    setState(r.state)
    if (r.picked) pick(r.picked)
    else if (e.key === 'Escape' && !state.open && state.query && value) onChange(null)
  }

  let lastGroup: string | null = null
  const groupTitle = (g: string) => (g === 'alternativen' ? 'Alternativen' : muscleLabel(g))
  const selected = value ? plan.exercises[value] : null

  return (
    <div
      ref={rootRef}
      className="space-y-2"
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setState((s) => ({ ...s, open: false, active: -1 }))
      }}
    >
      <label htmlFor={`${id}-input`} className="block text-base">
        {label}
      </label>
      <input
        id={`${id}-input`}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={state.open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={state.open && state.active >= 0 ? optId(state.active) : undefined}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        autoFocus={autoFocus}
        placeholder="Suchen, z. B. Latzug, Kabel, Bizeps"
        value={state.query}
        onFocus={() => setState((s) => (value ? s : { ...s, open: true, active: s.active < 0 ? 0 : s.active }))}
        onChange={(e) => {
          if (value !== null) onChange(null)
          setState(typeQuery(state, e.target.value))
        }}
        onKeyDown={onKeyDown}
        className="min-h-14 w-full border-2 border-ink bg-card px-3 text-xl text-ink outline-none placeholder:text-ink/60 focus:bg-info"
      />
      <div className="flex gap-2">
        <select aria-label="Muskelgruppe" value={muscle} onChange={(e) => setMuscle(e.target.value)} className={select}>
          <option value="">Alle Muskeln</option>
          {muscleOptions(plan, excludeKeys).map((o) => (
            <option key={o.value} value={o.value}>
              {o.text}
            </option>
          ))}
        </select>
        <select aria-label="Gerät" value={equipment} onChange={(e) => setEquipment(e.target.value)} className={select}>
          <option value="">Alle Geräte</option>
          {equipmentOptions(plan, excludeKeys).map((o) => (
            <option key={o.value} value={o.value}>
              {o.text}
            </option>
          ))}
        </select>
      </div>
      <p aria-live="polite" className="text-base">
        {value ? '' : results.length === 0 ? 'Keine Treffer.' : `${results.length} Treffer`}
      </p>
      {selected && !state.open && (
        <p className="border-2 border-ink bg-mark px-3 py-2 text-lg leading-tight">
          <strong>{selected.name}</strong>
          <span className="block text-base">
            {selected.equipment} · {muscleLabel(selected.primary_muscle)}
          </span>
        </p>
      )}
      <ul
        id={listId}
        role="listbox"
        aria-label={label}
        hidden={!state.open}
        className="max-h-72 overflow-y-auto border-2 border-ink bg-card"
      >
        {results.map((r, i) => {
          const ex = plan.exercises[r.key]
          const heading = r.group !== lastGroup && r.group !== '' ? groupTitle(r.group) : null
          lastGroup = r.group
          return (
            <li key={r.key} role="presentation">
              {heading && <p className="bg-info px-3 py-1 font-display text-base uppercase tracking-wider">{heading}</p>}
              <div
                id={optId(i)}
                role="option"
                aria-selected={i === state.active}
                // Fokus bleibt im Eingabefeld, das Antippen wählt.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pick(r.key)}
                className={`flex min-h-14 cursor-pointer flex-col justify-center border-t-2 border-ink/30 px-3 py-1.5 leading-tight ${
                  i === state.active ? 'bg-mark' : 'bg-card'
                }`}
              >
                <span className="text-lg">{ex.name}</span>
                <span className="text-base">
                  {ex.equipment} · {muscleLabel(ex.primary_muscle)}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
