import type { HTMLAttributes } from 'react'

const TONES = { card: 'bg-card', baby: 'bg-baby', ok: 'bg-ok' } as const

// Ruhiger, einfarbiger Kartengrund: Zahlen stehen immer auf Karten, nie auf Dekoration.
export function Card({
  className = '',
  tone = 'card',
  ...p
}: HTMLAttributes<HTMLElement> & { tone?: keyof typeof TONES }) {
  return <section className={`border-[3px] border-ink p-4 shadow-hard ${TONES[tone]} ${className}`} {...p} />
}
