import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  BACKUP_STALE_DAYS,
  backupFileName,
  exportBackup,
  getLastExport,
  inspectBackupText,
  isBackupStale,
  parseBackup,
  runImport,
  type ShareEnv,
} from './backup'
import { deleteLocal, exportAll, getAll, getDb, resetDbHandle, saveLocal, setMeta, stripMeta } from './db'

const uid = () => crypto.randomUUID()
const mkSession = (o: any = {}) => ({ id: uid(), day_key: 'mo_brust', started_at: '2026-10-05T10:00:00.000Z', ended_at: '2026-10-05T11:00:00.000Z', note: null, ...o })
const mkSet = (session_id: string, o: any = {}) => ({
  id: uid(), session_id, exercise_key: 'hs_incline_press', set_no: 1, weight_kg: 42.5, reps: 8, rir: null,
  is_warmup: false, side: 'both', logged_at: '2026-10-05T10:05:00.000Z', note: null, ...o,
})
const mkBw = (o: any = {}) => ({ id: uid(), measured_on: '2026-10-05', weight_kg: 80.4, ...o })

async function fill() {
  const s = mkSession()
  const s2 = mkSession({ day_key: 'di_ruecken', started_at: '2026-10-06T10:00:00.000Z', ended_at: null })
  const sets = [mkSet(s.id), mkSet(s.id, { set_no: 2, rir: 0 }), mkSet(s2.id, { exercise_key: 'cable_lateral_raise', side: 'left', is_warmup: true })]
  const bws = [mkBw(), mkBw({ measured_on: '2026-10-06', weight_kg: 80 })]
  for (const x of [s, s2]) await saveLocal('session', x)
  for (const x of sets) await saveLocal('workout_set', x)
  for (const x of bws) await saveLocal('bodyweight', x)
  return { sessions: [s, s2], sets, bws }
}
const dump = async () => ({
  session: (await getAll('session')).map(stripMeta).sort((a, b) => a.id.localeCompare(b.id)),
  workout_set: (await getAll('workout_set')).map(stripMeta).sort((a, b) => a.id.localeCompare(b.id)),
  bodyweight: (await getAll('bodyweight')).map(stripMeta).sort((a, b) => a.id.localeCompare(b.id)),
})
const fresh = async () => {
  await resetDbHandle()
  globalThis.indexedDB = new IDBFactory()
}
const noShare = (): ShareEnv & { downloaded: File[] } => {
  const downloaded: File[] = []
  return { download: (f) => void downloaded.push(f), downloaded }
}

beforeEach(fresh)

describe('Export', () => {
  it('enthaelt Formatversion, Zeitstempel und alle Zeilen; ohne Tombstones, Metadaten, meta und user_id', async () => {
    const d = await fill()
    await setMeta('position:abc', { geheim: 'token' })
    await setMeta('quotes:recent', ['x'])
    await deleteLocal('workout_set', d.sets[1].id) // Tombstone
    const out = await exportAll()
    expect(out.format).toBe('lift-heavy-backup')
    expect(out.version).toBe(1)
    expect(Number.isFinite(Date.parse(out.exported_at))).toBe(true)
    expect(out.session).toHaveLength(2)
    expect(out.workout_set.map((r: any) => r.id).sort()).toEqual([d.sets[0].id, d.sets[2].id].sort())
    expect(out.bodyweight).toHaveLength(2)
    const json = JSON.stringify(out)
    expect(json).not.toMatch(/"_(sync|v|error|deleted)"/)
    expect(json).not.toContain('user_id')
    expect(json).not.toContain('position:abc')
    expect(json).not.toContain('quotes:recent')
    expect(json).not.toContain('token')
  })
})

