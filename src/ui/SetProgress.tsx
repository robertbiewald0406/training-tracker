import { Plate } from './icons'

// Jeder Satz eine Hantelscheibe: erledigt = gefuellt.
export function SetProgress({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex flex-wrap gap-1 text-ink" role="img" aria-label={`${Math.min(done, total)} von ${total} Sätzen erledigt`}>
      {Array.from({ length: total }, (_, i) => (
        <Plate key={i} filled={i < done} className="size-9" />
      ))}
    </div>
  )
}
