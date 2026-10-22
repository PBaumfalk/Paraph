# 3. Konfiguration

Paraph liest seine Einstellungen ausschließlich aus Umgebungsvariablen (`src/server/config.ts`). Bei Docker stehen sie in `.env`; `docker-compose.yml` setzt einige Werte fest.

## Geheimnisse aus Dateien (`*_FILE`)

Jede Variable, die über `config.ts` gelesen wird, lässt sich auch aus einer Datei laden: `NAME_FILE=/pfad/zur/datei`. Paraph liest dann den Dateiinhalt (ohne Zeilenumbruch am Ende) und ignoriert `NAME`. So kommen Passwörter nicht in `.env` oder in `docker inspect`. Beispiel: `SMTP_URL_FILE=/run/secrets/smtp_url`.

Leere Werte (`SMTP_URL=`) gelten als nicht gesetzt. Ja/Nein-Werte akzeptieren `1`, `true`, `yes`, `ja`, `on`.

## Grundeinstellungen

| Variable | Standard | Zweck |
|---|---|---|
| `APP_URL` | `http://localhost:8080` | Öffentliche Adresse. In Docker Pflicht (`docker-compose.yml` bricht sonst ab). Links in E-Mails, OIDC-Rücksprung, sichere Cookies und HSTS hängen davon ab. Mit `https://` angeben. |
| `HOST` | `0.0.0.0` | Adresse, an die der Server im Container bindet. |
| `PORT` | `8080` | Port im Container. |
| `DATA_DIR` | `./data` (im Image `/data`) | Datenbank `paraph.db` und verschlüsselte Dateien `blobs/`. |
| `TRUST_PROXY` | `false` | Client-IP aus `X-Forwarded-For` übernehmen. Nur hinter einem Reverse Proxy setzen. |
| `LOG_LEVEL` | `info` | Protokollstufe (`fatal`, `error`, `warn`, `info`, `debug`, `trace`). |
| `MAX_UPLOAD_MB` | `25` | Höchstgröße einer hochgeladenen Datei. |
| `MAX_PAGES` | `500` | Höchstzahl Seiten je Dokument. |
| `SETUP_CODE` | – | Einrichtungscode für `/setup`. Fehlt er, erzeugt Paraph einen und schreibt ihn ins Log. Nach der Einrichtung wirkungslos. |
| `DEV_MODE` | `false` | Nur Entwicklung. Schreibt ohne SMTP die Links aus E-Mails ins Log. **Nie produktiv verwenden**, da die Links Zugang zu Vorgängen gewähren. |

## Hauptschlüssel

| Variable | Standard | Zweck |
|---|---|---|
| `MASTER_KEY` | – | 32 Byte als Base64 (`openssl rand -base64 32`). Aus ihm leitet Paraph alle Teilschlüssel für die Verschlüsselung ab. |
| `MASTER_KEY_FILE` | in Docker `/run/secrets/master_key` | Datei mit dem Hauptschlüssel. `docker-compose.yml` bindet `secrets/master.key` als Docker-Secret ein. |

Ist keins von beiden gesetzt, erzeugt Paraph einmalig `DATA_DIR/secrets/master.key` und warnt im Log. Dieser Schlüssel liegt dann im Datenvolume und ist **nicht** Teil der Sicherung. Für den Produktivbetrieb `MASTER_KEY_FILE` verwenden.

## E-Mail

| Variable | Standard | Zweck |
|---|---|---|
| `SMTP_URL` | – | SMTP-Zugang als URL, z. B. `smtps://benutzer:passwort@smtp.example.org:465` oder `smtp://host:587`. Ohne SMTP versendet Paraph keine E-Mails; Einladungslinks für neue Teammitglieder zeigt die Oberfläche dann direkt an. |
| `MAIL_FROM` | `Paraph <no-reply@localhost>` | Absender. Wirkt nur mit `SMTP_URL`. Absendername und Antwortadresse lassen sich je Organisation im Branding überschreiben. |

SPF, DKIM und DMARC für die Absenderdomain richten Sie beim Mailanbieter ein.

## Dokumentenumwandlung und Zeitstempel

