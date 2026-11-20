#!/usr/bin/env bash
# Paraph – Erstinstallation auf einem Linux-Server mit Docker Compose.
#
#   sudo ./scripts/install.sh            interaktiv
#   ./scripts/install.sh --probe         Probebetrieb auf dem eigenen Rechner: http://localhost:8080, ohne Domain,
#                                        ohne HTTPS, ohne E-Mail-Versand (Links werden selbst weitergegeben)
#   sudo PARAPH_NONINTERACTIVE=1 PARAPH_DOMAIN=sign.kanzlei.de PARAPH_ACME_EMAIL=it@kanzlei.de \
#        PARAPH_SMTP_URL='smtps://…' PARAPH_MAIL_FROM='Kanzlei <signatur@kanzlei.de>' ./scripts/install.sh
#
# Was das Skript tut (und was nicht):
#   - erzeugt Hauptschlüssel und Wiederherstellungs-Passphrase als Docker-Secrets (nur für UID 1000 lesbar)
#   - legt .env (0600) und den Sicherungsordner (0700) an, baut das Image und startet die Dienste
#   - ändert nichts außerhalb dieses Verzeichnisses, öffnet keine Firewall-Ports und versendet nichts
#   - überschreibt keine vorhandenen Schlüssel oder .env (erneuter Aufruf = Prüfung + Start)
#   - PARAPH_QUIET_SECRETS=1: Passphrase nicht ausgeben, nur ihren Ablageort nennen (z. B. bei Installation mit Claude Code)
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
PROBE=0
for arg in "$@"; do
  case "$arg" in
    --probe) PROBE=1 ;;
    -h|--help) awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"; exit 0 ;;
    *) die "Unbekannte Option: $arg (erlaubt: --probe, --help)" ;;
  esac
done
if [ "$PROBE" = 1 ]; then
  # Probebetrieb: nur auf diesem Rechner erreichbar, ohne Domain, HTTPS und E-Mail. Nicht für echte Mandantendaten.
  PROBE_PORT=${PARAPH_PORT:-8080}
  [[ "$PROBE_PORT" =~ ^[0-9]+$ ]] || die "PARAPH_PORT muss eine Portnummer sein: $PROBE_PORT"
  PARAPH_NONINTERACTIVE=${PARAPH_NONINTERACTIVE:-1}
  PARAPH_DOMAIN=${PARAPH_DOMAIN:-localhost}
  PARAPH_USE_CADDY=${PARAPH_USE_CADDY:-nein}
  PARAPH_APP_URL=${PARAPH_APP_URL:-http://localhost:$PROBE_PORT}
  [ -f .env ] || PARAPH_TSA_URL=${PARAPH_TSA_URL:-keiner}   # bei vorhandener .env bleibt der Dienst ohnehin unverändert
  PARAPH_ALLOW_NONROOT=1
fi

# ── Voraussetzungen ──────────────────────────────────────────────────────────
if [ "$(id -u)" != 0 ] && [ "${PARAPH_ALLOW_NONROOT:-0}" != 1 ]; then
  die "Bitte mit sudo ausführen: Die Schlüsseldateien werden dem Container-Benutzer (UID $UID_APP) zugeordnet und sind für niemanden sonst lesbar. Zum Ausprobieren auf dem eigenen Rechner: ./scripts/install.sh --probe"
fi
command -v docker >/dev/null || die "Docker fehlt. Installation: https://docs.docker.com/engine/install/ (Mac/Windows: Docker Desktop)"
docker info >/dev/null 2>&1 || die "Docker läuft nicht oder ist für dieses Konto nicht freigegeben (docker info schlägt fehl). Docker Desktop starten bzw. das Konto der Gruppe „docker“ hinzufügen oder sudo verwenden."
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 fehlt (Befehl „docker compose“)."
command -v openssl >/dev/null || die "openssl fehlt."
if [ "$(uname -s)" = Linux ]; then
  # Ohne root gehören die Schlüssel dem aufrufenden Konto (Rechte 0400) – der Container (UID 1000) könnte sie nicht lesen
  if [ "$(id -u)" != 0 ] && [ "$(id -u)" != "$UID_APP" ]; then
    die "Ohne root funktioniert das unter Linux nur mit UID $UID_APP (Ihre UID: $(id -u)), sonst kann der Container die Schlüssel nicht lesen. Bitte mit sudo ausführen."
  fi
elif [ "$PROBE" != 1 ]; then
  warn "Kein Linux erkannt – Paraph ist für Linux-Server gedacht; fahre fort."
fi

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
TSA_CA_SRC=${PARAPH_TSA_CA_FILE:-}
if [ -f .env ]; then
  # Erneuter Aufruf: TSA_URL steht in der vorhandenen .env, die hier nicht geändert wird. Den Vertrauensanker
  # nicht ersetzen – sonst passten Dienst und Zertifikat nicht mehr zusammen. Wechsel: Handbuch, Kapitel 14.
  [ -n "$TSA_URL$TSA_CA_SRC" ] && warn "PARAPH_TSA_URL/PARAPH_TSA_CA_FILE werden ignoriert: .env ist vorhanden, der Zeitstempeldienst bleibt unverändert."
  TSA_URL=
  TSA_CA_SRC=
else
  ask TSA_URL "Zeitstempeldienst (RFC 3161: „freetsa“, eigene URL oder „keiner“)" "freetsa"
fi
case "$TSA_URL" in
  keiner|none|-) TSA_URL= ;;
  freetsa|https://freetsa.org/tsr)
    # Mitgeliefertes Wurzelzertifikat; der Fingerabdruck ist hier fest hinterlegt, damit ein veränderter Checkout auffällt
    TSA_URL=https://freetsa.org/tsr
    TSA_CA_SRC=${TSA_CA_SRC:-docker/tsa/freetsa-root-ca.pem}
    if [ "$TSA_CA_SRC" = docker/tsa/freetsa-root-ca.pem ]; then
      FP=$(openssl x509 -in "$TSA_CA_SRC" -noout -fingerprint -sha256 2>/dev/null | cut -d= -f2 | tr -d : | tr 'A-F' 'a-f') || FP="kein lesbares Zertifikat"
      [ "$FP" = a6379e7cecc05faa3cbf076013d745e327bbbaa38c0b9af22469d4701d18aabc ] || die "Fingerabdruck von $TSA_CA_SRC passt nicht zum FreeTSA-Wurzelzertifikat ($FP)."
    fi
    say "Zeitstempeldienst: FreeTSA (kostenlos, nicht qualifiziert, ohne Verfügbarkeitszusage)" ;;
