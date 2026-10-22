#!/usr/bin/env bash
# Paraph – Wiederherstellung einer Sicherung (auch auf einem neuen Server).
#
#   sudo ./scripts/restore.sh backups/paraph-backup-….pbk
#
# Fall 1 – gleicher Server: secrets/master.key passt zur Sicherung → Daten werden ersetzt (vorher Rückfrage).
# Fall 2 – neuer Server ohne Hauptschlüssel: Die Wiederherstellungs-Passphrase steht in secrets/backup_passphrase
#          (aus dem Passwortmanager eintragen). Das Skript übernimmt den Hauptschlüssel aus der Sicherung.
set -euo pipefail
cd "$(dirname "$0")/.."
say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31m✕ %s\033[0m\n' "$*" >&2; exit 1; }
FILE=${1:-}
[ -n "$FILE" ] && [ -f "$FILE" ] || die "Aufruf: $0 <Sicherungsdatei>"
[ -f .env ] || die ".env fehlt – zuerst scripts/install.sh ausführen (legt Konfiguration an)."
[ -s secrets/backup_passphrase ] || [ -s secrets/master.key ] || die "Weder secrets/master.key noch secrets/backup_passphrase vorhanden."
mkdir -p backups
BASE=$(basename "$FILE")
[ "$(cd "$(dirname "$FILE")" && pwd)/$BASE" = "$(pwd)/backups/$BASE" ] || cp "$FILE" "backups/$BASE"
UIDAPP=1000
take_key() {
  say "Übernehme den Hauptschlüssel mit der Wiederherstellungs-Passphrase aus der Sicherung …"
  [ -s secrets/backup_passphrase ] || die "secrets/backup_passphrase fehlt – Passphrase aus dem Passwortmanager eintragen."
  [ -s secrets/master.key ] && mv secrets/master.key "secrets/master.key.ersetzt-$(date +%Y%m%d%H%M%S)"
  : > secrets/master.key   # Platzhalter, damit Docker das Secret einbinden kann
  OUT=$(mktemp -d)
  chmod 700 "$OUT"; [ "$(id -u)" = 0 ] && chown "$UIDAPP:$UIDAPP" "$OUT"
  docker compose run --rm --no-deps -v "$OUT:/out" paraph paraph restore-key "/backups/$BASE" --out /out/master.key
  mv "$OUT/master.key" secrets/master.key && rmdir "$OUT"
  chmod 0400 secrets/master.key; [ "$(id -u)" = 0 ] && chown "$UIDAPP:$UIDAPP" secrets/master.key
  say "✓ Hauptschlüssel übernommen (secrets/master.key)."
}
[ -s secrets/master.key ] || take_key
INFO=$(docker compose run --rm --no-deps paraph paraph verify-backup "/backups/$BASE") || { echo "$INFO"; die "Sicherung nicht in Ordnung."; }
echo "$INFO"
if echo "$INFO" | grep -q 'geöffnet per Passphrase'; then
  # Der Schlüssel dieser Instanz gehört nicht zur Sicherung (typisch: neuer Server nach install.sh)
  if [ "${PARAPH_TAKE_KEY:-0}" != 1 ]; then
    [ "${PARAPH_NONINTERACTIVE:-0}" = 1 ] && die "Hauptschlüssel passt nicht zur Sicherung. Mit PARAPH_TAKE_KEY=1 wird er aus der Sicherung übernommen."
    read -r -p "Der Hauptschlüssel dieser Instanz passt nicht zur Sicherung. Schlüssel aus der Sicherung übernehmen? Der bisherige wird umbenannt aufbewahrt. (ja/nein) " a
    [ "$a" = ja ] || die "Abgebrochen."
  fi
  docker compose stop paraph >/dev/null 2>&1 || true
  take_key
fi
if [ "${PARAPH_NONINTERACTIVE:-0}" != 1 ]; then
  read -r -p "Vorhandene Daten dieser Instanz durch die Sicherung ersetzen? (ja/nein) " a
  [ "$a" = ja ] || die "Abgebrochen."
fi
docker compose stop paraph >/dev/null 2>&1 || true
docker compose run --rm --no-deps paraph paraph restore "/backups/$BASE" --force
docker compose up -d
for _ in $(seq 1 90); do docker compose exec -T paraph paraph health >/dev/null 2>&1 && break; sleep 2; done
docker compose exec -T paraph paraph health >/dev/null 2>&1 || die "Paraph wird nicht bereit – docker compose logs paraph"
docker compose exec -T paraph paraph verify-audit || die "Audit-Prüfung nach der Wiederherstellung auffällig."
say "✓ Wiederhergestellt aus $BASE."
