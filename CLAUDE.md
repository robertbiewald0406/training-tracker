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
- IndexedDB-Upgrades sind rein additiv (aktuell Version 3, Store `meta` nur lokal, nie synchronisiert).
- Alle IDs sind client-seitige UUIDs (crypto.randomUUID()).
- Neue Tabellen: RLS + Policy user_id = auth.uid() + explizites grant to authenticated, nie an anon.
- Im Frontend nur der Publishable Key (VITE_SUPABASE_PUBLISHABLE_KEY). Secret/service_role Key
  nie im Repo, nie in .env, nie im Code.
- .env nie committen. Nur .env.example (ohne Werte) ist im Repo.

## Stack
Vite + React + TypeScript, Tailwind, supabase-js. Diagramme als schlichte Inline-SVGs (src/ui/charts.tsx), kein Chart-Paket. Keine weiteren Dienste.
Hosting: GitHub Pages über GitHub Actions (Vite `base` auf den Repo-Namen).

## Supabase
- Schema liegt in supabase/schema.sql und ist bereits eingespielt (Tabellen: session, workout_set, bodyweight).
  Spätere Änderungen liegen als Datei in supabase/migrations/ und werden vom Besitzer im SQL Editor ausgeführt
  (002: session_adjustment, plan_override).
- Ein einziger Nutzer (der Besitzer), Login mit E-Mail + Passwort.
- Sign-up in der App nicht anbieten, nur Login.

## Plan
- plan.json im Repo ist die einzige Quelle für Übungen und Tagesplan. Nicht in die DB.
- workout_set.exercise_key verweist auf einen Key in plan.json. Keys nie umbenennen.
- Ist eine Übung belegt, wird unter dem tatsächlich genutzten Key (alternatives) gespeichert.
- Tage: mo_brust, di_ruecken, mi_beine, do_schultern, fr_arme (weekday 1 bis 5).
- Varianten (nur mi_beine, `rotation` mit Labels "Vorne (Quads)" / "Hinten (Hams)"): Items mit `variant` erscheinen nur
  in dieser Variante, Items ohne immer. Variante = A, wenn die Zahl abgeschlossener Einheiten des Tages gerade ist,
  sonst B; auf der Startseite per Umschalter änderbar ("Nächste Woche: B (Hinten)"). Sie steckt ohne DB-Änderung im
  day_key (`mi_beine_a`, `mi_beine_b`). Zuordnung zum Plan-Tag über das Präfix (`planDayForKey`, `dayKeyMatches`,
  `resolveSessionDay` in src/lib/logger.ts). Vorbelegung und "Letztes Mal": gleiche Variante zuerst, sonst die andere.
- Verteilung: kein Bauch im Plan (alle Rumpfübungen mit primary_muscle abs, core, obliques sind stillgelegt, die
  Tage heißen "Brust + Trizeps" und "Arme"). Statistik zählt abs/core/obliques nicht in den Wochensätzen
  (`UNCOUNTED_MUSCLES` in src/lib/stats.ts). Adduktoren, Abduktoren und Waden in beiden Beinvarianten.
- Stillgelegt (`retired`: true, Definition bleibt, damit alte Sätze lesbar sind): hs_chest_press, plank, side_plank,
  cable_pallof_press, hanging_knee_raise, captain_chair_leg_raise, russian_twist, dead_bug, hanging_leg_raise, neg_situp, hs_ab_machine, lying_reverse_crunch. Eine retired-Übung steht nie in einem Tag oder in alternatives einer
  aktiven Übung (Test in plan.test.tsx). Schlüssel nie umbenennen oder löschen.
- Optionales Feld `warning` je Übung (captain_chair_leg_raise, russian_twist, dead_bug): gelber Hinweiskasten (src/ui/Warning.tsx)
  direkt unter dem Hinweis `cue`, nur bei Übungen mit warning.
- Zeitübungen (`unit: "sec"`: plank, side_plank): Sekunden statt Wiederholungen (5-s-Schritte, direkte Eingabe,
  Button "Stoppuhr"). Dauer steht in `reps`, weight_kg ist 0. Kein 1RM/Rekord für Zeitübungen.
- Körpergewicht (`bodyweight`: captain_chair_leg_raise, russian_twist, dead_bug, dazu die stillgelegten plank, side_plank, hanging_knee_raise): Gewicht heißt "Zusatzgewicht (kg)", ohne
  Verlauf mit 0 vorbelegt.
- Einseitig (`unilateral`): cable_lateral_raise, hs_iso_row, cable_pallof_press, side_plank (je Seite ein Satz).
- Wiedereinstieg: ramp_up in plan.json. `weeks` > 0: so viele Wochen ab der ersten Session ein Satz weniger
  je Übung (mind. `min_sets`), dazu der Hinweis "Nicht bis Versagen empfohlen". `weeks` = 0: aus, immer die
  volle Satzzahl, der Hinweis erscheint nirgends. Aktuell 0.

