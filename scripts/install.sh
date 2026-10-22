#!/usr/bin/env bash
# Paraph – Erstinstallation auf einem Linux-Server mit Docker Compose.
#
#   sudo ./scripts/install.sh            interaktiv
#   sudo PARAPH_NONINTERACTIVE=1 PARAPH_DOMAIN=sign.kanzlei.de PARAPH_ACME_EMAIL=it@kanzlei.de \
#        PARAPH_SMTP_URL='smtps://…' PARAPH_MAIL_FROM='Kanzlei <signatur@kanzlei.de>' ./scripts/install.sh
#
# Was das Skript tut (und was nicht):
#   - erzeugt Hauptschlüssel und Wiederherstellungs-Passphrase als Docker-Secrets (nur für UID 1000 lesbar)
#   - legt .env (0600) und den Sicherungsordner (0700) an, baut das Image und startet die Dienste
#   - ändert nichts außerhalb dieses Verzeichnisses, öffnet keine Firewall-Ports und versendet nichts
#   - überschreibt keine vorhandenen Schlüssel oder .env (erneuter Aufruf = Prüfung + Start)
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*" >&2; }
die() { printf '\033[31m✕ %s\033[0m\n' "$*" >&2; exit 1; }
ask() { # ask VAR "Frage" "Vorgabe"
  local var=$1 q=$2 def=${3:-} cur=${!1:-}
  if [ -n "$cur" ]; then return; fi
  if [ "${PARAPH_NONINTERACTIVE:-0}" = 1 ]; then printf -v "$var" '%s' "$def"; return; fi
  read -r -p "$q${def:+ [$def]}: " ans || true
  printf -v "$var" '%s' "${ans:-$def}"
}

UID_APP=1000
# ── Voraussetzungen ──────────────────────────────────────────────────────────
if [ "$(id -u)" != 0 ] && [ "${PARAPH_ALLOW_NONROOT:-0}" != 1 ]; then
  die "Bitte mit sudo ausführen: Die Schlüsseldateien werden dem Container-Benutzer (UID $UID_APP) zugeordnet und sind für niemanden sonst lesbar."
fi
command -v docker >/dev/null || die "Docker fehlt. Installation: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 fehlt (Befehl „docker compose“)."
command -v openssl >/dev/null || die "openssl fehlt."
[ "$(uname -s)" = Linux ] || warn "Kein Linux erkannt – Paraph ist für Linux-Server gedacht; fahre fort."