describe('Export und Import', () => {
  it('Export in leere Datenbank importiert: identische Daten, alles pending', async () => {
    await fill()
    const before = await dump()
    const file = JSON.stringify(await exportAll())

    await fresh()
    const r = await inspectBackupText(file)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.preview).toMatchObject({ sessions: 2, sets: 3, bodyweights: 2, skipped: 0 })
    const added = await runImport(r.rows)
    expect(added).toMatchObject({ session: 2, workout_set: 3, bodyweight: 2, skipped: 0 })

    expect(await dump()).toEqual(before)
    const raw = await (await getDb()).getAll('workout_set')
    expect(raw.every((x) => x._sync === 'pending')).toBe(true) // gehen beim naechsten Sync nach Supabase
  })

  it('doppelter Import erzeugt keine Dopplungen', async () => {
    await fill()
    const file = JSON.stringify(await exportAll())
    await fresh()
    const first = await inspectBackupText(file)
    if (!first.ok) throw new Error('ungueltig')
    await runImport(first.rows)
    const after1 = await dump()

    const second = await inspectBackupText(file)
    if (!second.ok) throw new Error('ungueltig')
    expect(second.preview).toMatchObject({ sessions: 0, sets: 0, bodyweights: 0, skipped: 7 })
    const added = await runImport(second.rows)
    expect(added).toMatchObject({ session: 0, workout_set: 0, bodyweight: 0, skipped: 7 })
    expect(await dump()).toEqual(after1)
  })

  it('ueberschreibt nichts Vorhandenes, insbesondere nichts Pending (auch Tombstones und gleiche Tage bleiben)', async () => {
    const d = await fill()
    const file = JSON.stringify(await exportAll())
    // lokal nachtraeglich geaendert / geloescht
    await saveLocal('workout_set', { ...d.sets[0], weight_kg: 99 }) // pending, anderes Gewicht
    await deleteLocal('workout_set', d.sets[1].id) // Tombstone
    await saveLocal('bodyweight', { ...d.bws[0], weight_kg: 70 })

    const r = await inspectBackupText(file)
    if (!r.ok) throw new Error('ungueltig')
    expect(r.preview).toMatchObject({ sessions: 0, sets: 0, bodyweights: 0 })
    await runImport(r.rows)
    const sets = await getAll('workout_set')
    expect(sets.find((x) => x.id === d.sets[0].id)?.weight_kg).toBe(99)
    expect(sets.find((x) => x.id === d.sets[1].id)).toBeUndefined() // Tombstone nicht wiederbelebt
    expect((await getAll('bodyweight')).find((x) => x.id === d.bws[0].id)?.weight_kg).toBe(70)
  })

  it('Koerpergewicht mit gleichem Tag, aber anderer Id, wird uebersprungen (kein Ueberschreiben)', async () => {
    await saveLocal('bodyweight', mkBw({ weight_kg: 81 }))
    const file = JSON.stringify({ ...(await exportAll()), bodyweight: [mkBw({ weight_kg: 60 })], session: [], workout_set: [] })
    const r = await inspectBackupText(file)
    if (!r.ok) throw new Error('ungueltig')
    expect(r.preview.bodyweights).toBe(0)
    await runImport(r.rows)
    expect((await getAll('bodyweight'))).toHaveLength(1)
    expect((await getAll('bodyweight'))[0].weight_kg).toBe(81)
  })

  it('Saetze duerfen auf lokal vorhandene Einheiten verweisen', async () => {
    const s = mkSession()
    await saveLocal('session', s)
    const file = JSON.stringify({ format: 'lift-heavy-backup', version: 1, session: [], workout_set: [mkSet(s.id)], bodyweight: [] })
    const r = await inspectBackupText(file)
    expect(r.ok).toBe(true)
  })
})