## Anpassungen in der Einheit
- Übungsansicht: Tauschen (Alternativen zuerst, dann Katalog ohne retired und ohne Übungen des Tages), Nach oben,
  Nach unten, Auslassen (src/screens/AdjustPanel.tsx, Logik src/lib/adjust.ts). Je Aktion optional Grund
  (schmerz, geraet_belegt, zeit, anderes) und Kommentar (max. 200 Zeichen), dazu "Nur heute" oder "Dauerhaft im Plan".
- Jede Aktion = Zeile in `session_adjustment` (typ auslassen/tauschen/reihenfolge, original_key, neuer_key, position,
  dauerhaft). "Dauerhaft" legt zusätzlich eine Zeile in `plan_override` (day_key ohne Variante, typ, exercise_key,
  neuer_key, position) an. plan.json bleibt unverändert; `effectiveDay` legt plan_override (nach created_at) und die
  "Nur heute"-Zeilen der Einheit (dauerhaft = false, nach logged_at) über den Tag. Positionen beziehen sich auf die
  Liste der Variante zum Zeitpunkt der Anpassung.
- Die gemerkte Position der laufenden Einheit wird per `remapPosition` über die Übungs-Keys nachgezogen. Sätze einer
  ausgelassenen oder getauschten Übung gehören zu keiner Position mehr (assign = -1), bleiben gespeichert und zählen
  in der Statistik. Fortschritt und Vorbelegung laufen über den tatsächlich genutzten Key.
- Beide Tabellen: offline-first (Stores `session_adjustment`, `plan_override`), Sync-Reihenfolge session,
  session_adjustment, workout_set, bodyweight, plan_override; Pull, Tombstones, Schutzbremse wie bei den anderen.
  Eine fehlende Einheit nimmt ihre synchronisierten Anpassungen mit, pending Anpassungen halten sie als Konflikt.
- Backup: `session_adjustment` und `plan_override` sind optionale Felder (Formatversion bleibt 1, alte Backups
  importierbar, strenge Prüfung wie bei Sätzen).
- Einstellungen (Tab Mehr): "Dauerhafte Anpassungen" mit "Zurücksetzen" je Anpassung (Tombstone auf plan_override).
- Statistik zählt nur tatsächlich gespeicherte Sätze. Die Wochenleiste auf der Startseite markiert Tage mit
  ausgelassenen oder getauschten Übungen (`weekAdjustments` in src/lib/stats.ts) und listet sie mit Grund.

## Datenregeln
- Zweites Segment je Satz (Dropsatz, Aufstocksatz, Backoff-Satz; Schalter im Satz-Editor, öffnet Gewicht und
  Wiederholungen des zweiten Teils, nicht bei Zeitübungen): Ein Satz bleibt eine Zeile in workout_set,
  weight_kg/reps = erstes Segment, das zweite steht in `note` als `seg:<drop|topup|backoff>|<kg>|<wdh>`
  (src/lib/segments.ts, kein Schema-Umbau). Zählt als ein harter Satz; das Volumen enthält beide Segmente,
  1RM/Rekord nur das erste.
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

## Navigation
Untere Tab-Leiste (src/ui/TabBar.tsx): Training (Start bzw. laufende Einheit), Verlauf (Dashboard), Mehr (Sync,
Einstellungen, Backup, Abmelden). Alle Tabs sind mobil gedacht. Das Training bleibt beim Tab-Wechsel eingehängt.
Startseite: Wochenleiste wählt den Tag (Standard heute), darunter die Übungen mit "Zuletzt"-Werten.

## Vergleich mit dem letzten Mal
src/lib/stats.ts (`lastLog`, `compareSets`): Im Training zeigt die Karte "Letztes Mal" die Arbeitssätze der
vorigen Einheit dieser Übung, der nächste Satz ist markiert. Der erste Satz wird mit dem gleichen Satz vom letzten
Mal vorbelegt, ein Hinweis vergleicht live über das geschätzte 1RM (besser / wie / unter letztem Mal).

## Dashboard (Tab Verlauf)
Kennzahlen der Woche (Einheiten, harte Sätze, Volumen; Vergleich mit der Vorwoche bis zum gleichen Zeitpunkt),
harte Sätze pro Muskel und Woche (primary_muscle, Strich = ganze Vorwoche), je Übung geschätztes 1RM (Epley) und
Volumen-Load als Trend mit Zeitraumwahl, letzte Rekorde, Körpergewicht (Eingabe, 7-Tage-Mittel). Alle Zahlen
kommen aus lokalen Daten (offline), nur is_warmup = false zählt, links/rechts eines Satzes zählt einmal.

## Wochenbericht "Deine Woche"
src/lib/report.ts (rein, offline), Karte src/screens/WeekReportCard.tsx auf der Startseite. Woche = Montag bis
Sonntag in Europe/Berlin (`berlinWeekStart`, unabhängig von der Gerätezeit; Einheiten zählen nach started_at).
Sonntags (Berlin) erscheint die Karte offen oben für die laufende Woche, sonst eingeklappt unten für die letzte
volle Woche; über die Pfeile rückwirkend bis zur ersten Einheit.
- Fortschritt: bestes geschätztes 1RM (Epley) der Woche aus Arbeitssätzen bis 10 Wdh. (`E1RM_MAX_REPS`, ohne
  Aufwärmen, Zeitübungen und zweites Segment) gegen den Schnitt der besten Wochenwerte der 4 Vorwochen
  (mind. 2 davon mit Daten, sonst "neu"). Abweichung unter 3 % (`STABLE_PCT`) = "stabil". Es zählt der tatsächlich
  genutzte Key.
