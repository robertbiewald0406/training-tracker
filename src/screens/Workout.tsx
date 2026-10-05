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
  isTimed,
  repsUnit,
  resolveSessionDay,
  startValues,
  variantMatch,
  variantOfKey,
  resolvePosition,
  setsByPosition,
  setsFor,
  type Position,
} from '../lib/logger'
import { plan, type Exercise } from '../lib/plan'
import { supabase } from '../lib/supabase'
import { lastLog } from '../lib/stats'
import { deleteAndSync, saveAndSync } from '../lib/sync'
import type { LocalRow } from '../lib/types'
import { unlockAudio } from '../lib/signal'
import { useWakeLock } from '../lib/useWakeLock'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { RestTimer } from '../ui/RestTimer'
import { SetProgress } from '../ui/SetProgress'
import { Check, Chevron, DAY_ICONS, Flame, Trophy } from '../ui/icons'
import { LastTime } from './LastTime'
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
  const day = resolveSessionDay(session.day_key, plan)!
  const variant = variantOfKey(session.day_key, plan)
  const match = variantMatch(variant, sessions, plan)
  const rampUp = useMemo(() => isRampUp(new Date(), sessions, plan), [sessions])
  const [pos, setPos] = useState<Position | null>(null)
  const [stepKg, setStepKg] = useState(2.5)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [panel, setPanel] = useState<string | null>(null) // "<idx>:cue" | "<idx>:alt"
  useWakeLock(true)
  // Wiederaufnahme ohne Start-Tap: Audio beim ersten Tap freischalten.
  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio, { once: true })
    return () => window.removeEventListener('pointerdown', unlockAudio)
  }, [])

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

  const Icon = DAY_ICONS[day.key as keyof typeof DAY_ICONS]
  const finished = idx >= n
  const per = setsByPosition(day, plan, sets, session.id, pos.assign)
  const go = (i: number) => update({ ...pos, itemIdx: Math.max(0, Math.min(n, i)) })

  // Kopf: Tagesname und Uebungsnavigation. Jede Uebung ist ein Tipp-Ziel (erledigt = Haken, aktuell = Neon).
  const header = (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="size-6 shrink-0" />}
        <h1 className="min-w-0 flex-1 truncate text-lg leading-none">{day.name}
          {variant ? ` · ${variant}` : ''}
        </h1>
        <p className="num shrink-0 text-base">{finished ? 'Fertig' : `Übung ${idx + 1} von ${n}`}</p>
      </div>
      <ol className="flex gap-2" aria-label="Übungen">
        {day.items.map((it, i) => {
          const full = positionDone(day, plan, per[i], i) >= setsFor(it, rampUp, plan)
          return (
            <li key={it.exercise_key} className="flex-1">
              <button
                type="button"
                onClick={() => go(i)}
                aria-label={`Übung ${i + 1}: ${plan.exercises[pos.chosen[i] ?? it.exercise_key].name}${full ? ', erledigt' : ''}`}
                aria-current={i === idx ? 'step' : undefined}
                className={`num flex min-h-12 w-full items-center justify-center border-[3px] border-ink text-xl ${
                  i === idx ? 'bg-neon' : full ? 'bg-ok' : 'bg-card'
                }`}
              >
                {full && i !== idx ? <Check className="size-6" /> : i + 1}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )

  if (finished) {
    return (
      <>
        {header}
        <Card className="space-y-4">
          <div className="flex items-center gap-3">
            <Trophy className="size-12 shrink-0" />
            <p className="text-xl">Stark! Alle Übungen sind durch.</p>
          </div>
          <Button variant="primary" onClick={() => void endSession()}>Einheit beenden</Button>
          <Button onClick={() => go(n - 1)}>Zurück zur letzten Übung</Button>
        </Card>
      </>
    )
  }

  const item = day.items[idx]
  const keys = [item.exercise_key, ...plan.exercises[item.exercise_key].alternatives]
  const chosenKey = pos.chosen[idx] ?? item.exercise_key
  const ex = plan.exercises[chosenKey]
  const uni = Boolean(ex.unilateral)
  const done = positionDone(day, plan, per[idx], idx)
  const total = setsFor(item, rampUp, plan)
  const right = uni ? pendingRightSide(sets, session.id, chosenKey) : null
  const side = uni ? (right ? 'right' : 'left') : 'both'
  const setNo = right ? right.setNo : nextSetNo(sets, session.id, chosenKey)

  const lastSet = [...sessionSets].sort((a, b) => a.logged_at.localeCompare(b.logged_at)).at(-1)
  const editSet = editing ? sessionSets.find((s) => s.id === editing) : undefined

  let initial: { weight_kg: number; reps: number | null } | null
  if (editSet) initial = { weight_kg: editSet.weight_kg, reps: editSet.reps }
  else if (right) initial = { weight_kg: right.weight_kg, reps: right.reps } // links -> rechts uebernehmen
  else initial = startValues(ex, item, prefill(chosenKey, uni ? 'left' : 'both', sets, sessions, session.id, match))

  // Vergleich mit dem letzten Mal: derselbe Satz (gleiche Reihenfolge, gleiche Seite), sonst der letzte Satz.
  const prev = lastLog(chosenKey, sets, sessions, session.id, match)
  const prevNos = [...new Set(prev?.sets.map((s) => s.set_no))]
  const refNo = prevNos[Math.min(done, prevNos.length - 1)]
  const refSet = prev ? (prev.sets.find((s) => s.set_no === refNo && s.side === side) ?? prev.sets.find((s) => s.set_no === refNo)) : undefined
  const reference = refSet ? { weight_kg: refSet.weight_kg, reps: refSet.reps, label: `Satz ${prevNos.indexOf(refNo) + 1}` } : null

  // Erster Satz der Uebung in dieser Einheit: den gleichen Satz vom letzten Mal vorbelegen (sonst den letzten Satz heute).
  const startedHere = sessionSets.some((x) => x.exercise_key === chosenKey && !x.is_warmup)
  if (!editSet && !right && !startedHere && reference) initial = { weight_kg: reference.weight_kg, reps: reference.reps }

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

  return (
    <>
      {header}

      <Card className="space-y-3">
        <div>
          <h2 className="text-xl leading-tight">{ex.name}</h2>
          <p className="text-base">
            {ex.equipment} · {ex.attachment}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="num text-3xl leading-none">
            {item.rep_min}–{item.rep_max}
            <span className="ml-1 text-base font-semibold">{repsUnit(ex)}</span>
          </p>
          <SetProgress done={done} total={total} />
        </div>
        {(done >= total || uni) && (
          <p className="text-base">
            {done >= total && (
              <span className="inline-flex items-center gap-2 text-lg">
                <Check className="size-6" /> Übung fertig
              </span>
            )}
            {uni && <span className="block">Einseitig: erst links, dann rechts speichern.</span>}
          </p>
        )}
        {rampUp && (
          <p className="flex items-center gap-2 border-[3px] border-ink bg-baby px-3 py-2 text-base">
            <Flame className="size-5 shrink-0" /> Wiedereinstieg: ein Satz weniger. Nicht bis Versagen.
          </p>
        )}
        <div className="flex gap-2">
          {[
            { id: 'cue', text: 'Hinweis' },
            ...(keys.length > 1 ? [{ id: 'alt', text: 'Alternative' }] : []),
          ].map((b) => {
            const open = panel === `${idx}:${b.id}`
            return (
              <button
                key={b.id}
                type="button"
                aria-expanded={open}
                onClick={() => setPanel(open ? null : `${idx}:${b.id}`)}
                className={`flex min-h-12 flex-1 items-center justify-center gap-1 border-[3px] border-ink font-display text-base uppercase tracking-wide ${
                  open ? 'bg-baby' : 'bg-card'
                }`}
              >
                {b.text}
                <Chevron dir={open ? 'down' : 'right'} className="size-4" />
              </button>
            )
          })}
        </div>
        {panel === `${idx}:cue` && <p className="text-lg">{ex.cue}</p>}
        {panel === `${idx}:alt` && (
          <div className="flex flex-col gap-2">
            <p className="text-base">Belegt? Alternative wählen:</p>
            {keys.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={k === chosenKey}
                onClick={() => update({ ...pos, chosen: { ...pos.chosen, [idx]: k } })}
                className={`min-h-14 border-[3px] border-ink px-3 text-left text-lg ${
                  k === chosenKey ? 'bg-neon' : 'bg-card'
                }`}
              >
                {plan.exercises[k].name}
              </button>
            ))}
          </div>
        )}
      </Card>

      <LastTime key={chosenKey} log={prev} current={done} />

      {pos.restEndsAt !== undefined && (
        <RestTimer
          endsAt={pos.restEndsAt}
          onAdjust={(d) => update({ ...pos, restEndsAt: pos.restEndsAt! + d })}
          onSkip={() => update({ ...pos, restEndsAt: undefined })}
        />
      )}

      {done >= total && !editSet && (
        <Button variant="primary" onClick={() => go(idx + 1)}>
          {idx === n - 1 ? 'Abschluss' : 'Nächste Übung'}
        </Button>
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
          timed={isTimed(plan.exercises[editSet.exercise_key])}
          bodyweight={Boolean(plan.exercises[editSet.exercise_key].bodyweight)}
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
          reference={reference}
          stepKg={stepKg}
          onStepKg={setStepKg}
          rampUp={rampUp}
          weightUnit={weightUnit(ex)}
          timed={isTimed(ex)}
          bodyweight={Boolean(ex.bodyweight)}
          saveLabel={uni ? `${side === 'left' ? 'Links' : 'Rechts'} speichern` : 'Satz speichern'}
          busy={busy}
          onSave={(v) => void saveSet(v)}
        />
      )}

      {lastSet && !editSet && (
        <Card className="space-y-2 py-3">
          <p className="num text-lg">
            Letzter Satz:{' '}
            {isTimed(plan.exercises[lastSet.exercise_key])
              ? `${lastSet.reps} s`
              : `${kg(lastSet.weight_kg)} kg × ${lastSet.reps}`}
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

      <Button onClick={() => void endSession()}>Einheit beenden</Button>
    </>
  )
}
