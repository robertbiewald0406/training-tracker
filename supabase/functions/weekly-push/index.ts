// Supabase Edge Function "weekly-push": sendet jedem eingetragenen Geraet die Kurzfassung des Wochenberichts.
// Aufruf nur durch pg_cron (Migration 004) mit dem Header x-cron-secret, oder von Hand mit curl zum Testen.
// Deploy: npx supabase functions deploy weekly-push --no-verify-jwt   (siehe docs/push-einrichtung.md)
//
// Secrets (npx supabase secrets set ...), nie im Repo:
//   VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT (mailto:...), CRON_SECRET
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase der Funktion automatisch bereit.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { isGone, payloadFor, sameSecret, shouldSend, type WeeklyReport } from './message.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function secret(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`Secret ${name} fehlt`)
  return v
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST erwartet' }, 405)
  let cron: string
  try {
    cron = secret('CRON_SECRET')
  } catch {
    return json({ error: 'nicht eingerichtet' }, 500)
  }
  if (!sameSecret(req.headers.get('x-cron-secret') ?? '', cron)) return json({ error: 'nicht erlaubt' }, 401)

  const body = await req.json().catch(() => ({}))
  const force = body?.force === true // manueller Test: auch senden, wenn diese Woche schon gesendet wurde

  try {
    webpush.setVapidDetails(secret('VAPID_SUBJECT'), secret('VAPID_PUBLIC_KEY'), secret('VAPID_PRIVATE_KEY'))
    const db = createClient(secret('SUPABASE_URL'), secret('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    })
    const { data: subs, error } = await db
      .from('push_subscription')
      .select('id, user_id, endpoint, p256dh, auth, last_week_sent')
    if (error) throw new Error(`Abos laden: ${error.message}`)

    const result = { sent: 0, skipped: 0, removed: 0, failed: 0, errors: [] as string[] }
    // Fehlerursachen nur als Statuscode und kurze Meldung (nie Schluessel); die Antwort sieht nur, wer das Passwort kennt.
    const note = (stage: string, detail: string) => result.errors.length < 5 && result.errors.push(`${stage}: ${detail}`.slice(0, 300))
    const byUser = new Map<string, NonNullable<typeof subs>>()
    for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s])

    for (const [userId, list] of byUser) {
      const { data: report, error: rerr } = await db.rpc('weekly_report', { p_user: userId })
      if (rerr || !report) {
        result.failed += list.length
        note('Bericht', rerr?.message ?? 'leer')
        continue
      }
      const r = report as WeeklyReport
      const payload = JSON.stringify(payloadFor(r))
      for (const s of list) {
        if (!shouldSend(s.last_week_sent, r.week_start, force)) {
          result.skipped++
          continue
        }
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
            TTL: 6 * 3600,
          })
          await db.from('push_subscription').update({ last_week_sent: r.week_start }).eq('id', s.id)
          result.sent++
        } catch (e) {
          if (isGone((e as { statusCode?: number }).statusCode)) {
            await db.from('push_subscription').delete().eq('id', s.id)
            result.removed++
          } else {
            result.failed++
            const err = e as { statusCode?: number; body?: string; message?: string }
            note('Senden', `${err.statusCode ?? ''} ${err.body ?? err.message ?? ''}`.trim())
          }
        }
      }
    }
    return json(result)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Fehler' }, 500)
  }
})