- Neue Bestwerte: Wochenbestwert über allem davor (ein früherer Wert muss existieren).
- Sätze pro Muskel: harte Sätze nach primary_muscle gegen `MUSCLE_TARGETS` (Richtwerte, in report.ts änderbar),
  Bauch zählt nicht. Dazu Trainingstage, ausgelassene/getauschte Übungen mit Grund, Körpergewicht (7-Tage-Mittel
  zum Wochenende gegen eine Woche früher). Je Abschnitt ein kurzer sachlicher Satz (`summarize`).

## Push am Sonntag
Einrichtung für den Besitzer: docs/push-einrichtung.md. Nur auf dem iPhone, wenn die App zum Home-Bildschirm hinzugefügt ist.
- Service Worker: src/sw.ts (vite-plugin-pwa `injectManifest`, Vorab-Speicher wie zuvor, dazu Push und Tipp auf die
  Nachricht; Build prüft ihn zusätzlich mit tsconfig.sw.json). Nachrichteninhalt/Ziel: src/lib/pushPayload.ts.
- Schalter: Mehr > "Wochenbericht per Push" (src/screens/PushCard.tsx, src/lib/push.ts). Ein Abo = Zeile in
  `push_subscription` (Migration 003, RLS, nur authenticated), direkt geschrieben, nicht in IndexedDB und nicht
  synchronisiert. Aus = Zeile löschen und Abo beenden. Auf dem iPhone ohne installierte App gibt es eine Erklärung statt Schalter.
- Schlüssel (VAPID): nur der öffentliche (`VITE_VAPID_PUBLIC_KEY`, 87 Zeichen, GitHub-Variable, im Workflow auf Länge
  geprüft) steht im Frontend. Der private Schlüssel und `CRON_SECRET` liegen nur als Supabase-Secrets, der Aufruf-Link
  und das Passwort zusätzlich im Vault. Nie im Repo, nie in .env.
- Bericht serverseitig: DB-Funktion `weekly_report(p_user, p_week_start)` (Migration 003, nur service_role) mit denselben
  Regeln wie src/lib/report.ts (Test src/lib/weeklyReportSql.test.ts führt die Migrationen in PGlite aus und
  vergleicht beide). Ohne Plan-Daten, daher nur Anzahlen. Edge Function supabase/functions/weekly-push (Text in
  message.ts: nur Anzahlen, ohne Namen, Gewichte, Körpergewicht).
- Zeitplan: pg_cron (Migration 004) Sonntag 16 und 17 Uhr UTC, `send_weekly_report_push()` sendet nur bei Berlin
  Sonntag 18 Uhr (Sommer-/Winterzeit). Je Abo und Woche einmal (`last_week_sent`); 404/410 vom Push-Dienst löscht das Abo.

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
- Form: 3 px Konturen in Indigo, Buttons mind. 56 px hoch. Harter Schlagschatten (4 px Versatz, keine Unschärfe)
  nur auf Karten und dem einen Haupt-Button je Ansicht (`primary`, gedrückt 4 px Versatz). Alle anderen Buttons,
  Schalter und Auswahlfelder sind flach (Kontur, kein Schatten); aktiv = Neon-Fläche. Verläufe nur für Himmel-Hintergrund und Sonne.
- Marke: Wortmarke "LIFT" (Righteous, Indigo, pinker Schlagschatten) mit "Heavy" (Yellowtail, Pink, 2 px
  Indigo-Kontur) darunter. Auf Login und in der Kopfzeile. Browser-Titel "Lift Heavy".
- Symbole: eigene einfarbige Inline-SVGs in src/ui/icons.tsx (keine Emojis, Bilder oder Icon-Bibliothek).
  Hantel = Sync-Symbol (dreht sich beim Sync), Scheibe = Satzfortschritt, Stoppuhr = Pausentimer,
  Flamme = "Bis Versagen", Pokal = neuer Rekord, Hantel-Trennlinie, Tagessymbole in `DAY_ICONS`.
- Bodybuilding-Szenerie (Venice-Beach-Vibes): Strandszene mit Sonne, Wellen und Palmen (`Scene`; fest auf Login
  und Zitat, im Seitenfluss am Ende der Startseite, nie hinter der Tab-Leiste), Motto-Banner mit Sternen und Langhanteln (`Ribbon`), Dreistreifen-Band unter der Kopfzeile,
  große Gerätesymbole an den Seiten auf breiten Bildschirmen. Alles rein dekorativ (`aria-hidden`).
- Regel: Gewicht, Wiederholungen und Timer stehen immer auf ruhigem, einfarbigem Kartengrund. Dekoration nur
  in Kopfbereich, an Rändern und auf leeren Flächen, nie hinter Zahlen.
- UI-Bausteine liegen in src/ui/; keine losen Farbwerte in Komponenten.
