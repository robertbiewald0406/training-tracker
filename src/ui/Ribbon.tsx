import { Diamond } from './icons'

// Duenne Dreifach-Linie unter der Kopfzeile (Akzent, Aktiv, Petrol), flach.
export function StripeBand() {
  return (
    <div className="mt-4 border-y-2 border-ink" aria-hidden="true">
      <div className="h-1 bg-accent" />
      <div className="h-1 bg-mark" />
      <div className="h-1 bg-alt" />
    </div>
  )
}

// Motto-Band: dunkle Flaeche, helle Schrift, Rauten als Trenner. Dekoration auf der Anmeldeseite.
export function Ribbon({ text = 'No pain · No gain' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 border-2 border-ink bg-ink px-3 py-2 text-card" role="note">
      <Diamond className="size-3 shrink-0 text-mark" />
      <span className="whitespace-nowrap font-display text-xl font-bold uppercase tracking-[0.22em]">{text}</span>
      <Diamond className="size-3 shrink-0 text-mark" />
    </div>
  )
}
