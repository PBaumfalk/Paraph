# 2. Installation

## Voraussetzungen

- Linux-Server (amd64 oder arm64) mit Docker und Docker Compose v2 (`docker compose`)
- `openssl` für `scripts/init.sh`
- 2 GB RAM frei: Paraph und Gotenberg sind in `docker-compose.yml` auf je 1 GB begrenzt
- eine Domain und ein Reverse Proxy mit TLS-Zertifikat (Caddy, nginx oder Traefik)
- ein SMTP-Konto für den Versand der Einladungen
- optional: SMS-Gateway, Zeitstempeldienst (TSA), OIDC-Anbieter, S3-Speicher

Für den Betrieb ohne Docker ist Node.js 24 nötig (`package.json`: `"node": ">=24"`). Dieses Handbuch beschreibt nur den Docker-Betrieb.

## Schritt 1: Vorbereiten mit `init.sh`

```sh
cd paraph
./scripts/init.sh
```

Das Skript

1. legt `secrets/` und `backups/` an,
2. erzeugt den Hauptschlüssel `secrets/master.key` (32 Byte, Base64), falls er fehlt,
3. kopiert `.env.example` nach `.env`, falls `.env` fehlt, und trägt einen zufälligen `SETUP_CODE` ein,
4. setzt den Eigentümer von `backups/` auf UID 1000 (der Container läuft als Benutzer `node`) und macht den Schlüssel lesbar für den Container (`0444`).

Ein erneuter Aufruf überschreibt weder Schlüssel noch `.env`.

**Sichern Sie `secrets/master.key` sofort an einem zweiten Ort, getrennt von den Sicherungen** (z. B. Passwortmanager). Ohne diesen Schlüssel sind alle gespeicherten Dokumente unlesbar, auch aus einer Sicherung.

## Schritt 2: `.env` anpassen

Mindestens:

```ini
APP_URL=https://sign.kanzlei.example
TRUST_PROXY=true
SMTP_URL=smtps://benutzer:passwort@smtp.example.org:465
MAIL_FROM="Kanzlei Muster <signatur@kanzlei.example>"
```

Alle Variablen: [Kapitel 3](03-konfiguration.md).

## Schritt 3: Starten

```sh
docker compose up -d
docker compose ps
docker compose logs -f paraph
```

`docker-compose.yml` startet zwei Dienste:

| Dienst | Aufgabe | Netz |
|---|---|---|
| `paraph` | Anwendung, Port `127.0.0.1:8080` | `frontend` und `convert` |
| `gotenberg` | Umwandlung Word/ODT/RTF → PDF | nur `convert` (intern, ohne Internetzugang) |

Der Paraph-Container läuft als UID 1000 mit schreibgeschütztem Dateisystem, ohne Linux-Capabilities und mit `no-new-privileges`. Schreibbar sind nur das Volume `paraph-data` (`/data`), der Sicherungsordner (`/backups`) und `/tmp` (tmpfs, 128 MB). Der Healthcheck ruft `paraph health` auf.

Ohne Gotenberg (oder ohne `GOTENBERG_URL`) nimmt Paraph nur PDF an.

## Reverse Proxy

Paraph bindet standardmäßig nur an `127.0.0.1`. Der Proxy übernimmt TLS und leitet an `127.0.0.1:8080` weiter. Beachten Sie:

- **Body-Größe:** Die API nimmt beim Anlegen eines Vorgangs bis zu 60 MB je Anfrage an (Dokumente als Base64). Der Proxy muss das zulassen.
- **Client-IP:** Der Proxy muss `X-Forwarded-For` setzen, und in `.env` muss `TRUST_PROXY=true` stehen. Sonst steht im Audit-Trail die IP des Proxys.
- **Live-Aktualisierung:** `/api/v1/events` ist ein Server-Sent-Events-Strom. Der Proxy darf ihn nicht puffern.
- `TRUST_PROXY=true` nur setzen, wenn der Container ausschließlich über den Proxy erreichbar ist. Sonst kann ein Client seine IP im Audit-Trail fälschen und Rate-Limits umgehen.

### Caddy

```caddy
sign.kanzlei.example {
	request_body {
		max_size 60MB
	}
	reverse_proxy 127.0.0.1:8080
}
```

Caddy holt das Zertifikat selbst, setzt `X-Forwarded-For` und reicht Server-Sent Events ungepuffert durch.

### nginx

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

HSTS setzt Paraph selbst, sobald `APP_URL` mit `https://` beginnt.

## Ersteinrichtung

1. `https://IHRE-DOMAIN/setup` öffnen.
2. Den Einrichtungscode eingeben. Er steht in `.env` (`SETUP_CODE`). Ist dort keiner gesetzt, erzeugt Paraph einen und schreibt ihn ins Log; anzeigen mit
   ```sh
   docker compose exec paraph paraph setup-code
   ```
3. Organisationsname, eigener Name, E-Mail und Passwort (mindestens 10 Zeichen) eingeben.

Das erste Konto wird **Inhaber** der ersten Organisation und **Instanz-Administrator**. Danach ist `/setup` wirkungslos; der Code wird nicht mehr akzeptiert.

Anschließend empfohlen:

- Zwei-Faktor für das eigene Konto einschalten (Einstellungen → Profil und Sicherheit)
- Branding und E-Mail-Absender einstellen ([Kapitel 4](04-administration.md))
- eine Testsignatur an die eigene Adresse senden und prüfen, ob die E-Mail ankommt
- eine Sicherung erstellen und probeweise prüfen ([Kapitel 6](06-sicherung.md))

## Updates

1. Vorher sichern:
   ```sh
   docker compose exec paraph paraph backup
   ```
2. Neue Fassung holen und bauen bzw. ziehen:
   ```sh
   git pull            # wenn Sie aus dem Quellcode bauen
   docker compose build
   # oder bei einem fertigen Image (PARAPH_IMAGE): docker compose pull
   docker compose up -d
   ```
3. Log prüfen: `docker compose logs -f paraph`

Datenbank-Migrationen laufen beim Start automatisch. Ein Zurückspielen auf eine ältere Version ist nur über eine Sicherung möglich; `verify-backup` lehnt Sicherungen aus einer neueren Schemaversion ab.

## Eigene Domain je Organisation

Jede Organisation kann eine eigene Domain erhalten (Einstellungen → Organisation, z. B. `unterschrift.kanzlei-b.example`). Dann gilt:

- Links in E-Mails an Unterzeichner verwenden diese Domain.
- Anfragen von dieser Domain gelten als zulässige Herkunft (Origin-Prüfung).
- Das Protokoll (http/https) übernimmt Paraph aus `APP_URL`.

Sie müssen die Domain selbst einrichten: DNS-Eintrag auf den Server und einen zusätzlichen Eintrag im Reverse Proxy, der ebenfalls an `127.0.0.1:8080` weiterleitet. Jede Domain darf nur einer Organisation zugeordnet sein.

Anmeldung per OIDC nutzt immer `APP_URL` als Rücksprungadresse.
