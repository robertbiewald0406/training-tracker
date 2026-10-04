# Training Tracker

## Prinzipien
- Offline-first: Satz sofort lokal speichern (IndexedDB), danach Upsert zu Supabase.
- Lokale Einträge erst nach Bestätigung durch Supabase löschen. Nie Daten verwerfen.
- Alle IDs sind client-seitige UUIDs (crypto.randomUUID()).
- Neue Tabellen: RLS + Policy user_id = auth.uid() + explizites grant to authenticated, nie an anon.
- Im Frontend nur der Publishable Key (VITE_SUPABASE_PUBLISHABLE_KEY). Secret/service_role Key
  nie im Repo, nie in .env, nie im Code.
- .env nie committen. Nur .env.example (ohne Werte) ist im Repo.

## Stack
Vite + React + TypeScript, Tailwind, Recharts, supabase-js. Keine weiteren Dienste.
Hosting: GitHub Pages über GitHub Actions (Vite `base` auf den Repo-Namen).

## Supabase
- Schema liegt in supabase/schema.sql und ist bereits eingespielt (Tabellen: session, workout_set, bodyweight).
- Ein einziger Nutzer (der Besitzer), Login mit E-Mail + Passwort.
- Sign-up in der App nicht anbieten, nur Login.

## Plan
- plan.json im Repo ist die einzige Quelle für Übungen und Tagesplan. Nicht in die DB.
- workout_set.exercise_key verweist auf einen Key in plan.json. Keys nie umbenennen.
- Ist eine Übung belegt, wird unter dem tatsächlich genutzten Key (alternatives) gespeichert.
- Wiedereinstieg: ramp_up in plan.json (erste 2 Wochen ein Satz weniger, mind. 2, Ziel-RIR 3).

## Datenregeln
- weight_kg = Zusatz- bzw. Maschinengewicht. Kurzhanteln: Gewicht pro Hand.
  Plate-Loaded: Platten pro Seite in kg, Stack: Stackgewicht.
- Einseitige Übungen (Kabel-Seitheben, Iso Row): je Seite ein Satz, side = left/right. Sonst 'both'.
- Aufwärmsätze: is_warmup = true. Dashboard zählt nur is_warmup = false.
- rir ist optional, 0-5.

## UX-Regeln Logger
- Ein Satz = max. 2 Taps. Werte der letzten Einheit vorbelegt.
- Pausentimer (rest_sec aus plan.json), Screen Wake Lock, große Touch-Ziele.
- Mobile first, PWA mit Service Worker, offline lauffähig.
- Einstellungen: JSON-Export und -Import, Logout, Sync-Status.

## Dashboard
Harte Sätze pro Muskel und Woche (primary_muscle), geschätztes 1RM (Epley) als Trend,
Volumen-Load pro Übung, durchschnittliche RIR, Körpergewicht als 7-Tage-Mittel, PRs.
