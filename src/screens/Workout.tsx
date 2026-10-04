import { useEffect, useMemo, useState } from 'react'
import { deleteMeta, getMeta, setMeta, stripMeta } from '../lib/db'
import {
  buildSetRow,
  derivePosition,
  isRampUp,
  nextSetNo,
  pendingRightSide,
  positionDone,
  prefill,
  resolvePosition,
  setsByPosition,
  setsFor,
  type Position,
} from '../lib/logger'
import { plan, type Exercise } from '../lib/plan'
import { supabase } from '../lib/supabase'
import { deleteAndSync, saveAndSync } from '../lib/sync'
import type { LocalRow } from '../lib/types'
import { useWakeLock } from '../lib/useWakeLock'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { RestTimer } from '../ui/RestTimer'
import { SetProgress } from '../ui/SetProgress'
import { Check, DAY_ICONS, Flame, Trophy } from '../ui/icons'
import { Divider } from '../ui/Divider'
import { SetEditor, type SetValues } from './SetEditor'

interface Props {
  session: LocalRow<'session'>
  sessions: LocalRow<'session'>[]
  sets: LocalRow<'workout_set'>[]
}

function weightUnit(ex: Exercise): string {
  const t = `${ex.equipment} ${ex.attachment}`
  if (/Kurzhantel/i.test(t)) return 'kg pro Hand'
  if (/Plate/i.test(ex.equipment)) return 'kg Platten pro Seite'
  if (/Stack|Kabel|Maschine/i.test(ex.equipment)) return 'kg Stack'
  return 'kg'
}
const kg = (n: number) => String(n).replace('.', ',')
const SIDE_TEXT = { left: 'links', right: 'rechts', both: '' } as const

