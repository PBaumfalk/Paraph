# 11. Installation

Dieses Kapitel richtet sich an die IT, die Paraph auf einem eigenen Server in Betrieb nimmt. Es beschreibt die Voraussetzungen, das Installationsskript `scripts/install.sh` Schritt für Schritt, den Reverse Proxy, die Freigaben in der Firewall und die Ersteinrichtung im Browser. Stand: Version 0.3.0.

> **Schneller ans Ziel:** Zum Ausprobieren auf einem Mac oder Linux-Rechner genügt `./scripts/install.sh --probe`. Paraph läuft dann unter `http://localhost:8080`, ohne Domain, HTTPS und E-Mail. Wer die Installation von Claude Code ausführen lassen möchte, findet fertige Aufträge für beide Wege in [Kapitel 18](18-installation-mit-claude-code.md).

Alle Umgebungsvariablen erklärt [Kapitel 12](12-konfiguration.md). Sicherung, Wiederherstellung und Updates stehen in [Kapitel 13](13-sicherung-und-updates.md).

## Voraussetzungen prüfen

| Bereich | Anforderung |
|---|---|
| Server | Linux (amd64 oder arm64). `install.sh` warnt auf anderen Systemen und fährt fort. |
| Software | Docker und Docker Compose v2 (Befehl `docker compose`), `openssl`, `git` (für `update.sh`) |
| Rechte | Root (`sudo`). Das Skript übergibt die Schlüsseldateien dem Container-Benutzer (UID 1000). |
| Arbeitsspeicher | 2 GB frei. Paraph und Gotenberg sind in `docker-compose.yml` auf je 1 GB begrenzt (`mem_limit`). |
| Domain | ein DNS-Eintrag, der auf den Server zeigt, z. B. `sign.firma.example` |
| HTTPS | entweder die Ports 80 und 443 frei für den mitgelieferten Caddy oder ein vorhandener Reverse Proxy (nginx, Traefik) |
| E-Mail | ein SMTP-Konto für Einladungen und Benachrichtigungen |
| Zeitstempel | empfohlen: ein Zeitstempeldienst nach RFC 3161. `install.sh` schlägt FreeTSA vor. |
| optional | SMS-Gateway, OIDC-Anbieter (z. B. authentik), S3-kompatibler Speicher |

Ohne Docker braucht Paraph Node.js 24 (`package.json`: `"node": ">=24"`). Dieses Handbuch beschreibt nur den Betrieb mit Docker.

## Paraph auf den Server holen

Der Quellcode liegt im Repository `github.com/PBaumfalk/Paraph`.

```sh
git clone https://github.com/PBaumfalk/Paraph.git /opt/paraph
cd /opt/paraph
```

