// Auswahl aus wenigen Werten (z. B. Schrittweite). Eine Option ist immer aktiv.
interface Props<T extends number | string> {
  label: string
  options: { value: T; text: string }[]
  value: T
  onChange: (v: T) => void
}

export function Segmented<T extends number | string>({ label, options, value, onChange }: Props<T>) {
  return (
    <div role="group" aria-label={label} className="flex border-[3px] border-ink bg-card">
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`num min-h-12 flex-1 text-lg text-ink ${i > 0 ? 'border-l-[3px] border-ink' : ''} ${
            o.value === value ? 'bg-neon' : 'bg-card'
          }`}
        >
          {o.text}
        </button>
      ))}
    </div>
  )
}
