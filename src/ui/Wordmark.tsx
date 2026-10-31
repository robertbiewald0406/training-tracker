// "LIFT" in Barlow Condensed (Text), darunter "HEAVY" weit gesperrt in der Akzentfarbe, dazwischen eine feine Linie.
export function Wordmark({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const lg = size === 'lg'
  return (
    <div
      className={`inline-flex ${lg ? 'flex-col items-center' : 'items-baseline gap-2'} leading-none`}
      role="img"
      aria-label="Lift Heavy"
    >
      <span className={`font-display font-bold uppercase text-ink ${lg ? 'text-7xl tracking-[0.14em] pl-[0.14em]' : 'text-2xl tracking-[0.14em]'}`}>
        Lift
      </span>
      {lg && <span aria-hidden="true" className="my-2 h-0.5 w-44 bg-accent" />}
      <span className={`font-display font-bold uppercase text-accent ${lg ? 'text-5xl tracking-[0.32em] pl-[0.32em]' : 'text-2xl tracking-[0.14em]'}`}>
        Heavy
      </span>
    </div>
  )
}
