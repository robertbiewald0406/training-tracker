// Auswahl aus wenigen Werten (z. B. Schrittweite). Eine Option ist immer aktiv.
interface Props<T extends number | string> {
  label: string
  options: { value: T; text: string }[]
  value: T
  onChange: (v: T) => void
}

export function Segmented<T extends number | string>({ label, options, value, onChange }: Props<T>) {
  return (
    <div role="group" aria-label={label} className="flex gap-2">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`num min-h-14 flex-1 border-[3px] border-ink text-xl text-ink shadow-hard active:translate-x-1 active:translate-y-1 active:shadow-none ${
            o.value === value ? 'bg-neon' : 'bg-card'
          }`}
        >
          {o.text}
        </button>
      ))}
    </div>
  )
}