describe('Ungueltige Datei importiert nichts', () => {
  const base = () => ({ format: 'lift-heavy-backup', version: 1, exported_at: '2026-10-05T12:00:00.000Z', session: [] as any[], workout_set: [] as any[], bodyweight: [] as any[] })
  const bad = async (label: string, text: string, expectMsg?: RegExp) => {
    const r = await inspectBackupText(text)
    expect(r.ok, label).toBe(false)
    if (!r.ok && expectMsg) expect(r.errors.join(' | '), label).toMatch(expectMsg)
    for (const st of ['session', 'workout_set', 'bodyweight'] as const) expect(await getAll(st), label).toHaveLength(0)
  }

  it('kein JSON, falsches Format, falsche oder neuere Version, fehlende Listen', async () => {
    await bad('kein JSON', 'das ist kein json', /JSON/)
    await bad('Array', '[]', /kein Backup/)
    await bad('Format', JSON.stringify({ ...base(), format: 'anderes' }), /kein Lift-Heavy-Backup/)
    await bad('Version 2', JSON.stringify({ ...base(), version: 2 }), /neueren/)
    await bad('Version fehlt', JSON.stringify({ ...base(), version: undefined }), /Formatversion/)
    await bad('Liste fehlt', JSON.stringify({ ...base(), workout_set: undefined }), /workout_set/)
  })

  it('ungueltige UUIDs, Pflichtfelder und Wertebereiche', async () => {
    const s = mkSession()
    const cases: [string, any][] = [
      ['UUID Einheit', { session: [{ ...s, id: 'abc' }] }],
      ['day_key fehlt', { session: [{ ...s, day_key: '' }] }],
      ['Zeitpunkt', { session: [{ ...s, started_at: 'gestern' }] }],
      ['Gewicht negativ', { session: [s], workout_set: [mkSet(s.id, { weight_kg: -5 })] }],
      ['Gewicht zu gross', { session: [s], workout_set: [mkSet(s.id, { weight_kg: 5000 })] }],
      ['Wdh 0', { session: [s], workout_set: [mkSet(s.id, { reps: 0 })] }],
      ['Wdh Kommazahl', { session: [s], workout_set: [mkSet(s.id, { reps: 7.5 })] }],
      ['RIR 9', { session: [s], workout_set: [mkSet(s.id, { rir: 9 })] }],
      ['side', { session: [s], workout_set: [mkSet(s.id, { side: 'oben' })] }],
      ['is_warmup', { session: [s], workout_set: [mkSet(s.id, { is_warmup: 'ja' })] }],
      ['unbekannte Uebung', { session: [s], workout_set: [mkSet(s.id, { exercise_key: 'gibt_es_nicht' })] }],
      ['Satz ohne Einheit', { workout_set: [mkSet(uid())] }],
      ['Satz session_id kaputt', { session: [s], workout_set: [mkSet('x')] }],
      ['Koerpergewicht Datum', { bodyweight: [mkBw({ measured_on: '2026-13-45' })] }],
      ['Koerpergewicht Datum 31. Februar', { bodyweight: [mkBw({ measured_on: '2026-02-31' })] }],
      ['Koerpergewicht Wert', { bodyweight: [mkBw({ weight_kg: 5 })] }],
      ['doppelte Id', { session: [s, { ...s }] }],
      ['Datum doppelt', { bodyweight: [mkBw(), mkBw()] }],
    ]
    for (const [label, patch] of cases) await bad(label, JSON.stringify({ ...base(), ...patch }))
  })

  it('eine einzige kaputte Zeile verhindert den gesamten Import (nichts wird teilweise geschrieben)', async () => {
    const s = mkSession()
    const text = JSON.stringify({ ...base(), session: [s], workout_set: [mkSet(s.id), mkSet(s.id, { reps: -1 })] })
    await bad('teilweise', text, /workout_set\[1\]\.reps/)
  })

  it('zu grosse Datei wird abgelehnt', () => {
    const r = parseBackup('x'.repeat(21 * 1024 * 1024))
    expect(r.ok).toBe(false)
  })

  it('unbekannte Felder (z. B. user_id) werden verworfen', () => {
    const s = mkSession()
    const r = parseBackup(JSON.stringify({ ...base(), session: [{ ...s, user_id: 'geheim', extra: 1 }] }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(Object.keys(r.rows.session[0]).sort()).toEqual(['day_key', 'ended_at', 'id', 'note', 'started_at'])
  })
})

describe('Ausgabe und letzter Export', () => {
  const now = new Date(2026, 9, 4, 14, 3)
  it('Dateiname mit Datum', () => {
    expect(backupFileName(now)).toBe('lift-heavy-backup-2026-10-04.json')
  })
  it('nutzt das Teilen-Menue mit Datei und merkt sich den Zeitpunkt', async () => {
    await fill()
    let shared: File[] = []
    const env: ShareEnv = {
      canShare: () => true,
      share: async (d) => void (shared = d.files),
      download: () => {
        throw new Error('kein Download erwartet')
      },
    }
    const r = await exportBackup(env, now)
    expect(r.how).toBe('shared')
    expect(shared[0].name).toBe('lift-heavy-backup-2026-10-04.json')
    expect(JSON.parse(await shared[0].text()).session).toHaveLength(2)
    expect(await getLastExport()).toBe(now.toISOString())
  })
  it('Fallback Download, wenn Teilen nicht moeglich ist', async () => {
    const env = noShare()
    const r = await exportBackup(env, now)
    expect(r.how).toBe('downloaded')
    expect(env.downloaded[0].name).toBe('lift-heavy-backup-2026-10-04.json')
    expect(await getLastExport()).toBe(now.toISOString())
  })
  it('Fallback Download, wenn das Teilen scheitert; Abbruch im Teilen-Menue speichert nichts', async () => {
    const env = noShare()
    const failing: ShareEnv = { ...env, canShare: () => true, share: async () => { throw new Error('NotAllowedError') } }
    expect((await exportBackup(failing, now)).how).toBe('downloaded')
    await fresh()
    const cancelling: ShareEnv = { ...env, canShare: () => true, share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }) } }
    expect((await exportBackup(cancelling, now)).how).toBe('cancelled')
    expect(await getLastExport()).toBeUndefined()
  })
  it('Hinweis erst nach mehr als 30 Tagen', () => {
    const day = 86_400_000
    expect(BACKUP_STALE_DAYS).toBe(30)
    expect(isBackupStale(undefined, now)).toBe(false)
    expect(isBackupStale(new Date(now.getTime() - 29 * day).toISOString(), now)).toBe(false)
    expect(isBackupStale(new Date(now.getTime() - 31 * day).toISOString(), now)).toBe(true)
    expect(isBackupStale('kaputt', now)).toBe(false)
  })
})
