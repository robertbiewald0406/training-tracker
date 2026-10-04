import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  exportBackup,
  getLastExport,
  inspectBackupText,
  isBackupStale,
  runImport,
  BACKUP_STALE_DAYS,
  type ImportPreview,
} from '../lib/backup'
import type { BackupRows } from '../lib/db'
import { getSettings, subscribeSettings, updateSettings } from '../lib/settings'
import { canVibrate } from '../lib/signal'
import { supabase } from '../lib/supabase'
import { refreshPending, syncNow } from '../lib/sync'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Toggle } from '../ui/Toggle'

interface Pending {
  rows: BackupRows
  preview: ImportPreview
  exportedAt: string | null
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

export function SettingsCard() {
  const [last, setLast] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [pending, setPending] = useState<Pending | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const settings = useSyncExternalStore(subscribeSettings, getSettings)

  useEffect(() => {
    void getLastExport().then(setLast)
  }, [])

  async function doExport() {
    setBusy(true)
    setInfo(null)
    setErrors([])
    try {
      const r = await exportBackup()
      setLast(await getLastExport())
      if (r.how === 'shared') setInfo('Backup geteilt.')
      else if (r.how === 'downloaded') setInfo(`Datei ${r.fileName} wurde geladen.`)
    } catch (e) {
      setErrors([`Export fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`])
    } finally {
      setBusy(false)
    }
  }

  async function onFile(file: File | undefined) {
    setInfo(null)
    setErrors([])
    setPending(null)
    if (!file) return
    setBusy(true)
    try {
      const r = await inspectBackupText(await file.text())
      if (!r.ok) setErrors(['Die Datei ist ungültig, es wurde nichts importiert.', ...r.errors.slice(0, 8)])
      else setPending({ rows: r.rows, preview: r.preview, exportedAt: r.exportedAt })
    } catch (e) {
      setErrors([`Datei konnte nicht gelesen werden: ${e instanceof Error ? e.message : String(e)}`])
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function confirmImport() {
    if (!pending) return
    setBusy(true)
    try {
      const a = await runImport(pending.rows)
      setPending(null)
      setInfo(
        `Importiert: ${a.session} ${a.session === 1 ? 'Einheit' : 'Einheiten'}, ${a.workout_set} ` +
          `${a.workout_set === 1 ? 'Satz' : 'Sätze'}, ${a.bodyweight} ` +
          `${a.bodyweight === 1 ? 'Körpergewicht' : 'Körpergewichte'}. ` +
          'Die Daten werden jetzt mit Supabase synchronisiert.',
      )
      await refreshPending()
      void syncNow(supabase)
    } catch (e) {
      setErrors([`Import fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`])
    } finally {
      setBusy(false)
    }
  }

  const p = pending?.preview
  return (
    <Card className="space-y-3">
      <h2 className="text-2xl">Einstellungen</h2>
      <h3 className="text-lg">Pausenende</h3>
      <div className="flex">
        <Toggle label="Ton" checked={settings.sound} onChange={(v) => void updateSettings({ sound: v })} />
      </div>
      {canVibrate() && (
        <div className="flex">
          <Toggle
            label="Vibration"
            checked={settings.vibration}
            onChange={(v) => void updateSettings({ vibration: v })}
          />
        </div>
      )}
      <h3 className="text-lg">Backup</h3>
      <p className="text-base">{last ? `Letzter Export: ${fmt(last)}` : 'Noch kein Backup exportiert.'}</p>
      {isBackupStale(last) && (
        <p role="alert" className="border-[3px] border-ink bg-neon px-3 py-2 text-base">
          Dein letzter Export ist älter als {BACKUP_STALE_DAYS} Tage. Bitte ein neues Backup exportieren.
        </p>
      )}
      <Button variant="secondary" disabled={busy} onClick={() => void doExport()}>
        Backup exportieren
      </Button>
      <Button disabled={busy} onClick={() => fileRef.current?.click()}>
        Backup importieren
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {p && (
        <div role="group" aria-label="Import-Vorschau" className="space-y-3 border-[3px] border-ink bg-baby px-3 py-3">
          <p className="text-lg">
            {pending?.exportedAt ? `Backup vom ${fmt(pending.exportedAt)}: ` : 'Backup: '}
            <strong>
              {p.sessions} {p.sessions === 1 ? 'neue Einheit' : 'neue Einheiten'}, {p.sets}{' '}
              {p.sets === 1 ? 'neuer Satz' : 'neue Sätze'}, {p.bodyweights}{' '}
              {p.bodyweights === 1 ? 'Körpergewicht' : 'Körpergewichte'}
            </strong>
            .
          </p>
          {p.skipped > 0 && <p className="text-base">{p.skipped} Einträge sind schon vorhanden und werden übersprungen.</p>}
          <p className="text-base">Der Import fügt nur hinzu und überschreibt nichts.</p>
          <Button
            variant="primary"
            disabled={busy || p.sessions + p.sets + p.bodyweights === 0}
            onClick={() => void confirmImport()}
          >
            Importieren
          </Button>
          <Button onClick={() => setPending(null)}>Abbrechen</Button>
        </div>
      )}
      {info && <p role="status" className="text-base">{info}</p>}
      {errors.length > 0 && (
        <ul role="alert" className="space-y-1 border-[3px] border-ink bg-err px-3 py-2 text-base text-white">
          {errors.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
    </Card>
  )
}
