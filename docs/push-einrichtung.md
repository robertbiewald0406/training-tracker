# Push am Sonntag einrichten (einmalig)

Ziel: Sonntag um 18 Uhr kommt auf dein iPhone eine kurze Nachricht mit der Zusammenfassung deiner Woche. Tippst du darauf, öffnet sich die App mit der Karte "Deine Woche".

## Was schon da ist
- Die App ist gehostet (GitHub Pages, https), das ist Pflicht für Push.
- Der Wochenbericht wird in der Datenbank berechnet (Funktion `weekly_report`), eine Supabase Edge Function verschickt die Nachricht, `pg_cron` startet sie sonntags.

## Was dafür bei dir nötig ist
- iPhone mit iOS 16.4 oder neuer.
- Die App muss **zum Home-Bildschirm hinzugefügt** sein. Nur dann erlaubt iOS Push. In Safari: Teilen-Symbol, "Zum Home-Bildschirm". Danach die App **von dort** öffnen, nicht in Safari.
- Migration 002 ist bei dir schon gelaufen. Die Schritte unten brauchst du nur einmal.

## Schritt für Schritt

### 1. Schlüsselpaar erzeugen (am Mac, Terminal)
```bash
npx web-push generate-vapid-keys
```
Du bekommst zwei Zeilen: **Public Key** (87 Zeichen) und **Private Key** (43 Zeichen). Der Private Key ist geheim: nicht in die App, nicht ins Repo, nicht in den Chat. Lass das Terminalfenster offen, du brauchst beide Werte gleich.

### 2. Öffentlichen Schlüssel bei GitHub eintragen
GitHub, dein Repo, Settings, Secrets and variables, Actions, Reiter **Variables**, "New repository variable":
- Name: `VITE_VAPID_PUBLIC_KEY`
- Wert: der **Public Key**

### 3. Datenbank vorbereiten
Supabase, dein Projekt, SQL Editor: den ganzen Inhalt von `supabase/migrations/003_push_weekly_report.sql` einfügen, **Run**. Erwartet: "Success. No rows returned".

### 4. Geheimnisse und Funktion in Supabase (Terminal)
Du brauchst die Projekt-ID: in Supabase unter Project Settings, General ("Project ID", z. B. `abcdefghijklmnop`).

Ein zufälliges Passwort für den Aufruf erzeugen und kurz notieren (wird noch einmal gebraucht):
```bash
openssl rand -hex 32
```
Dann, im Projektordner (Werte in `<...>` ersetzen):
```bash
npx supabase login
npx supabase link --project-ref <PROJEKT-ID>
npx supabase secrets set VAPID_PUBLIC_KEY=<PUBLIC KEY> VAPID_PRIVATE_KEY=<PRIVATE KEY> VAPID_SUBJECT=mailto:robert@grothe-biewald.de CRON_SECRET=<ZUFALLS-PASSWORT>
npx supabase functions deploy weekly-push --no-verify-jwt
```
(`--no-verify-jwt` ist richtig: die Funktion prüft stattdessen das Passwort `CRON_SECRET` selbst.)

### 5. Zeitplan einrichten (SQL Editor)
Zuerst die zwei Vault-Einträge (URL und Passwort der Funktion; Werte ersetzen, **dasselbe** Passwort wie in Schritt 4):
```sql
select vault.create_secret('https://<PROJEKT-ID>.supabase.co/functions/v1/weekly-push', 'weekly_push_url');
select vault.create_secret('<ZUFALLS-PASSWORT>', 'weekly_push_secret');
```
Dann den ganzen Inhalt von `supabase/migrations/004_push_weekly_cron.sql` einfügen, **Run**. Falls eine Fehlermeldung zu `pg_cron` oder `pg_net` kommt: in Supabase unter Database, Extensions beide einschalten und 004 noch einmal ausführen.

### 6. App neu veröffentlichen
Damit der öffentliche Schlüssel in der App steckt, muss die App einmal neu gebaut werden (GitHub, Actions, "Deploy auf GitHub Pages", "Run workflow"; oder ein neuer Push auf `main`). Dann die App auf dem iPhone schließen und neu öffnen, bei "Neue Version" auf "Aktualisieren" tippen.

### 7. Auf dem iPhone einschalten
In der App: Tab **Mehr**, Karte **Wochenbericht per Push**, Schalter auf **An**. iOS fragt nach der Erlaubnis für Mitteilungen: **Erlauben**.

### 8. Testen (sofort, ohne bis Sonntag zu warten)
Im Terminal (Werte ersetzen):
```bash
curl -X POST https://<PROJEKT-ID>.supabase.co/functions/v1/weekly-push -H "x-cron-secret: <ZUFALLS-PASSWORT>" -H "Content-Type: application/json" -d '{"force": true}'
```
Antwort `{"sent":1,...}` und kurz darauf die Nachricht auf dem iPhone. `force` sendet auch dann, wenn diese Woche schon gesendet wurde.

## Ausschalten und Aufräumen
- In der App: Schalter auf **Aus** (löscht das Abo).
- Ganz abstellen: SQL Editor: `select cron.unschedule('weekly-report-push');`

## Gut zu wissen
- Gesendet wird nur, wenn es in Berlin Sonntag 18 Uhr ist (Sommer- und Winterzeit werden beachtet). Pro Gerät und Woche höchstens eine Nachricht.
- Die Nachricht enthält nur Anzahlen (Trainingstage, besser/stabil/darunter, Bestwerte, Anpassungen), keine Übungsnamen, Gewichte oder Körpergewicht. Die Details stehen in der App.
- Der Private Key und das Passwort stehen nur in den Supabase-Secrets (und im Vault), nie im Repo oder in der App.
- Neues Gerät oder App neu installiert: Schalter dort noch einmal einschalten.
