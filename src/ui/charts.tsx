// Schlichte Diagramme als Inline-SVG: kein Extra-Paket, offline, Farben nur aus den Tokens.

export interface LinePoint {
  t: number // ms-Zeitstempel (X-Achse zeitlich skaliert)
  v: number
}

const W = 320
const H = 170
const PAD = { l: 42, r: 12, t: 12, b: 26 }
const INK = '#2b1b4d'

const dm = (t: number) => new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })
const nf = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
// Achsenbeschriftung: grosse Spannen ganzzahlig mit Tausenderpunkt, kleine mit einer Nachkommastelle.
const tick = (n: number, span: number) => (span >= 10 ? Math.round(n).toLocaleString('de-DE') : nf(n))

/** Linie mit Punkten; optional eine zweite, geglaettete Linie (z. B. 7-Tage-Mittel). */
export function LineChart({
  points,
  line2,
  label,
  unit,
}: {
  points: LinePoint[]
  line2?: LinePoint[]
  label: string
  unit: string
}) {
  if (!points.length) return null
  const all = [...points, ...(line2 ?? [])]
  const t0 = Math.min(...all.map((p) => p.t))
  const t1 = Math.max(...all.map((p) => p.t))
  let lo = Math.min(...all.map((p) => p.v))
  let hi = Math.max(...all.map((p) => p.v))
  const span = hi - lo || Math.max(1, hi * 0.1)
  lo -= span * 0.15
  hi += span * 0.15
  const x = (t: number) => PAD.l + (t1 === t0 ? (W - PAD.l - PAD.r) / 2 : ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r))
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b)
  const path = (pts: LinePoint[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ')
  const ticks = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1]
  const last = points[points.length - 1]
  const main = line2 ?? points
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`${label}: ${points.length} Werte, zuletzt ${nf(last.v)} ${unit}`}
    >
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={INK} strokeOpacity="0.18" strokeWidth="1" />
          <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="num" fontSize="12" fill={INK}>
            {tick(v, hi - lo)}
          </text>
        </g>
      ))}
      <text x={PAD.l} y={H - 6} className="num" fontSize="12" fill={INK}>
        {dm(t0)}
      </text>
      {t1 !== t0 && (
        <text x={W - PAD.r} y={H - 6} textAnchor="end" className="num" fontSize="12" fill={INK}>
          {dm(t1)}
        </text>
      )}
      {main.length > 1 && (
        <path d={path(main)} fill="none" stroke={INK} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={x(p.t)}
          cy={y(p.v)}
          r={line2 ? 3 : i === points.length - 1 ? 7 : 5}
          fill={line2 ? '#00b7c3' : i === points.length - 1 ? '#e91e8c' : '#fff9fd'}
          stroke={INK}
          strokeWidth="2.5"
        />
      ))}
    </svg>
  )
}

/** Waagerechte Balken: diese Woche (Neon) mit Marke fuer die Vorwoche. */
export function BarRows({
  rows,
  max,
}: {
  rows: { label: string; value: number; prev: number }[]
  max: number
}) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="num shrink-0">
              {r.value}
              <span className="ml-1 text-base font-semibold">(Vorwoche {r.prev})</span>
            </span>
          </div>
          <div className="relative mt-1 h-5 border-[3px] border-ink bg-card" aria-hidden="true">
            <div className="h-full bg-neon" style={{ width: `${Math.min(100, (r.value / max) * 100)}%` }} />
            {r.prev > 0 && (
              <div
                className="absolute -inset-y-[3px] w-[3px] bg-ink"
                style={{ left: `calc(${Math.min(100, (r.prev / max) * 100)}% - 1.5px)` }}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
