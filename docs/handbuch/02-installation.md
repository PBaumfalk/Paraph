# 2. Installation

Stand: Version 0.2.0.

## Voraussetzungen

- Linux-Server (amd64 oder arm64) mit Docker und Docker Compose v2 (`docker compose`)
- `openssl` (für die Schlüsselerzeugung in `scripts/install.sh`)
- Root-Rechte für die Installation (`sudo`); das Skript ordnet die Schlüsseldateien dem Container-Benutzer (UID 1000) zu
- 2 GB RAM frei: Paraph und Gotenberg sind in `docker-compose.yml` auf je 1 GB begrenzt
- eine Domain, deren DNS-Eintrag auf den Server zeigt
- entweder freie Ports 80 und 443 für den mitgelieferten Caddy (automatisches HTTPS) oder ein vorhandener Reverse Proxy (nginx, Traefik)
- ein SMTP-Konto für den Versand der Einladungen
- empfohlen: ein Zeitstempeldienst (TSA) nach RFC 3161; FreeTSA ist voreingestellt
- optional: SMS-Gateway, OIDC-Anbieter, S3-Speicher

Für den Betrieb ohne Docker ist Node.js 24 nötig (`package.json`: `"node": ">=24"`). Dieses Handbuch beschreibt nur den Docker-Betrieb.

## Installation mit `install.sh`

```sh
cd paraph
sudo ./scripts/install.sh
```

Das Skript fragt nacheinander:

| Frage | Wirkung |
|---|---|
| Domain | z. B. `sign.kanzlei.example`. Daraus wird `APP_URL=https://<Domain>`. |
| Caddy mitstarten? (Vorgabe: ja) | ja: Caddy belegt die Ports 80 und 443 und holt das Zertifikat selbst. nein: Sie betreiben einen eigenen Proxy. |
| E-Mail für Let's Encrypt | nur mit Caddy, Pflicht. Ohne gültige Adresse bricht das Skript ab. |
| SMTP-Zugang | `SMTP_URL`, z. B. `smtps://benutzer:passwort@server:465` |
| Absender | `MAIL_FROM`, Vorgabe `Paraph <signatur@<Domain>>` |
| Zeitstempeldienst (Vorgabe: `freetsa`) | `freetsa` setzt `TSA_URL=https://freetsa.org/tsr` und übernimmt das mitgelieferte Wurzelzertifikat `docker/tsa/freetsa-root-ca.pem` nach `secrets/tsa_ca.pem`; das Skript prüft vorher dessen SHA-256-Fingerabdruck und bricht bei Abweichung ab. Eine eigene URL fragt zusätzlich nach der PEM-Datei des Anbieters. `keiner` = ohne Zeitstempeldienst. |

Danach

1. legt es `secrets/` (0700) und `backups/` (0700) an,
2. erzeugt den Hauptschlüssel `secrets/master.key` (32 Byte, Base64) und die Wiederherstellungs-Passphrase `secrets/backup_passphrase` (32 Zeichen), falls sie fehlen; beide gehören UID 1000 und haben die Rechte 0400,
3. legt `secrets/tsa_ca.pem` an (Zertifikat des Zeitstempeldienstes, leer ohne Dienst),
4. kopiert `.env.example` nach `.env` (Rechte 0600), falls `.env` fehlt, und trägt `APP_URL`, `DOMAIN`, `ACME_EMAIL`, einen zufälligen `SETUP_CODE`, `SMTP_URL`, `MAIL_FROM`, `TSA_URL` und `TRUST_PROXY=true` ein,
5. schreibt `PARAPH_IMAGE=paraph:<Version>` und `COMPOSE_PROFILES` (`caddy` oder leer) in `.env`, damit auch ein späteres `docker compose up -d` genau diesen Stand verwendet,
6. baut das Image (`docker compose build --pull paraph`), startet alle Dienste und wartet bis zu drei Minuten auf Bereitschaft,
7. führt `paraph doctor --quick` aus und legt `.paraph-install` an (Zeitpunkt und Version; `update.sh` setzt diese Datei voraus),
8. zeigt den Einrichtungscode und, wenn neu erzeugt, die Wiederherstellungs-Passphrase.

Ein erneuter Aufruf überschreibt weder Schlüssel noch `.env`; er prüft, baut und startet.

Das Skript ändert nichts außerhalb des Projektordners, öffnet keine Firewall-Ports und versendet nichts.

