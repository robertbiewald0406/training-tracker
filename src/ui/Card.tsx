import type { HTMLAttributes } from 'react'

const TONES = { card: 'bg-card', info: 'bg-info', ok: 'bg-ok' } as const

// Ruhiger, einfarbiger Kartengrund: Zahlen stehen immer auf Karten, nie auf Dekoration.
export function Card({
  className = '',
  tone = 'card',
  ...p
}: HTMLAttributes<HTMLElement> & { tone?: keyof typeof TONES }) {
  return <section className={`border-2 border-ink p-4 shadow-hard ${TONES[tone]} ${className}`} {...p} />
}
