import type { ReactNode } from 'react'
import { Header } from './Header'
import { StripeBand } from './Ribbon'

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      <div className="relative z-10">
        <Header />
        <StripeBand />
        <main className="mx-auto max-w-md space-y-5 p-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
          {children}
        </main>
      </div>
    </div>
  )
}
