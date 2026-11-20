# 18. Installation mit Claude Code

Dieses Kapitel richtet sich an alle, die Paraph installieren sollen, aber nicht jeden Befehl selbst eintippen wollen. [Claude Code](https://code.claude.com/docs/en/overview) ist der Programmierassistent von Anthropic, der im Terminal läuft. Sie geben ihm einen fertigen Auftrag. Er prüft dann die Voraussetzungen, führt das Installationsskript aus, startet Paraph und kontrolliert, ob alles läuft. Am Ende nennt er Ihnen die Adresse und den Einrichtungscode.

Es gibt zwei Wege:

| Weg | Wofür | Ergebnis |
|---|---|---|
| [Probebetrieb](#probebetrieb-auf-dem-eigenen-rechner) | Ausprobieren auf einem Mac oder Linux-Rechner, Schulung, erster Eindruck | `http://localhost:8080`, nur auf diesem Rechner, ohne E-Mail-Versand |
| [Server](#installation-auf-dem-server) | Kanzleibetrieb | `https://<Ihre Domain>` mit HTTPS, E-Mail und Sicherung |

Alles, was Claude Code ausführt, steht in [Kapitel 11](11-installation.md) als Befehl. Diese Befehle finden Sie auch hier unter [Was Claude Code ausführt](#was-claude-code-ausführt). So können Sie jeden Schritt nachvollziehen oder von Hand wiederholen.

## Vorab bereitstellen

| Was | Wozu | Woher |
|---|---|---|
| Ein Konto für Claude Code | Claude Code braucht ein Abo **Pro, Max, Ultra, Team oder Enterprise** oder ein Konto in der Claude Console (API). Das kostenlose Claude-Konto reicht nicht. | [claude.com](https://claude.com) |
| Docker | Paraph läuft in Docker-Containern. Auf dem Mac: [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/) installieren und starten. Auf Linux: [Docker Engine](https://docs.docker.com/engine/install/) mit Compose v2. | docker.com |
| `git` und `openssl` | Checkout und Schlüsselerzeugung | auf dem Mac und den meisten Linux-Systemen vorhanden |
| Platz und Arbeitsspeicher | etwa 4 GB Plattenplatz für die Images, 2 GB freier Arbeitsspeicher | – |
| Nur Server | eine Domain mit DNS-Eintrag auf den Server, ein SMTP-Konto für den Versand, Ports 80 und 443 frei (oder ein vorhandener Reverse Proxy) | Ihre IT oder Ihr Hoster |

Claude Code läuft unter macOS 13 oder neuer, Ubuntu 20.04 oder neuer, Debian 10 oder neuer und Windows 10/11. Paraph selbst ist für Linux-Server gebaut. Den Probebetrieb haben wir auf einem Mac mit Docker Desktop geprüft. Windows mit WSL 2 ist nicht geprüft.

## Claude Code einrichten

Die folgenden Befehle stammen aus der offiziellen Anleitung ([Setup](https://code.claude.com/docs/en/setup), Stand November 2026). Prüfen Sie dort im Zweifel den aktuellen Stand.

1. Installieren Sie Claude Code im Terminal (macOS, Linux, WSL):

   ```sh
   curl -fsSL https://claude.ai/install.sh | bash
   ```

   Auf dem Mac geht auch `brew install --cask claude-code`.

2. Prüfen Sie die Installation:

   ```sh
   claude --version
   claude doctor
   ```

   Wird `claude` nicht gefunden, öffnen Sie ein neues Terminalfenster. Hilft das nicht, liegt das Installationsverzeichnis noch nicht im `PATH` ([Fehlerbehebung](https://code.claude.com/docs/en/troubleshooting)).

3. Melden Sie sich beim ersten Start an. Das passiert automatisch, wenn Sie `claude` aufrufen.

## Paraph herunterladen

Laden Sie Paraph in den Ordner, in dem es dauerhaft liegen soll. Ein GitHub-Konto brauchen Sie dafür nicht.

```sh
# Probebetrieb, z. B. im Benutzerordner
git clone https://github.com/PBaumfalk/Paraph.git ~/paraph

# Server
sudo git clone https://github.com/PBaumfalk/Paraph.git /opt/paraph
```

Für eine bestimmte Version hängen Sie `--branch v0.3.0` an (Versionen: [Releases](https://github.com/PBaumfalk/Paraph/releases)). Spätere Updates holt `scripts/update.sh` per `git pull` ([Kapitel 13](13-sicherung-und-updates.md#paraph-aktualisieren)).

## Claude Code im richtigen Ordner öffnen

Öffnen Sie Claude Code **im Paraph-Ordner**, also dort, wo `scripts/install.sh` und `docker-compose.yml` liegen:

```sh
cd ~/paraph          # Server: cd /opt/paraph
claude
```

Claude Code liest dann die mitgelieferte Datei `CLAUDE.md` und kennt die Regeln für dieses Projekt: das Handbuch als Grundlage, keine Schlüssel ausgeben, nichts Vorhandenes überschreiben.

Fragt Claude Code beim Start, ob Sie dem Ordner vertrauen, bestätigen Sie. Vor jedem Befehl fragt Claude Code um Erlaubnis. Lesen Sie die Befehle und erlauben Sie sie einzeln. Wenn Sie wollen, erlauben Sie wiederkehrende Befehle wie `docker compose` für die Sitzung.

## Probebetrieb auf dem eigenen Rechner

Im Probebetrieb läuft Paraph unter `http://localhost:8080`, nur auf Ihrem Rechner. Es gibt keine Domain, kein HTTPS und keinen E-Mail-Versand. Die Links zum Unterschreiben öffnen Sie selbst ([Kapitel 1, Schritt für Schritt](01-paraph-in-fuenf-minuten.md#ihr-erster-vorgang-schritt-für-schritt)). Verwenden Sie im Probebetrieb **keine echten Mandantendaten**.

Fügen Sie diesen Auftrag unverändert in Claude Code ein:

```text
Installiere Paraph aus diesem Ordner im Probebetrieb und weise nach, dass es läuft.
Grundlage sind docs/handbuch/18-installation-mit-claude-code.md und docs/handbuch/11-installation.md.

1. Prüfe die Umgebung und zeige mir das Ergebnis als kurze Liste: Betriebssystem, `docker info`
   (Docker läuft), `docker compose version` (v2), `openssl version`, `git --version`, freier
   Plattenplatz (mindestens 4 GB), ob Port 8080 frei ist. Fehlt etwas, sag mir genau, was ich tun
   muss, und hör dann auf.
2. Prüfe, dass dieser Ordner ein Paraph-Checkout ist (scripts/install.sh und docker-compose.yml
   vorhanden). Wenn nicht, hör auf und verweise mich auf den Abschnitt „Paraph herunterladen“.
3. Führe `./scripts/install.sh --probe` aus. Ist Port 8080 belegt, setze PARAPH_PORT=8081 (oder
   den nächsten freien Port). Das Bauen dauert beim ersten Mal mehrere Minuten.
   Lösche, überschreibe oder ändere keine vorhandene .env, nichts in secrets/ und keine
   Docker-Volumes. Gib keine Schlüssel, Passphrasen oder Inhalte von .env und secrets/ aus.
4. Weise nach, dass Paraph läuft. Die Adresse liefert
   `docker compose exec -T paraph printenv APP_URL` (lies .env dafür nicht). Prüfe:
   - `docker compose ps`: paraph ist „healthy“, gotenberg läuft
   - `curl -fsS <APP_URL>/api/health/ready` antwortet mit "status":"ready"
   - `curl -s -o /dev/null -w '%{http_code}' <APP_URL>/setup` ergibt 200
   - `docker compose exec -T paraph paraph doctor --quick` ohne Fehler (Warnungen zu E-Mail,
     Zeitstempel und Sicherung sind im Probebetrieb erwartet; nenne sie mir)
5. Schlägt ein Schritt fehl, such die Ursache mit `docker compose logs --tail 100 paraph` und
   docs/handbuch/15-diagnose-und-fehlersuche.md, behebe sie ohne Datenverlust und wiederhole
   ab Schritt 3. Ein erneuter Aufruf von install.sh ist dafür vorgesehen.
6. Melde zum Schluss knapp: die Adresse, die ich im Browser öffnen soll (<APP_URL>/setup), den
   Einrichtungscode (`docker compose exec -T paraph paraph setup-code`), welche Prüfungen bestanden
   sind, und die Befehle zum Beenden (docker compose down) und Wiederstarten (docker compose up -d).
```

Woran Sie den Erfolg erkennen: Claude Code meldet die Adresse `http://localhost:8080/setup` (oder einen anderen Port) und einen Einrichtungscode aus 16 Zeichen. Öffnen Sie die Adresse genau so, mit `localhost` und nicht mit `127.0.0.1`. Sonst lehnt Paraph die Anmeldung aus Sicherheitsgründen ab. Wie es weitergeht, steht unter [Nach der Installation](#nach-der-installation).

## Installation auf dem Server

Für den Kanzleibetrieb installieren Sie Paraph auf einem Linux-Server. Claude Code muss dafür auf dem Server selbst laufen: Melden Sie sich per SSH an und installieren Sie Claude Code dort wie oben beschrieben.

Claude Code fragt Sie nach Domain, Absender und SMTP-Server. Zugangsdaten wie das SMTP-Passwort fragt es **nicht** ab. Sie tragen sie selbst in `.env` ein, damit sie nicht im Gesprächsverlauf landen. Ebenso bleibt die Wiederherstellungs-Passphrase verdeckt (`PARAPH_QUIET_SECRETS=1`); Sie lesen sie selbst aus.

Fügen Sie diesen Auftrag unverändert in Claude Code ein:

```text
Installiere Paraph aus diesem Ordner auf diesem Linux-Server für den Kanzleibetrieb und weise nach,
dass es läuft. Grundlage sind docs/handbuch/18-installation-mit-claude-code.md,
docs/handbuch/11-installation.md und docs/handbuch/12-konfiguration.md.

1. Prüfe die Umgebung und zeige mir das Ergebnis als kurze Liste: Linux-Distribution und
   Architektur, `docker info`, `docker compose version` (v2), `openssl version`, `git --version`,
   freier Arbeitsspeicher (mindestens 2 GB) und Plattenplatz (mindestens 4 GB), ob die Ports 80
   und 443 frei sind, ob ich root bin oder sudo ohne Passwort nutzen kann. Fehlt etwas, sag mir
   genau, was ich tun muss, und hör dann auf.
2. Prüfe, dass dieser Ordner ein Paraph-Checkout ist. Gibt es hier schon .env, secrets/ oder
   .paraph-install, ist Paraph bereits installiert: dann nichts überschreiben, nur
   `sudo ./scripts/install.sh` erneut aufrufen (prüft und startet) und mit Schritt 6 weitermachen.
3. Frag mich nacheinander nach: Domain für Paraph; ob der mitgelieferte Caddy HTTPS übernehmen
   soll (Ports 80/443) oder ein vorhandener Reverse Proxy; E-Mail-Adresse für Let's Encrypt;
   Absender (Name und Adresse); SMTP-Server und Port; Zeitstempeldienst (Vorgabe freetsa).
   Rate nichts und frag nicht nach Passwörtern.
4. Prüfe, dass die Domain auf diesen Server zeigt (`getent hosts <Domain>` und die öffentliche
   IP des Servers). Weicht sie ab, sag es mir, bevor du weitermachst.
5. Führe die Installation ohne Rückfragen aus, mit PARAPH_NONINTERACTIVE=1, PARAPH_QUIET_SECRETS=1,
   meinen Angaben aus Schritt 3 und einem leeren PARAPH_SMTP_URL:
   sudo PARAPH_NONINTERACTIVE=1 PARAPH_QUIET_SECRETS=1 PARAPH_DOMAIN=… PARAPH_USE_CADDY=… \
        PARAPH_ACME_EMAIL=… PARAPH_MAIL_FROM='…' PARAPH_TSA_URL=… PARAPH_SMTP_URL= ./scripts/install.sh
   Fordert sudo ein Passwort, gib mir den vollständigen Befehl, damit ich ihn selbst mit
   vorangestelltem „!“ ausführe. Gib keine Schlüssel, Passphrasen oder Inhalte von .env und
   secrets/ aus und ändere nichts in secrets/.
6. Bitte mich, SMTP_URL in .env selbst einzutragen (Format smtps://benutzer:passwort@server:465
   oder smtp://benutzer:passwort@server:587), z. B. mit `! sudo nano .env`. Warte, bis ich
   „fertig“ schreibe. Starte dann mit `sudo docker compose up -d` neu.
7. Weise nach, dass Paraph läuft:
   - `sudo docker compose ps`: paraph „healthy“, gotenberg läuft, mit Caddy auch caddy
   - `curl -fsS https://<Domain>/api/health/ready` ohne -k (gültiges Zertifikat), Antwort "status":"ready"
   - `curl -s -o /dev/null -w '%{http_code}' https://<Domain>/setup` ergibt 200
   - `sudo docker compose exec -T paraph paraph doctor`; erkläre mir jede Warnung anhand von
     docs/handbuch/15-diagnose-und-fehlersuche.md
8. Schlägt ein Schritt fehl, such die Ursache (`sudo docker compose logs --tail 100 paraph`,
   bei Caddy auch `caddy`), behebe sie ohne Datenverlust und wiederhole den Schritt.
9. Melde zum Schluss knapp: die Adresse https://<Domain>/setup, den Einrichtungscode
   (`sudo docker compose exec -T paraph paraph setup-code`), welche Prüfungen bestanden sind,
   was offen ist, und erinnere mich daran, die Wiederherstellungs-Passphrase mit
   `sudo cat secrets/backup_passphrase` selbst in den Passwortmanager zu übernehmen.
```

Woran Sie den Erfolg erkennen: `https://<Ihre Domain>/setup` öffnet sich ohne Zertifikatswarnung, und `paraph doctor` meldet keine Fehler. Danach folgen die Ersteinrichtung und die Abnahme aus [Kapitel 11](11-installation.md#den-betrieb-abnehmen).

> **Wichtig:** Übernehmen Sie die Wiederherstellungs-Passphrase sofort in einen Passwortmanager oder Tresor. Ohne sie und ohne `secrets/master.key` lassen sich Sicherungen auf einem neuen Server nicht wiederherstellen ([Kapitel 13](13-sicherung-und-updates.md#hauptschlüssel-und-passphrase-aufbewahren)).

## Was Claude Code ausführt

Diese Befehle stecken hinter den beiden Aufträgen. Sie können sie auch selbst ausführen.

**Probebetrieb**

```sh
cd ~/paraph
./scripts/install.sh --probe                 # Port 8080; anderer Port: PARAPH_PORT=8081 ./scripts/install.sh --probe
docker compose ps                            # paraph „healthy“, gotenberg „running“
curl -fsS http://localhost:8080/api/health/ready   # {"status":"ready", …}
docker compose exec -T paraph printenv APP_URL
docker compose exec -T paraph paraph doctor --quick
docker compose exec -T paraph paraph setup-code
```

`--probe` setzt: Domain `localhost`, kein Caddy, `APP_URL=http://localhost:8080`, kein Zeitstempeldienst, keine automatische Sicherung, kein SMTP und `TRUST_PROXY=false`. Root ist nicht nötig. Unter Linux muss das aufrufende Konto dann die UID 1000 haben; sonst bricht das Skript mit einem Hinweis ab, und Sie rufen es mit `sudo` auf. Alle Werte stehen danach in `.env`.

**Server**

```sh
cd /opt/paraph
sudo PARAPH_NONINTERACTIVE=1 PARAPH_QUIET_SECRETS=1 \
     PARAPH_DOMAIN=sign.kanzlei.example PARAPH_USE_CADDY=ja \
     PARAPH_ACME_EMAIL=it@kanzlei.example \
     PARAPH_MAIL_FROM='Kanzlei Muster <signatur@kanzlei.example>' \
     PARAPH_TSA_URL=freetsa PARAPH_SMTP_URL= \
     ./scripts/install.sh
sudo nano .env                               # SMTP_URL eintragen
sudo docker compose up -d
curl -fsS https://sign.kanzlei.example/api/health/ready
sudo docker compose exec -T paraph paraph doctor
sudo cat secrets/backup_passphrase           # in den Passwortmanager übernehmen
```

Was `install.sh` im Einzelnen tut und welche Variablen es kennt, steht in [Kapitel 11](11-installation.md#mit-installsh-installieren).

## Nach der Installation

1. Öffnen Sie `<Adresse>/setup` und legen Sie mit dem Einrichtungscode das erste Konto an: Kanzleiname, Ihr Name, Ihre E-Mail-Adresse und ein Passwort mit mindestens zehn Zeichen. Dieses Konto ist Inhaber der Organisation und Administrator der Instanz ([Kapitel 8](08-kanzlei-team-erscheinungsbild.md#paraph-erstmals-einrichten)).
2. Im Probebetrieb: Spielen Sie den [ersten Vorgang](01-paraph-in-fuenf-minuten.md#ihr-erster-vorgang-schritt-für-schritt) mit dem Beispieldokument durch.
3. Auf dem Server: Öffnen Sie „Einstellungen → System“, starten Sie die „Tiefenprüfung“ und senden Sie eine „Test-E-Mail“. Arbeiten Sie danach die Abnahme in [Kapitel 11](11-installation.md#den-betrieb-abnehmen) ab und laden Sie das Team ein ([Kapitel 8](08-kanzlei-team-erscheinungsbild.md#das-team-einladen-und-verwalten)).

## Probebetrieb beenden oder entfernen

| Ziel | Befehl im Paraph-Ordner | Folge |
|---|---|---|
| anhalten | `docker compose down` | Container weg, Daten bleiben im Volume |
| wieder starten | `docker compose up -d` | Paraph mit allen Vorgängen wie zuvor |
| alles löschen | `docker compose down -v`, danach den Ordner löschen | **Alle Vorgänge, Dokumente und Konten sind unwiderruflich weg.** |

Aus einem Probebetrieb wird kein Server-Betrieb. Für die Kanzlei installieren Sie Paraph neu auf dem Server.

## Wenn etwas nicht klappt

| Meldung | Ursache und Lösung |
|---|---|
| `Docker läuft nicht oder ist für dieses Konto nicht freigegeben` | Docker Desktop starten. Unter Linux das Konto der Gruppe `docker` hinzufügen (`sudo usermod -aG docker $USER`, neu anmelden) oder mit `sudo` arbeiten. |
| `Port 8080 ist schon belegt` | Anderen Port wählen: `PARAPH_PORT=8081 ./scripts/install.sh --probe`. Bei einer vorhandenen `.env` stattdessen `HOST_PORT` in `.env` ändern. |
| `Ohne root funktioniert das unter Linux nur mit UID 1000` | Mit `sudo` aufrufen. |
| `Bitte mit sudo ausführen` | Für den Server mit `sudo` aufrufen; zum Ausprobieren `--probe` verwenden. |
| `Paraph wurde nicht bereit – Protokoll oben` | Das Protokoll nennt den Grund. Häufig: zu wenig Arbeitsspeicher, ein fehlendes Secret oder ein ungültiger Wert in `.env`. Siehe [Kapitel 15](15-diagnose-und-fehlersuche.md). |
| Anmeldung im Browser schlägt fehl, Formular lädt neu | Die Adresse muss genau `APP_URL` entsprechen, also `http://localhost:8080` statt `http://127.0.0.1:8080`. |

---

← [17. Grenzen](17-grenzen.md) · [Inhalt](README.md) · [Glossar](glossar.md) →