**Sichern Sie die angezeigte Wiederherstellungs-Passphrase sofort an einem zweiten Ort** (Passwortmanager, Tresor), nicht nur auf diesem Server. Mit ihr lässt sich jede Sicherung samt Hauptschlüssel auf einem neuen Server wiederherstellen. Ohne Passphrase und ohne `secrets/master.key` sind Sicherungen und Dokumente unlesbar. Siehe [Kapitel 6](06-sicherung.md).

### Ohne Rückfragen

Alle Angaben lassen sich vorgeben:

```sh
sudo PARAPH_NONINTERACTIVE=1 \
     PARAPH_DOMAIN=sign.kanzlei.example \
     PARAPH_USE_CADDY=ja \
     PARAPH_ACME_EMAIL=it@kanzlei.example \
     PARAPH_SMTP_URL='smtps://benutzer:passwort@smtp.example.org:465' \
     PARAPH_MAIL_FROM='Kanzlei Muster <signatur@kanzlei.example>' \
     PARAPH_TSA_URL=freetsa \
     ./scripts/install.sh
```

| Variable | Zweck |
|---|---|
| `PARAPH_NONINTERACTIVE=1` | keine Rückfragen; fehlende Angaben erhalten die Vorgabe |
| `PARAPH_DOMAIN`, `PARAPH_USE_CADDY`, `PARAPH_ACME_EMAIL`, `PARAPH_SMTP_URL`, `PARAPH_MAIL_FROM`, `PARAPH_TSA_URL` | Antworten auf die Fragen oben. Ohne `PARAPH_TSA_URL` gilt auch hier `freetsa`; `keiner` schaltet den Zeitstempeldienst ab. |
| `PARAPH_TSA_CA_FILE` | PEM-Datei des Zeitstempeldienstes bei eigener `PARAPH_TSA_URL` |
| `PARAPH_APP_URL` | abweichende öffentliche Adresse (Vorgabe `https://<Domain>`) |
| `PARAPH_EXTRA_ENV` | weitere Zeilen, die an eine neu angelegte `.env` angehängt werden |
| `PARAPH_SKIP_BUILD=1` | nicht bauen, sondern das Image aus `PARAPH_IMAGE` verwenden (muss vorhanden sein) |
| `PARAPH_ALLOW_NONROOT=1` | ohne root ausführen. Die Schlüssel gehören dann nicht UID 1000. Nur für Tests. |

### `init.sh` ist veraltet

`scripts/init.sh` stammt aus Version 0.1.0. Es erzeugt keine Wiederherstellungs-Passphrase, setzt die Schlüsseldatei auf 0444 und trägt weder `PARAPH_IMAGE` noch `COMPOSE_PROFILES` ein. `docker-compose.yml` verlangt ab 0.2.0 die Datei `secrets/backup_passphrase`. Verwenden Sie für neue Installationen `install.sh`.

## Ergebnis: Dienste

`docker-compose.yml` startet:

| Dienst | Aufgabe | Netz |
|---|---|---|
| `paraph` | Anwendung, Port `127.0.0.1:8080` (`BIND`, `HOST_PORT`) | `frontend` und `convert` |
| `gotenberg` | Umwandlung Word/ODT/RTF → PDF, Image `gotenberg/gotenberg:8.38.1` | nur `convert` (intern, ohne Internetzugang) |
| `caddy` | nur mit Profil `caddy`: HTTPS auf Port 80/443, Image `caddy:2.10.2-alpine` | `frontend` |

Der Paraph-Container läuft als UID 1000 mit schreibgeschütztem Dateisystem, ohne Linux-Capabilities und mit `no-new-privileges`. Schreibbar sind nur das Volume `paraph-data` (`/data`), der Sicherungsordner (`/backups`) und `/tmp` (tmpfs, 256 MB). Der Healthcheck im Image ruft `paraph health` auf.

Hauptschlüssel und Passphrase bindet Compose als Docker-Secrets ein (`/run/secrets/master_key`, `/run/secrets/backup_passphrase`). Sie stehen nicht in `.env` und nicht in `docker inspect`.

Ohne Gotenberg (oder ohne `GOTENBERG_URL`) nimmt Paraph nur PDF an.

Prüfen:

```sh
docker compose ps
docker compose logs -f paraph
docker compose exec paraph paraph doctor
```

## Reverse Proxy

Paraph bindet nur an `127.0.0.1`. HTTPS übernimmt der Proxy.

### Mitgelieferter Caddy (Profil `caddy`)

Mit „Caddy mitstarten: ja“ steht `COMPOSE_PROFILES=caddy` in `.env`. Caddy verwendet `docker/Caddyfile`:

