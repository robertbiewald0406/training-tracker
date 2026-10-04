interface Props {
  value: string
  label: string
  unit: string
  inputMode: 'decimal' | 'numeric'
  onValue: (v: string) => void
  onMinus: () => void
  onPlus: () => void
}

// Grosse Zahl (Barlow fett, tabellarisch) zwischen zwei 56-px-Buttons. Zahl antippen = direkt eintippen.
export function Stepper({ value, label, unit, inputMode, onValue, onMinus, onPlus }: Props) {
  const b =
    'size-14 shrink-0 border-[3px] border-ink bg-turq font-sans text-4xl font-bold leading-none text-ink active:brightness-95'
  return (
    <div>
      <div className="flex items-center gap-3">
        <button type="button" aria-label={`${label} weniger`} className={b} onClick={onMinus}>−</button>
        <input
          className="num min-w-0 flex-1 bg-transparent text-center text-6xl leading-none outline-none focus:bg-baby/40"
          aria-label={label}
          inputMode={inputMode}
          enterKeyHint="done"
          autoComplete="off"
          value={value}
          onChange={(e) => onValue(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" aria-label={`${label} mehr`} className={b} onClick={onPlus}>+</button>
      </div>
      <p className="mt-1 text-center text-base">{unit}</p>
    </div>
  )
}
