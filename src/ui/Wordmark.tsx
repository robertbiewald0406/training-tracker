// "MUSCLE" in Barlow Condensed (Text), darunter "BRAIN" weit gesperrt in der Akzentfarbe, dazwischen eine feine Linie.
export function Wordmark({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const lg = size === 'lg'
  return (
    <div
      className={`inline-flex ${lg ? 'flex-col items-center' : 'items-baseline gap-2'} leading-none`}
      role="img"
      aria-label="MuscleBrain"
    >
      <span className={`font-display font-bold uppercase text-ink ${lg ? 'text-7xl tracking-[0.1em] pl-[0.1em]' : 'text-2xl tracking-[0.14em]'}`}>
        Muscle
      </span>
      {lg && <span aria-hidden="true" className="my-2 h-0.5 w-44 bg-accent" />}
      <span className={`font-display font-bold uppercase text-accent ${lg ? 'text-5xl tracking-[0.34em] pl-[0.34em]' : 'text-2xl tracking-[0.14em]'}`}>
        Brain
      </span>
    </div>
  )
}
