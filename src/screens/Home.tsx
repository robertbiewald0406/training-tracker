import { useState, type ReactNode } from 'react'
import { getMeta, setMeta } from '../lib/db'
import { isRampUp, planDayForDate, weekOverview } from '../lib/logger'
import { plan, type PlanDay } from '../lib/plan'
import { FALLBACK_QUOTE, pickQuote, QUOTES, RECENT_KEY, type PendingQuote } from '../lib/quotes'
import { supabase } from '../lib/supabase'
import { saveAndSync } from '../lib/sync'
import type { LocalRow } from '../lib/types'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Ribbon } from '../ui/Ribbon'
import { Check, DAY_ICONS, Flame } from '../ui/icons'

const WEEKDAYS = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr']
const WEEKDAYS_LONG = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag']

export async function startSession(day: PlanDay, id: string = crypto.randomUUID()) {
  await saveAndSync(supabase, 'session', {
    id,
    day_key: day.key,
    started_at: new Date().toISOString(),
    ended_at: null,
    note: null,
  })
}

/** Zitat waehlen (keines der letzten 30, Liste liegt in meta). Darf den Start nie blockieren. */
async function chooseQuote() {
  try {
    const { quote, recent } = pickQuote(QUOTES, await getMeta<unknown>(RECENT_KEY))
    await setMeta(RECENT_KEY, recent)
    return quote
  } catch {
    return FALLBACK_QUOTE
  }
}

interface HomeProps {
  sessions: LocalRow<'session'>[]
  extras?: ReactNode
  onQuote: (p: PendingQuote) => void
}

export function Home({ sessions, extras, onQuote }: HomeProps) {
  const now = new Date()
  const today = planDayForDate(now, plan)
  const rampUp = isRampUp(now, sessions, plan)
  const week = weekOverview(plan, sessions, now)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)

  const start = async (d: PlanDay) => {
    setBusy(true)
    try {
      // Session sofort anlegen (nicht erst nach dem Zitat); das Zitat wird nur fuer diesen Start gemerkt.
      const id = crypto.randomUUID()
      onQuote({ sessionId: id, quote: await chooseQuote() })
      await startSession(d, id)
    } finally {
      setBusy(false)
    }
  }
  const TodayIcon = DAY_ICONS[today ? (today.key as keyof typeof DAY_ICONS) : 'lauftag']

  return (
    <>
      <Ribbon />
      <Card className="space-y-4">
        <p className="text-base">{today ? 'Heute' : 'Wochenende'}</p>
        <div className="flex items-center gap-3">
          <TodayIcon className="size-14 shrink-0" />
          <div>
            <h1 className="text-4xl leading-none">{today ? today.name : 'Lauftag'}</h1>
            <p className="mt-1 text-base">
              {today ? `${today.items.length} Übungen` : 'Heute wird gelaufen.'}
            </p>
          </div>
        </div>
        {today && (
          <Button variant="primary" disabled={busy} onClick={() => void start(today)}>
            Einheit starten
          </Button>
        )}
        <Button variant={today ? 'neutral' : 'secondary'} onClick={() => setPicking((v) => !v)} aria-expanded={picking}>
          Anderen Tag wählen
        </Button>
        {picking && (
          <div className="space-y-2">
            {plan.days.map((d) => {
              const Icon = DAY_ICONS[d.key as keyof typeof DAY_ICONS]
              return (
                <Button key={d.key} disabled={busy} onClick={() => void start(d)} className="justify-start">
                  <Icon className="size-7 shrink-0" />
                  <span className="min-w-0 text-left leading-tight">
                    {WEEKDAYS[d.weekday]} · {d.name}
                  </span>
                </Button>
              )
            })}
          </div>
        )}
      </Card>

      {rampUp && (
        <Card tone="baby" className="flex items-start gap-3">
          <Flame className="mt-1 size-6 shrink-0" />
          <p className="text-lg">
            <strong>Wiedereinstieg:</strong> In den ersten {plan.ramp_up.weeks * 7} Tagen ein Satz weniger je Übung.
            Nicht bis Versagen.
          </p>
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="text-2xl">Diese Woche</h2>
        <ul className="grid grid-cols-5 gap-2">
          {week.map(({ day, done }) => {
            const Icon = DAY_ICONS[day.key as keyof typeof DAY_ICONS]
            const isToday = today?.key === day.key
            return (
              <li
                key={day.key}
                aria-label={`${WEEKDAYS_LONG[day.weekday]} ${day.name}: ${done ? 'erledigt' : 'offen'}`}
                className={`flex min-w-0 flex-col items-center gap-1 border-[3px] border-ink py-2 ${
                  done ? 'bg-ok' : isToday ? 'bg-neon' : 'bg-card'
                }`}
              >
                <span className="font-display uppercase tracking-wider">{WEEKDAYS[day.weekday]}</span>
                {done ? <Check className="size-7" /> : <Icon className="size-7" />}
              </li>
            )
          })}
        </ul>
        <p className="text-base">Mit Häkchen = Einheit beendet, sonst offen.</p>
      </Card>
      {extras}
    </>
  )
}
