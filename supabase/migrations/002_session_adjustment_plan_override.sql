-- Stufe 2: Anpassungen in der Einheit (ausgelassen, getauscht, Reihenfolge) und dauerhafte Plan-Anpassungen.
-- Im Supabase SQL Editor des privaten Projekts dieser App ausfuehren. Mehrfaches Ausfuehren ist unschaedlich.
-- Eine Tabelle session_skip gab es nicht, deshalb wird session_adjustment neu angelegt.

create table if not exists session_adjustment (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id),
  session_id uuid not null references session(id) on delete cascade,
  typ text not null check (typ in ('auslassen', 'tauschen', 'reihenfolge')),
  original_key text not null,
  neuer_key text,
  position int check (position is null or position >= 0),
  grund text check (grund is null or grund in ('schmerz', 'geraet_belegt', 'zeit', 'anderes')),
  note text check (note is null or char_length(note) <= 200),
  dauerhaft boolean not null default false,
  logged_at timestamptz not null,
  check (typ <> 'tauschen' or neuer_key is not null),
  check (typ <> 'reihenfolge' or position is not null)
);

-- Dauerhafte Anpassung des Plans (plan.json bleibt unveraendert, die App legt sie darueber).
-- exercise_key = Uebung, auf die sich die Anpassung bezieht; position = Zielposition (Reihenfolge).
create table if not exists plan_override (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id),
  day_key text not null,
  typ text not null check (typ in ('auslassen', 'tauschen', 'reihenfolge')),
  exercise_key text not null,
  neuer_key text,
  position int check (position is null or position >= 0),
  created_at timestamptz not null,
  check (typ <> 'tauschen' or neuer_key is not null),
  check (typ <> 'reihenfolge' or position is not null)
);

create index if not exists session_adjustment_session_idx on session_adjustment (session_id);
create index if not exists session_adjustment_user_idx on session_adjustment (user_id, logged_at);
create index if not exists plan_override_user_idx on plan_override (user_id, day_key, created_at);

alter table session_adjustment enable row level security;
alter table plan_override enable row level security;

drop policy if exists own_rows on session_adjustment;
create policy own_rows on session_adjustment for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists own_rows on plan_override;
create policy own_rows on plan_override for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Nur angemeldete Nutzer, nie anon.
revoke all on session_adjustment, plan_override from anon;
grant select, insert, update, delete
  on session_adjustment, plan_override
  to authenticated;