| Variable | Standard | Zweck |
|---|---|---|
| `GOTENBERG_URL` | – (in Docker `http://gotenberg:3000`) | Gotenberg-Dienst für Word/DOC/ODT/RTF → PDF. Fehlt er, nimmt Paraph nur PDF an. |
| `TSA_URL` | – | RFC-3161-Zeitstempeldienst für das Plattformsiegel, z. B. `https://freetsa.org/tsr`. An den Dienst geht nur ein Hashwert. Ist der Dienst nicht erreichbar, wird ohne Zeitstempel versiegelt (PAdES-B-B statt B-T). |

## Webhooks

| Variable | Standard | Zweck |
|---|---|---|
| `WEBHOOK_ALLOW_HOSTS` | – | Kommagetrennte Hostnamen oder IPs, die trotz SSRF-Schutz erreichbar sein dürfen, z. B. `n8n.lan,192.168.1.20`. Für diese Hosts ist auch `http://` erlaubt. |
| `WEBHOOK_ALLOW_PRIVATE_NETWORKS` | `false` | Schaltet den Schutz vor internen Zielen vollständig ab. Nicht empfohlen; besser einzelne Hosts freigeben. |

## Anmeldung per OIDC (z. B. authentik)

| Variable | Standard | Zweck |
|---|---|---|
| `OIDC_ISSUER` | – | Issuer-URL des Anbieters. Schaltet OIDC ein. |
| `OIDC_CLIENT_ID` | leer | Client-ID. |
| `OIDC_CLIENT_SECRET` | leer | Client-Secret. |
| `OIDC_NAME` | `SSO` (`.env.example`: `authentik`) | Beschriftung der Anmeldeschaltfläche. |
| `OIDC_AUTO_CREATE_USERS` | `false` | Unbekannte Personen erhalten beim ersten OIDC-Login ein Konto, aber keine Organisation. |