esac
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
  if [ "$PROBE" = 1 ]; then
    setv TRUST_PROXY "false"         # kein Proxy davor
    setv HOST_PORT "$PROBE_PORT"
    setv BACKUP_INTERVAL_HOURS "0"   # keine automatischen Sicherungen im Probebetrieb
    setv PARAPH_PROBE "1"
  else
    setv TRUST_PROXY "true"
  fi
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
HOST_PORT_ENV=$(grep -E '^HOST_PORT=' .env | cut -d= -f2- | tr -d '"')
HOST_PORT_ENV=${HOST_PORT_ENV:-8080}
if [ -z "$(docker compose ps -q paraph 2>/dev/null)" ] && (exec 3<>"/dev/tcp/127.0.0.1/$HOST_PORT_ENV") 2>/dev/null; then
  die "Port $HOST_PORT_ENV ist schon belegt. Anderen Port wählen: HOST_PORT in .env ändern (Probebetrieb: PARAPH_PORT=8081 ./scripts/install.sh --probe bei neuer Installation)."
fi
say "Starte Dienste …"
docker compose up -d
printf 'Warte auf Bereitschaft'
for _ in $(seq 1 90); do
  if docker compose exec -T paraph paraph health >/dev/null 2>&1; then echo ' ✓'; break; fi
  printf '.'; sleep 2
done
docker compose exec -T paraph paraph health >/dev/null 2>&1 || { echo; docker compose logs --tail 50 paraph; die "Paraph wurde nicht bereit – Protokoll oben."; }
printf 'INSTALLED=%s\nVERSION=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$VERSION" > .paraph-install
APP_URL_ENV=$(grep -E '^APP_URL=' .env | cut -d= -f2- | tr -d '"')

say ""
say "Betriebsdiagnose:"
docker compose exec -T paraph paraph doctor --quick || true

say ""
say "Fertig. Nächste Schritte:"
# Schon eingerichtet (erneuter Aufruf)? Dann gibt es keinen Einrichtungscode mehr, nur die Anmeldung.
if docker compose exec -T paraph paraph setup-code 2>/dev/null | grep -q 'bereits eingerichtet'; then
  echo "  Paraph ist bereits eingerichtet – anmelden unter $APP_URL_ENV/login"
  if grep -q '^PARAPH_PROBE="1"' .env; then echo "  Beenden: docker compose down   ·   Wieder starten: docker compose up -d"; fi
elif grep -q '^PARAPH_PROBE="1"' .env; then
  echo "  Probebetrieb – nur auf diesem Rechner erreichbar, ohne E-Mail-Versand. Nicht für echte Mandantendaten."
  echo "  1. $APP_URL_ENV/setup im Browser öffnen (genau diese Adresse, nicht 127.0.0.1) und mit dem"
  echo "     Einrichtungscode $SETUP_CODE das erste Konto anlegen."
  echo "  2. Ohne Mailserver geben Sie die Links selbst weiter; der Versanddialog wählt das vor (Handbuch, Kapitel 1)."
  echo "  Beenden: docker compose down   ·   Wieder starten: docker compose up -d   ·   Alles löschen: docker compose down -v"
else
  echo "  1. $APP_URL_ENV/setup öffnen und mit dem Einrichtungscode $SETUP_CODE das erste Konto anlegen."
  echo "  2. Einstellungen → System → „Tiefenprüfung“ und „Test-E-Mail senden“."
fi
if [ "$NEW_KEYS" = 1 ]; then
  echo
  say "WICHTIG – jetzt sichern (Passwortmanager/Tresor, NICHT auf diesem Server allein):"
  if [ "${PARAPH_QUIET_SECRETS:-0}" = 1 ]; then
    # Etwa bei einer Installation durch einen Assistenten: die Passphrase nicht in die Terminalausgabe schreiben
    echo "  Wiederherstellungs-Passphrase: liegt in $(pwd)/secrets/backup_passphrase – selbst anzeigen mit"
    echo "    sudo cat $(pwd)/secrets/backup_passphrase"
  else
    echo "  Wiederherstellungs-Passphrase: $(cat secrets/backup_passphrase)"
  fi
  echo "  Mit ihr lässt sich jede Sicherung samt Hauptschlüssel auf einem neuen Server wiederherstellen."
  echo "  Ohne sie und ohne secrets/master.key sind Sicherungen nicht lesbar."
fi
echo
if ! grep -q '^PARAPH_PROBE="1"' .env; then
  echo "  Sicherungen: $(pwd)/backups (verschlüsselt) – zusätzlich auf ein anderes System kopieren (z. B. restic, rsync)."
  echo "  Aktualisieren: sudo ./scripts/update.sh"
fi
