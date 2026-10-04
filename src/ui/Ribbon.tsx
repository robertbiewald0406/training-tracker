import { Barbell, Star } from './icons'

// Dreistreifen-Band in Pink, Babyblau, Tuerkis (Racing-Stripes, flach).
export function StripeBand() {
  return (
    <div className="mt-4 border-y-[3px] border-ink" aria-hidden="true">
      <div className="h-2 bg-neon" />
      <div className="h-2 bg-baby" />
      <div className="h-2 bg-turq" />
    </div>
  )
}

// Banner mit Motto: Indigo-Fläche, helle Schrift (14,8:1), Sterne in Neon-Pink.
export function Ribbon({ text = 'No pain · No gain' }: { text?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-3 border-[3px] border-ink bg-ink px-3 py-2 text-card shadow-[4px_4px_0_0_var(--color-neon)]"
      role="note"
    >
      <Barbell className="hidden size-7 shrink-0 sm:block" />
      <Star className="size-5 shrink-0 text-neon" />
      <span className="whitespace-nowrap font-display text-lg uppercase tracking-wider">{text}</span>
      <Star className="size-5 shrink-0 text-neon" />
      <Barbell className="hidden size-7 shrink-0 sm:block" />
    </div>
  )
}