- holt das Zertifikat für `DOMAIN` automatisch bei Let's Encrypt (Kontaktadresse `ACME_EMAIL`) und leitet HTTP auf HTTPS um,
- lässt Anfragen bis 64 MB zu (Paraph begrenzt zusätzlich per `MAX_UPLOAD_MB`),
- reicht Server-Sent Events ungepuffert durch (`flush_interval -1`),
- setzt HSTS und entfernt den `Server`-Header,
- schreibt Signaturlinks, Einladungs- und Rücksetztokens in Pfaden (`/s/`, `/embed/s/`, `/invite/`, `/reset/`, `/f/`) nur gekürzt ins Zugriffsprotokoll und entfernt `Cookie` und `Authorization`.

Andere Ports (z. B. für Tests): `CADDY_HTTP_PORT`, `CADDY_HTTPS_PORT`. Für Let's Encrypt müssen 80 und 443 aus dem Internet erreichbar sein.

### Eigener Proxy

Beachten Sie:

- **Body-Größe:** Die API nimmt beim Anlegen eines Vorgangs bis zu 60 MB je Anfrage an (Dokumente als Base64). Der Proxy muss das zulassen.
- **Client-IP:** Der Proxy muss `X-Forwarded-For` setzen. `TRUST_PROXY=true` bedeutet genau **einen** vertrauenswürdigen Proxy-Hop: Paraph nimmt den letzten Eintrag in `X-Forwarded-For`, den Ihr Proxy angehängt hat. Weiter links stehende Einträge kann der Client frei wählen; sie werden ignoriert. Stehen zwei Proxys hintereinander (z. B. CDN und nginx), setzen Sie `TRUST_PROXY=2` oder die Adressen bzw. Netze der Proxys (`TRUST_PROXY=172.16.0.0/12`). Siehe [Kapitel 3](03-konfiguration.md#grundeinstellungen).
- **Live-Aktualisierung:** `/api/v1/events` ist ein Server-Sent-Events-Strom. Der Proxy darf ihn nicht puffern.
- `TRUST_PROXY` nur setzen, wenn der Container ausschließlich über den Proxy erreichbar ist. Sonst kann ein Client seine IP im Audit-Trail fälschen und Rate-Limits umgehen.

#### nginx

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name sign.kanzlei.example;

    ssl_certificate     /etc/letsencrypt/live/sign.kanzlei.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sign.kanzlei.example/privkey.pem;

    client_max_body_size 60m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection        "";
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}

server {
    listen 80;
    server_name sign.kanzlei.example;
    return 301 https://$host$request_uri;
}
```

#### Caddy außerhalb von Docker

```caddy
sign.kanzlei.example {
	request_body {
		max_size 60MB
	}
	reverse_proxy 127.0.0.1:8080
}
```

HSTS setzt Paraph selbst, sobald `APP_URL` mit `https://` beginnt.

## Ersteinrichtung

1. `https://IHRE-DOMAIN/setup` öffnen.
2. Den Einrichtungscode eingeben. `install.sh` zeigt ihn am Ende an; er steht auch in `.env` (`SETUP_CODE`). Ist dort keiner gesetzt, erzeugt Paraph einen und schreibt ihn ins Log; anzeigen mit
   ```sh
   docker compose exec paraph paraph setup-code
   ```
3. Organisationsname, eigener Name, E-Mail und Passwort (mindestens 10 Zeichen) eingeben.

Das erste Konto wird **Inhaber** der ersten Organisation und **Instanz-Administrator**. Danach ist `/setup` wirkungslos; der Code wird nicht mehr akzeptiert.

Anschließend empfohlen:

