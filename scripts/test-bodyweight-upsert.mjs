// Integrationstest gegen die echte Supabase-Instanz (RLS aktiv, daher mit Login).
// Aufruf: TEST_EMAIL=... TEST_PASSWORD=... node --env-file=.env scripts/test-bodyweight-upsert.mjs
import { createClient } from '@supabase/supabase-js'

const { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key, TEST_EMAIL, TEST_PASSWORD } = process.env
if (!url || !key || !TEST_EMAIL || !TEST_PASSWORD) {
  console.error('Fehlt: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY (.env), TEST_EMAIL, TEST_PASSWORD')
  process.exit(2)
}
const sb = createClient(url, key, { auth: { persistSession: false } })
const DATE = '1999-01-01' // Testdatum, kollidiert nicht mit echten Messungen
const opts = { onConflict: 'user_id,measured_on' }
const fail = (m) => { console.error('FEHLER:', m); process.exit(1) }

const { error: authErr } = await sb.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD })
if (authErr) fail('Login: ' + authErr.message)

const pre = await sb.from('bodyweight').select('id').eq('measured_on', DATE)
if (pre.error) fail(pre.error.message)
if (pre.data.length) fail(`Für ${DATE} existiert schon eine Zeile, Test abgebrochen (nichts verändert).`)

const a = { id: crypto.randomUUID(), measured_on: DATE, weight_kg: 70 }
const b = { id: crypto.randomUUID(), measured_on: DATE, weight_kg: 71.5 }
try {
  const r1 = await sb.from('bodyweight').upsert([a], opts)
  if (r1.error) fail('Upsert 1: ' + r1.error.message)
  const r2 = await sb.from('bodyweight').upsert([b], opts)
  if (r2.error) fail('Upsert 2 (andere id, gleiches Datum): ' + r2.error.message)

  const { data, error } = await sb.from('bodyweight').select('id, weight_kg').eq('measured_on', DATE)
  if (error) fail(error.message)
  console.log('Zeilen für', DATE + ':', data)
  if (data.length !== 1) fail(`Erwartet 1 Zeile, gefunden ${data.length}`)
  if (Number(data[0].weight_kg) !== 71.5) fail('Zeile wurde nicht aktualisiert')
  console.log(`OK: 1 Zeile, aktualisiert auf 71.5, kein Fehler. id = ${data[0].id === b.id ? 'zweite (b)' : 'erste (a)'}`)
} finally {
  const del = await sb.from('bodyweight').delete().eq('measured_on', DATE)
  console.log(del.error ? 'Aufräumen fehlgeschlagen: ' + del.error.message : 'Testzeile gelöscht.')
}
