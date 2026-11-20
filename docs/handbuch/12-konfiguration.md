# 12. Konfiguration

Dieses Kapitel ist die vollständige Referenz aller Umgebungsvariablen und Secrets von Paraph. Es richtet sich an die IT. Maßgeblich ist `src/server/config.ts`; ergänzend lesen einige Programmteile Variablen direkt, sie sind jeweils gekennzeichnet. Variablen, die nur Docker Compose oder die Skripte auswerten, stehen in eigenen Abschnitten.

Einstellungen je Organisation (Erscheinungsbild, Aufbewahrung, Standardwerte, eigene Domain, Siegel) liegen nicht in `.env`, sondern in der Datenbank. Sie werden in der Oberfläche gepflegt, siehe [Kapitel 8](08-organisation-team-erscheinungsbild.md).

## Wie Paraph die Konfiguration liest

- **Umgebungsvariablen:** Paraph liest seine Einstellungen ausschließlich aus der Umgebung. Bei Docker stehen sie in `.env`; `docker-compose.yml` setzt einige Werte fest (siehe [Was docker-compose.yml fest setzt](#was-docker-composeyml-fest-setzt)).
- **Geheimnisse aus Dateien:** Jede Variable, die über `config.ts` gelesen wird, lässt sich auch aus einer Datei laden: `NAME_FILE=/pfad/zur/datei`. Paraph liest dann den Dateiinhalt (ohne Leerraum am Anfang und Ende) und ignoriert `NAME`. Ist die Datei nicht lesbar, startet Paraph nicht. So kommen Passwörter nicht in `.env` oder `docker inspect`. Beispiel: `SMTP_URL_FILE=/run/secrets/smtp_url`.
- **Leere Werte** (`SMTP_URL=`) gelten als nicht gesetzt.
- **Ja/Nein-Werte** akzeptieren `1`, `true`, `yes`, `ja`, `on` (ohne Rücksicht auf Groß- und Kleinschreibung). Alles andere gilt als „nein“.
- **Zahlen:** Ein Wert, der keine Zahl ist, verhindert den Start (`… muss eine Zahl sein`).

Variablen, die Paraph **direkt** aus der Umgebung liest, kennen die `_FILE`-Variante nicht. Das betrifft `SMTP_ALLOW_INSECURE`, `BACKUP_DIR`, `BACKUP_PASSPHRASE`, `PARAPH_BUILD_VERSION` und `PARAPH_DEBUG_PDF`. `BACKUP_PASSPHRASE_FILE` ist selbst ein Dateipfad und funktioniert.

## Änderungen übernehmen

1. `.env` bearbeiten (Rechte 0600 beibehalten).
2. `docker compose up -d` ausführen. Compose erstellt den Paraph-Container mit der geänderten Umgebung neu.
3. Haben Sie nur den Inhalt einer Datei in `secrets/` geändert, erzwingen Sie die Neuerstellung: `docker compose up -d --force-recreate paraph`.
4. Mit `docker compose exec paraph paraph doctor` prüfen.

## Grundeinstellungen

| Variable | Standard | Zweck |
|---|---|---|
| `APP_URL` | `http://localhost:8080` | Öffentliche Adresse. In Docker Pflicht: `docker-compose.yml` bricht ohne sie ab („APP_URL in .env setzen“). Links in E-Mails, OIDC-Rücksprung, sichere Cookies und HSTS hängen davon ab. Mit `https://` angeben; ein Schrägstrich am Ende wird entfernt. Ohne HTTPS meldet die Diagnose einen Fehler (bei `localhost` nur einen Hinweis). |
| `HOST` | `0.0.0.0` | Adresse, an die der Server im Container bindet. |
| `PORT` | `8080` | Port im Container. Auch `paraph health` verwendet ihn. |
| `DATA_DIR` | `./data` (im Image `/data`) | Datenbank `paraph.db`, verschlüsselte Dateien `blobs/`, Kopien vor Migrationen `backups/migrations/`. |
| `TRUST_PROXY` | aus | Client-IP aus `X-Forwarded-For` übernehmen. Nur hinter einem Reverse Proxy setzen. `true` (auch `1`, `yes`, `ja`, `on`) bedeutet genau **einen** vertrauenswürdigen Proxy-Hop, nicht „allen vertrauen“. Alternativ eine Zahl (Anzahl der Hops, z. B. `2` bei CDN und Proxy) oder kommagetrennte Proxy-Adressen bzw. Netze (z. B. `172.16.0.0/12`). `false`, `0`, `no`, `nein`, `off` schalten aus. `install.sh` setzt `true`. |
| `LOG_LEVEL` | `info` | Protokollstufe (`fatal`, `error`, `warn`, `info`, `debug`, `trace`). |
| `MAX_UPLOAD_MB` | `25` | Höchstgröße einer hochgeladenen Datei in MB. |
| `MAX_PAGES` | `500` | Höchstzahl Seiten je Dokument. |
| `SETUP_CODE` | – | Einrichtungscode für `/setup`. Fehlt er, erzeugt Paraph einen, speichert ihn in der Datenbank und schreibt ihn ins Protokoll. Nach der Einrichtung wirkungslos. |

Unabhängig von `MAX_UPLOAD_MB` gelten feste Grenzen je Anfrage: 60 MB beim Anlegen eines Vorgangs und beim Hinzufügen von Dokumenten über die API sowie bei der Siegelprüfung, 12 MB für Anhänge auf der Signaturseite, 10 MB für den Massenversand aus einer Vorlage, 3 MB für Unterschriftsbilder und Logos, sonst 2 MB.

## Hauptschlüssel

| Variable | Standard | Zweck |
|---|---|---|
| `MASTER_KEY` | – | 32 Byte als Base64 (`openssl rand -base64 32`). Aus ihm leitet Paraph alle Teilschlüssel ab. Eine andere Länge verhindert den Start. |
| `MASTER_KEY_FILE` | in Docker `/run/secrets/master_key` | Datei mit dem Hauptschlüssel. `docker-compose.yml` bindet `secrets/master.key` als Docker-Secret ein. |

Ist keins von beiden gesetzt, erzeugt Paraph einmalig `DATA_DIR/secrets/master.key` (0600) und warnt bei jedem Start im Protokoll. Dieser Schlüssel liegt dann im selben Volume wie die Daten; die Diagnose meldet einen Hinweis. Für den Produktivbetrieb verwenden Sie `MASTER_KEY_FILE`. Ist die Schlüsseldatei für alle lesbar, meldet die Diagnose einen Fehler.

Ohne Hauptschlüssel sind Dokumente, Unterschriften, TOTP-Geheimnisse, Webhook-Geheimnisse und der Siegelschlüssel unlesbar. Ob er in der Sicherung enthalten ist, hängt von der Wiederherstellungs-Passphrase ab ([Kapitel 13](13-sicherung-und-updates.md#hauptschlüssel-und-passphrase-aufbewahren)).

## E-Mail

| Variable | Standard | Zweck |
|---|---|---|
| `SMTP_URL` | – | SMTP-Zugang als URL, z. B. `smtps://benutzer:passwort@smtp.example.org:465` (TLS) oder `smtp://benutzer:passwort@host:587` (STARTTLS). Sonderzeichen im Passwort URL-kodieren (z. B. `@` → `%40`). Ohne SMTP versendet Paraph keine E-Mails; Einladungslinks für neue Teammitglieder zeigt die Oberfläche dann direkt an. |
| `MAIL_FROM` | `Paraph <no-reply@localhost>` | Absender. Wirkt nur mit `SMTP_URL`. Absendername und Antwortadresse lassen sich je Organisation unter Einstellungen → Erscheinungsbild und E-Mails überschreiben. |
| `SMTP_ALLOW_INSECURE` | aus | Nur der Wert `true` (genau so) schaltet die Pflicht zur Verschlüsselung ab und erlaubt `rejectUnauthorized=false` in `SMTP_URL`. Direkt gelesen. Nicht produktiv verwenden. |

Verschlüsselung (`src/server/domain/mail.ts`):

- Bei `smtp://` verlangt Paraph STARTTLS. Bietet der Server kein STARTTLS an, schlägt der Versand fehl, statt unverschlüsselt zu senden. Ausnahme: lokale Testserver (`localhost`, `127.0.0.1`, `::1`, `mailpit`, `mailhog`).
- TLS mindestens in Version 1.2; Zertifikate werden geprüft.
- Eine `SMTP_URL` mit `rejectUnauthorized=false` verhindert den Versand, außer `SMTP_ALLOW_INSECURE=true`.
- Zeitlimits: Verbindungsaufbau 15 s, Begrüßung 10 s, Übertragung 30 s; höchstens zwei Verbindungen gleichzeitig.

Fehlerbehandlung:

- Paraph ordnet Fehler ein: Anmeldung, TLS, Verbindung, vorübergehend abgewiesen (4xx) oder dauerhaft abgewiesen (5xx, z. B. unbekannte Empfängeradresse). Die Meldungen enthalten keine Zugangsdaten.
- Vorübergehende Fehler wiederholt Paraph bis zu 8-mal mit wachsendem Abstand. Dauerhafte Fehler werden nicht wiederholt.
- Ist eine E-Mail an Beteiligte endgültig gescheitert, vermerkt Paraph `recipient.delivery_failed` im Audit-Trail, löst den gleichnamigen Webhook aus und benachrichtigt die versendende Person per E-Mail. Der Zustellstatus steht im Vorgang bei der jeweiligen Person.

SPF, DKIM und DMARC für die Absenderdomain richten Sie beim Mailanbieter ein.

## Dokumentumwandlung

| Variable | Standard | Zweck |
|---|---|---|
| `GOTENBERG_URL` | – (in Docker fest `http://gotenberg:3000`) | Gotenberg-Dienst für Word, DOC, ODT und RTF → PDF. Fehlt er, nimmt Paraph nur PDF an. |

## Zeitstempel und Verankerung

| Variable | Standard | Zweck |
|---|---|---|
| `TSA_URL` | – | RFC-3161-Zeitstempeldienst, z. B. der Dienst Ihres Vertrauensdiensteanbieters oder `https://freetsa.org/tsr` (kostenlos, ohne Gewähr, nicht qualifiziert). An den Dienst geht nur ein Hashwert. Verwendet für das Plattformsiegel (PAdES-B-T) und für die externe Verankerung der Audit-Ketten. Ist der Dienst beim Abschluss nicht erreichbar, wird ohne Zeitstempel versiegelt (PAdES-B-B). |
| `TSA_CA` / `TSA_CA_FILE` | in Docker `TSA_CA_FILE=/run/secrets/tsa_ca` | Vertrauensanker des Zeitstempeldienstes als PEM (Wurzel- und gegebenenfalls Zwischenzertifikat vom Anbieter). Ein Wert ohne `BEGIN CERTIFICATE`, also auch eine leere Datei, gilt als nicht eingerichtet. Mit `TSA_URL` **Pflicht**: Ohne ihn melden Diagnose und `paraph verify-audit` einen Fehler, weil sich Zeitstempel sonst von jemandem mit Serverzugriff selbst erzeugen ließen. In Docker liegt die Datei als `secrets/tsa_ca.pem`. Für FreeTSA liegt das Wurzelzertifikat bei (`docker/tsa/freetsa-root-ca.pem`, SHA-256 `a6379e7c…1d18aabc`, gültig bis 2041). |
| `ANCHOR_INTERVAL_MINUTES` | `60` | Abstand der externen Verankerung in Minuten, mindestens 5 (kleinere Werte werden auf 5 angehoben). Zusätzlich wird jeder Abschluss zeitnah verankert. |

Jeden Zeitstempel prüft Paraph vollständig, bevor er zählt: Signatur des Dienstes, Hashwert (Imprint), Nonce der eigenen Anfrage und Verwendungszweck des Zertifikats. Eine Antwort, die nicht zur Anfrage passt, wird verworfen. Hintergründe: [Kapitel 14](14-sicherheit-und-nachweis.md).

### Den Zeitstempeldienst wechseln

So stellen Sie eine bestehende Installation auf einen anderen Dienst um (oder richten nachträglich FreeTSA ein):

1. Das PEM-Zertifikat des Anbieters nach `secrets/tsa_ca.pem` kopieren. Für FreeTSA: `docker/tsa/freetsa-root-ca.pem`.
2. Rechte setzen: `sudo chown 1000:1000 secrets/tsa_ca.pem && sudo chmod 0400 secrets/tsa_ca.pem`.
3. In `.env` `TSA_URL` eintragen, z. B. `TSA_URL="https://freetsa.org/tsr"`.
4. `docker compose up -d --force-recreate paraph`.
5. Einstellungen → System → „Tiefenprüfung“ oder `paraph doctor` ausführen. Die Tiefenprüfung kontaktiert den Zeitstempeldienst.

Zeitstempel und Anker aus der Zeit vor dem Wechsel bleiben gültig, solange ihr Aussteller dem eingetragenen Vertrauensanker entspricht. Wenn Sie den Anbieter wechseln, nehmen Sie beide Zertifikate in dieselbe PEM-Datei auf, damit `paraph verify-audit` auch ältere Anker bestätigt. (Abgeleitet aus der Kettenprüfung; nicht gesondert getestet.)

## Webhooks

| Variable | Standard | Zweck |
|---|---|---|
| `WEBHOOK_ALLOW_HOSTS` | – | Kommagetrennte Hostnamen oder IPs, die trotz SSRF-Schutz erreichbar sein dürfen, z. B. `n8n.lan,192.168.1.20`. Für diese Hosts ist auch `http://` erlaubt. |
| `WEBHOOK_ALLOW_PRIVATE_NETWORKS` | aus | Schaltet den Schutz vor internen Zielen vollständig ab. Nicht empfohlen; besser einzelne Hosts freigeben. |

Ereignisse, Signatur und Wiederholungen der Webhooks beschreibt [Kapitel 10](10-anbindung-api-webhooks.md).

## Anmeldung per OIDC

| Variable | Standard | Zweck |
|---|---|---|
| `OIDC_ISSUER` | – | Issuer-URL des Anbieters. Schaltet OIDC ein. Immer `https://`; `http://` nur für `localhost`, `127.0.0.1`, `[::1]` oder mit `DEV_MODE`. |
| `OIDC_CLIENT_ID` | leer | Client-ID. |
| `OIDC_CLIENT_SECRET` | leer | Client-Secret, besser als `OIDC_CLIENT_SECRET_FILE`. |
| `OIDC_NAME` | `SSO` (`.env.example`: `authentik`) | Beschriftung der Anmeldeschaltfläche („Mit authentik anmelden“). |
| `OIDC_SCOPES` | `openid email profile` | Angeforderte Scopes. Bei authentik enthält `profile` bereits den Claim `groups`. |
| `OIDC_ALLOWED_GROUPS` | leer | Kommagetrennte Gruppennamen. Gesetzt: Anmeldung nur, wenn der Claim `groups` mindestens eine davon enthält. Leer: keine Einschränkung. |
| `OIDC_AUTO_CREATE_USERS` | aus | Unbekannte Personen erhalten beim ersten OIDC-Login ein Konto. |
| `OIDC_DEFAULT_ROLE` | leer | Nur mit `OIDC_AUTO_CREATE_USERS`: neue Konten treten der ältesten Organisation mit dieser Rolle bei. Erlaubt sind nur `member` und `viewer`; andere Werte verhindern den Start. Leer: Beitritt nur per Einladung. |
| `OIDC_TRUST_EMAIL` | aus | Bestehende Konten auch dann per E-Mail verknüpfen, wenn der Anbieter `email_verified` nicht als `true` meldet. Nur setzen, wenn ausschließlich die Verwaltung E-Mail-Adressen im Anbieter pflegt. |

Die Rücksprungadresse beim Anbieter lautet `${APP_URL}/api/auth/oidc/callback`, exakt wie `APP_URL` und ohne Schrägstrich am Ende. Verhalten bei Verknüpfung, Zwei-Faktor und Fehlern sowie die Einrichtung von authentik Schritt für Schritt beschreibt [Kapitel 9](09-anmeldung-und-sso.md).

## S3-Speicher

| Variable | Standard | Zweck |
|---|---|---|
| `S3_BUCKET` | – | Bucket-Name. Schaltet S3 statt lokaler Ablage ein. |
| `S3_ENDPOINT` | – | Endpunkt, z. B. `https://s3.eu-central-1.amazonaws.com` oder ein MinIO-Server. Ohne Angabe: `https://s3.<S3_REGION>.amazonaws.com`. Keine Zugangsdaten in die URL schreiben. |
| `S3_REGION` | `us-east-1` | Region für die SigV4-Signatur. Muss zur Region des Buckets passen (MinIO meist `us-east-1`, Garage meist `garage`). |
| `S3_ACCESS_KEY_ID` | leer | Zugangsschlüssel. Pflicht. |
| `S3_SECRET_ACCESS_KEY` | leer | Geheimer Schlüssel. Pflicht; besser als `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_SESSION_TOKEN` | – | Nur für temporäre Zugangsdaten (STS); wird als `x-amz-security-token` mitsigniert. Läuft das Token ab, schlagen Zugriffe mit „Sitzungstoken abgelaufen“ fehl – Paraph erneuert es nicht selbst. |
| `S3_FORCE_PATH_STYLE` | an mit `S3_ENDPOINT`, sonst aus | Pfadstil (`endpoint/bucket/objekt`), wie bei MinIO, Garage und Ceph üblich. Aus = virtual-hosted (`bucket.endpoint/objekt`), Standard bei AWS. Bucketnamen mit Punkt oder Großbuchstaben werden immer im Pfadstil angesprochen, weil sie nicht zum TLS-Zertifikat der Subdomain passen. |
| `S3_PREFIX` | leer | Schlüsselpräfix im Bucket, z. B. `paraph/`. Erlaubt einen gemeinsamen Bucket für mehrere Dienste und eine auf das Präfix beschränkte Policy. Nachträglich nicht ändern: vorhandene Objekte werden nicht verschoben. |

Dateien werden vor dem Hochladen verschlüsselt (AES-256-GCM, Schlüssel je Datei aus dem Hauptschlüssel abgeleitet); der Bucket enthält nur Chiffrat. Die Sicherung enthält auch bei S3 alle Dokumente ([Kapitel 13](13-sicherung-und-updates.md#s3-speicher-sichern-und-wechseln)).

### Startprüfung und Fehlerverhalten

Beim Start prüft Paraph die Ablage, bevor der Webserver läuft: Bucket auflisten, ein zufälliges Probeobjekt unter `<S3_PREFIX>_paraph-probe/` schreiben, lesen und wieder löschen. Schlägt ein Schritt fehl, bricht der Start mit einer Meldung ab, z. B.

```text
S3-Startprüfung fehlgeschlagen (Auflisten, Bucket „paraph“ an s3.example.org): S3: Signatur ungültig – S3_SECRET_ACCESS_KEY prüfen
```

Häufige Ursachen:

| S3-Fehler | Ursache |
|---|---|
| `SignatureDoesNotMatch` | falscher geheimer Schlüssel |
| `InvalidAccessKeyId` | unbekannte Schlüssel-ID |
| `AuthorizationHeaderMalformed` | falsche Region |
| `NoSuchBucket` (ohne Berechtigung stattdessen `AccessDenied`) | Bucket fehlt |
| `RequestTimeTooSkewed` | Serveruhr weicht mehr als 15 Minuten ab – NTP einrichten |

Zugangsdaten und der Meldungstext von S3 erscheinen nie in Fehlermeldungen oder im Protokoll.

Im Betrieb wiederholt Paraph Anfragen bei Serverfehlern (5xx, `SlowDown`), Zeitüberschreitung (60 s je Versuch) und Netzwerkfehlern bis zu dreimal mit wachsendem Abstand; 4xx-Fehler werden nicht wiederholt. Uploads tragen `Content-MD5` und `x-amz-content-sha256`; S3 lehnt beschädigte Übertragungen ab. Fehlt ein Objekt, das die Datenbank kennt, lautet die Meldung „Datei fehlt im Speicher“.

### Den Bucket absichern

- **Privat und ohne öffentlichen Zugriff.** Bei AWS „Block Public Access“ für Bucket und Konto vollständig aktivieren, keine Bucket-ACLs (Object Ownership „Bucket owner enforced“). Bei MinIO keine anonyme Policy (`mc anonymous get` muss `none` zeigen).
- **Eigener Benutzer mit minimalen Rechten** nur für Paraph, nie der Root- oder Admin-Schlüssel. Paraph braucht genau `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` und `s3:ListBucket` – keine Rechte zum Anlegen oder Löschen von Buckets, keine Policy- oder ACL-Rechte.
- **Transportverschlüsselung:** `S3_ENDPOINT` mit `https://`, außer der Speicher läuft im selben abgeschotteten Netz (z. B. MinIO im Docker-Netz). Optional per Policy erzwingen (`aws:SecureTransport`).
- **Versionierung** (optional, empfohlen) schützt vor versehentlichem Löschen und Überschreiben. Paraph löscht Dateien nach Ablauf der Aufbewahrungsfrist; mit Versionierung bleiben alte Versionen bestehen, bis eine Lifecycle-Regel sie entfernt. Wählen Sie die Regel passend zur Löschpflicht (DSGVO), z. B. nicht aktuelle Versionen nach 30 Tagen löschen.
- **Object Lock** (optional, nur bei neu angelegten Buckets mit Versionierung) macht Objekte für eine Frist unveränderbar und schützt so auch gegen Ransomware mit gestohlenen Schlüsseln. Beginnen Sie im Modus „Governance“; „Compliance“ verhindert jede Löschung vor Fristende, auch die nach Aufbewahrungsfrist.
- **Sicherung:** Eine zusätzliche Replikation des Buckets (zweiter Standort, `mc mirror`, `rclone sync`) bleibt sinnvoll, ist aber nicht Voraussetzung für die Wiederherstellung. Ohne den Hauptschlüssel ist auch eine Bucket-Kopie unlesbar.

Beispiel-Policy (AWS-IAM-Syntax; MinIO und Ceph RGW verstehen dieselbe Form, Garage vergibt Rechte stattdessen je Schlüssel mit `garage bucket allow --read --write`) für Bucket `firma-paraph` mit `S3_PREFIX=paraph/`. Ohne Präfix lassen Sie die `Condition` weg und ersetzen `paraph/*` durch `*`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ParaphListe",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::firma-paraph"],
      "Condition": { "StringLike": { "s3:prefix": ["paraph/*"] } }
    },
    {
      "Sid": "ParaphObjekte",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::firma-paraph/paraph/*"]
    }
  ]
}
```

MinIO, Benutzer und Policy anlegen:

```sh
mc mb local/firma-paraph
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
| `QES_CSC_BASE_URL` | – | Basis-URL einer CSC-Schnittstelle. Schaltet die Anzeige ein. |
| `QES_PROVIDER_NAME` | `QES-Anbieter` | Anzeigename. |
| `QES_CSC_CLIENT_ID` | leer | Client-ID. |
| `QES_CSC_CLIENT_SECRET` | leer | Client-Secret. |
| `QES_CSC_TOKEN_URL` | – | Token-Endpunkt. |

Diese Werte werden nur gelesen. Einstellungen → „Siegel und Signaturstufen“ zeigt dann „Anbieter konfiguriert, nicht verifiziert“; unter Einstellungen → System meldet die Diagnosezeile „Qualifizierte Signatur (QES)“, die Anbindung sei vorbereitet, aber nicht produktiv freigegeben. Es gibt keine Anbieter-Implementierung. Vorgänge mit der Stufe QES lassen sich nicht versenden, auch wenn diese Variablen gesetzt sind. Siehe [Kapitel 17](17-grenzen.md).

## Sicherung

| Variable | Standard | Zweck |
|---|---|---|
| `BACKUP_INTERVAL_HOURS` | `24` | Abstand der automatischen Sicherung in Stunden. `0` schaltet sie ab; die Diagnose meldet dann einen Hinweis. |
| `BACKUP_KEEP` | `14` | Anzahl aufbewahrter automatischer Sicherungen; ältere werden gelöscht. |
| `BACKUP_DIR` | `DATA_DIR/backups` (in Docker fest `/backups`) | Zielordner. Direkt gelesen. |
| `BACKUP_PASSPHRASE_FILE` | in Docker `/run/secrets/backup_passphrase` | Datei mit der Wiederherstellungs-Passphrase. Gesetzt: Jede Sicherung enthält den Hauptschlüssel und lässt sich mit der Passphrase öffnen. Ist die Datei nicht lesbar, scheitert die Sicherung. |
| `BACKUP_PASSPHRASE` | – | Passphrase direkt als Wert, falls `BACKUP_PASSPHRASE_FILE` nicht gesetzt ist. Direkt gelesen. |

Einzelheiten: [Kapitel 13](13-sicherung-und-updates.md).

## Monitoring

| Variable | Standard | Zweck |
|---|---|---|
| `METRICS_TOKEN` | – | Schaltet `/metrics` (Prometheus-Textformat) frei. Abruf nur mit `Authorization: Bearer <METRICS_TOKEN>`. Ohne Token oder mit falschem Token antwortet Paraph mit 404. |

Die Metriken enthalten nur Zählwerte, keine personenbezogenen Daten:

| Metrik | Inhalt |
|---|---|
| `paraph_up` | 1, solange die Instanz läuft |
| `paraph_schema_version` | Datenbankschema |
| `paraph_jobs{state}` | Hintergrundaufgaben: `queued`, `failed`, `overdue`, `retrying` |
| `paraph_emails{state}` | E-Mails der letzten 7 Tage: `queued`, `sent`, `failed` |
| `paraph_envelopes{state}` | Vorgänge ohne Testmodus: `draft`, `sent`, `completed`, `declined`, `voided`, `expired` |
| `paraph_backup_age_seconds` | Alter der letzten Sicherung (−1 = noch keine) |
| `paraph_anchors_unstamped` | Anker ohne externen Zeitstempel |
| `paraph_disk_free_bytes` | freier Speicher im Datenverzeichnis |

Für einfache Verfügbarkeitsprüfungen genügen `GET /api/health` (Status und Version) und `GET /api/health/ready` (Datenbank und Schreibzugriff; 503 bei Störung).

## Entwicklung und Fehlersuche

| Variable | Standard | Zweck |
|---|---|---|
| `DEV_MODE` | aus | Nur Entwicklung. Schreibt ohne SMTP die Links aus E-Mails ins Protokoll und erlaubt `http://` für `OIDC_ISSUER`. **Nie produktiv verwenden**, da die Links Zugang zu Vorgängen gewähren. Die Diagnose meldet einen Fehler. |
| `PARAPH_PROBE` | aus | Kennzeichnet den Probebetrieb. Setzt `install.sh --probe` in `.env` ([Kapitel 18](18-installation-mit-claude-code.md#was-claude-code-ausführt)). Ein fehlender Mailserver gilt in der Diagnose dann als Warnung statt als Fehler. Unabhängig davon wählt der Versanddialog ohne Mailserver „Links selbst weitergeben“ vor. Sonst ändert sich nichts; die Variable macht eine Installation nicht zum Testsystem. |
| `PARAPH_DEBUG_PDF` | – | Gibt Fehler beim Analysieren hochgeladener PDFs zusätzlich auf der Konsole aus. Direkt gelesen. |
| `PARAPH_BUILD_VERSION` | `0.3.1-dev` (im Image die Build-Version, z. B. `0.3.1`) | Angezeigte Versionsnummer. Setzt das Image; nicht selbst ändern. Direkt gelesen. |

Variablen nur für die automatisierten Tests (z. B. `PARAPH_LIVE_TSA=1`) beschreibt [Kapitel 16](16-tests-und-nachweise.md).

## Secrets im Überblick

| Datei auf dem Host | Im Container | Variable | Inhalt |
|---|---|---|---|
| `secrets/master.key` | `/run/secrets/master_key` | `MASTER_KEY_FILE` | Hauptschlüssel, eine Zeile Base64 (44 Zeichen) |
| `secrets/backup_passphrase` | `/run/secrets/backup_passphrase` | `BACKUP_PASSPHRASE_FILE` | Wiederherstellungs-Passphrase, 32 Zeichen |
| `secrets/tsa_ca.pem` | `/run/secrets/tsa_ca` | `TSA_CA_FILE` | Vertrauensanker des Zeitstempeldienstes (leer = keiner) |

Alle drei gehören UID 1000 und haben die Rechte 0400; der Ordner `secrets/` hat 0700. Compose verlangt alle drei Dateien, auch wenn `tsa_ca.pem` leer ist. Weitere Secrets (z. B. `SMTP_URL`, `OIDC_CLIENT_SECRET`, `S3_SECRET_ACCESS_KEY`) können Sie über die `_FILE`-Variante einbinden; dafür ergänzen Sie `docker-compose.yml` um ein eigenes Secret.

## Was docker-compose.yml fest setzt

Diese Werte überschreiben gleichnamige Einträge in `.env`:

| Variable | Wert |
|---|---|
| `APP_URL` | aus `.env`, aber Pflicht |
| `TZ` | `${TZ:-Europe/Berlin}` |
| `MASTER_KEY_FILE` | `/run/secrets/master_key` |
| `BACKUP_PASSPHRASE_FILE` | `/run/secrets/backup_passphrase` |
| `TSA_CA_FILE` | `/run/secrets/tsa_ca` |
| `GOTENBERG_URL` | `http://gotenberg:3000` |
| `BACKUP_DIR` | `/backups` |

Das Image setzt außerdem `NODE_ENV=production`, `DATA_DIR=/data`, `PORT=8080` und `HOST=0.0.0.0`.

## Variablen für Docker Compose

Diese Variablen wertet Docker Compose aus, nicht Paraph. Sie stehen ebenfalls in `.env`:

| Variable | Standard | Zweck |
|---|---|---|
| `PARAPH_ENV_FILE` | `.env` | Pfad der Umgebungsdatei für den Paraph-Container (Pflicht). |
| `PARAPH_IMAGE` | `paraph:local` | Image-Name. `install.sh` trägt `paraph:<Version>` ein, `update.sh` das jeweils neue Image. Für das fertige Image z. B. `ghcr.io/pbaumfalk/paraph:0.2.0`. |
| `PARAPH_VERSION` | `0.3.1` | Build-Argument; wird im Image zu `PARAPH_BUILD_VERSION`. Die Skripte setzen es aus `package.json`. |
| `PARAPH_MEM_LIMIT` | `1g` | Speichergrenze des Paraph-Containers. |
| `COMPOSE_PROJECT_NAME` | `paraph` | Projektname (Präfix für Container, Netze, Volumes). |
| `COMPOSE_PROFILES` | – | `caddy` startet den mitgelieferten Reverse Proxy. Setzt `install.sh`. |
| `DOMAIN` | – | Nur Profil `caddy`: Domain für das Zertifikat. |
| `ACME_EMAIL` | – | Nur Profil `caddy`: Kontaktadresse für Let's Encrypt. |
| `CADDY_HTTP_PORT` | `80` | Nur Profil `caddy`: HTTP-Port auf dem Host. |
| `CADDY_HTTPS_PORT` | `443` | Nur Profil `caddy`: HTTPS-Port auf dem Host (TCP und UDP). |
| `BIND` | `127.0.0.1` | Host-Adresse, an die der Paraph-Port gebunden wird. |
| `HOST_PORT` | `8080` | Paraph-Port auf dem Host. |
| `BACKUP_PATH` | `./backups` | Host-Ordner, der als `/backups` eingebunden wird. |
| `TZ` | `Europe/Berlin` | Zeitzone des Containers. |
| `MAILPIT_PORT` | `8025` | Nur `docker-compose.test.yml`: Port der Mailpit-Oberfläche. |
| `TEST_CERTS` | – | Nur `docker-compose.test.yml`: Ordner mit Testzertifikaten und Anmeldedatei für Mailpit. |

`docker-compose.test.yml` setzt im Paraph-Container zusätzlich `NODE_EXTRA_CA_CERTS=/certs/ca.pem`, damit Paraph dem Test-Mailserver vertraut. Es ist nur für den automatisierten Gesamttest gedacht, nie für den Produktivbetrieb.

## Variablen der Skripte

`install.sh`, `update.sh` und `restore.sh` werten eigene Variablen aus. Sie gehören nicht in `.env`, sondern vor den Aufruf (`sudo VARIABLE=… ./scripts/…`).

| Variable | Skript | Zweck |
|---|---|---|
| `PARAPH_NONINTERACTIVE=1` | alle | keine Rückfragen |
| `PARAPH_DOMAIN`, `PARAPH_USE_CADDY`, `PARAPH_ACME_EMAIL`, `PARAPH_SMTP_URL`, `PARAPH_MAIL_FROM`, `PARAPH_TSA_URL`, `PARAPH_TSA_CA_FILE`, `PARAPH_APP_URL`, `PARAPH_EXTRA_ENV` | `install.sh` | Antworten und Zusätze, siehe [Kapitel 11](11-installation.md#ohne-rückfragen-installieren) |
| `PARAPH_SKIP_BUILD=1` | `install.sh`, `update.sh` | vorhandenes Image verwenden statt bauen |
| `PARAPH_ALLOW_NONROOT=1` | `install.sh` | ohne root ausführen (nur Tests) |
| `--probe` (Option), `PARAPH_PORT` | `install.sh` | Probebetrieb auf `http://localhost:<PARAPH_PORT>` (Vorgabe 8080), siehe [Kapitel 18](18-installation-mit-claude-code.md#was-claude-code-ausführt) |
| `PARAPH_QUIET_SECRETS=1` | `install.sh` | Wiederherstellungs-Passphrase nicht ausgeben, nur ihren Ablageort nennen |
| `PARAPH_TAKE_KEY=1` | `restore.sh` | Hauptschlüssel ohne Rückfrage aus der Sicherung übernehmen |

---

← [11. Installation](11-installation.md) · [Inhalt](README.md) · [13. Sicherung und Updates](13-sicherung-und-updates.md) →
