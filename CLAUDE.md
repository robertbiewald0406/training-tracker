# Training Tracker

## Prinzipien
- Offline-first: Satz sofort lokal speichern (IndexedDB), danach Upsert zu Supabase.
- Lokale Einträge erst nach Bestätigung durch Supabase löschen. Nie Daten verwerfen.
- Lokal löschen = Tombstone (`_deleted`, bleibt pending). Der Datensatz wird erst nach bestätigtem DELETE in
  Supabase entfernt. Alle Lesezugriffe, Export und Pull (`applyRemote`) respektieren Tombstones.
- Pull-Abgleich (lokal synchronisierte Zeilen entfernen, die remote fehlen) nur mit gültiger Sitzung (nicht
  abgelaufen, bei Bedarf erneuert) und nur nach vollständigem Pull einer Tabelle. Schutzbremse (Konstanten in
  src/lib/pull.ts): Entfernen von > BRAKE_MIN_ROWS Zeilen und > BRAKE_MAX_FRACTION der lokal synchronisierten,
  oder 0 Zeilen vom Server bei vorhandenen lokalen Zeilen, hält an und braucht Bestätigung. pending und
  Tombstones werden nie entfernt.
- IndexedDB-Upgrades sind rein additiv (aktuell Version 2, Store `meta` nur lokal, nie synchronisiert).
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
- Wiedereinstieg: ramp_up in plan.json. `weeks` > 0: so viele Wochen ab der ersten Session ein Satz weniger
  je Übung (mind. `min_sets`), dazu der Hinweis "Nicht bis Versagen empfohlen". `weeks` = 0: aus, immer die
  volle Satzzahl, der Hinweis erscheint nirgends. Aktuell 0.

## Datenregeln
- weight_kg = Zusatz- bzw. Maschinengewicht. Kurzhanteln: Gewicht pro Hand.
  Plate-Loaded: Platten pro Seite in kg, Stack: Stackgewicht.
- Einseitige Übungen (Kabel-Seitheben, Iso Row): je Seite ein Satz, side = left/right. Sonst 'both'.
- Aufwärmsätze: is_warmup = true. Dashboard zählt nur is_warmup = false.
- Kein RIR im UI. `rir` bleibt optional in der DB. Ein Schalter 'Bis Versagen' speichert rir = 0, sonst null.
  Dashboard später ohne RIR-Kennzahl.

## UX-Regeln Logger
- Ein Satz = max. 2 Taps. Werte der letzten Einheit vorbelegt.
- Pausentimer (rest_sec aus plan.json), Screen Wake Lock, große Touch-Ziele.
- Mobile first, PWA mit Service Worker, offline lauffähig.
- Einstellungen: JSON-Export und -Import, Logout, Sync-Status.

## Dashboard
Harte Sätze pro Muskel und Woche (primary_muscle), geschätztes 1RM (Epley) als Trend,
Volumen-Load pro Übung, Körpergewicht als 7-Tage-Mittel, PRs.

## Backup
- Einstellungen: "Backup exportieren" (JSON mit Formatversion, Zeitstempel, session/workout_set/bodyweight; ohne
  Tombstones, meta, Tokens; Teilen-Menü, Fallback Download) und "Backup importieren" (prüft die ganze Datei,
  Vorschau und Rückfrage, fügt nur hinzu, überschreibt nie vorhandene Ids oder pending, neue Zeilen sind pending).
  Hinweis, wenn der letzte Export älter als 30 Tage ist (`meta`: backup:lastExport).

## PWA
- vite-plugin-pwa (Service Worker nur im Build). Vorab gespeichert: alle App-Dateien, Schriften, Icons, Manifest.
  Manifest: "Lift Heavy", standalone, start_url/scope = Vite `base` (/training-tracker/), Theme-Farbe Pink.
- Neue Version: wird im Hintergrund geladen, aktiviert sich beim nächsten App-Start; Hinweis "Neue Version" mit
  Button "Aktualisieren" (kein Neuladen mitten im Training). `navigator.storage.persist()` wird angefragt,
  das Ergebnis nie vorausgesetzt (Backup bleibt der Schutz).
- Icons: `npm run icons` (scripts/make-icons.mjs, SVG -> PNG). Quelle der Wahrheit ist das Skript.
- Offline-Start: Der App-Start wartet nie auf das Netz. Ist ohne Netz der Token abgelaufen, bleibt die
  gespeicherte Sitzung gültig (Daten sind lokal); Synchronisieren braucht eine gültige Sitzung. Offline wird
  nicht synchronisiert und ist kein Fehler.

