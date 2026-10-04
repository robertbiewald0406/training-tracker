import type { ReactNode } from 'react'
import { ChartBars, Dumbbell, Menu } from './icons'

export type Tab = 'training' | 'verlauf' | 'mehr'

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'training', label: 'Training', icon: <Dumbbell className="size-7" /> },
  { id: 'verlauf', label: 'Verlauf', icon: <ChartBars className="size-7" /> },
  { id: 'mehr', label: 'Mehr', icon: <Menu className="size-7" /> },
]

// Feste Leiste unten: drei grosse Ziele, aktiver Tab = Neon-Flaeche. Beruecksichtigt die Home-Anzeige des iPhones.
export function TabBar({ tab, onTab, badge }: { tab: Tab; onTab: (t: Tab) => void; badge?: number }) {
  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-20 border-t-[3px] border-ink bg-card pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map((t, i) => (
          <li key={t.id} className={`flex-1 ${i > 0 ? 'border-l-[3px] border-ink' : ''}`}>
            <button
              type="button"
              onClick={() => onTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`relative flex min-h-16 w-full flex-col items-center justify-center gap-0.5 font-display text-sm uppercase tracking-wider text-ink ${
                tab === t.id ? 'bg-neon' : 'bg-card'
              }`}
            >
              {t.icon}
              {t.label}
              {t.id === 'mehr' && badge ? (
                <span className="num absolute right-3 top-1.5 min-w-5 border-2 border-ink bg-card px-1 text-xs leading-4">
                  {badge}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
