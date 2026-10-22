#!/bin/sh
# Einmalige Vorbereitung: Hauptschlüssel als Docker-Secret, .env aus Vorlage, Sicherungsordner.
set -e
cd "$(dirname "$0")/.."
mkdir -p secrets backups
if [ ! -f secrets/master.key ]; then
  umask 077
  openssl rand -base64 32 > secrets/master.key
  echo "Hauptschlüssel erzeugt: secrets/master.key – GETRENNT von den Sicherungen aufbewahren (z. B. Passwortmanager)."
fi
if [ ! -f .env ]; then
  cp .env.example .env
  code=$(openssl rand -hex 8)
  sed -i.bak "s/^SETUP_CODE=.*/SETUP_CODE=$code/" .env && rm -f .env.bak
  echo ".env angelegt. Einrichtungscode: $code – APP_URL und SMTP_URL in .env eintragen."
fi
# Der Container läuft als Benutzer node (UID 1000)
chown 1000:1000 backups 2>/dev/null || true
chmod 0444 secrets/master.key 2>/dev/null || true
