interface Props {
  value: string
  label: string
  onMinus: () => void
  onPlus: () => void
}

// Grosse Zahl (Barlow fett, tabellarisch) zwischen zwei 56-px-Buttons. Direkteingabe folgt mit dem Logger.
export function Stepper({ value, label, onMinus, onPlus }: Props) {
  const b =
    'size-14 shrink-0 border-[3px] border-ink bg-turq font-sans text-4xl font-bold leading-none text-ink shadow-hard active:translate-x-1 active:translate-y-1 active:shadow-none'
  return (
    <div className="flex items-center gap-3">
      <button type="button" aria-label={`${label} weniger`} className={b} onClick={onMinus}>−</button>
      <div className="num flex-1 text-center text-7xl leading-none" aria-label={label}>{value}</div>
      <button type="button" aria-label={`${label} mehr`} className={b} onClick={onPlus}>+</button>
    </div>
  )
}
