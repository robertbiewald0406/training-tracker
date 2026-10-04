import { daysBetween, fmtKg, type SessionLog } from '../lib/stats'
import { Card } from '../ui/Card'

const SIDE = { left: 'L', right: 'R', both: '' } as const

function ago(iso: string, now: Date) {
  const d = daysBetween(iso, now)
  if (d <= 0) return 'heute'
  if (d === 1) return 'gestern'
  if (d === 7) return 'vor 1 Woche'
  if (d % 7 === 0 && d <= 28) return `vor ${d / 7} Wochen`
  return `vor ${d} Tagen`
}

/** "Letztes Mal": Saetze der vorigen Einheit dieser Uebung. Der Satz, der jetzt dran ist, ist hervorgehoben. */
export function LastTime({ log, current, now = new Date() }: { log: SessionLog | null; current: number; now?: Date }) {
  if (!log)
    return (
      <Card tone="baby" className="py-3">
        <p>Erstes Mal bei dieser Übung. Danach siehst du hier deine letzten Werte.</p>
      </Card>
    )
  const byNo = new Map<number, typeof log.sets>()
  for (const s of log.sets) byNo.set(s.set_no, [...(byNo.get(s.set_no) ?? []), s])
  const groups = [...byNo.values()]
  return (
    <Card tone="baby" className="space-y-2 p-3">
      <h2 className="flex items-center gap-2 text-lg">
        Letztes Mal <span className="font-sans text-base normal-case tracking-normal">· {ago(log.startedAt, now)}</span>
      </h2>
      <ul className="flex flex-wrap gap-2">
        {groups.map((g, i) => (
          <li
            key={g[0].set_no}
            aria-current={i === current ? 'step' : undefined}
            className={`num border-[3px] border-ink px-2 py-1 text-base leading-tight ${i === current ? 'bg-neon' : 'bg-card'}`}
          >
            <span className="mr-1 text-sm font-semibold">{i + 1}.</span>
            {g.map((s) => `${SIDE[s.side]}${SIDE[s.side] ? ' ' : ''}${fmtKg(s.weight_kg)} × ${s.reps}`).join(' · ')}
          </li>
        ))}
      </ul>
    </Card>
  )
}
