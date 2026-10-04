import type { HTMLAttributes } from 'react'

// Ruhiger, einfarbiger Kartengrund: Zahlen stehen immer auf Karten, nie auf Dekoration.
export function Card({ className = '', ...p }: HTMLAttributes<HTMLElement>) {
  return <section className={`border-[3px] border-ink bg-card p-4 shadow-hard ${className}`} {...p} />
}
