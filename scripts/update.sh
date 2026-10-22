#!/usr/bin/env bash
# Paraph – Aktualisierung mit Sicherung vorab und Rückweg.
#
#   sudo ./scripts/update.sh                 neueste Fassung aus Git (fast-forward) bauen und starten
#   sudo ./scripts/update.sh --ref v0.3.0    bestimmten Stand (Tag/Commit) verwenden
#   sudo ./scripts/update.sh --no-pull       nur neu bauen (z. B. nach manuell entpacktem Archiv)
#   sudo ./scripts/update.sh --rollback      auf den Stand vor dem letzten Update zurück (Image + Daten)
#
# Ablauf: verschlüsselte Sicherung → Image des laufenden Stands als Rückfall markieren → neuen Stand bauen →
# starten (Datenbankmigration läuft automatisch, vorher legt Paraph eine Kopie an) → Bereitschaft, Diagnose
# und Audit-Prüfung. Scheitert ein Schritt, bleibt der alte Stand nutzbar bzw. --rollback stellt ihn her.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31m✕ %s\033[0m\n' "$*" >&2; exit 1; }
[ -f .paraph-install ] || die "Keine Installation gefunden (.paraph-install fehlt). Zuerst scripts/install.sh ausführen."
STATE=.paraph-update-state
DC() { docker compose "$@"; }
PARAPH_IMAGE=$(grep '^PARAPH_IMAGE=' .env | cut -d= -f2- | tr -d '"')
[ -n "$PARAPH_IMAGE" ] || die "PARAPH_IMAGE fehlt in .env."
set_image() { sed -i.bak "s|^PARAPH_IMAGE=.*|PARAPH_IMAGE=\"$1\"|" .env && rm -f .env.bak && chmod 600 .env; }

wait_ready() {
  for _ in $(seq 1 90); do
    DC exec -T paraph paraph health >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}

if [ "${1:-}" = "--rollback" ]; then
  [ -f "$STATE" ] || die "Kein vorheriges Update protokolliert ($STATE fehlt)."
  # shellcheck disable=SC1090
  . "./$STATE"
  say "Rückkehr zu $PREV_IMAGE mit Sicherung $BACKUP_FILE …"
  docker image inspect "$PREV_IMAGE" >/dev/null 2>&1 || die "Image $PREV_IMAGE nicht mehr vorhanden."
  DC stop paraph
  # Daten auf den Stand vor dem Update zurücksetzen (mit dem alten Programm, passend zum alten Schema)
  PARAPH_IMAGE="$PREV_IMAGE" DC run --rm --no-deps paraph paraph restore "/backups/$BACKUP_FILE" --force
  set_image "$PREV_IMAGE"
  PARAPH_IMAGE="$PREV_IMAGE" DC up -d
  PARAPH_IMAGE="$PREV_IMAGE" wait_ready || die "Auch der alte Stand startet nicht – Protokoll: docker compose logs paraph"
  say "✓ Zurückgesetzt auf $PREV_IMAGE. Änderungen nach $BACKUP_TIME sind nicht mehr enthalten."
  exit 0
fi

REF=""; PULL=1
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF=$2; shift 2 ;;
    --no-pull) PULL=0; shift ;;
    *) die "Unbekannte Option: $1" ;;
  esac
done

export PARAPH_IMAGE
say "1/6 Zustand prüfen"
wait_ready || die "Paraph läuft nicht bereit – vor einem Update erst den Betrieb herstellen (docker compose logs paraph)."
OLD_VERSION=$(DC exec -T paraph paraph version 2>/dev/null | head -1 || echo unbekannt)
echo "    laufend: $OLD_VERSION ($PARAPH_IMAGE)"

say "2/6 Verschlüsselte Sicherung"
OUT=$(DC exec -T paraph paraph backup) || die "Sicherung fehlgeschlagen – Update abgebrochen, nichts verändert."
echo "$OUT" | sed 's/^/    /'
BACKUP_FILE=$(echo "$OUT" | sed -n 's|^Sicherung erstellt: /backups/||p' | head -1)
[ -n "$BACKUP_FILE" ] || die "Sicherungsdatei nicht erkannt – Update abgebrochen."
DC exec -T paraph paraph verify-backup "/backups/$BACKUP_FILE" | sed 's/^/    /' || die "Sicherung nicht prüfbar – Update abgebrochen."

say "3/6 Rückfall-Image markieren"
PREV_IMAGE="paraph:rollback-$(date +%Y%m%d%H%M%S)"
docker tag "$PARAPH_IMAGE" "$PREV_IMAGE"
printf 'PREV_IMAGE=%s\nBACKUP_FILE=%s\nBACKUP_TIME=%s\n' "$PREV_IMAGE" "$BACKUP_FILE" "$(date -Iseconds)" > "$STATE"
echo "    $PREV_IMAGE"

say "4/6 Neuen Stand holen und bauen"
if [ "$PULL" = 1 ]; then
  [ -d .git ] || die "Kein Git-Verzeichnis – neuen Stand entpacken und mit --no-pull aufrufen."
  git fetch --tags --quiet
  if [ -n "$REF" ]; then git -c advice.detachedHead=false checkout --quiet "$REF"; else git pull --ff-only --quiet; fi
fi
VERSION=$(grep -m1 '"version"' package.json | sed -E 's/.*"([0-9A-Za-z.+-]+)".*/\1/')
NEW_IMAGE="paraph:$VERSION"
[ "$NEW_IMAGE" = "$PARAPH_IMAGE" ] && NEW_IMAGE="paraph:$VERSION-$(date +%Y%m%d%H%M%S)"
if [ "${PARAPH_SKIP_BUILD:-0}" = 1 ] && docker image inspect "paraph:$VERSION" >/dev/null 2>&1; then
  # Vorgebautes Image (z. B. aus einer Registry oder CI) verwenden
  NEW_IMAGE="paraph:$VERSION"
  echo "    verwende vorhandenes Image $NEW_IMAGE"
else
  PARAPH_IMAGE="$NEW_IMAGE" PARAPH_VERSION="$VERSION" DC build --pull paraph
fi

say "5/6 Starten (Migration läuft automatisch)"
PARAPH_IMAGE="$NEW_IMAGE" PARAPH_VERSION="$VERSION" DC up -d
if ! PARAPH_IMAGE="$NEW_IMAGE" wait_ready; then
  DC logs --tail 60 paraph || true
  die "Neuer Stand wird nicht bereit. Zurück zum vorherigen Stand: sudo ./scripts/update.sh --rollback"
fi
set_image "$NEW_IMAGE"

say "6/6 Prüfen"
PARAPH_IMAGE="$NEW_IMAGE" DC exec -T paraph paraph doctor --quick | sed 's/^/    /' || true
if ! PARAPH_IMAGE="$NEW_IMAGE" DC exec -T paraph paraph verify-audit | sed 's/^/    /'; then
  die "Audit-Prüfung meldet Abweichungen – bitte prüfen. Rückweg: sudo ./scripts/update.sh --rollback"
fi
say "✓ Aktualisiert: $OLD_VERSION → $VERSION ($NEW_IMAGE). Sicherung vorab: backups/$BACKUP_FILE"
echo "  Rückweg (stellt Daten auf den Stand vor dem Update zurück): sudo ./scripts/update.sh --rollback"
