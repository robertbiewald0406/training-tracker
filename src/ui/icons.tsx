import { useId, type SVGProps } from 'react'

// Eigene Linien-Symbole (currentColor, 24er Raster, gleiche Strichstaerke). Keine Emojis, keine Bilder, keine Bibliothek.
type P = SVGProps<SVGSVGElement>

function Svg({ children, ...p }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      className="size-6"
      {...p}
    >
      {children}
    </svg>
  )
}

export const Dumbbell = (p: P) => (
  <Svg {...p}>
    <path d="M7 12h10M1.5 10v4M22.5 10v4" />
    <rect x="3.5" y="7" width="3.5" height="10" />
    <rect x="17" y="7" width="3.5" height="10" />
  </Svg>
)

export const Barbell = (p: P) => (
  <Svg {...p}>
    <path d="M1 12h22" />
    <rect x="3.75" y="4.5" width="2.5" height="15" />
    <rect x="7.5" y="7.5" width="2" height="9" />
    <rect x="14.5" y="7.5" width="2" height="9" />
    <rect x="17.75" y="4.5" width="2.5" height="15" />
  </Svg>
)

export const Kettlebell = (p: P) => (
  <Svg {...p}>
    <path d="M8.5 8.5V6a3.5 3.5 0 0 1 7 0v2.5" />
    <path d="M12 8.5c-4 0-7 3-7 7 0 1.800.6 3 1.500 4h11c.9-1 1.500-2.200 1.500-4 0-4-3-7-7-7z" />
  </Svg>
)

// Kabelzug (Rueckentag): Rolle, Seil, Griff, Gewichtsblock.
export const Cable = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="5" r="2.500" />
    <path d="M12 7.500v7.500M6.500 15h11" />
    <rect x="9" y="17.500" width="6" height="4" />
  </Svg>
)

// Kniebeuge (Beintag): Figur mit Langhantel auf den Schultern.
export const Squat = (p: P) => (
  <Svg {...p}>
    <path d="M3 8.500h18M4.500 6v5M19.500 6v5" />
    <circle cx="12" cy="4.500" r="1.600" />
    <path d="M12 9.500V14l-4.500 3v4.500M12 14l4.500 3v4.500" />
  </Svg>
)

// Schulterdruecken (Schultertag): Langhantel ueber dem Kopf.
export const Press = (p: P) => (
  <Svg {...p}>
    <path d="M2.500 3.500h19M4 1.500v4M20 1.500v4" />
    <path d="M9 3.500l1 6.500M15 3.500l-1 6.500" />
    <circle cx="12" cy="13" r="2" />
    <path d="M7.500 22v-3.500a4.500 4.500 0 0 1 9 0V22" />
  </Svg>
)

// Sonnenaufgang (Lauftag am Wochenende).
export const Sunrise = (p: P) => (
  <Svg {...p}>
    <path d="M6 17a6 6 0 0 1 12 0M2 17h20M5 20.500h14M12 6v2.500M4.500 9.500l1.800 1.800M19.500 9.500l-1.800 1.800" />
  </Svg>
)

export const Trophy = (p: P) => (
  <Svg {...p}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
    <path d="M7 6H4.500v1.500A2.500 2.500 0 0 0 7 10M17 6h2.500v1.500A2.500 2.500 0 0 1 17 10M12 14v4M8 20.500h8M9 18h6" />
  </Svg>
)

export const Stopwatch = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="13.500" r="7.500" />
    <path d="M12 13.500V9M9.500 2.500h5M12 2.500v3M18 6.500l1.500-1.500" />
  </Svg>
)

export const Flame = (p: P) => (
  <Svg {...p}>
    <path d="M12 2.500c.5 3.500 5.500 5.500 5.500 11a5.500 5.500 0 0 1-11 0c0-2.500 1.300-4 2.500-5.500.6 1.200 1.200 1.800 2 2-.4-2.500-.2-5 1-7.500z" />
    <path d="M12 21a2.500 2.500 0 0 0 2.500-2.600c0-1.600-1.500-2.500-2.500-4.400-1 1.900-2.500 2.800-2.500 4.400A2.500 2.500 0 0 0 12 21z" />
  </Svg>
)

// Sonne ueber dem Horizont, Streifen nach unten dicker. Flach, in der Akzentfarbe.
export function Sun({ className = 'size-24', ...p }: P) {
  const id = useId()
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className={className} {...p}>
      <defs>
        <clipPath id={`c${id}`}>
          <circle cx="50" cy="50" r="46" />
        </clipPath>
      </defs>
      <g clipPath={`url(#c${id})`}>
        <rect width="100" height="100" className="fill-accent" />
        <rect y="58" width="100" height="3" className="fill-sky-bottom" />
        <rect y="67" width="100" height="5" className="fill-sky-bottom" />
        <rect y="77" width="100" height="7" className="fill-sky-bottom" />
        <rect y="89" width="100" height="9" className="fill-sky-bottom" />
      </g>
    </svg>
  )
}

// Raute als Trenner und Zierpunkt.
export const Diamond = (p: P) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M12 2l7 10-7 10-7-10z" />
  </Svg>
)

export const Check = (p: P) => (
  <Svg {...p} strokeWidth="2.400">
    <path d="M4.500 12.500l5 5L19.500 7" />
  </Svg>
)

// Hantelscheibe fuer den Satzfortschritt: erledigt = gefuellt, offen = nur Kontur.
export function Plate({ filled = false, ...p }: P & { filled?: boolean }) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9.500" fill={filled ? 'currentColor' : 'none'} />
      <circle cx="12" cy="12" r="3" fill={filled ? 'var(--color-card)' : 'none'} />
    </Svg>
  )
}

// Navigation und Trend
export const ChartBars = (p: P) => (
  <Svg {...p}>
    <rect x="3.500" y="12" width="4" height="8.500" />
    <rect x="10" y="6.500" width="4" height="14" />
    <rect x="16.500" y="3.500" width="4" height="17" />
  </Svg>
)
export const Menu = (p: P) => (
  <Svg {...p} strokeWidth="2">
    <path d="M3.500 6.500h17M3.500 12h17M3.500 17.500h17" />
  </Svg>
)
export const ArrowUp = (p: P) => (
  <Svg {...p} strokeWidth="2">
    <path d="M12 20V4M5.500 10.500L12 4l6.500 6.500" />
  </Svg>
)
export const ArrowDown = (p: P) => (
  <Svg {...p} strokeWidth="2">
    <path d="M12 4v16M5.500 13.500L12 20l6.500-6.500" />
  </Svg>
)
export const Chevron = ({ dir = 'right', ...p }: P & { dir?: 'left' | 'right' | 'down' }) => (
  <Svg {...p} strokeWidth="2.200">
    <path d={dir === 'left' ? 'M15 4.500L7.500 12 15 19.500' : dir === 'down' ? 'M4.500 8.500L12 16l7.500-7.500' : 'M9 4.500L16.500 12 9 19.500'} />
  </Svg>
)

// Zuordnung Trainingstag -> Symbol (plan.json: days[].key). Lauftag am Wochenende: Sonnenaufgang.
export const DAY_ICONS = {
  mo_brust: Barbell,
  di_ruecken: Cable,
  mi_beine: Squat,
  do_schultern: Press,
  fr_arme: Dumbbell,
  lauftag: Sunrise,
} as const
