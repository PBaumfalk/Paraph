# Paraph – Projektregeln für Claude Code

Paraph ist eine selbst gehostete Plattform für elektronische Signaturen für Kanzleien. Diese Regeln gelten für alle, die das Repository mit Claude Code öffnen.

## Installation und Betrieb

- Grundlage für Installation, Update und Diagnose ist das Handbuch: `docs/handbuch/18-installation-mit-claude-code.md`, `11-installation.md`, `12-konfiguration.md`, `13-sicherung-und-updates.md`, `15-diagnose-und-fehlersuche.md`. Nicht improvisieren, wenn das Handbuch einen Weg beschreibt.
- Installieren nur über `scripts/install.sh` (Probebetrieb: `--probe`), aktualisieren nur über `scripts/update.sh`, wiederherstellen nur über `scripts/restore.sh`.
- `.env`, `secrets/` und `backups/` nie lesen, ausgeben, überschreiben oder löschen. Die Adresse liefert `docker compose exec -T paraph printenv APP_URL`. Docker-Volumes nie löschen (`docker compose down -v` nur auf ausdrücklichen Wunsch).
- Zugangsdaten (SMTP-Passwort, OIDC-Secret, S3-Schlüssel) nicht im Chat erfragen; die Person trägt sie selbst in `.env` ein.
- Erfolg nachweisen statt behaupten: `docker compose ps`, `curl <APP_URL>/api/health/ready` (Antwort `"status":"ready"`), `docker compose exec -T paraph paraph doctor`.