export function Workout({ session, sessions, sets }: Props) {
  const day = plan.days.find((d) => d.key === session.day_key)!
  const rampUp = useMemo(() => isRampUp(new Date(), sessions, plan), [sessions])
  const [pos, setPos] = useState<Position | null>(null)
  const [stepKg, setStepKg] = useState(2.5)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useWakeLock(true)

  // Wiederaufnahme: gespeicherte Position (lokal, nie synchronisiert), sonst aus den Saetzen abgeleitet.
  useEffect(() => {
    let alive = true
    void getMeta<Position>(`position:${session.id}`).then((stored) => {
      if (!alive) return
      const derived = derivePosition(day, sets, session.id, rampUp, plan, stored?.assign)
      const p = resolvePosition(stored, derived, day.items.length)
      // Ein laengst abgelaufener Pausentimer wird nach der Wiederaufnahme nicht mehr angezeigt.
      if (p.restEndsAt !== undefined && p.restEndsAt < Date.now() - 60_000) p.restEndsAt = undefined
      setPos(p)
    })
    return () => {
      alive = false
    }
    // Nur beim Start der Einheit laden; danach ist `pos` die Quelle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  if (!pos) return null

  const update = (p: Position) => {
    setPos(p)
    void setMeta(`position:${session.id}`, p)
  }
  const sessionSets = sets.filter((s) => s.session_id === session.id)
  const idx = pos.itemIdx
  const n = day.items.length

  async function endSession() {
    if (!window.confirm('Einheit beenden?')) return
    await saveAndSync(supabase, 'session', { ...stripMeta(session), ended_at: new Date().toISOString() })
    await deleteMeta(`position:${session.id}`)
  }

  const header = (
    <div className="flex items-center gap-3">
      {(() => {
        const Icon = DAY_ICONS[day.key as keyof typeof DAY_ICONS]
        return Icon ? <Icon className="size-10 shrink-0" /> : null
      })()}
      <div className="min-w-0">
        <h1 className="text-3xl leading-none">{day.name}</h1>
        <p className="text-base">{idx >= n ? 'Alle Übungen erledigt' : `Übung ${idx + 1} von ${n}`}</p>
      </div>
    </div>
  )

  if (idx >= n) {
    return (
      <>
        <Card className="space-y-4">
          {header}
          <div className="flex items-center gap-3">
            <Trophy className="size-12 shrink-0" />
            <p className="text-xl">Stark! Alle Übungen sind durch.</p>
          </div>
          <Button variant="primary" onClick={() => void endSession()}>Einheit beenden</Button>
          <Button onClick={() => update({ ...pos, itemIdx: n - 1 })}>Zurück zur letzten Übung</Button>
        </Card>
      </>
    )
  }

  const item = day.items[idx]
  const keys = [item.exercise_key, ...plan.exercises[item.exercise_key].alternatives]
  const chosenKey = pos.chosen[idx] ?? item.exercise_key
  const ex = plan.exercises[chosenKey]
  const uni = Boolean(ex.unilateral)
  const per = setsByPosition(day, plan, sets, session.id, pos.assign)
  const done = positionDone(day, plan, per[idx], idx)
  const total = setsFor(item, rampUp, plan)
  const right = uni ? pendingRightSide(sets, session.id, chosenKey) : null
  const side = uni ? (right ? 'right' : 'left') : 'both'
  const setNo = right ? right.setNo : nextSetNo(sets, session.id, chosenKey)

  const lastSet = [...sessionSets].sort((a, b) => a.logged_at.localeCompare(b.logged_at)).at(-1)
  const editSet = editing ? sessionSets.find((s) => s.id === editing) : undefined

  let initial: { weight_kg: number; reps: number } | null
  if (editSet) initial = { weight_kg: editSet.weight_kg, reps: editSet.reps }
  else if (right) initial = { weight_kg: right.weight_kg, reps: right.reps } // links -> rechts uebernehmen
  else initial = prefill(chosenKey, uni ? 'left' : 'both', sets, sessions, session.id)

  async function saveSet(v: SetValues) {
    if (!pos) return
    setBusy(true)
    try {
      const row = buildSetRow({
        sessionId: session.id,
        exerciseKey: chosenKey,
        setNo,
        weight_kg: v.weight,
        reps: v.reps,
        warmup: v.warmup,
        failure: v.failure,
        side,
      })
      await saveAndSync(supabase, 'workout_set', row)
      // Pausentimer erst nach der rechten Seite (bzw. nach jedem beidseitigen Satz).
      const timer = !uni || side === 'right'
      update({
        ...pos,
        chosen: { ...pos.chosen, [idx]: chosenKey },
        assign: { ...pos.assign, [row.id]: idx },
        restEndsAt: timer ? Date.now() + item.rest_sec * 1000 : pos.restEndsAt,
      })
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit(v: SetValues) {
    if (!editSet) return
    setBusy(true)
    try {
      await saveAndSync(supabase, 'workout_set', {
        ...stripMeta(editSet),
        weight_kg: Math.round(v.weight * 100) / 100,
        reps: v.reps,
        is_warmup: v.warmup,
        rir: v.failure ? 0 : null,
      })
      setEditing(null)
    } finally {
      setBusy(false)
    }
  }

  async function removeLast() {
    if (!lastSet) return
    if (!window.confirm('Letzten Satz löschen? Er wird auch in Supabase gelöscht.')) return
    await deleteAndSync(supabase, 'workout_set', lastSet.id)
    setEditing(null)
  }

  const go = (i: number) => update({ ...pos, itemIdx: Math.max(0, Math.min(n, i)) })

  return (
    <>
      <Card className="space-y-4">
        {header}
        <Divider />
        <div className="space-y-1">
          <h2 className="text-2xl leading-tight">{ex.name}</h2>
          <p className="text-base">
            {ex.equipment} · {ex.attachment}
          </p>
          <p className="text-lg">{ex.cue}</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="num text-4xl leading-none">
            {item.rep_min}–{item.rep_max}
            <span className="ml-1 text-lg font-semibold">Wdh.</span>
          </p>
          <SetProgress done={done} total={total} />
        </div>
        <p className="text-xl">
          {done >= total ? (
            <span className="inline-flex items-center gap-2">
              <Check className="size-6" /> Übung fertig
            </span>
          ) : (
            <>Satz {done + 1} von {total}</>
          )}
        </p>
        {uni && <p className="text-base">Einseitig: erst links, dann rechts speichern.</p>}
        {rampUp && (
          <p className="flex items-center gap-2 border-[3px] border-ink bg-baby px-3 py-2 text-base">
            <Flame className="size-5 shrink-0" /> Wiedereinstieg: ein Satz weniger. Nicht bis Versagen.
          </p>
        )}
        {keys.length > 1 && (
          <div className="space-y-2">
            <p className="text-base">Belegt? Alternative wählen:</p>
            <div className="flex flex-col gap-2">
              {keys.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={k === chosenKey}
                  onClick={() => update({ ...pos, chosen: { ...pos.chosen, [idx]: k } })}
                  className={`min-h-14 border-[3px] border-ink px-3 text-left text-lg shadow-hard active:translate-x-1 active:translate-y-1 active:shadow-none ${
                    k === chosenKey ? 'bg-neon' : 'bg-card'
                  }`}
                >
                  {plan.exercises[k].name}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {pos.restEndsAt !== undefined && (
        <RestTimer
          endsAt={pos.restEndsAt}
          onAdjust={(d) => update({ ...pos, restEndsAt: pos.restEndsAt! + d })}
          onSkip={() => update({ ...pos, restEndsAt: undefined })}
        />
      )}

      {editSet ? (
        <SetEditor
          key={`edit-${editSet.id}`}
          title={`Satz korrigieren${editSet.side !== 'both' ? ` · ${SIDE_TEXT[editSet.side]}` : ''}`}
          initial={initial}
          initialFlags={{ warmup: editSet.is_warmup, failure: editSet.rir === 0 }}
          stepKg={stepKg}
          onStepKg={setStepKg}
          rampUp={rampUp}
          weightUnit={weightUnit(plan.exercises[editSet.exercise_key])}
          saveLabel="Änderung speichern"
          busy={busy}
          onSave={(v) => void saveEdit(v)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <SetEditor
          key={`${chosenKey}|${side}|${setNo}`}
          title={`${done >= total && !right ? 'Zusatzsatz' : `Satz ${done + 1}`}${uni ? ` · ${side === 'left' ? 'LINKS' : 'RECHTS'}` : ''}`}
          initial={initial}
          stepKg={stepKg}
          onStepKg={setStepKg}
          rampUp={rampUp}
          weightUnit={weightUnit(ex)}
          saveLabel={uni ? `${side === 'left' ? 'Links' : 'Rechts'} speichern` : 'Satz speichern'}
          busy={busy}
          onSave={(v) => void saveSet(v)}
        />
      )}

      {lastSet && !editSet && (
        <Card className="space-y-3">
          <h2 className="text-xl">Letzter Satz</h2>
          <p className="num text-2xl">
            {kg(lastSet.weight_kg)} kg × {lastSet.reps}
            <span className="ml-2 font-sans text-base font-semibold">
              {plan.exercises[lastSet.exercise_key].name}
              {lastSet.side !== 'both' ? `, ${SIDE_TEXT[lastSet.side]}` : ''}
              {lastSet.is_warmup ? ', Aufwärmen' : ''}
              {lastSet.rir === 0 ? ', bis Versagen' : ''}
            </span>
          </p>
          <div className="flex gap-3">
            <Button onClick={() => setEditing(lastSet.id)}>Bearbeiten</Button>
            <Button onClick={() => void removeLast()}>Löschen</Button>
          </div>
        </Card>
      )}

      <div className="flex gap-3">
        <Button disabled={idx === 0} onClick={() => go(idx - 1)}>Zurück</Button>
        <Button variant={done >= total ? 'primary' : 'secondary'} onClick={() => go(idx + 1)}>
          {idx === n - 1 ? 'Abschluss' : 'Nächste Übung'}
        </Button>
      </div>
      <Button onClick={() => void endSession()}>Einheit beenden</Button>
    </>
  )
}
