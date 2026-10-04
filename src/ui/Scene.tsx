import { useId } from 'react'
import { Palm, Sun } from './icons'

function Waves({ color, height, offset = 0 }: { color: string; height: number; offset?: number }) {
  const id = useId()
  return (
    <svg width="100%" height={height} className="absolute inset-x-0 bottom-0" aria-hidden="true">
      <defs>
        <pattern id={id} patternUnits="userSpaceOnUse" width="96" height={height} x={offset}>
          <path d={`M0 14 Q24 0 48 14 T96 14 V${height} H0Z`} fill={color} stroke="#2b1b4d" strokeWidth="3" />
        </pattern>
      </defs>
      <rect width="100%" height={height} fill={`url(#${id})`} />
    </svg>
  )
}

// Strandszene am unteren Seitenrand: Sonne am Horizont, Wellen, Palmen. Nur Dekoration, steht hinter allem.
export function Scene({ sun = true }: { sun?: boolean }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-36 overflow-hidden sm:h-44">
      {sun && <Sun className="absolute bottom-[-4.5rem] left-1/2 size-48 -translate-x-1/2" />}
      <Waves color="#8fd8f5" height={64} offset={30} />
      <Waves color="#00b7c3" height={40} />
      <Palm className="absolute -bottom-3 -left-4 size-40 text-ink" />
      <Palm className="absolute -bottom-3 left-24 size-24 -scale-x-100 text-ink" />
      <Palm className="absolute -bottom-3 -right-6 size-44 -scale-x-100 text-ink" />
      <Palm className="absolute -bottom-3 right-24 size-24 text-ink" />
    </div>
  )
}
