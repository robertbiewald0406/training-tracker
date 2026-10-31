import { useMemo, useState, type ReactNode } from 'react'
import { plan } from '../lib/plan'
import {
  berlinWeekStart,
  buildWeekReport,
  isBerlinSunday,
  latestReportWeek,
  shiftWeek,
  type ProgressRow,
} from '../lib/report'
import { fmtKg } from '../lib/stats'
import type { LocalRow } from '../lib/types'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Chevron, Trophy } from '../ui/icons'

interface Props {
  sessions: LocalRow<'session'>[]
  sets: LocalRow<'workout_set'>[]
  adjustments: LocalRow<'session_adjustment'>[]
  bodyweight: LocalRow<'bodyweight'>[]
  now?: Date
}

const pct = (p: number) => `${p > 0 ? '+' : p < 0 ? '−' : '±'}${String(Math.round(Math.abs(p) * 1000) / 10).replace('.', ',')} %`

function Section({ title, sentence, children }: { title: string; sentence: string; children?: ReactNode }) {
  return (
    <section className="space-y-2 border-t-[3px] border-ink pt-3">
      <h3 className="text-lg">{title}</h3>
      <p className="text-base">{sentence}</p>
      {children}
    </section>
  )
}

function ProgressList({ rows }: { rows: ProgressRow[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key} className="flex items-baseline justify-between gap-3 leading-tight">
          <span className="min-w-0">
            {r.name}
            <span className="num block text-base">
              1RM ≈ {fmtKg(r.current)} kg · Schnitt {fmtKg(r.baseline ?? 0)} kg
            </span>
          </span>
          <span className="num shrink-0 text-xl">{pct(r.pct ?? 0)}</span>
        </li>
      ))}
    </ul>
  )
}

const MAX_BETTER = 3

/**
 * "Deine Woche": Wochenbericht aus den lokalen Daten (Montag bis Sonntag, Europe/Berlin). Sonntags offen fuer die
 * laufende Woche, sonst eingeklappt fuer die letzte volle Woche. Frueher Wochen ueber die Pfeile.
 */
export function WeekReportCard({ sessions, sets, adjustments, bodyweight, now = new Date() }: Props) {
  const latest = useMemo(() => latestReportWeek(now), [now.toDateString()]) // eslint-disable-line react-hooks/exhaustive-deps
  const [week, setWeek] = useState<Date>(latest)
  const [open, setOpen] = useState(isBerlinSunday(now))
  const first = useMemo(() => {
    const t = sessions.map((s) => new Date(s.started_at).getTime())
    return t.length ? berlinWeekStart(new Date(Math.min(...t))) : latest
  }, [sessions, latest])
  const canBack = week.getTime() > first.getTime()
  const canFwd = week.getTime() < latest.getTime()

  const r = useMemo(
    () => buildWeekReport({ plan, sessions, sets, adjustments, bodyweight, weekStart: week }),
    [sessions, sets, adjustments, bodyweight, week],
  )

  if (!open)
    return (
      <Card className="space-y-3">
        <h2 className="text-2xl">Deine Woche</h2>
        <p className="text-base">{r.label}</p>
        <Button onClick={() => setOpen(true)}>Wochenbericht ansehen</Button>
      </Card>
    )

  const nav = (dir: -1 | 1, label: string, disabled: boolean) => (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={() => setWeek(shiftWeek(week, dir))}
      className="flex size-12 shrink-0 items-center justify-center border-[3px] border-ink bg-card disabled:text-[#6b5b8c]"
    >
      <Chevron dir={dir < 0 ? 'left' : 'right'} className="size-5" />
    </button>
  )
  const { training, progress, records, muscles, adjustments: adj, bodyweight: bw } = r.sentences
  const better = r.progress.better.slice(0, MAX_BETTER)

  return (
    <Card className="space-y-4" aria-label="Deine Woche">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-2xl">Deine Woche</h2>
        {!isBerlinSunday(now) && (
          <button type="button" onClick={() => setOpen(false)} className="min-h-12 border-[3px] border-ink bg-card px-3 font-display text-base uppercase">
            Zu
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {nav(-1, 'Frühere Woche', !canBack)}
        <p className="num min-w-0 flex-1 text-center text-lg leading-tight" aria-live="polite">
          {r.label}
        </p>
        {nav(1, 'Spätere Woche', !canFwd)}
      </div>

      <Section title="Trainingstage" sentence={training}>
        {r.trainingDays.weekdays.length > 0 && (
          <p className="num text-lg" aria-label={`Trainiert am ${r.trainingDays.weekdays.join(', ')}`}>
            {r.trainingDays.weekdays.join(' · ')}
          </p>
        )}
      </Section>

      <Section title="Fortschritt" sentence={progress}>
        {better.length > 0 && <ProgressList rows={better} />}
        {r.progress.better.length > MAX_BETTER && (
          <p className="text-base">Weitere {r.progress.better.length - MAX_BETTER} Übungen darüber.</p>
        )}
        {r.progress.below.length > 0 && (
          <>
            <p className="text-base">Darunter:</p>
            <ProgressList rows={r.progress.below} />
          </>
        )}
        {r.progress.stable.length > 0 && (
          <p className="text-base">
            <strong>Stabil</strong> (unter 3 %): {r.progress.stable.map((x) => x.name).join(', ')}
          </p>
        )}
        {r.progress.fresh.length > 0 && (
          <p className="text-base">Noch ohne Vergleich: {r.progress.fresh.map((x) => x.name).join(', ')}</p>
        )}
      </Section>

      <Section title="Neue Bestwerte" sentence={records}>
        {r.records.length > 0 && (
          <ul className="space-y-2">
            {r.records.map((x) => (
              <li key={x.key} className="flex items-center gap-2 leading-tight">
                <Trophy className="size-6 shrink-0" />
                <span className="min-w-0">
                  {x.name}
                  <span className="num block text-base">
                    1RM ≈ {fmtKg(x.e1rm)} kg (vorher {fmtKg(x.previous)} kg)
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Sätze pro Muskel" sentence={muscles}>
        <ul className="space-y-2">
          {r.muscles.map((m) => (
            <li key={m.muscle} className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 leading-tight">
                {m.label}
                <span className="num block text-base">Ziel {m.min}–{m.max}</span>
              </span>
              <span className="num w-8 shrink-0 text-right text-xl">{m.sets}</span>
              <span
                className={`w-24 shrink-0 border-[3px] border-ink px-1 py-1 text-center text-base leading-tight ${
                  m.status === 'im Bereich' ? 'bg-ok' : m.status === 'darunter' ? 'bg-baby' : 'bg-neon'
                }`}
              >
                {m.status === 'darueber' ? 'darüber' : m.status}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Ausgelassen und getauscht" sentence={adj}>
        {r.adjustments.length > 0 && (
          <ul className="space-y-1 text-base">
            {r.adjustments.map((a) => (
              <li key={a.id}>
                <strong>{a.weekday}</strong> {a.text}
                {a.grund ? ` (${a.grund})` : ''}
                {a.dauerhaft ? ', dauerhaft' : ''}
                {a.note ? `: ${a.note}` : ''}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Körpergewicht" sentence={bw} />
    </Card>
  )
}
