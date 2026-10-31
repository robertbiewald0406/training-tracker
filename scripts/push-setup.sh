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
    CRON="$(openssl rand -hex 32)"

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

    echo "5/5  Passwort lokal merken und SQL fuer den Vault in die Zwischenablage legen"
    umask 077
    printf '%s' "$CRON" > "$SECRET_FILE"
    SQL="delete from vault.secrets where name in ('weekly_push_url', 'weekly_push_secret');
select vault.create_secret('$URL', 'weekly_push_url');
select vault.create_secret('$CRON', 'weekly_push_secret');"
    printf '%s' "$SQL" | pbcopy
    unset PRIV CRON SQL

    cat <<EOF

Fertig. Jetzt noch zwei Dinge von Hand:

A) GitHub-Variable VITE_VAPID_PUBLIC_KEY (Settings > Secrets and variables > Actions > Variables) mit diesem
   oeffentlichen Schluessel anlegen (der ist kein Geheimnis):

$PUB

B) Supabase > SQL Editor: Strg+V (die Zwischenablage enthaelt die zwei Vault-Zeilen), Run.
   Danach den Inhalt von supabase/migrations/004_push_weekly_cron.sql ausfuehren (003 muss vorher gelaufen sein).
   Kopiere vorher nichts anderes, sonst ist die Zwischenablage ueberschrieben.

Test spaeter: bash scripts/push-setup.sh test
EOF
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
    echo "Aufruf: bash scripts/push-setup.sh setup | test"
    exit 2
    ;;
esac
