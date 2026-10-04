create table session (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id),
  day_key text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  note text
);

create table workout_set (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id),
  session_id uuid not null references session(id) on delete cascade,
  exercise_key text not null,
  set_no int not null,
  weight_kg numeric(6,2) not null,
  reps int not null,
  rir int,
  is_warmup boolean not null default false,
  side text not null default 'both' check (side in ('left','right','both')),
  logged_at timestamptz not null,
  note text
);

create table bodyweight (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id),
  measured_on date not null,
  weight_kg numeric(5,2) not null,
  unique (user_id, measured_on)
);

create index on workout_set (session_id);
create index on workout_set (user_id, exercise_key, logged_at);

alter table session enable row level security;
alter table workout_set enable row level security;
alter table bodyweight enable row level security;

create policy own_rows on session for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy own_rows on workout_set for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy own_rows on bodyweight for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete
  on session, workout_set, bodyweight
  to authenticated;
