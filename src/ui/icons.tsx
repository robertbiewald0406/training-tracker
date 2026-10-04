import { useId, type SVGProps } from 'react'

// Eigene, einfarbige Inline-SVGs (currentColor). Keine Emojis, keine Bilder, keine Bibliothek.
type P = SVGProps<SVGSVGElement>

function Svg({ children, ...p }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className="size-6" {...p}>
      {children}
    </svg>
  )
}
const S = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const Dumbbell = (p: P) => (
  <Svg {...p}>
    <rect x="1.5" y="7" width="3.5" height="10" rx="1.2" />
    <rect x="5" y="9" width="2.5" height="6" rx="0.8" />
    <rect x="7.5" y="11" width="9" height="2" />
    <rect x="16.5" y="9" width="2.5" height="6" rx="0.8" />
    <rect x="19" y="7" width="3.5" height="10" rx="1.2" />
  </Svg>
)

export const Barbell = (p: P) => (
  <Svg {...p}>
    <rect x="0.5" y="11" width="23" height="2" />
    <rect x="3" y="3.5" width="3" height="17" rx="1" />
    <rect x="6.5" y="6" width="2.5" height="12" rx="0.8" />
    <rect x="9.5" y="9.5" width="1.5" height="5" />
    <rect x="13" y="9.5" width="1.5" height="5" />
    <rect x="15" y="6" width="2.5" height="12" rx="0.8" />
    <rect x="18" y="3.5" width="3" height="17" rx="1" />
  </Svg>
)

export const Kettlebell = (p: P) => (
  <Svg {...p}>
    <path d="M8.2 9.5V7a3.8 3.8 0 0 1 7.6 0v2.5" {...S} strokeWidth="2.3" />
    <path d="M12 8.5a7 7 0 0 1 6.2 10.2c-.3.6-.8.8-1.4.8H7.2c-.6 0-1.1-.2-1.4-.8A7 7 0 0 1 12 8.5z" />
  </Svg>
)

// Angewinkelter Arm (Bizeps-Pose): Oberarm waagerecht, Unterarm nach oben, Faust, Bizeps-Beule.
export const Biceps = (p: P) => (
  <Svg {...p}>
    <path d="M3 20h14.500V9" {...S} strokeWidth="4.200" />
    <rect x="13.200" y="2" width="8.600" height="7.600" rx="2.800" />
    <path d="M3.500 16.200c.6-5.600 6-7.600 9.500-4.600" {...S} strokeWidth="2.200" />
  </Svg>
)

export const Trophy = (p: P) => (
  <Svg {...p}>
    <path d="M7 3h10v6.2a5 5 0 0 1-10 0V3z" />
    <path d="M7 5H4v1.8A3.2 3.2 0 0 0 7.2 10M17 5h3v1.8a3.2 3.2 0 0 1-3.2 3.2" {...S} strokeWidth="1.8" />
    <rect x="10.8" y="13.6" width="2.4" height="4" />
    <rect x="7.5" y="17.6" width="9" height="3.4" rx="1" />
  </Svg>
)

export const Stopwatch = (p: P) => (
  <Svg {...p}>
    <rect x="9.5" y="1.5" width="5" height="2.4" rx="1" />
    <rect x="11" y="3.5" width="2" height="2.5" />
    <circle cx="12" cy="14" r="7.8" {...S} strokeWidth="2.4" />
    <path d="M12 14V9.5" {...S} strokeWidth="2.2" />
    <path d="M18.6 6.6l1.4-1.4" {...S} strokeWidth="2.2" />
  </Svg>
)

export const Flame = (p: P) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M12.5 1.5c.6 4 5.8 6.2 5.8 12.2a6.3 6.3 0 0 1-12.6 0c0-3 1.6-4.6 2.8-6.6.7 1.4 1.4 2 2.2 2.2-.5-2.8-.2-5.8 1.8-7.8zM12 20.2a2.9 2.9 0 0 0 2.9-3c0-1.9-1.8-3-2.9-5.2-1.1 2.2-2.9 3.3-2.9 5.2a2.9 2.9 0 0 0 2.9 3z"
    />
  </Svg>
)

export const Palm = (p: P) => (
  <Svg viewBox="0 0 48 48" {...p}>
    <path d="M22 47c.4-9 1.6-16 4.6-22.5l2.6 1.2C26.4 32 25.2 38.6 25 47z" />
    <path d="M27.5 24C22 17 12 15.5 3 20c8-1.5 14 .5 24.5 4z" />
    <path d="M27.5 24C26 14 18 7 8 7.5c8 3 13 8 19.5 16.5z" />
    <path d="M27.5 24C29 12 36 5 46 5c-7.500 3.200-12 9.500-18.500 19z" />
    <path d="M27.500 24C34 17 43 16 47 21.500c-7-2.500-12-1.500-19.500 2.500z" />
    <path d="M27.500 24c-5 5-6 11-3.500 17-1-6 .5-10 3.500-17zM27.500 24c4 4 7.500 8 7.500 14-2-6-4.500-9.500-7.500-14z" />
  </Svg>
)

// Sonne mit Streifen (Verlauf erlaubt: Sonne).
export function Sun({ className = 'size-24', ...p }: P) {
  const id = useId()
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className={className} {...p}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd23f" />
          <stop offset="1" stopColor="#ff5cb8" />
        </linearGradient>
        <clipPath id={`c${id}`}>
          <circle cx="50" cy="50" r="46" />
        </clipPath>
      </defs>
      <g clipPath={`url(#c${id})`}>
        <rect width="100" height="100" fill={`url(#g${id})`} />
        {/* Streifen aus dem Himmel-Ton ausgeschnitten, nach unten dicker */}
        <rect y="58" width="100" height="3" fill="#ffd1e8" />
        <rect y="67" width="100" height="5" fill="#ffd1e8" />
        <rect y="77" width="100" height="7" fill="#ffd1e8" />
        <rect y="89" width="100" height="9" fill="#ffd1e8" />
      </g>
      <circle cx="50" cy="50" r="46" fill="none" stroke="#2b1b4d" strokeWidth="3" />
    </svg>
  )
}

export const Star = (p: P) => (
  <Svg {...p}>
    <path d="M12 2l2.900 6.300 6.900.8-5.100 4.700 1.400 6.800L12 17.200 5.900 20.600l1.400-6.800L2.200 9.100l6.900-.8z" />
  </Svg>
)

export const Check = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 12.8l5 5L19.5 6.5" {...S} strokeWidth="3.4" />
  </Svg>
)

// Hantelscheibe fuer den Satzfortschritt: erledigt = gefuellt, offen = nur Kontur.
export function Plate({ filled = false, ...p }: P & { filled?: boolean }) {
  return (
    <Svg {...p}>
      <circle
        cx="12" cy="12" r="9.5"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="2.4"
      />
      <circle cx="12" cy="12" r="2.6" fill={filled ? 'var(--color-card)' : 'none'} stroke="currentColor" strokeWidth="2" />
    </Svg>
  )
}

// Zuordnung Trainingstag -> Symbol (plan.json: days[].key). Lauftag am Wochenende: Palme.
export const DAY_ICONS = {
  mo_brust: Barbell,
  di_ruecken: Kettlebell,
  mi_beine: Flame,
  do_schultern: Dumbbell,
  fr_arme: Biceps,
  lauftag: Palm,
} as const
