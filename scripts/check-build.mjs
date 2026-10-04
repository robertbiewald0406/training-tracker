// Prueft den Produktions-Build (dist): kein geheimer Schluessel, keine Dev-Texte.
// Aufruf: node scripts/check-build.mjs   (laeuft auch im GitHub-Workflow)
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Das reine Wort "service_role" oder das Praefix "sb_secret_" steht legitim in Bibliothekscode (z. B. supabase-js
// prueft Praefixe). Deshalb wird nach echten Schluesseln gesucht, nicht nach Woertern.
const SECRET_KEY = /sb_secret_[A-Za-z0-9_-]{16,}/
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g
const DEV_TEXT = [/Lokale Daten löschen/, /TESTDATEN/]

export function scanText(text) {
  const problems = []
  if (SECRET_KEY.test(text)) problems.push('geheimer Schlüssel (sb_secret_…)')
  for (const m of text.matchAll(JWT)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
      if (payload?.role === 'service_role') problems.push('JWT mit Rolle service_role')
    } catch {
      /* kein JWT, nur ein langer Text */
    }
  }
  for (const re of DEV_TEXT) if (re.test(text)) problems.push(`Dev-Text (${re.source})`)
  return problems
}

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else yield p
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? 'dist'
  let bad = 0
  let files = 0
  for await (const f of walk(dir)) {
    if (/\.(woff2?|png|ico|jpe?g|webp)$/.test(f)) continue
    files++
    const problems = scanText(await readFile(f, 'utf8'))
    for (const p of problems) {
      console.error(`FEHLER ${f}: ${p}`)
      bad++
    }
  }
  if (!files) {
    console.error(`Keine Dateien in ${dir} gefunden. Zuerst bauen.`)
    process.exit(2)
  }
  if (bad) process.exit(1)
  console.log(`Build-Prüfung ok (${files} Dateien: kein geheimer Schlüssel, keine Dev-Texte).`)
}