- Einstellungen → System → „Tiefenprüfung“ und „Test-E-Mail senden“ ([Kapitel 4](04-administration.md#system-instanz-administrator))
- Zwei-Faktor für das eigene Konto einschalten (Einstellungen → Profil und Sicherheit)
- Datenschutzhinweise verlinken (Einstellungen → Organisation)
- Branding und E-Mail-Absender einstellen ([Kapitel 4](04-administration.md))
- eine Testsignatur an die eigene Adresse senden und prüfen, ob die E-Mail ankommt
- eine Sicherung erstellen und probeweise prüfen ([Kapitel 6](06-sicherung.md))

## Updates mit `update.sh`

```sh
sudo ./scripts/update.sh                 # neueste Fassung aus Git (fast-forward)
sudo ./scripts/update.sh --ref v0.3.0    # bestimmten Tag oder Commit
sudo ./scripts/update.sh --no-pull       # nur neu bauen, z. B. nach manuell entpacktem Archiv
sudo ./scripts/update.sh --rollback      # zurück auf den Stand vor dem letzten Update
```

Ablauf:

| Schritt | Inhalt |
|---|---|
| 1/6 Zustand prüfen | Paraph muss bereit sein. Sonst bricht das Skript ab, ohne etwas zu ändern. |
| 2/6 Sicherung | `paraph backup` mit der laufenden Version, danach `paraph verify-backup`. Scheitert eines davon, endet das Update. |
| 3/6 Rückfall-Image | Das laufende Image erhält zusätzlich den Namen `paraph:rollback-<Zeitpunkt>`. Image und Sicherungsdatei stehen in `.paraph-update-state`. |
| 4/6 Holen und bauen | `git fetch` und `git pull --ff-only` bzw. `git checkout <ref>`; dann `docker compose build --pull`. Neues Image: `paraph:<Version>`. |
| 5/6 Starten | Die Datenbankmigration läuft beim Start automatisch. Vorher legt Paraph eine Kopie der Datenbank an (siehe unten). Wird der neue Stand nicht bereit, nennt das Skript den Rückweg. |
| 6/6 Prüfen | `paraph doctor --quick` und `paraph verify-audit`. Meldet die Audit-Prüfung Abweichungen, endet das Skript mit Fehler und nennt den Rückweg. |

Erst nach erfolgreichem Start trägt das Skript das neue Image als `PARAPH_IMAGE` in `.env` ein.

`PARAPH_SKIP_BUILD=1`: Ist `paraph:<Version>` bereits vorhanden (z. B. aus einer Registry), verwendet das Skript dieses Image, statt zu bauen.

### Kopie vor der Migration

Vor jeder Migration einer bestehenden Datenbank schreibt Paraph eine Kopie nach `/data/backups/migrations/pre-migration-schema<N>-<Zeitpunkt>.db` (im Datenvolume, Rechte 0600). Die drei neuesten bleiben erhalten. Die Kopie ist nicht verschlüsselt; sie liegt im selben Volume wie die Datenbank.

Eine Datenbank aus einer neueren Version startet nicht mit einem älteren Programm. Paraph bricht dann mit einer Meldung ab.

### Rückweg

`update.sh --rollback`

1. stoppt Paraph,
2. stellt mit dem alten Image die Sicherung aus Schritt 2 wieder her (`restore --force`),
3. setzt `PARAPH_IMAGE` auf das Rückfall-Image und startet.

**Alles, was nach dem Update geändert wurde, ist danach nicht mehr enthalten.** Die Rückfall-Images bleiben im lokalen Docker-Speicher, bis Sie sie entfernen.

### Update einer mit `init.sh` eingerichteten Installation (0.1.0)

`update.sh` setzt `.paraph-install` voraus, das nur `install.sh` anlegt. Aus dem Code ergibt sich folgender Weg; er ist nicht automatisiert getestet (der Docker-Test installiert 0.1.0 mit `install.sh`, siehe [Kapitel 9](09-tests-und-nachweise.md)):

1. Mit der laufenden Version sichern: `docker compose exec paraph paraph backup`
2. Neue Fassung holen: `git pull`
3. `sudo ./scripts/install.sh` ausführen. Vorhandene `.env` und `secrets/master.key` bleiben unverändert; das Skript erzeugt `secrets/backup_passphrase`, setzt Rechte und Eigentümer der Schlüssel, baut und startet. Die Migration läuft beim Start.

Bei einer vorhandenen `.env` schreibt `install.sh` `DOMAIN` und `ACME_EMAIL` nicht hinein. Wer Caddy neu einsetzen will, trägt beide selbst in `.env` ein; wer seinen bisherigen Proxy behält, antwortet bei Caddy mit „nein“. Prüfen Sie außerdem `TRUST_PROXY` (Bedeutung seit 0.2.0: genau ein Hop).

## Eigene Domain je Organisation

Jede Organisation kann eine eigene Domain erhalten (Einstellungen → Organisation, z. B. `unterschrift.kanzlei-b.example`). Dann gilt:

- Links in E-Mails an Unterzeichner verwenden diese Domain.
- Anfragen von dieser Domain gelten als zulässige Herkunft (Origin-Prüfung).
- Das Protokoll (http/https) übernimmt Paraph aus `APP_URL`.

Sie müssen die Domain selbst einrichten: DNS-Eintrag auf den Server und einen zusätzlichen Eintrag im Reverse Proxy, der ebenfalls an Paraph weiterleitet. Der mitgelieferte `docker/Caddyfile` kennt nur `DOMAIN`; für weitere Domains ist dort ein eigener Block nötig. Jede Domain darf nur einer Organisation zugeordnet sein.

Anmeldung per OIDC nutzt immer `APP_URL` als Rücksprungadresse.