Details: [Kapitel 4](04-administration.md#anmeldung-per-oidc-authentik).

## S3-Speicher

| Variable | Standard | Zweck |
|---|---|---|
| `S3_BUCKET` | – | Bucket-Name. Schaltet S3 statt lokaler Ablage ein. |
| `S3_ENDPOINT` | – | Endpunkt, z. B. `https://s3.eu-central-1.amazonaws.com` oder ein MinIO-Server. Ohne Angabe: `https://s3.<S3_REGION>.amazonaws.com`. Keine Zugangsdaten in die URL schreiben. |
| `S3_REGION` | `us-east-1` | Region für die SigV4-Signatur. Muss zur Region des Buckets passen (MinIO/Garage: meist `us-east-1` bzw. `garage`). |
| `S3_ACCESS_KEY_ID` | – | Zugangsschlüssel. Pflicht. |
| `S3_SECRET_ACCESS_KEY` | – | Geheimer Schlüssel. Pflicht; besser als Docker-Secret über `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_SESSION_TOKEN` | – | Nur für temporäre Zugangsdaten (STS); wird als `x-amz-security-token` mitsigniert. Läuft das Token ab, schlagen Zugriffe mit „Sitzungstoken abgelaufen“ fehl – Paraph erneuert es nicht selbst. |
| `S3_FORCE_PATH_STYLE` | `true` mit `S3_ENDPOINT`, sonst `false` | Pfadstil (`endpoint/bucket/objekt`), wie bei MinIO, Garage und Ceph üblich. `false` = virtual-hosted (`bucket.endpoint/objekt`), Standard bei AWS. Bucketnamen mit Punkt oder Großbuchstaben werden immer im Pfadstil angesprochen, weil sie nicht zum TLS-Zertifikat der Subdomain passen. |
| `S3_PREFIX` | leer | Schlüsselpräfix im Bucket, z. B. `paraph/`. Erlaubt einen gemeinsamen Bucket für mehrere Dienste und eine auf das Präfix beschränkte Policy. Nachträglich nicht ändern: vorhandene Objekte werden nicht verschoben. |

Dateien werden vor dem Hochladen verschlüsselt (AES-256-GCM, Schlüssel je Datei aus dem Hauptschlüssel abgeleitet); der Bucket enthält nur Chiffrat. Mit S3 enthält die Sicherung nur die Datenbank, nicht die Dateien. Siehe [Kapitel 6](06-sicherung.md#s3).

### Startprüfung und Fehlerverhalten

Beim Start prüft Paraph die Ablage, bevor der Webserver läuft: Bucket auflisten, ein zufälliges Probeobjekt unter `<S3_PREFIX>_paraph-probe/` schreiben, lesen und wieder löschen. Schlägt ein Schritt fehl, bricht der Start mit einer Meldung ab, z. B.

```
S3-Startprüfung fehlgeschlagen (Auflisten, Bucket „paraph“ an s3.example.org): S3: Signatur ungültig – S3_SECRET_ACCESS_KEY prüfen
```

Häufige Ursachen: falscher geheimer Schlüssel (`SignatureDoesNotMatch`), unbekannte Schlüssel-ID (`InvalidAccessKeyId`), falsche Region (`AuthorizationHeaderMalformed`), Bucket fehlt (`NoSuchBucket`; ohne Berechtigung meldet S3 stattdessen `AccessDenied`), Uhrzeit des Servers weicht mehr als 15 Minuten ab (`RequestTimeTooSkewed` – NTP einrichten). Zugangsdaten und der Meldungstext von S3 erscheinen nie in Fehlermeldungen oder im Log.

Im Betrieb wiederholt Paraph Anfragen bei Serverfehlern (5xx, `SlowDown`), Zeitüberschreitung (60 s je Versuch) und Netzwerkfehlern bis zu dreimal mit wachsendem Abstand; 4xx-Fehler werden nicht wiederholt. Uploads tragen `Content-MD5` und `x-amz-content-sha256`; S3 lehnt beschädigte Übertragungen ab. Fehlt ein Objekt, das die Datenbank kennt, lautet die Meldung „Datei fehlt im Speicher“.

### Sicherheitsempfehlungen für den Bucket

- **Privat und ohne öffentlichen Zugriff.** Bei AWS „Block Public Access“ für Bucket und Konto vollständig aktivieren, keine Bucket-ACLs (Object Ownership „Bucket owner enforced“). Bei MinIO keine anonyme Policy (`mc anonymous get` muss `none` zeigen).
- **Eigener Benutzer mit minimalen Rechten** nur für Paraph, nie der Root- oder Admin-Schlüssel. Paraph braucht genau `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` und `s3:ListBucket` – keine Rechte zum Anlegen oder Löschen von Buckets, keine Policy- oder ACL-Rechte.
- **Transportverschlüsselung:** `S3_ENDPOINT` mit `https://`, außer der Speicher läuft im selben abgeschotteten Netz (z. B. MinIO im Docker-Netz). Optional per Policy erzwingen (`aws:SecureTransport`).
- **Versionierung** (optional, empfohlen) schützt vor versehentlichem Löschen und Überschreiben. Paraph löscht Dateien nach Ablauf der Aufbewahrungsfrist; mit Versionierung bleiben alte Versionen bestehen, bis eine Lifecycle-Regel sie entfernt – die Regel passend zur Löschpflicht (DSGVO) wählen, z. B. nicht aktuelle Versionen nach 30 Tagen löschen.
- **Object Lock** (optional, nur bei neu angelegten Buckets mit Versionierung) macht Objekte für eine Frist unveränderbar und schützt so auch gegen Ransomware mit gestohlenen Schlüsseln. Im Modus „Governance“ beginnen; „Compliance“ verhindert jede Löschung vor Fristende, auch die nach Aufbewahrungsfrist.
- **Sicherung:** Die Paraph-Sicherung erfasst den Bucket nicht. Sichern Sie ihn gesondert und zeitlich passend zur Datenbank (Replikation in einen zweiten Bucket/Standort, `mc mirror`, `rclone sync`). Ohne den Hauptschlüssel ist auch die Bucket-Kopie unlesbar – Schlüssel getrennt aufbewahren.

Beispiel-Policy (AWS-IAM-Syntax; MinIO und Ceph RGW verstehen dieselbe Form, Garage vergibt Rechte stattdessen je Schlüssel mit `garage bucket allow --read --write`) für Bucket `kanzlei-paraph` mit `S3_PREFIX=paraph/`. Ohne Präfix die `Condition` weglassen und `paraph/*` durch `*` ersetzen:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ParaphListe",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::kanzlei-paraph"],
      "Condition": { "StringLike": { "s3:prefix": ["paraph/*"] } }
    },
    {
      "Sid": "ParaphObjekte",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::kanzlei-paraph/paraph/*"]
    }
  ]
}
```

MinIO, Benutzer und Policy anlegen:

```bash
mc mb local/kanzlei-paraph
mc admin policy create local paraph-rw paraph-policy.json
mc admin user add local paraph "$(openssl rand -base64 30)"
mc admin policy attach local paraph-rw --user paraph
```

## SMS

| Variable | Standard | Zweck |
|---|---|---|
| `SMS_GATEWAY_URL` | – | HTTP-Endpunkt. Paraph sendet `POST` mit JSON `{"to", "text", "sender"}`. Schaltet die Methode „SMS-Code“ frei. |
| `SMS_GATEWAY_TOKEN` | – | Wird als `Authorization: Bearer …` mitgesendet. |
| `SMS_SENDER` | – | Absenderkennung im Feld `sender`. |

## QES-Anbieter (vorbereitet, nicht funktionsfähig)

| Variable | Standard | Zweck |
|---|---|---|
| `QES_CSC_BASE_URL` | – | Basis-URL einer CSC-Schnittstelle. |
| `QES_PROVIDER_NAME` | `QES-Anbieter` | Anzeigename. |
| `QES_CSC_CLIENT_ID` | leer | Client-ID. |
| `QES_CSC_CLIENT_SECRET` | leer | Client-Secret. |
| `QES_CSC_TOKEN_URL` | – | Token-Endpunkt. |

Diese Werte werden nur gelesen und in der Systemübersicht angezeigt („Anbieter konfiguriert, nicht verifiziert“). Es gibt keine Anbieter-Implementierung. Vorgänge mit Stufe `qes` lassen sich nicht versenden, auch wenn diese Variablen gesetzt sind. Siehe [Kapitel 10](10-einschraenkungen.md).

## Sicherung

| Variable | Standard | Zweck |
|---|---|---|
| `BACKUP_INTERVAL_HOURS` | `24` | Abstand der automatischen Sicherung in Stunden. `0` schaltet sie ab. |
| `BACKUP_KEEP` | `14` | Anzahl aufbewahrter automatischer Sicherungen; ältere werden gelöscht. |
| `BACKUP_DIR` | `DATA_DIR/backups` (in Docker `/backups`) | Zielordner. Wird direkt aus der Umgebung gelesen; `BACKUP_DIR_FILE` wirkt nicht. |

## Nur in `docker-compose.yml`

Diese Variablen wertet Docker Compose aus, nicht Paraph:

| Variable | Standard | Zweck |
|---|---|---|
| `PARAPH_ENV_FILE` | `.env` | Pfad der Umgebungsdatei für den Paraph-Container. |
| `PARAPH_IMAGE` | `paraph:latest` | Image-Name. |
| `BIND` | `127.0.0.1` | Host-Adresse, an die der Port gebunden wird. |
| `HOST_PORT` | `8080` | Port auf dem Host. |
| `BACKUP_PATH` | `./backups` | Host-Ordner, der als `/backups` eingebunden wird. |
| `TZ` | `Europe/Berlin` | Zeitzone des Containers. |
| `MAILPIT_PORT` | `8025` | Nur `docker-compose.test.yml`: Port der Mailpit-Oberfläche. |

## Sonstiges

| Variable | Standard | Zweck |
|---|---|---|
| `PARAPH_BUILD_VERSION` | `0.1.0-dev` | Angezeigte Versionsnummer. Wird direkt aus der Umgebung gelesen. |

## Einstellungen in der Oberfläche

Viele Einstellungen liegen nicht in `.env`, sondern je Organisation in der Datenbank: Sichtbarkeit der Vorgänge, Standard-Ablauf und -Erinnerung, Aufbewahrung, Zeitzone, Sprache, Branding, E-Mail-Texte, eigene Domain, Einbettungs-Herkünfte, Siegelzertifikat. Siehe [Kapitel 4](04-administration.md).
