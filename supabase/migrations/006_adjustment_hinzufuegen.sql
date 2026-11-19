-- Stufe 1 (Uebungsauswahl): neuer Anpassungstyp "hinzufuegen" (Uebung zur Einheit bzw. dauerhaft zum Plan-Tag hinzufuegen).
-- Im Supabase SQL Editor des privaten Projekts ausfuehren (nach 002). Mehrfaches Ausfuehren ist unschaedlich.
-- Bei "hinzufuegen" steht in original_key die hinzugefuegte Uebung und in position die Einfuegeposition in der Tagesliste.
-- Bei plan_override darf day_key fuer "hinzufuegen" auf einem Tag mit Variante auf die Variante zeigen (z. B. mi_beine_b).

alter table session_adjustment drop constraint if exists session_adjustment_typ_check;
alter table session_adjustment
  add constraint session_adjustment_typ_check check (typ in ('auslassen', 'tauschen', 'reihenfolge', 'hinzufuegen'));
alter table session_adjustment drop constraint if exists session_adjustment_hinzufuegen_position;
alter table session_adjustment
  add constraint session_adjustment_hinzufuegen_position check (typ <> 'hinzufuegen' or position is not null);

alter table plan_override drop constraint if exists plan_override_typ_check;
alter table plan_override
  add constraint plan_override_typ_check check (typ in ('auslassen', 'tauschen', 'reihenfolge', 'hinzufuegen'));
alter table plan_override drop constraint if exists plan_override_hinzufuegen_position;
alter table plan_override
  add constraint plan_override_hinzufuegen_position check (typ <> 'hinzufuegen' or position is not null);
