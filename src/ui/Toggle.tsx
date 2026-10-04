import type { ReactNode } from 'react'

interface Props {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  icon?: ReactNode
}

// Flacher Schalter: aktiv = Neon-Flaeche mit Haken-Rand, aus = Karte.
export function Toggle({ label, checked, onChange, icon }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex min-h-14 min-w-0 flex-1 items-center justify-center gap-1.5 border-[3px] border-ink px-2 text-center font-display text-base uppercase leading-tight tracking-wide text-ink
        ${checked ? 'bg-neon' : 'bg-card'}`}
    >
      {icon}
      {label}
    </button>
  )
}
