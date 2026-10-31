import { Sun } from './icons'

// Horizont am unteren Seitenrand: flache Sonne, duenne Linien. Nur Dekoration, steht hinter allem.
export function Scene({ sun = true, inline = false }: { sun?: boolean; inline?: boolean }) {
  // inline: im Seitenfluss am Ende der Seite (kein festes Element, nichts liegt dahinter oder davor).
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none inset-x-0 bottom-0 z-0 h-28 overflow-hidden sm:h-36 ${
        inline ? 'relative -mx-4 mt-4 border-t-2 border-ink' : 'fixed'
      }`}
    >
      {sun && <Sun className="absolute bottom-[-3.25rem] left-1/2 size-36 -translate-x-1/2 sm:size-44" />}
      <div className="absolute inset-x-0 bottom-[1.6rem] h-0.5 bg-ink" />
      <div className="absolute inset-x-0 bottom-[0.9rem] h-px bg-ink/60" />
      <div className="absolute inset-x-0 bottom-[0.3rem] h-px bg-ink/30" />
    </div>
  )
}
