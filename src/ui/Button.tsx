import type { ButtonHTMLAttributes } from 'react'

// Textfarben so gewaehlt, dass der Kontrast >= 4,5:1 bleibt (Ink auf Neon/Tuerkis/Gelb, Weiss auf Fehler-Rot).
const VARIANTS = {
  primary: 'bg-neon text-ink',
  secondary: 'bg-turq text-ink',
  neutral: 'bg-card text-ink',
  baby: 'bg-baby text-ink',
} as const

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS
}

export function Button({ variant = 'neutral', className = '', ...p }: Props) {
  return (
    <button
      className={`flex min-h-14 w-full items-center justify-center gap-2 border-[3px] border-ink px-4 font-display text-xl uppercase tracking-wider
        shadow-hard transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none
        disabled:bg-card disabled:text-[#6b5b8c] disabled:shadow-none ${VARIANTS[variant]} ${className}`}
      {...p}
    />
  )
}
