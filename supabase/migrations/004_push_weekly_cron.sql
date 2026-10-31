-- Stufe 4b: Sonntag 18:00 Uhr (Europe/Berlin) die Edge Function "weekly-push" aufrufen.
-- Erst ausfuehren, wenn 003 gelaufen ist, die Edge Function deployt ist und die beiden Vault-Eintraege existieren
-- (siehe docs/push-einrichtung.md). Mehrfaches Ausfuehren ist unschaedlich.
-- Hier steht kein Geheimnis: URL und Passwort der Funktion liegen im Supabase Vault.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- pg_cron rechnet in UTC. Der Job laeuft Sonntag um 16:00 und 17:00 UTC; die Funktion sendet nur, wenn es in Berlin
-- gerade Sonntag 18 Uhr ist (Sommerzeit 16 UTC, Winterzeit 17 UTC), sonst tut sie nichts.
create or replace function send_weekly_report_push()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local timestamp := now() at time zone 'Europe/Berlin';
  v_url text;
  v_secret text;
begin
  if extract(dow from v_local) <> 0 or extract(hour from v_local) <> 18 then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'weekly_push_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'weekly_push_secret';
  if v_url is null or v_secret is null then
    raise warning 'weekly push: Vault-Eintraege weekly_push_url und weekly_push_secret fehlen';
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function send_weekly_report_push() from public, anon, authenticated;

select cron.schedule('weekly-report-push', '0 16,17 * * 0', 'select public.send_weekly_report_push()');
