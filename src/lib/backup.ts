import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  exportAll,
  existingKeys,
  getAll,
  getMeta,
  importBackupRows,
  setMeta,
  type BackupRows,
} from './db'
import { plan } from './plan'

export { BACKUP_FORMAT, BACKUP_VERSION }
export const LAST_EXPORT_KEY = 'backup:lastExport' // lokaler Store meta, nie synchronisiert
export const BACKUP_STALE_DAYS = 30
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024

const pad = (n: number) => String(n).padStart(2, '0')

/** lift-heavy-backup-2026-10-04.json (lokales Datum). */
export function backupFileName(d: Date = new Date()): string {
  return `lift-heavy-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
}

/** Letzter Export aelter als BACKUP_STALE_DAYS Tage? Nie exportiert zaehlt hier nicht als veraltet. */
export function isBackupStale(lastExportIso: string | undefined, now: Date = new Date()): boolean {
  if (!lastExportIso) return false
  const t = Date.parse(lastExportIso)
  return Number.isFinite(t) && now.getTime() - t > BACKUP_STALE_DAYS * 86_400_000
}

// ---------- Export ----------

export interface ShareEnv {
  canShare?: (data: { files: File[] }) => boolean
  share?: (data: { files: File[]; title?: string }) => Promise<void>
  download: (file: File) => void
}

function browserEnv(): ShareEnv {
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  return {
    canShare: nav?.canShare ? (d) => nav.canShare(d) : undefined,
    share: nav?.share ? (d) => nav.share(d) : undefined,
    download: (file) => {
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    },
  }
}

/**
 * Erzeugt das Backup und gibt es ueber das Teilen-Menue aus (navigator.share mit Datei), sonst als Download.
 * Der Zeitpunkt des letzten Exports wird nur bei Erfolg gespeichert (nicht, wenn das Teilen-Menue abgebrochen wird).
 */
export async function exportBackup(env: ShareEnv = browserEnv(), now: Date = new Date()) {
  const data = await exportAll()
  const file = new File([JSON.stringify(data, null, 2)], backupFileName(now), { type: 'application/json' })
  let how: 'shared' | 'downloaded' | 'cancelled' = 'downloaded'
  if (env.share && env.canShare?.({ files: [file] })) {
    try {
      await env.share({ files: [file], title: 'Lift Heavy Backup' })
      how = 'shared'
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') how = 'cancelled'
      else env.download(file) // Teilen nicht moeglich: Fallback Download
    }
  } else {
    env.download(file)
  }
  if (how !== 'cancelled') await setMeta(LAST_EXPORT_KEY, now.toISOString())
  return { how, fileName: file.name, counts: { session: data.session.length, workout_set: data.workout_set.length, bodyweight: data.bodyweight.length } }
}

export const getLastExport = () => getMeta<string>(LAST_EXPORT_KEY)

// ---------- Import: Pruefung ----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SIDES = ['left', 'right', 'both']

export type ParseResult =
  | { ok: true; rows: BackupRows; exportedAt: string | null }
  | { ok: false; errors: string[] }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isIso = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v))
const isDay = (v: unknown) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const t = Date.parse(`${v}T00:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().startsWith(v) // fängt z. B. 2026-02-31 ab
}
const isInt = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max
const isNum = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const isNullableText = (v: unknown) => v === null || (typeof v === 'string' && v.length <= 2000)

/**
 * Prueft die ganze Datei, bevor irgendetwas geschrieben wird: Formatversion, UUIDs, Pflichtfelder, Wertebereiche
 * und Verweise (Satz -> Einheit in der Datei oder lokal). Ungueltig = nichts wird importiert.
 * Unbekannte Felder (z. B. user_id) werden verworfen.
 */
