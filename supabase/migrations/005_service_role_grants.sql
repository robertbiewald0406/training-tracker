-- Stufe 4c: Rechte fuer die Edge Function. Sie laeuft als service_role (umgeht RLS, braucht aber ausdrueckliche
-- Tabellenrechte, wenn Supabase sie nicht automatisch vergibt). Im SQL Editor ausfuehren, nach 003. Mehrfach ausfuehrbar.
-- Behebt: "permission denied for table push_subscription".

-- Abos lesen, nach dem Senden last_week_sent setzen, ungueltige Abos loeschen.
grant select, insert, update, delete on push_subscription to service_role;

-- weekly_report() liest diese Tabellen als service_role. Nur lesen, nie schreiben.
grant select on session, workout_set, bodyweight, session_adjustment to service_role;
