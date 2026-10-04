import { useMemo, useState } from 'react'
import { plan } from '../lib/plan'
import { supabase } from '../lib/supabase'
import { saveAndSync } from '../lib/sync'
import { formatNumber, parseNumber } from '../lib/logger'
import {
  bodyweightSeries,
  daysBetween,
  exerciseHistory,
  exerciseLogs,
  fmtInt,
  fmtKg,
  hardSetsByMuscle,
  isoDay,
  MUSCLE_NAMES,
  personalRecords,
  weekTotals,
} from '../lib/stats'
import type { LocalRow } from '../lib/types'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { BarRows, LineChart } from '../ui/charts'
import { ArrowDown, ArrowUp, Chevron, Trophy } from '../ui/icons'
import { Segmented } from '../ui/Segmented'

interface Props {
  sessions: LocalRow<'session'>[]
  sets: LocalRow<'workout_set'>[]
  bodyweight: LocalRow<'bodyweight'>[]
}

const RANGES = [
  { value: 56, text: '8 Wo.' },
  { value: 180, text: '6 Mon.' },
  { value: 0, text: 'Alles' },
]
const DAY = 86_400_000

function Delta({ now, before, unit = '' }: { now: number; before: number; unit?: string }) {
  const d = now - before
  if (before === 0 && now === 0) return <span className="text-base">–</span>
  if (d === 0) return <span className="text-base">±0</span>
  const Icon = d > 0 ? ArrowUp : ArrowDown
  return (
    <span className="inline-flex items-center gap-1 text-base">
      <Icon className="size-4" />
      {d > 0 ? '+' : '−'}
      {fmtInt(Math.abs(d))}
      {unit}
    </span>
  )
}

function Tile({ value, label, now, before, unit }: { value: string; label: string; now: number; before: number; unit?: string }) {
  return (
    <li className="min-w-0 border-[3px] border-ink bg-card p-2">
      <p className="num text-3xl leading-none">{value}</p>
      <p className="mt-1 truncate text-base">{label}</p>
      <Delta now={now} before={before} unit={unit} />
    </li>
  )
}