export function parseBackup(text: string, localSessionIds: Set<string> = new Set()): ParseResult {
  const errors: string[] = []
  const err = (m: string) => errors.length < 30 && errors.push(m)
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, errors: ['Datei ist zu groß (mehr als 20 MB).'] }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['Keine gültige JSON-Datei.'] }
  }
  if (!isObj(raw)) return { ok: false, errors: ['Unerwarteter Inhalt: kein Backup.'] }
  if (raw.format !== BACKUP_FORMAT) return { ok: false, errors: ['Das ist kein Lift-Heavy-Backup.'] }
  if (raw.version !== BACKUP_VERSION)
    return {
      ok: false,
      errors: [
        typeof raw.version === 'number' && raw.version > BACKUP_VERSION
          ? 'Dieses Backup stammt aus einer neueren App-Version. Bitte die App aktualisieren.'
          : 'Unbekannte Formatversion.',
      ],
    }
  for (const k of ['session', 'workout_set', 'bodyweight'] as const)
    if (!Array.isArray(raw[k])) err(`Feld "${k}" fehlt oder ist keine Liste.`)
  if (errors.length) return { ok: false, errors }

  const rows: BackupRows = { session: [], workout_set: [], bodyweight: [] }
  const seen = new Set<string>()
  const checkId = (e: Record<string, unknown>, where: string) => {
    if (typeof e.id !== 'string' || !UUID.test(e.id)) return err(`${where}.id: keine gültige UUID.`), false
    if (seen.has(e.id)) return err(`${where}.id: doppelt in der Datei.`), false
    seen.add(e.id)
    return true
  }

  ;(raw.session as unknown[]).forEach((e, i) => {
    const w = `session[${i}]`
    if (!isObj(e)) return void err(`${w}: kein Objekt.`)
    let ok = checkId(e, w)
    if (typeof e.day_key !== 'string' || !e.day_key || e.day_key.length > 50) ok = (err(`${w}.day_key: fehlt.`), false)
    if (!isIso(e.started_at)) ok = (err(`${w}.started_at: kein gültiger Zeitpunkt.`), false)
    if (e.ended_at !== null && !isIso(e.ended_at)) ok = (err(`${w}.ended_at: kein gültiger Zeitpunkt.`), false)
    if (!isNullableText(e.note ?? null)) ok = (err(`${w}.note: ungültig.`), false)
    if (ok)
      rows.session.push({
        id: e.id as string,
        day_key: e.day_key as string,
        started_at: e.started_at as string,
        ended_at: (e.ended_at as string | null) ?? null,
        note: (e.note as string | null) ?? null,
      })
  })
  const sessionIds = new Set([...localSessionIds, ...rows.session.map((s) => s.id)])

  ;(raw.workout_set as unknown[]).forEach((e, i) => {
    const w = `workout_set[${i}]`
    if (!isObj(e)) return void err(`${w}: kein Objekt.`)
    let ok = checkId(e, w)
    if (typeof e.session_id !== 'string' || !UUID.test(e.session_id)) ok = (err(`${w}.session_id: keine gültige UUID.`), false)
    else if (!sessionIds.has(e.session_id)) ok = (err(`${w}.session_id: verweist auf eine unbekannte Einheit.`), false)
    if (typeof e.exercise_key !== 'string' || !(e.exercise_key in plan.exercises))
      ok = (err(`${w}.exercise_key: unbekannte Übung.`), false)
    if (!isInt(e.set_no, 1, 999)) ok = (err(`${w}.set_no: ganze Zahl 1–999 erwartet.`), false)
    if (!isNum(e.weight_kg, 0, 2000)) ok = (err(`${w}.weight_kg: Zahl 0–2000 erwartet.`), false)
    if (!isInt(e.reps, 1, 1000)) ok = (err(`${w}.reps: ganze Zahl 1–1000 erwartet.`), false)
    if (e.rir !== null && e.rir !== undefined && !isInt(e.rir, 0, 5)) ok = (err(`${w}.rir: leer oder 0–5 erwartet.`), false)
    if (typeof e.is_warmup !== 'boolean') ok = (err(`${w}.is_warmup: true/false erwartet.`), false)
    if (typeof e.side !== 'string' || !SIDES.includes(e.side)) ok = (err(`${w}.side: left, right oder both erwartet.`), false)
    if (!isIso(e.logged_at)) ok = (err(`${w}.logged_at: kein gültiger Zeitpunkt.`), false)
    if (!isNullableText(e.note ?? null)) ok = (err(`${w}.note: ungültig.`), false)
    if (ok)
      rows.workout_set.push({
        id: e.id as string,
        session_id: e.session_id as string,
        exercise_key: e.exercise_key as string,
        set_no: e.set_no as number,
        weight_kg: e.weight_kg as number,
        reps: e.reps as number,
        rir: (e.rir as number | null | undefined) ?? null,
        is_warmup: e.is_warmup as boolean,
        side: e.side as 'left' | 'right' | 'both',
        logged_at: e.logged_at as string,
        note: (e.note as string | null) ?? null,
      })
  })

  const days = new Set<string>()
  ;(raw.bodyweight as unknown[]).forEach((e, i) => {
    const w = `bodyweight[${i}]`
    if (!isObj(e)) return void err(`${w}: kein Objekt.`)
    let ok = checkId(e, w)
    if (!isDay(e.measured_on)) ok = (err(`${w}.measured_on: Datum JJJJ-MM-TT erwartet.`), false)
    else if (days.has(e.measured_on as string)) ok = (err(`${w}.measured_on: Datum doppelt in der Datei.`), false)
    else days.add(e.measured_on as string)
    if (!isNum(e.weight_kg, 20, 500)) ok = (err(`${w}.weight_kg: Zahl 20–500 erwartet.`), false)
    if (ok) rows.bodyweight.push({ id: e.id as string, measured_on: e.measured_on as string, weight_kg: e.weight_kg as number })
  })

  if (errors.length) return { ok: false, errors }
  return { ok: true, rows, exportedAt: typeof raw.exported_at === 'string' ? raw.exported_at : null }
}

// ---------- Import: Vorschau und Ausfuehrung ----------

export interface ImportPreview {
  sessions: number
  sets: number
  bodyweights: number
  skipped: number // bereits vorhanden (gleiche Id oder gleicher Tag), werden nicht angefasst
}

/** Zaehlt, was der Import tatsaechlich hinzufuegen wuerde. Schreibt nichts. */
export async function previewImport(rows: BackupRows): Promise<ImportPreview> {
  const have = await existingKeys()
  const p: ImportPreview = { sessions: 0, sets: 0, bodyweights: 0, skipped: 0 }
  for (const r of rows.session) have.session.has(r.id) ? p.skipped++ : p.sessions++
  for (const r of rows.workout_set) have.workout_set.has(r.id) ? p.skipped++ : p.sets++
  for (const r of rows.bodyweight)
    have.bodyweight.has(r.id) || have.bodyweightDates.has(r.measured_on) ? p.skipped++ : p.bodyweights++
  return p
}

/** Liest die Datei, prueft sie und liefert (ohne zu schreiben) Zeilen und Vorschau, oder die Fehler. */
export async function inspectBackupText(text: string) {
  const local = new Set((await getAll('session')).map((s) => s.id))
  // Auch Einheiten mit Tombstone sind "lokal vorhanden" (existingKeys), Saetze duerfen darauf verweisen.
  const have = await existingKeys()
  const parsed = parseBackup(text, new Set([...local, ...have.session]))
  if (!parsed.ok) return parsed
  return { ...parsed, preview: await previewImport(parsed.rows) }
}

export const runImport = importBackupRows
