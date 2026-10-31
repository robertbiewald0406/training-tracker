#!/usr/bin/env bash
# Richtet den Push am Sonntag ein (Schritt 1 bis 5 aus docs/push-einrichtung.md) ohne Geheimnisse anzuzeigen.
#   bash scripts/push-setup.sh setup   erzeugt frische Schluessel, setzt die Supabase-Secrets, deployt die Funktion
#   bash scripts/push-setup.sh test    loest den Versand sofort aus (zum Testen)
# Das Skript enthaelt selbst keine Geheimnisse. Der private Schluessel wandert direkt zu Supabase und wird nicht
# angezeigt; das Aufruf-Passwort liegt zusaetzlich in ~/.lift-heavy-push-secret (nur fuer dich lesbar, ausserhalb des Repos).
set -euo pipefail
cd "$(dirname "$0")/.."

REF="${PUSH_PROJECT_REF:-hvhdyzzbwwmfmsnkbknn}"
SUBJECT="${PUSH_SUBJECT:-mailto:robert@grothe-biewald.de}"
SECRET_FILE="$HOME/.lift-heavy-push-secret"
PUBKEY_FILE="$HOME/.lift-heavy-push-public"
URL="https://$REF.supabase.co/functions/v1/weekly-push"

case "${1:-}" in
  setup)
    echo "1/5  Mit Supabase verbinden"
    npx --yes supabase link --project-ref "$REF"

    echo "2/5  Frisches Schluesselpaar erzeugen (wird nicht angezeigt)"
    KEYS="$(npx --yes web-push generate-vapid-keys --json)"
    PUB="$(printf '%s' "$KEYS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).publicKey))')"
    PRIV="$(printf '%s' "$KEYS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).privateKey))')"
    unset KEYS
    [ "${#PUB}" -eq 87 ] && [ "${#PRIV}" -eq 43 ] || { echo "Schluessel haben eine unerwartete Laenge, Abbruch."; exit 1; }
    # Das Aufruf-Passwort bleibt bei einem erneuten Lauf gleich, damit der Vault nicht neu befuellt werden muss.
    if [ -f "$SECRET_FILE" ]; then CRON="$(cat "$SECRET_FILE")"; NEW_CRON=0; else CRON="$(openssl rand -hex 32)"; NEW_CRON=1; fi

    echo "3/5  Secrets in Supabase setzen"
    ENVFILE="$(mktemp)"
    trap 'rm -f "$ENVFILE"' EXIT
    chmod 600 "$ENVFILE"
    {
      echo "VAPID_PUBLIC_KEY=$PUB"
      echo "VAPID_PRIVATE_KEY=$PRIV"
      echo "VAPID_SUBJECT=$SUBJECT"
      echo "CRON_SECRET=$CRON"
    } > "$ENVFILE"
    npx --yes supabase secrets set --env-file "$ENVFILE" --project-ref "$REF"
    rm -f "$ENVFILE"

    echo "4/5  Edge Function deployen"
    npx --yes supabase functions deploy weekly-push --no-verify-jwt --project-ref "$REF"

    echo "5/5  Passwort und oeffentlichen Schluessel lokal merken"
    umask 077
    printf '%s' "$CRON" > "$SECRET_FILE"
    printf '%s' "$PUB" > "$PUBKEY_FILE"
    if [ "$NEW_CRON" -eq 1 ]; then
      SQL="delete from vault.secrets where name in ('weekly_push_url', 'weekly_push_secret');
select vault.create_secret('$URL', 'weekly_push_url');
select vault.create_secret('$CRON', 'weekly_push_secret');"
      printf '%s' "$SQL" | pbcopy
      VAULT_NOTE="B) Supabase > SQL Editor: Cmd+V (die Zwischenablage enthaelt die zwei Vault-Zeilen), Run.
   Danach supabase/migrations/004_push_weekly_cron.sql ausfuehren (003 und 005 muessen vorher gelaufen sein)."
    else
      printf '%s' "$PUB" | pbcopy
      VAULT_NOTE="B) Der Vault ist unveraendert (Passwort blieb gleich), dort ist nichts zu tun. Der oeffentliche Schluessel
   steht jetzt in der Zwischenablage."
    fi
    unset PRIV CRON SQL

    cat <<EOF

Fertig. Jetzt noch:

A) GitHub-Variable VITE_VAPID_PUBLIC_KEY (Settings > Secrets and variables > Actions > Variables) auf genau diesen
   oeffentlichen Schluessel setzen (er ist kein Geheimnis). Bei Bedarf erneut kopieren: bash scripts/push-setup.sh pubkey

$PUB

$VAULT_NOTE

Danach: Actions > Deploy auf GitHub Pages > Run workflow, App auf dem iPhone aktualisieren, den Schalter
"Wochenbericht per Push" aus- und wieder einschalten (neues Abo), dann: bash scripts/push-setup.sh test
EOF
    ;;
  deploy)
    # Funktion erneut deployen (z. B. nach einer Aenderung), ohne neue Schluessel.
    npx --yes supabase functions deploy weekly-push --no-verify-jwt --project-ref "$REF"
    ;;
  pubkey)
    # Legt den oeffentlichen Schluessel (fuer die GitHub-Variable) erneut in die Zwischenablage.
    [ -f "$PUBKEY_FILE" ] || { echo "Zuerst: bash scripts/push-setup.sh setup"; exit 1; }
    pbcopy < "$PUBKEY_FILE"
    echo "Der oeffentliche Schluessel ist in der Zwischenablage ($(wc -c < "$PUBKEY_FILE" | tr -d ' ') Zeichen, richtig sind 87)."
    ;;
  vault-sql)
    # Legt die zwei Vault-Zeilen erneut in die Zwischenablage (Passwort aus der lokalen Datei), ohne neue Schluessel.
    [ -f "$SECRET_FILE" ] || { echo "Zuerst: bash scripts/push-setup.sh setup"; exit 1; }
    printf "delete from vault.secrets where name in ('weekly_push_url', 'weekly_push_secret');
select vault.create_secret('%s', 'weekly_push_url');
select vault.create_secret('%s', 'weekly_push_secret');" "$URL" "$(cat "$SECRET_FILE")" | pbcopy
    echo "Die zwei Vault-Zeilen sind in der Zwischenablage. Jetzt im Supabase SQL Editor mit Cmd+V einfuegen und Run."
    ;;
  test)
    [ -f "$SECRET_FILE" ] || { echo "Zuerst: bash scripts/push-setup.sh setup"; exit 1; }
    curl -sS -X POST "$URL" -H "x-cron-secret: $(cat "$SECRET_FILE")" -H "Content-Type: application/json" -d '{"force": true}'
    echo
    ;;
  *)
    echo "Aufruf: bash scripts/push-setup.sh setup | deploy | pubkey | vault-sql | test"
    exit 2
    ;;
esac