export function Dashboard({ sessions, sets, bodyweight }: Props) {
  const now = new Date()
  const [range, setRange] = useState(180)
  const [open, setOpen] = useState<string | null>(null)
  const cutoff = range ? now.getTime() - range * DAY : 0

  const w0 = weekTotals(sets, sessions, now, 0)
  const w1 = weekTotals(sets, sessions, now, 1, true) // Vorwoche bis zum gleichen Zeitpunkt
  const muscles0 = hardSetsByMuscle(sets, sessions, plan, now, 0)
  const muscles1 = hardSetsByMuscle(sets, sessions, plan, now, 1)
  const muscleRows = Object.keys({ ...muscles0, ...muscles1 })
    .map((m) => ({ label: MUSCLE_NAMES[m] ?? m, value: muscles0[m] ?? 0, prev: muscles1[m] ?? 0 }))
    .sort((a, b) => b.value - a.value || b.prev - a.prev)
  const muscleMax = Math.max(10, ...muscleRows.flatMap((r) => [r.value, r.prev]))

  const records = useMemo(() => personalRecords(sets, sessions, plan), [sets, sessions])
  const exercises = useMemo(
    () =>
      records.map((pr) => {
        const hist = exerciseHistory(pr.exerciseKey, sets, sessions)
        return { pr, hist, last: hist.at(-1)!, prev: hist.at(-2) }
      }),
    [records, sets, sessions],
  )

  return (
    <>
      <h1 className="text-3xl">Verlauf</h1>

      <Card className="space-y-3">
        <h2 className="text-xl">Diese Woche</h2>
        <ul className="grid grid-cols-3 gap-2">
          <Tile value={String(w0.sessions)} label="Einheiten" now={w0.sessions} before={w1.sessions} />
          <Tile value={String(w0.sets)} label="Harte Sätze" now={w0.sets} before={w1.sets} />
          <Tile value={fmtInt(w0.volume)} label="Volumen kg" now={w0.volume} before={w1.volume} />
        </ul>
        <p className="text-base">Pfeil = Unterschied zur Vorwoche bis zum gleichen Zeitpunkt.</p>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-xl">Harte Sätze pro Muskel</h2>
        {muscleRows.length ? (
          <>
            <BarRows rows={muscleRows} max={muscleMax} />
            <p className="text-base">Balken = diese Woche, Strich = ganze Vorwoche.</p>
          </>
        ) : (
          <p>Noch keine Sätze in dieser oder der letzten Woche.</p>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-xl">Übungen</h2>
        <Segmented label="Zeitraum" options={RANGES} value={range} onChange={setRange} />
        {exercises.length === 0 && <p>Sobald du Sätze speicherst, erscheinen hier deine Fortschritte.</p>}
        <ul className="space-y-2">
          {exercises.map(({ pr, hist, last, prev }) => {
            const key = pr.exerciseKey
            const isOpen = open === key
            const shown = hist.filter((p) => new Date(p.date).getTime() >= cutoff)
            const trend = prev ? Math.round(last.e1rm * 10) - Math.round(prev.e1rm * 10) : 0
            return (
              <li key={key} className="border-[3px] border-ink bg-card">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : key)}
                  className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block leading-tight">{plan.exercises[key].name}</span>
                    <span className="num block text-base">
                      1RM ≈ {fmtKg(last.e1rm)} kg
                      {prev && trend !== 0 && (
                        <span className="ml-2 inline-flex items-center gap-0.5">
                          {trend > 0 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
                          {fmtKg(Math.abs(trend) / 10)}
                        </span>
                      )}
                    </span>
                  </span>
                  <Chevron dir={isOpen ? 'down' : 'right'} className="size-5 shrink-0" />
                </button>
                {isOpen && (
                  <div className="space-y-3 border-t-[3px] border-ink p-3">
                    {shown.length ? (
                      <>
                        <p className="text-base">Geschätztes 1RM (Epley), je Einheit der beste Satz, in kg</p>
                        <LineChart
                          points={shown.map((p) => ({ t: new Date(p.date).getTime(), v: p.e1rm }))}
                          label={`1RM ${plan.exercises[key].name}`}
                          unit="kg"
                        />
                        <p className="text-base">Volumen je Einheit (Gewicht × Wiederholungen), in kg</p>
                        <LineChart
                          points={shown.map((p) => ({ t: new Date(p.date).getTime(), v: p.volume }))}
                          label={`Volumen ${plan.exercises[key].name}`}
                          unit="kg"
                        />
                        <ul className="space-y-1">
                          {exerciseLogs(key, sets, sessions)
                            .slice(-4)
                            .reverse()
                            .map((l) => (
                              <li key={l.sessionId} className="num text-base">
                                {new Date(l.startedAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}:{' '}
                                {l.sets.map((s) => `${fmtKg(s.weight_kg)}×${s.reps}`).join(' · ')}
                              </li>
                            ))}
                        </ul>
                      </>
                    ) : (
                      <p>Im gewählten Zeitraum keine Einheit.</p>
                    )}
                    <p className="num flex items-center gap-2 text-base">
                      <Trophy className="size-5 shrink-0" />
                      Rekord: {fmtKg(pr.weight)} kg × {pr.reps} (≈ {fmtKg(pr.e1rm)} kg)
                    </p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </Card>

      <Records records={records.slice(0, 5)} now={now} />
      <Bodyweight rows={bodyweight} cutoff={cutoff} />
    </>
  )
}

function Records({ records, now }: { records: ReturnType<typeof personalRecords>; now: Date }) {
  if (!records.length) return null
  return (
    <Card className="space-y-3">
      <h2 className="text-xl">Letzte Rekorde</h2>
      <ul className="space-y-2">
        {records.map((r) => {
          const days = daysBetween(r.date, now)
          return (
            <li key={r.exerciseKey} className="flex items-center gap-3">
              <Trophy className="size-7 shrink-0" />
              <span className="min-w-0 flex-1 leading-tight">
                {plan.exercises[r.exerciseKey].name}
                <span className="num block text-base">
                  {fmtKg(r.weight)} kg × {r.reps} · {days <= 0 ? 'heute' : days === 1 ? 'gestern' : `vor ${days} Tagen`}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function Bodyweight({ rows, cutoff }: { rows: LocalRow<'bodyweight'>[]; cutoff: number }) {
  const series = useMemo(() => bodyweightSeries(rows), [rows])
  const today = isoDay(new Date())
  const todays = series.find((p) => p.date === today)
  const latest = series.at(-1)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const t = (d: string) => new Date(`${d}T12:00:00`).getTime()
  const shown = series.filter((p) => t(p.date) >= cutoff)
  const v = parseNumber(text || (latest ? formatNumber(latest.kg) : ''))
  const valid = v !== null && v >= 20 && v <= 400

  async function save() {
    if (!valid) return
    setBusy(true)
    try {
      await saveAndSync(supabase, 'bodyweight', {
        id: crypto.randomUUID(),
        measured_on: today,
        weight_kg: Math.round(v * 10) / 10,
      })
      setText('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="text-xl">Körpergewicht</h2>
      {latest && (
        <p className="num text-4xl leading-none">
          {fmtKg(latest.avg7)}
          <span className="ml-2 font-sans text-base font-semibold">kg im 7-Tage-Mittel</span>
        </p>
      )}
      {shown.length > 0 && (
        <LineChart
          points={shown.map((p) => ({ t: t(p.date), v: p.kg }))}
          line2={shown.map((p) => ({ t: t(p.date), v: p.avg7 }))}
          label="Körpergewicht, 7-Tage-Mittel"
          unit="kg"
        />
      )}
      {shown.length > 0 && <p className="text-base">Linie = 7-Tage-Mittel, Punkte = einzelne Messungen.</p>}
      <label className="block text-base" htmlFor="bw">
        {todays ? `Heute eingetragen: ${fmtKg(todays.kg)} kg. Korrigieren:` : 'Heute wiegen (kg):'}
      </label>
      <div className="flex gap-2">
        <input
          id="bw"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          placeholder={latest ? formatNumber(latest.kg) : '80,0'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="num min-h-14 min-w-0 flex-1 border-[3px] border-ink bg-white px-3 text-2xl text-ink outline-none placeholder:text-[#5f4f85] focus:bg-baby/40"
        />
        <Button variant="secondary" className="!w-auto shrink-0" disabled={!valid || busy} onClick={() => void save()}>
          Speichern
        </Button>
      </div>
    </Card>
  )
}
