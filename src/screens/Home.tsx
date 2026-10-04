import { useState } from 'react'
import { getMeta, setMeta } from '../lib/db'
import { isRampUp, planDayForDate, setsFor, weekOverview } from '../lib/logger'
import { plan, type PlanDay } from '../lib/plan'
import { FALLBACK_QUOTE, pickQuote, QUOTES, RECENT_KEY, type PendingQuote } from '../lib/quotes'
import { supabase } from '../lib/supabase'
import { unlockAudio } from '../lib/signal'
import { saveAndSync } from '../lib/sync'
import type { LocalRow } from '../lib/types'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Scene } from '../ui/Scene'
import { Check, DAY_ICONS, Flame } from '../ui/icons'
import { epley, fmtKg, lastLog, daysBetween } from '../lib/stats'

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
  sets: LocalRow<'workout_set'>[]
  onQuote: (p: PendingQuote) => void
}

// Bester Arbeitssatz der letzten Einheit als Kurzinfo ("60 kg x 8, 4 Saetze").
function lastSummary(key: string, sets: LocalRow<'workout_set'>[], sessions: LocalRow<'session'>[], now: Date) {
  const log = lastLog(key, sets, sessions, null)
  if (!log) return null
  const best = log.sets.reduce((a, b) => (epley(b.weight_kg, b.reps) > epley(a.weight_kg, a.reps) ? b : a))
  const d = daysBetween(log.startedAt, now)
  return `${fmtKg(best.weight_kg)} kg × ${best.reps} · ${d <= 0 ? 'heute' : d === 1 ? 'gestern' : `vor ${d} Tagen`}`
}

export function Home({ sessions, sets, onQuote }: HomeProps) {
  const now = new Date()
  const today = planDayForDate(now, plan)
  const rampUp = isRampUp(now, sessions, plan)
  const week = weekOverview(plan, sessions, now)
  // Gewaehlter Tag: standardmaessig heute; am Wochenende der erste offene Tag. Ein Tipp auf die Wochenleiste wechselt.
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const selected = plan.days.find((d) => d.key === (picked ?? today?.key)) ?? null

  const start = async (d: PlanDay) => {
    unlockAudio() // erster Tap der Einheit: Ton fuer das Pausenende freischalten
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
  const Icon = DAY_ICONS[selected ? (selected.key as keyof typeof DAY_ICONS) : 'lauftag']
  const isToday = selected && today?.key === selected.key

  return (
    <>
      <Card className="p-3">
        <ul className="grid grid-cols-5 gap-2" aria-label="Diese Woche, Tag wählen">
          {week.map(({ day, done }) => {
            const DIcon = DAY_ICONS[day.key as keyof typeof DAY_ICONS]
            const sel = selected?.key === day.key
            return (
              <li key={day.key}>
                <button
                  type="button"
                  aria-pressed={sel}
                  aria-label={`${WEEKDAYS_LONG[day.weekday]} ${day.name}: ${done ? 'erledigt' : 'offen'}${sel ? ', gewählt' : ''}`}
                  onClick={() => setPicked(day.key)}
                  className={`flex min-h-16 w-full min-w-0 flex-col items-center justify-center gap-1 border-[3px] border-ink ${
                    sel ? 'bg-neon' : done ? 'bg-ok' : 'bg-card'
                  }`}
                >
                  <span className="font-display uppercase tracking-wider">{WEEKDAYS[day.weekday]}</span>
                  {done ? <Check className="size-6" /> : <DIcon className="size-6" />}
                </button>
              </li>
            )
          })}
        </ul>
      </Card>
      <Card className="space-y-4">
        <p className="text-base">{isToday ? 'Heute' : selected ? 'Gewählter Tag' : 'Wochenende'}</p>
        <div className="flex items-center gap-3">
          <Icon className="size-14 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-3xl leading-none">{selected ? selected.name : 'Lauftag'}</h1>
            <p className="mt-1 text-base">
              {selected ? `${selected.items.length} Übungen` : 'Heute wird gelaufen. Zum Trainieren oben einen Tag wählen.'}
            </p>
          </div>
        </div>
        {selected && (
          <>
            <Button variant="primary" disabled={busy} onClick={() => void start(selected)}>
              Einheit starten
            </Button>
            <ul className="space-y-2 border-t-[3px] border-ink pt-3">
              {selected.items.map((it) => {
                const info = lastSummary(it.exercise_key, sets, sessions, now)
                return (
                  <li key={it.exercise_key} className="leading-tight">
                    {plan.exercises[it.exercise_key].name}
                    <span className="num block text-base">
                      {setsFor(it, rampUp, plan)} × {it.rep_min}–{it.rep_max} Wdh.
                    </span>
                    <span className="num block text-base">{info ? `Zuletzt ${info}` : 'Noch kein Vergleich'}</span>
                  </li>
                )
              })}
            </ul>
          </>
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

      <Scene inline />
    </>
  )
}