Auch wenn Sie das fertige Image von GitHub verwenden ([siehe unten](#das-fertige-image-von-github-verwenden)), brauchen Sie den Checkout: Er enthält `docker-compose.yml`, `docker/Caddyfile`, das FreeTSA-Wurzelzertifikat und die Skripte.

## Mit install.sh installieren

```sh
sudo ./scripts/install.sh
```

### Die Fragen beantworten

Das Skript fragt nacheinander:

| Frage | Vorgabe | Wirkung |
|---|---|---|
| „Domain für Paraph“ | – | Pflicht, nur Kleinbuchstaben, Ziffern, Punkt und Bindestrich. Daraus wird `APP_URL=https://<Domain>`. |
| „Caddy für automatisches HTTPS mitstarten?“ | `ja` | `ja` (auch `j`, `yes`, `y`, `true`, `1`): Caddy belegt die Ports 80 und 443 und holt das Zertifikat selbst. Jede andere Antwort: Sie betreiben einen eigenen Proxy. |
| „E-Mail-Adresse für Let's Encrypt“ | – | Nur mit Caddy, dann Pflicht. Ohne gültige Adresse bricht das Skript ab. |
| „SMTP-Zugang“ | – | wird zu `SMTP_URL`, z. B. `smtps://benutzer:passwort@server:465` oder `smtp://…:587` |
| „Absender“ | `Paraph <signatur@<Domain>>` | wird zu `MAIL_FROM` |
| „Zeitstempeldienst“ | `freetsa` | siehe [Den Zeitstempeldienst wählen](#den-zeitstempeldienst-wählen) |
| „PEM-Datei mit Wurzel-/Zwischenzertifikat des Zeitstempeldienstes“ | – | nur bei eigener URL. Die Datei muss ein Zertifikat (`BEGIN CERTIFICATE`) enthalten, sonst bricht das Skript ab. |

### Den Zeitstempeldienst wählen

Paraph nutzt den Zeitstempeldienst für das Plattformsiegel (PAdES-B-T) und für die externe Verankerung der Audit-Ketten. An den Dienst geht nur ein Hashwert.

| Antwort | Ergebnis |
|---|---|
| `freetsa` (Vorgabe) oder `https://freetsa.org/tsr` | `TSA_URL=https://freetsa.org/tsr`. Als Vertrauensanker übernimmt das Skript das mitgelieferte Wurzelzertifikat `docker/tsa/freetsa-root-ca.pem` nach `secrets/tsa_ca.pem`. Vorher prüft es dessen SHA-256-Fingerabdruck gegen einen fest hinterlegten Wert (`a6379e7cecc05faa3cbf076013d745e327bbbaa38c0b9af22469d4701d18aabc`) und bricht bei Abweichung ab. Das Zertifikat ist bis März 2041 gültig. |
| eigene URL | Das Skript fragt nach der PEM-Datei des Anbieters und kopiert sie nach `secrets/tsa_ca.pem`. |
| `keiner` (auch `none` oder `-`) | kein Zeitstempeldienst. `secrets/tsa_ca.pem` bleibt leer. |

> **Gut zu wissen:** FreeTSA ist kostenlos, aber **nicht qualifiziert** und ohne Verfügbarkeitszusage. Sie können später jederzeit zu einem qualifizierten Anbieter wechseln, siehe [Kapitel 12](12-konfiguration.md#den-zeitstempeldienst-wechseln).

### Was das Skript danach tut

1. Es prüft die Voraussetzungen: root, `docker`, `docker compose`, `openssl`.
2. Es legt `secrets/` (0700) und `backups/` (0700, Eigentümer UID 1000) an.
3. Es erzeugt, falls nicht vorhanden, den Hauptschlüssel `secrets/master.key` (32 Byte, Base64) und die Wiederherstellungs-Passphrase `secrets/backup_passphrase` (32 Zeichen aus einem Alphabet ohne verwechselbare Zeichen).
4. Es schreibt den Vertrauensanker nach `secrets/tsa_ca.pem` (leer ohne Zeitstempeldienst).
5. Alle drei Dateien erhalten Eigentümer UID 1000 und die Rechte 0400.
6. Fehlt `.env`, kopiert es `.env.example` nach `.env` (0600) und trägt ein: `APP_URL`, `DOMAIN`, `ACME_EMAIL`, einen zufälligen `SETUP_CODE` (16 Hex-Zeichen), `SMTP_URL`, `MAIL_FROM`, `TSA_URL` und `TRUST_PROXY=true`.
7. Es trägt `PARAPH_IMAGE=paraph:<Version>` (falls noch nicht vorhanden) und `COMPOSE_PROFILES` (`caddy` oder leer) in `.env` ein. So startet auch ein späteres `docker compose up -d` genau diesen Stand.
8. Es baut das Image (`docker compose build --pull paraph`), startet alle Dienste (`docker compose up -d`) und wartet bis zu drei Minuten, bis `paraph health` antwortet. Wird Paraph nicht bereit, zeigt es die letzten 50 Protokollzeilen und bricht ab.
9. Es legt `.paraph-install` an (Zeitpunkt und Version). `update.sh` setzt diese Datei voraus.
10. Es führt `paraph doctor --quick` aus.
11. Es zeigt die nächsten Schritte, den Einrichtungscode und, wenn neu erzeugt, die Wiederherstellungs-Passphrase.

Das Skript ändert nichts außerhalb des Projektordners, öffnet keine Firewall-Ports und versendet nichts.

> **Wichtig:** Übernehmen Sie die angezeigte Wiederherstellungs-Passphrase sofort in einen Passwortmanager oder Tresor, nicht nur auf diesem Server. Mit ihr lässt sich jede Sicherung samt Hauptschlüssel auf einem neuen Server wiederherstellen. Ohne Passphrase und ohne `secrets/master.key` sind Sicherungen und Dokumente unlesbar. Einzelheiten: [Kapitel 13](13-sicherung-und-updates.md#hauptschlüssel-und-passphrase-aufbewahren).

### Ohne Rückfragen installieren

Alle Antworten lassen sich vorgeben. Die Variablen stehen hinter `sudo`, damit sie das Skript erreichen:

```sh
sudo PARAPH_NONINTERACTIVE=1 \
     PARAPH_DOMAIN=sign.firma.example \
     PARAPH_USE_CADDY=ja \
     PARAPH_ACME_EMAIL=it@firma.example \
     PARAPH_SMTP_URL='smtps://benutzer:passwort@smtp.example.org:465' \
     PARAPH_MAIL_FROM='Firma Muster <signatur@firma.example>' \
     PARAPH_TSA_URL=freetsa \
     ./scripts/install.sh
```

| Variable | Zweck |
|---|---|
| `PARAPH_NONINTERACTIVE=1` | keine Rückfragen. Fehlende Angaben erhalten die Vorgabe aus der Tabelle oben; fehlt eine Pflichtangabe (Domain, mit Caddy die Let's-Encrypt-Adresse), bricht das Skript ab. |
| `PARAPH_DOMAIN`, `PARAPH_USE_CADDY`, `PARAPH_ACME_EMAIL`, `PARAPH_SMTP_URL`, `PARAPH_MAIL_FROM`, `PARAPH_TSA_URL` | Antworten auf die Fragen. Ohne `PARAPH_TSA_URL` gilt `freetsa`; `keiner` schaltet den Zeitstempeldienst ab. |
| `PARAPH_TSA_CA_FILE` | PEM-Datei des Zeitstempeldienstes bei eigener `PARAPH_TSA_URL` |
| `PARAPH_APP_URL` | abweichende öffentliche Adresse (Vorgabe `https://<Domain>`) |
| `PARAPH_EXTRA_ENV` | weitere Zeilen, die an eine **neu angelegte** `.env` angehängt werden |
| `PARAPH_SKIP_BUILD=1` | nicht bauen, sondern das Image aus `PARAPH_IMAGE` verwenden. Es muss lokal vorhanden sein. |
| `PARAPH_ALLOW_NONROOT=1` | ohne root ausführen. Die Schlüssel gehören dann nicht UID 1000. Nur für Tests. Unter Linux bricht das Skript ab, wenn das Konto nicht UID 1000 hat, weil der Container die Schlüssel sonst nicht lesen kann. |
| `PARAPH_QUIET_SECRETS=1` | die Wiederherstellungs-Passphrase am Ende nicht anzeigen, sondern nur ihren Ablageort nennen. Gedacht für Installationen durch einen Assistenten wie Claude Code ([Kapitel 18](18-installation-mit-claude-code.md)). |

### install.sh erneut aufrufen

Ein zweiter Aufruf überschreibt weder `secrets/master.key` noch `secrets/backup_passphrase` noch `.env`. Er prüft, baut und startet. Beachten Sie dabei:

- Bei vorhandener `.env` schreibt das Skript `APP_URL`, `DOMAIN`, `ACME_EMAIL`, `SMTP_URL`, `MAIL_FROM` und `TSA_URL` **nicht** neu. Es setzt nur `COMPOSE_PROFILES` (bei „Caddy: ja“) und gegebenenfalls `PARAPH_IMAGE`.
- Nach dem Zeitstempeldienst fragt das Skript nicht erneut. `TSA_URL` in `.env` und `secrets/tsa_ca.pem` bleiben unverändert, damit Dienst und Vertrauensanker zusammenpassen. Gesetzte `PARAPH_TSA_URL` oder `PARAPH_TSA_CA_FILE` ignoriert es mit einer Warnung. Einen Anbieterwechsel beschreibt [Kapitel 14](14-sicherheit-und-nachweis.md#zu-einem-qualifizierten-anbieter-wechseln).
- Rechte und Eigentümer der drei Dateien in `secrets/` werden neu gesetzt.

### init.sh nicht mehr verwenden

`scripts/init.sh` stammt aus Version 0.1.0. Es erzeugt keine Wiederherstellungs-Passphrase und keinen Vertrauensanker, setzt die Schlüsseldatei ohne root auf 0444 (für alle lokalen Konten lesbar) und trägt weder `PARAPH_IMAGE` noch `COMPOSE_PROFILES` ein. `docker-compose.yml` verlangt ab 0.2.0 die Dateien `secrets/backup_passphrase` und `secrets/tsa_ca.pem`. Verwenden Sie für neue Installationen `install.sh`. Wie Sie eine alte Installation umstellen, steht in [Kapitel 13](13-sicherung-und-updates.md#eine-installation-aus-010-umstellen).

## Das fertige Image von GitHub verwenden

Der GitHub-Workflow (`.github/workflows/ci.yml`) baut nach erfolgreichen Tests und einem Rauchtest ein Image für amd64 und arm64 und veröffentlicht es öffentlich unter [`ghcr.io/pbaumfalk/paraph`](https://github.com/PBaumfalk/Paraph/pkgs/container/paraph). Eine Anmeldung bei GitHub ist zum Herunterladen nicht nötig.

| Tag | Inhalt | Wofür |
|---|---|---|
| `0.3.0`, `0.3` | Freigabe aus einem Git-Tag `v0.3.0` | Betrieb |
| `latest` | die letzte Freigabe | Ausprobieren |
| `main` | der aktuelle Stand von `main`, nach jeder Änderung neu | Testen neuer Funktionen vor der nächsten Freigabe |
| `main-<Commit>` | ein bestimmter Stand von `main`, z. B. `main-424bd3f` | Zurückverfolgen eines Testbetriebs |

Verwenden Sie für den Betrieb einen Versions-Tag. `main` kann Änderungen enthalten, die noch nicht freigegeben sind. Die Versionsnummer im Image ist dann noch die der letzten Freigabe.

Erstinstallation mit dem fertigen Image:

```sh
sudo docker pull ghcr.io/pbaumfalk/paraph:0.3.0
sudo PARAPH_SKIP_BUILD=1 \
     PARAPH_EXTRA_ENV='PARAPH_IMAGE=ghcr.io/pbaumfalk/paraph:0.3.0' \
     ./scripts/install.sh
```

`PARAPH_EXTRA_ENV` wirkt nur, wenn `.env` neu angelegt wird. Bei vorhandener `.env` tragen Sie `PARAPH_IMAGE` selbst ein. Wie `update.sh` mit fertigen Images umgeht, steht in [Kapitel 13](13-sicherung-und-updates.md#ein-fertiges-image-einspielen).

## Das Ergebnis prüfen

`docker-compose.yml` startet diese Dienste:

| Dienst | Aufgabe | Netz |
|---|---|---|
| `paraph` | die Anwendung. Port `127.0.0.1:8080` auf dem Host (`BIND`, `HOST_PORT`) | `frontend` und `convert` |
| `gotenberg` | Umwandlung Word/ODT/RTF → PDF, Image `gotenberg/gotenberg:8.38.1`, JavaScript in Chromium abgeschaltet | nur `convert` (intern, ohne Internetzugang, ohne Zugriff auf Paraph-Daten) |
| `caddy` | nur mit Profil `caddy`: HTTPS auf Port 80 und 443 (TCP und UDP), Image `caddy:2.10.2-alpine` | `frontend` |

Der Paraph-Container läuft als UID 1000 mit schreibgeschütztem Dateisystem, ohne Linux-Capabilities (`cap_drop: ALL`), mit `no-new-privileges` und höchstens 256 Prozessen. Schreibbar sind nur das Volume `paraph-data` (`/data`), der Sicherungsordner (`/backups`) und `/tmp` (tmpfs, 256 MB). Der Healthcheck im Image ruft alle 30 Sekunden `paraph health` auf. Protokolle rotiert Docker (10 MB, fünf Dateien).

Hauptschlüssel, Passphrase und Vertrauensanker bindet Compose als Docker-Secrets ein (`/run/secrets/master_key`, `/run/secrets/backup_passphrase`, `/run/secrets/tsa_ca`). Sie stehen nicht in `.env` und erscheinen nicht in `docker inspect`.

Ohne Gotenberg (oder ohne `GOTENBERG_URL`) nimmt Paraph nur PDF an.

```sh
docker compose ps
docker compose logs -f paraph
docker compose exec paraph paraph doctor
```

Was `paraph doctor` prüft, erklärt [Kapitel 15](15-diagnose-und-fehlersuche.md).

## Einen Reverse Proxy einrichten

Paraph bindet auf dem Host nur an `127.0.0.1`. HTTPS übernimmt ein Reverse Proxy.

### Den mitgelieferten Caddy nutzen

Mit „Caddy mitstarten: ja“ steht `COMPOSE_PROFILES=caddy` in `.env`. Caddy verwendet `docker/Caddyfile`. Er

- holt das Zertifikat für `DOMAIN` bei Let's Encrypt (Kontaktadresse `ACME_EMAIL`) und leitet HTTP auf HTTPS um,
- lässt Anfragen bis 64 MB zu (Paraph begrenzt zusätzlich, siehe unten),
- reicht Server-Sent Events ungepuffert durch (`flush_interval -1`),
- komprimiert Antworten (zstd, gzip),
- setzt HSTS und entfernt den `Server`-Header,
- setzt `X-Forwarded-For` selbst auf die echte Client-Adresse. Das entspricht `TRUST_PROXY=true` (ein Hop).
- schreibt Signaturlinks, Einladungs- und Rücksetztokens in Pfaden (`/s/`, `/embed/s/`, `/invite/`, `/reset/`, `/f/`) nur gekürzt ins Zugriffsprotokoll und entfernt `Cookie` und `Authorization`.

Andere Host-Ports (z. B. für Tests) setzen Sie mit `CADDY_HTTP_PORT` und `CADDY_HTTPS_PORT`. Für Let's Encrypt müssen 80 und 443 aus dem Internet erreichbar sein.

### Einen eigenen Proxy betreiben

Beachten Sie:

- **Anfragegröße:** Paraph nimmt beim Anlegen eines Vorgangs und beim Hinzufügen von Dokumenten über die API bis zu 60 MB je Anfrage an (Dokumente als Base64), ebenso bei der Siegelprüfung in der Prüfstelle. Der Proxy muss das zulassen. Einzelne Dateien begrenzt `MAX_UPLOAD_MB` (Vorgabe 25).
- **Client-IP:** Der Proxy muss `X-Forwarded-For` setzen. `TRUST_PROXY=true` bedeutet genau **einen** vertrauenswürdigen Proxy-Hop: Paraph nimmt den Eintrag, den Ihr Proxy angehängt hat. Weiter links stehende Einträge kann der Client frei wählen; sie werden ignoriert. Bei zwei Proxys hintereinander (z. B. CDN und nginx) setzen Sie `TRUST_PROXY=2` oder die Adressen bzw. Netze der Proxys. Siehe [Kapitel 12](12-konfiguration.md#grundeinstellungen).
- **Ohne korrekte Client-IP** steht im Audit-Trail die Adresse des Proxys, und alle Nutzer teilen sich die Anfragebegrenzung der API (600 Anfragen je Minute und Adresse).
- **`TRUST_PROXY` nur setzen**, wenn der Container ausschließlich über den Proxy erreichbar ist. Sonst kann ein Client seine IP im Audit-Trail fälschen und Rate-Limits umgehen.
- **Live-Aktualisierung:** `/api/v1/events` ist ein Server-Sent-Events-Strom. Der Proxy darf ihn nicht puffern und nicht nach kurzer Zeit trennen.
- **Sicherheits-Header:** Paraph setzt selbst `Content-Security-Policy`, `X-Frame-Options`, HSTS (sobald `APP_URL` mit `https://` beginnt) und weitere Header. Für die Einbettung (`/embed/s/`) erlaubt die CSP gezielt die eingetragenen Herkünfte. Überschreiben Sie diese Header im Proxy nicht.

#### nginx

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name sign.firma.example;

    ssl_certificate     /etc/letsencrypt/live/sign.firma.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sign.firma.example/privkey.pem;

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
    server_name sign.firma.example;
    return 301 https://$host$request_uri;
}
```

#### Caddy außerhalb von Docker

```caddy
sign.firma.example {
	request_body {
		max_size 60MB
	}
	reverse_proxy 127.0.0.1:8080 {
		flush_interval -1
	}
}
```

#### Traefik

Beispiel für den Datei-Provider (dynamische Konfiguration). Traefik begrenzt die Anfragegröße nicht, solange Sie keine `buffering`-Middleware einsetzen, und hängt `X-Forwarded-For` selbst an. Läuft Traefik selbst in einem Container, erreicht er `127.0.0.1:8080` des Hosts nicht; dann setzen Sie `BIND` passend oder hängen Traefik an das Netz `frontend` und verwenden `http://paraph:8080`. Dieses Beispiel ist nicht automatisiert getestet.

```yaml
http:
  routers:
    paraph:
      rule: Host(`sign.firma.example`)
      entryPoints: [websecure]
      service: paraph
      tls:
        certResolver: letsencrypt
  services:
    paraph:
      loadBalancer:
        servers:
          - url: http://127.0.0.1:8080
```

## Firewall und Erreichbarkeit festlegen

### Eingehende Verbindungen

| Port | Wofür |
|---|---|
| 443/tcp (und 443/udp für HTTP/3 mit Caddy) | Zugriff auf Paraph |
| 80/tcp | Let's-Encrypt-Prüfung und Weiterleitung auf HTTPS |
| 8080 | **nicht** öffnen. Paraph lauscht nur auf `127.0.0.1` (`BIND`). |

### Öffentlich nötige Pfade

Unterzeichnende und andere Beteiligte rufen Paraph ohne Anmeldung auf. Diese Pfade müssen aus dem Internet erreichbar sein (geprüft in `src/web/App.tsx`, `src/server/app.ts` und `src/server/routes/sign.ts`, `public.ts`):

| Pfad | Wer braucht ihn |
|---|---|
| `/s/<Token>` | Signaturseite für Unterzeichner |
| `/embed/s/<Token>` | eingebettete Signaturseite |
| `/f/<Kennung>` | öffentliche Formulare |
| `/verify` | Prüfstelle |
| `/api/sign/…` | alle Aufrufe der Signaturseite (Öffnen, Einmalcode, Felder, Unterschrift, Anhänge, Abschluss, Ablehnen, Vertretung, Download) |
| `/api/public/…` | Prüfstelle (`/api/public/verify/hash`, `/api/public/verify/signature`), Formulare (`/api/public/forms/…`) und das Logo der Organisation (`/api/public/orgs/<id>/logo`) |
| `/assets/…` | Programmcode, Schriften und Styles der Oberfläche |
| `/favicon.svg` | Symbol im Browser-Tab |
| `/api/health`, `/api/health/ready` | nur für externes Monitoring. Die öffentlichen Seiten rufen sie nicht auf. |

Die Seiten `/s/`, `/embed/s/`, `/f/` und `/verify` liefert Paraph als dieselbe Oberfläche aus (`index.html`); dafür ist kein weiterer Pfad nötig.

### Nur für die Organisation nötige Pfade

Alle übrigen Pfade braucht nur das Team. Dazu gehören `/`, `/login`, `/setup`, `/envelopes/…`, `/templates`, `/forms`, `/activity`, `/settings/…`, `/api/auth/…` (Anmeldung, auch der OIDC-Rücksprung `/api/auth/oidc/callback`), `/api/v1/…` (Oberfläche, REST-API, Live-Strom `/api/v1/events`) und `/docs/api`. Einladungen und Passwort-Rücksetzungen verlinken auf `/invite/<Token>` und `/reset/<Token>`; diese Pfade müssen für neue Teammitglieder erreichbar sein, wo immer sie die E-Mail öffnen. `/metrics` braucht nur Ihr Monitoring (siehe [Kapitel 12](12-konfiguration.md#monitoring)).

Wenn Sie die Verwaltung nur aus dem internen Netz Ihrer Organisation zulassen wollen, beschränken Sie diese Pfade im Proxy. Beispiel für nginx (nicht automatisiert getestet; Netze anpassen):

```nginx
# im http-Block
geo $paraph_intern {
    default        0;
    10.0.0.0/8     1;
    192.168.0.0/16 1;
}
map $uri $paraph_oeffentlich {
    default                   0;
    ~^/(s|embed/s|f)/         1;
    /verify                   1;
    ~^/api/(sign|public)/     1;
    ~^/assets/                1;
    /favicon.svg              1;
}
map "$paraph_oeffentlich$paraph_intern" $paraph_erlaubt {
    "00"    0;
    default 1;
}

# im server-Block, vor proxy_pass
if ($paraph_erlaubt = 0) { return 403; }
```

Externe Werkzeuge, die die REST-API nutzen (z. B. n8n oder Make in der Cloud), brauchen dann eine eigene Freigabe für `/api/v1/`.

### Ausgehende Verbindungen

| Ziel | Wofür |
|---|---|
| SMTP-Server (465 oder 587) | E-Mail-Versand |
| Zeitstempeldienst, z. B. `https://freetsa.org/tsr` | Siegel und Verankerung |
| Let's Encrypt | Zertifikat (nur Caddy) |
| OIDC-Anbieter, S3-Speicher, SMS-Gateway | nur wenn eingerichtet |
| Webhook-Ziele | nur wenn eingerichtet; interne Ziele nur mit `WEBHOOK_ALLOW_HOSTS` |
| `ghcr.io`, Docker Hub, Paketquellen | Images und Build |

Gotenberg hat keinen Internetzugang (Netz `convert` ist `internal`).

## Eine eigene Domain je Organisation einrichten

Jede Organisation kann eine eigene Domain erhalten (Einstellungen → Organisation, z. B. `unterschrift.firma-b.example`, siehe [Kapitel 8](08-organisation-team-erscheinungsbild.md)). Dann gilt:

- Links in E-Mails an Unterzeichner verwenden diese Domain.
- Anfragen von dieser Domain gelten als zulässige Herkunft (Origin-Prüfung).
- Das Protokoll (http oder https) übernimmt Paraph aus `APP_URL`.
- Jede Domain darf nur einer Organisation zugeordnet sein.
- Die Anmeldung per OIDC nutzt immer `APP_URL` als Rücksprungadresse.

Die Domain richten Sie selbst ein: DNS-Eintrag auf den Server und ein zusätzlicher Eintrag im Reverse Proxy, der ebenfalls an Paraph weiterleitet. Der mitgelieferte `docker/Caddyfile` kennt nur `DOMAIN`; für weitere Domains ergänzen Sie dort einen eigenen Block nach demselben Muster.

## Die Ersteinrichtung abschließen

1. Öffnen Sie `https://IHRE-DOMAIN/setup`.
2. Geben Sie den Einrichtungscode ein. `install.sh` zeigt ihn am Ende an; er steht auch in `.env` (`SETUP_CODE`). Ist dort keiner gesetzt, erzeugt Paraph einen und schreibt ihn beim Start ins Protokoll. Anzeigen lässt er sich auch so:
   ```sh
   docker compose exec paraph paraph setup-code
   ```
3. Geben Sie Organisationsname, Ihren Namen, E-Mail-Adresse und ein Passwort mit mindestens 10 Zeichen ein.

Das erste Konto wird **Inhaber** der ersten Organisation und **Instanz-Administrator**. Danach ist `/setup` wirkungslos; der Code wird nicht mehr akzeptiert. Solange kein Konto existiert, meldet die Betriebsdiagnose „Ersteinrichtung“ als Hinweis.

Anschließend empfohlen:

- Einstellungen → System → „Tiefenprüfung“ und „Test-E-Mail senden“
- Zwei-Faktor-Anmeldung für das eigene Konto einschalten (Einstellungen → Profil und Sicherheit, siehe [Kapitel 9](09-anmeldung-und-sso.md))
- Link zu den Datenschutzhinweisen eintragen (Einstellungen → Organisation)
- Erscheinungsbild und E-Mail-Absender einstellen ([Kapitel 8](08-organisation-team-erscheinungsbild.md))
- eine Sicherung erstellen und prüfen ([Kapitel 13](13-sicherung-und-updates.md))

![Einstellungen → System mit Diagnose, Test-E-Mail und Sicherung](bilder/einst-system.png)

## Den Betrieb abnehmen

Vor dem Produktivbetrieb empfiehlt `docs/STATUS-0.2.0.md` diesen Abnahmelauf:

1. `paraph doctor` meldet keinen Fehler („FEHL“), und `TSA_URL` ist gesetzt.
2. Eine Test-E-Mail an ein externes Postfach (z. B. Gmail oder Outlook) senden und in den Kopfzeilen `dkim=pass`, `spf=pass` und `dmarc=pass` prüfen. SPF, DKIM und DMARC richten Sie beim Mailanbieter ein.
3. Einen Vorgang im Testmodus und einen echten Vorgang an sich selbst senden; das fertige PDF in Adobe Reader öffnen.
4. `paraph backup` ausführen, die Sicherung auf ein zweites System kopieren und dort `restore.sh` einmal durchspielen ([Kapitel 13](13-sicherung-und-updates.md#einen-restore-test-durchführen)).

> **Stand:** Die Erstinstallation mit `scripts/install.sh` auf einem echten Linux-Server mit eigener Domain war am 20.11.2026 erfolgreich (Rückmeldung aus dem Betrieb). Damit ist die Installation selbst geprüft. Die übrigen Punkte dieser Abnahme sind dadurch nicht einzeln belegt, insbesondere SPF, DKIM und DMARC (Punkt 2), die Wiederherstellung auf einem zweiten System (Punkt 4) und die Zertifikatsausstellung durch Let's Encrypt. Arbeiten Sie diese Punkte bei Ihrer Installation selbst ab. Siehe auch [Kapitel 17](17-grenzen.md).

---

← [10. Anbindung: API und Webhooks](10-anbindung-api-webhooks.md) · [Inhalt](README.md) · [12. Konfiguration](12-konfiguration.md) →