say "Paraph – Installation"
# ── Angaben ──────────────────────────────────────────────────────────────────
DOMAIN=${PARAPH_DOMAIN:-}
ask DOMAIN "Domain für Paraph (z. B. sign.kanzlei.de)" ""
[ -n "$DOMAIN" ] || die "Eine Domain ist erforderlich."
[[ "$DOMAIN" =~ ^[a-z0-9.-]+$ ]] || die "Ungültige Domain: $DOMAIN"
USE_CADDY=${PARAPH_USE_CADDY:-}
ask USE_CADDY "Caddy für automatisches HTTPS mitstarten? (ja = Ports 80/443 werden belegt, nein = eigener Proxy)" "ja"
case "$USE_CADDY" in ja|j|yes|y|true|1) USE_CADDY=1 ;; *) USE_CADDY=0 ;; esac
ACME_EMAIL=${PARAPH_ACME_EMAIL:-}
if [ "$USE_CADDY" = 1 ]; then
  ask ACME_EMAIL "E-Mail-Adresse für Let's Encrypt (Ablaufwarnungen)" ""
  [[ "$ACME_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "Für Caddy ist eine gültige E-Mail-Adresse für Let's Encrypt nötig."
fi
SMTP_URL=${PARAPH_SMTP_URL:-}
ask SMTP_URL "SMTP-Zugang (smtps://benutzer:passwort@server:465 oder smtp://…:587)" ""
MAIL_FROM=${PARAPH_MAIL_FROM:-}
ask MAIL_FROM "Absender (z. B. Kanzlei Muster <signatur@kanzlei.de>)" "Paraph <signatur@$DOMAIN>"
TSA_URL=${PARAPH_TSA_URL:-}
ask TSA_URL "Zeitstempeldienst (RFC 3161, leer = keiner; dringend empfohlen)" ""
TSA_CA_SRC=${PARAPH_TSA_CA_FILE:-}
if [ -n "$TSA_URL" ]; then
  # Ohne Vertrauensanker ließen sich Zeitstempel von jemandem mit Serverzugriff selbst erzeugen
  ask TSA_CA_SRC "PEM-Datei mit Wurzel-/Zwischenzertifikat des Zeitstempeldienstes (vom Anbieter)" ""
  [ -f "$TSA_CA_SRC" ] && grep -q 'BEGIN CERTIFICATE' "$TSA_CA_SRC" || die "Für TSA_URL ist das Zertifikat des Zeitstempeldienstes (PEM) nötig: $TSA_CA_SRC"
fi

# ── Schlüssel ────────────────────────────────────────────────────────────────
umask 077
mkdir -p secrets backups
chmod 700 secrets
NEW_KEYS=0
if [ ! -s secrets/master.key ]; then
  openssl rand -base64 32 > secrets/master.key
  NEW_KEYS=1
fi
if [ ! -s secrets/backup_passphrase ]; then
  # 32 Zeichen aus einem Alphabet ohne Verwechslungsgefahr – zum Abschreiben in einen Passwortmanager
  # (endliche Quelle statt /dev/urandom | head: kein SIGPIPE unter pipefail)
  PASS=$(openssl rand -base64 96 | LC_ALL=C tr -dc 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789')
  [ ${#PASS} -ge 32 ] || die "Zufallsquelle liefert zu wenig Zeichen."
  printf '%s' "${PASS:0:32}" > secrets/backup_passphrase
  NEW_KEYS=1
fi
if [ -n "${TSA_CA_SRC:-}" ]; then cp "$TSA_CA_SRC" secrets/tsa_ca.pem; elif [ ! -f secrets/tsa_ca.pem ]; then : > secrets/tsa_ca.pem; fi
for f in secrets/master.key secrets/backup_passphrase secrets/tsa_ca.pem; do
  if [ "$(id -u)" = 0 ]; then chown "$UID_APP:$UID_APP" "$f"; chmod 0400 "$f"; else chmod 0400 "$f"; warn "$f gehört nicht UID $UID_APP (ohne root). Nur für Tests geeignet."; fi
done

# ── .env ─────────────────────────────────────────────────────────────────────
setv() { # setv SCHLÜSSEL WERT  (setzt oder ergänzt eine Zeile in .env; Wert in Anführungszeichen)
  local k=$1 v=$2 esc
  esc=$(printf '%s' "$v" | sed -e 's/[\\"$`]/\\&/g')
  if grep -q "^$k=" .env; then
    awk -v k="$k" -v v="\"$esc\"" 'BEGIN{FS=OFS="="} $1==k {print k"="v; next} {print}' .env > .env.tmp && mv .env.tmp .env
  else printf '%s="%s"\n' "$k" "$esc" >> .env; fi
  chmod 600 .env
}
if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  SETUP_CODE=$(openssl rand -hex 8)
  setv APP_URL "${PARAPH_APP_URL:-https://$DOMAIN}"
  setv DOMAIN "$DOMAIN"
  setv ACME_EMAIL "$ACME_EMAIL"
  setv SETUP_CODE "$SETUP_CODE"
  setv SMTP_URL "$SMTP_URL"
  setv MAIL_FROM "$MAIL_FROM"
  setv TSA_URL "$TSA_URL"
  setv TRUST_PROXY "true"
  [ -n "${PARAPH_EXTRA_ENV:-}" ] && printf '%s\n' "$PARAPH_EXTRA_ENV" >> .env
  chmod 600 .env
  say "✓ .env angelegt (nur für root lesbar)."
else
  SETUP_CODE=$(grep -E '^SETUP_CODE=' .env | cut -d= -f2- | tr -d '"')
  say "✓ .env vorhanden – unverändert übernommen."
fi
chmod 700 backups
[ "$(id -u)" = 0 ] && chown "$UID_APP:$UID_APP" backups

# ── Start ────────────────────────────────────────────────────────────────────
VERSION=$(grep -m1 '"version"' package.json | sed -E 's/.*"([0-9A-Za-z.+-]+)".*/\1/')
# Image und Profil stehen in .env – damit verwendet auch ein späteres „docker compose up -d“ genau diesen Stand
grep -q '^PARAPH_IMAGE=' .env || setv PARAPH_IMAGE "paraph:$VERSION"
if [ "$USE_CADDY" = 1 ]; then setv COMPOSE_PROFILES caddy; elif ! grep -q '^COMPOSE_PROFILES=' .env; then setv COMPOSE_PROFILES ""; fi
PARAPH_IMAGE=$(grep '^PARAPH_IMAGE=' .env | cut -d= -f2- | tr -d '"')
export PARAPH_VERSION=$VERSION
if [ "${PARAPH_SKIP_BUILD:-0}" = 1 ]; then
  docker image inspect "$PARAPH_IMAGE" >/dev/null 2>&1 || die "Image $PARAPH_IMAGE nicht vorhanden (PARAPH_SKIP_BUILD=1)."
  say "Verwende vorhandenes Image $PARAPH_IMAGE"
else
  say "Baue Paraph $VERSION … (einige Minuten)"
  docker compose build --pull paraph
fi
say "Starte Dienste …"
docker compose up -d
printf 'Warte auf Bereitschaft'
for _ in $(seq 1 90); do
  if docker compose exec -T paraph paraph health >/dev/null 2>&1; then echo ' ✓'; break; fi
  printf '.'; sleep 2
done
docker compose exec -T paraph paraph health >/dev/null 2>&1 || { echo; docker compose logs --tail 50 paraph; die "Paraph wurde nicht bereit – Protokoll oben."; }
printf 'INSTALLED=%s\nVERSION=%s\n' "$(date -Iseconds)" "$VERSION" > .paraph-install

say ""
say "Betriebsdiagnose:"
docker compose exec -T paraph paraph doctor --quick || true

say ""
say "Fertig. Nächste Schritte:"
echo "  1. https://$DOMAIN/setup öffnen und mit dem Einrichtungscode $SETUP_CODE das erste Konto anlegen."
echo "  2. Einstellungen → System → „Tiefenprüfung“ und „Test-E-Mail senden“."
if [ "$NEW_KEYS" = 1 ]; then
  echo
  say "WICHTIG – jetzt sichern (Passwortmanager/Tresor, NICHT auf diesem Server allein):"
  echo "  Wiederherstellungs-Passphrase: $(cat secrets/backup_passphrase)"
  echo "  Mit ihr lässt sich jede Sicherung samt Hauptschlüssel auf einem neuen Server wiederherstellen."
  echo "  Ohne sie und ohne secrets/master.key sind Sicherungen nicht lesbar."
fi
echo
echo "  Sicherungen: $(pwd)/backups (verschlüsselt) – zusätzlich auf ein anderes System kopieren (z. B. restic, rsync)."
echo "  Aktualisieren: sudo ./scripts/update.sh"