## Deploy
- GitHub Pages über .github/workflows/deploy.yml (Push auf main: Tests, Build, Veröffentlichung).
  VITE_SUPABASE_URL und VITE_SUPABASE_PUBLISHABLE_KEY kommen aus GitHub-Variablen (Settings > Secrets and
  variables > Actions > Variables), nie aus dem Repo. Der Workflow bricht ab, wenn sie fehlen, wenn der Key ein
  Secret/service_role-Key ist, oder wenn ein Secret oder Dev-Text im Build steht.
- Vite `base` = Repo-Name (/training-tracker/). Wird das Repo umbenannt, `BASE` in vite.config.ts anpassen.

## Zitate
- src/data/quotes.json (100 Einträge: text, author, source, verified). verified = "belegt" (Autor und Quelle),
  "zugeschrieben" (Autor und Etikett), "original" (nur Wortmarke "Lift Heavy", nie Personennamen).
- Beim Tap auf "Einheit starten" (Session wird sofort angelegt) erscheint vor der ersten Übung eine
  Vollbild-Karte mit Button "Los". Auswahl zufällig, keines der letzten 30 gezeigten (Liste in meta,
  nie synchronisiert). Bei Wiederaufnahme einer laufenden Einheit kein Zitat. Leere oder defekte Liste
  fällt auf einen neutralen Text zurück, nie auf einen Absturz.

## Design
App-Name: "Lift Heavy". Miami Vice, 80er/90er, hell, kräftig, mit Bodybuilding-Symbolik (Babyblau und Pink,
Sonnenuntergang, Palmen, Hanteln). Kein Dark Mode (`color-scheme: light`).
- Farben als Tailwind-Tokens (src/index.css, @theme): Himmel-Verlauf #BDE8FA (oben) nach #FFD1E8 (unten)
  als Seitenhintergrund, Karte #FFF9FD, Text/Kontur/Schatten Indigo #2B1B4D, Pink #E91E8C, Türkis #00B7C3,
  Babyblau #8FD8F5, Sonnengelb #FFD23F, Erfolg #14A37F, Fehler #D7263D, Neon-Pink #FF5CB8.
  Gelb nur in der Sonne (Grafik), nie als Schriftfarbe und nicht für Buttons oder Etiketten. Rot (Fehler) nur
  für echte Fehlermeldungen, nie als Buttonfarbe. Neon-Pink nur als Fläche oder Kontur.
- Kontrast: normaler Text mind. 4,5:1, sehr großer fetter Text mind. 3:1. Erlaubte Textpaare: Indigo auf
  Karte/Himmel/Neon/Türkis/Babyblau/Gelb/Erfolg, Weiß auf Fehler. Nicht für Text: Weiß/Karte auf Pink, Erfolg
  oder Türkis, Indigo auf Fehler-Rot, Pink als Schrift (außer der große "Heavy"-Wortmarke).
- Schrift (@fontsource, nur woff2, nur Latin, nur benutzte Schnitte, keine externen Server): Righteous für
  Überschriften und Buttons, Yellowtail nur für das Wort "Heavy", Barlow Semi Condensed 600/700 für Text und
  alle Zahlen (Gewicht, Wiederholungen, Timer; Klasse `num`, tabellarische Ziffern).
- Form: 3 px Konturen in Indigo, harte Schlagschatten (4 px Versatz, keine Unschärfe) in Indigo, Buttons
  mind. 56 px hoch, gedrückt verschiebt sich der Button um 4 px. Verläufe nur für Himmel-Hintergrund und Sonne.
- Marke: Wortmarke "LIFT" (Righteous, Indigo, pinker Schlagschatten) mit "Heavy" (Yellowtail, Pink, 2 px
  Indigo-Kontur) darunter. Auf Login und in der Kopfzeile. Browser-Titel "Lift Heavy".
- Symbole: eigene einfarbige Inline-SVGs in src/ui/icons.tsx (keine Emojis, Bilder oder Icon-Bibliothek).
  Hantel = Sync-Symbol (dreht sich beim Sync), Scheibe = Satzfortschritt, Stoppuhr = Pausentimer,
  Flamme = "Bis Versagen", Pokal = neuer Rekord, Hantel-Trennlinie, Tagessymbole in `DAY_ICONS`.
- Bodybuilding-Szenerie (Venice-Beach-Vibes): Strandszene mit Sonne, Wellen und Palmen am unteren Rand
  (`Scene`), Motto-Banner mit Sternen und Langhanteln (`Ribbon`), Dreistreifen-Band unter der Kopfzeile,
  große Gerätesymbole an den Seiten auf breiten Bildschirmen. Alles rein dekorativ (`aria-hidden`).
- Regel: Gewicht, Wiederholungen und Timer stehen immer auf ruhigem, einfarbigem Kartengrund. Dekoration nur
  in Kopfbereich, an Rändern und auf leeren Flächen, nie hinter Zahlen.
- UI-Bausteine liegen in src/ui/; keine losen Farbwerte in Komponenten.
