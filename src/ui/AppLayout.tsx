import type { ReactNode } from 'react'
import { Header } from './Header'
import { Ribbon, StripeBand } from './Ribbon'
import { Scene } from './Scene'
import { Barbell, Dumbbell, Kettlebell, Trophy } from './icons'

// Dekoration an den Seiten, nur auf breiten Bildschirmen (leere Flaechen), nie hinter Zahlen.
function SideDecor() {
  const c = 'absolute size-40 text-white/60'
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden lg:block">
      <Barbell className={`${c} left-[6%] top-[22%] -rotate-12`} />
      <Kettlebell className={`${c} left-[14%] top-[48%] rotate-6`} />
      <Trophy className={`${c} right-[8%] top-[24%] rotate-6`} />
      <Dumbbell className={`${c} right-[12%] top-[50%] -rotate-12`} />
    </div>
  )
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      <SideDecor />
      <Scene />
      <div className="relative z-10">
        <Header />
        <StripeBand />
        <main className="mx-auto max-w-md space-y-5 p-4 pb-48">
          <Ribbon />
          {children}
        </main>
      </div>
    </div>
  )
}
