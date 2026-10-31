import type { ButtonHTMLAttributes } from 'react'

// Nur der Haupt-Button der Seite (primary) hat den harten Schatten, alle anderen sind flach und ruhig.
// Textfarben so gewaehlt, dass der Kontrast >= 4,5:1 bleibt (Ink auf Neon/Tuerkis/Karte).
const VARIANTS = {
  primary: 'bg-mark text-ink shadow-hard active:translate-x-1 active:translate-y-1 active:shadow-none',
  secondary: 'bg-alt text-ink active:brightness-95',
  neutral: 'bg-card text-ink active:bg-info',
} as const

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS
}

export function Button({ variant = 'neutral', className = '', type = 'button', ...p }: Props) {
  return (
    <button
      type={type}
      className={`flex min-h-14 w-full items-center justify-center gap-2 border-2 border-ink px-4 font-display text-xl font-bold uppercase tracking-widest
        transition-transform disabled:bg-card disabled:text-ink/50 disabled:shadow-none ${VARIANTS[variant]} ${className}`}
      {...p}
    />
  )
}
