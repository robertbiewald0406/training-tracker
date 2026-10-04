// "LIFT" in Righteous (Indigo, pinker Schlagschatten), darunter "Heavy" in Yellowtail (Pink, 2 px Indigo-Kontur).
export function Wordmark({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const lg = size === 'lg'
  return (
    <div
      className={`inline-flex ${lg ? 'flex-col items-center' : 'items-baseline gap-1.5'} leading-none`}
      role="img"
      aria-label="Lift Heavy"
    >
      <span
        className={`font-display uppercase tracking-wider text-ink ${lg ? 'text-7xl' : 'text-2xl'}`}
        style={{ textShadow: `${lg ? 4 : 2}px ${lg ? 4 : 2}px 0 var(--color-pink)` }}
      >
        Lift
      </span>
      <span
        className={`font-script text-pink ${lg ? '-mt-3 -rotate-3 text-6xl' : 'text-2xl'}`}
        // 4 px Kontur hinter der Fuellung (paint-order) = 2 px sichtbar ausserhalb.
        style={{ WebkitTextStroke: '4px var(--color-ink)', paintOrder: 'stroke fill' }}
      >
        Heavy
      </span>
    </div>
  )
}
