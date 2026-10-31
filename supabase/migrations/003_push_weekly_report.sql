-- Stufe 4a: Push-Abos und der Wochenbericht als Datenbankfunktion.
-- Im Supabase SQL Editor des privaten Projekts dieser App ausfuehren (nach 002). Mehrfaches Ausfuehren ist unschaedlich.

-- Ein Eintrag je Geraet, das Push-Nachrichten bekommen will (Endpoint und Schluessel liefert der Browser).
-- Der Schalter in den Einstellungen legt den Eintrag an bzw. loescht ihn. Wird nicht mit der App synchronisiert.
create table if not exists push_subscription (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_week_sent date -- Montag der Woche, fuer die zuletzt gesendet wurde (verhindert Doppelversand)
);

create index if not exists push_subscription_user_idx on push_subscription (user_id);

alter table push_subscription enable row level security;

drop policy if exists own_rows on push_subscription;
create policy own_rows on push_subscription for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on push_subscription from anon;
grant select, insert, update, delete on push_subscription to authenticated;

-- Wochenbericht (Kurzfassung) fuer eine Woche Montag bis Sonntag in Europe/Berlin.
-- Gleiche Regeln wie src/lib/report.ts: geschaetztes 1RM nach Epley aus Arbeitssaetzen bis 10 Wdh. ohne Aufwaermen,
-- Vergleich mit dem Schnitt der besten Wochenwerte der 4 Vorwochen (mind. 2 mit Daten), unter 3 % = stabil.
-- Ohne Plan-Daten (der Plan liegt nur in plan.json), daher keine Muskelgruppen und keine Uebungsnamen.
-- p_week_start leer = aktuelle Woche in Berlin. Aufruf nur mit dem service_role-Schluessel der Edge Function.
create or replace function weekly_report(p_user uuid, p_week_start date default null)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_start date := date_trunc('week', coalesce(p_week_start, (now() at time zone 'Europe/Berlin')::date)::timestamp)::date;
  v_from timestamptz;
  v_to timestamptz;
  v_days int;
  v_sessions int;
  v_better int := 0;
  v_stable int := 0;
  v_below int := 0;
  v_fresh int := 0;
  v_records int := 0;
  v_skipped int := 0;
  v_swapped int := 0;
  v_reason text;
  v_bw numeric;
  v_bw_prev numeric;
begin
  v_from := v_start::timestamp at time zone 'Europe/Berlin';
  v_to := (v_start + 7)::timestamp at time zone 'Europe/Berlin';

  -- Trainingstage: Berliner Kalendertage mit einer Einheit, die Arbeitssaetze hat.
  select count(distinct (s.started_at at time zone 'Europe/Berlin')::date), count(distinct s.id)
    into v_days, v_sessions
    from session s
    join workout_set w on w.session_id = s.id and w.user_id = p_user and not w.is_warmup
   where s.user_id = p_user and s.started_at >= v_from and s.started_at < v_to;

  -- Fortschritt und Rekorde je Uebung. wk: 0 = Berichtswoche, -1 = Vorwoche, ...
  with cand as (
    select w.exercise_key,
           floor(((s.started_at at time zone 'Europe/Berlin')::date - v_start) / 7.0)::int as wk,
           case when w.reps = 1 then w.weight_kg else w.weight_kg * (1 + w.reps / 30.0) end as e1
      from workout_set w
      join session s on s.id = w.session_id
     where w.user_id = p_user and s.user_id = p_user
       and not w.is_warmup and w.reps <= 10 and w.weight_kg > 0
       and s.started_at < v_to
  ),
  best as (
    select exercise_key, wk, max(e1) as e1 from cand group by exercise_key, wk
  ),
  cur as (select exercise_key, e1 from best where wk = 0),
  base as (
    select exercise_key, avg(e1) as avg_e1, count(*) as n
      from best where wk between -4 and -1 group by exercise_key
  ),
  hist as (select exercise_key, max(e1) as max_e1 from best where wk < 0 group by exercise_key),
  cls as (
    select c.exercise_key,
           case
             when b.n is null or b.n < 2 then 'fresh'
             when (c.e1 - b.avg_e1) / b.avg_e1 >= 0.03 - 1e-9 then 'better'
             when (c.e1 - b.avg_e1) / b.avg_e1 <= -0.03 + 1e-9 then 'below'
             else 'stable'
           end as status,
           (h.max_e1 is not null and c.e1 > h.max_e1 + 1e-9) as is_record
      from cur c
      left join base b using (exercise_key)
      left join hist h using (exercise_key)
  )
  select count(*) filter (where status = 'better'),
         count(*) filter (where status = 'stable'),
         count(*) filter (where status = 'below'),
         count(*) filter (where status = 'fresh'),
         count(*) filter (where is_record)
    into v_better, v_stable, v_below, v_fresh, v_records
    from cls;

  -- Ausgelassen und getauscht (Verschieben zaehlt nicht), haeufigster Grund (bei Gleichstand der frueheste).
  select count(*) filter (where a.typ = 'auslassen'), count(*) filter (where a.typ = 'tauschen')
    into v_skipped, v_swapped
    from session_adjustment a
    join session s on s.id = a.session_id
   where a.user_id = p_user and s.user_id = p_user
     and a.typ in ('auslassen', 'tauschen')
     and s.started_at >= v_from and s.started_at < v_to;

  select a.grund into v_reason
    from session_adjustment a
    join session s on s.id = a.session_id
   where a.user_id = p_user and s.user_id = p_user
     and a.typ in ('auslassen', 'tauschen') and a.grund is not null
     and s.started_at >= v_from and s.started_at < v_to
   group by a.grund
   order by count(*) desc, min(a.logged_at)
   limit 1;

  -- Koerpergewicht: Mittel der Messungen der 7 Tage bis Sonntag, und eine Woche frueher.
  select avg(weight_kg) into v_bw from bodyweight
   where user_id = p_user and measured_on > v_start + 6 - 7 and measured_on <= v_start + 6;
  select avg(weight_kg) into v_bw_prev from bodyweight
   where user_id = p_user and measured_on > v_start - 1 - 7 and measured_on <= v_start - 1;

  return jsonb_build_object(
    'week_start', v_start,
    'week_end', v_start + 6,
    'training_days', v_days,
    'sessions', v_sessions,
    'better', v_better,
    'stable', v_stable,
    'below', v_below,
    'fresh', v_fresh,
    'records', v_records,
    'skipped', v_skipped,
    'swapped', v_swapped,
    'top_reason', v_reason,
    'bodyweight_avg', v_bw,
    'bodyweight_prev_avg', v_bw_prev
  );
end;
$$;

-- Nur die Edge Function (service_role) darf den Bericht abrufen, nie ein angemeldeter Nutzer ueber die API und nie anon.
revoke all on function weekly_report(uuid, date) from public, anon, authenticated;
grant execute on function weekly_report(uuid, date) to service_role;
