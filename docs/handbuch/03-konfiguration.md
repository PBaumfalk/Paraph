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
| `TRUST_PROXY` | `false` | Client-IP aus `X-Forwarded-For` übernehmen. Nur hinter einem Reverse Proxy setzen. `true` bedeutet genau **einen** vertrauenswürdigen Proxy-Hop (nicht „allen vertrauen“). Alternativ eine Zahl (Anzahl der Hops, z. B. `2` bei CDN und Proxy) oder kommagetrennte Proxy-Adressen bzw. Netze (z. B. `172.16.0.0/12`). `install.sh` setzt `true`. |
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

Ist keins von beiden gesetzt, erzeugt Paraph einmalig `DATA_DIR/secrets/master.key` und warnt im Log. Dieser Schlüssel liegt dann im Datenvolume. Für den Produktivbetrieb `MASTER_KEY_FILE` verwenden. Ob der Hauptschlüssel in der Sicherung enthalten ist, hängt von der Wiederherstellungs-Passphrase ab (siehe [Sicherung](#sicherung)).

## E-Mail

| Variable | Standard | Zweck |
|---|---|---|
| `SMTP_URL` | – | SMTP-Zugang als URL, z. B. `smtps://benutzer:passwort@smtp.example.org:465` (TLS) oder `smtp://benutzer:passwort@host:587` (STARTTLS). Sonderzeichen im Passwort URL-kodieren (z. B. `@` → `%40`). Ohne SMTP versendet Paraph keine E-Mails; Einladungslinks für neue Teammitglieder zeigt die Oberfläche dann direkt an. |
| `MAIL_FROM` | `Paraph <no-reply@localhost>` | Absender. Wirkt nur mit `SMTP_URL`. Absendername und Antwortadresse lassen sich je Organisation im Branding überschreiben. |
| `SMTP_ALLOW_INSECURE` | `false` | Nur `true` schaltet die Pflicht zur Verschlüsselung ab und erlaubt `rejectUnauthorized=false` in `SMTP_URL`. Wird direkt aus der Umgebung gelesen; `SMTP_ALLOW_INSECURE_FILE` wirkt nicht. Nicht produktiv verwenden. |

Verschlüsselung (`src/server/domain/mail.ts`):

- Bei `smtp://` verlangt Paraph STARTTLS. Bietet der Server kein STARTTLS an, schlägt der Versand fehl, statt unverschlüsselt zu senden. Ausnahme: lokale Testserver (`localhost`, `127.0.0.1`, `::1`, `mailpit`, `mailhog`).
- TLS mindestens in Version 1.2; Zertifikate werden geprüft.
- Eine `SMTP_URL` mit `rejectUnauthorized=false` verhindert den Versand, außer `SMTP_ALLOW_INSECURE=true`.

Fehlerbehandlung:

- Paraph ordnet Fehler ein: Anmeldung, TLS, Verbindung, vorübergehend abgewiesen (4xx) oder dauerhaft abgewiesen (5xx, z. B. unbekannte Empfängeradresse). Die Meldungen enthalten keine Zugangsdaten.
- Vorübergehende Fehler wiederholt Paraph bis zu 8-mal mit wachsendem Abstand. Dauerhafte Fehler werden nicht wiederholt.
- Ist eine E-Mail an Beteiligte endgültig gescheitert, vermerkt Paraph `recipient.delivery_failed` im Audit-Trail, löst den gleichnamigen Webhook aus und benachrichtigt die versendende Person per E-Mail. Der Zustellstatus steht im Vorgang bei der jeweiligen Person.

SPF, DKIM und DMARC für die Absenderdomain richten Sie beim Mailanbieter ein.

## Dokumentenumwandlung, Zeitstempel und Verankerung

| Variable | Standard | Zweck |
|---|---|---|
| `GOTENBERG_URL` | – (in Docker `http://gotenberg:3000`) | Gotenberg-Dienst für Word/DOC/ODT/RTF → PDF. Fehlt er, nimmt Paraph nur PDF an. |
| `TSA_URL` | – | RFC-3161-Zeitstempeldienst, z. B. der Dienst Ihres Vertrauensdiensteanbieters oder `https://freetsa.org/tsr` (kostenlos, ohne Gewähr). An den Dienst geht nur ein Hashwert. Verwendet für das Plattformsiegel (PAdES-B-T) und für die externe Verankerung der Audit-Ketten. Ist der Dienst beim Abschluss nicht erreichbar, wird ohne Zeitstempel versiegelt (PAdES-B-B). |
| `TSA_CA_FILE` | `/run/secrets/tsa_ca` | Vertrauensanker des Zeitstempeldienstes (PEM, vom Anbieter). Mit `TSA_URL` **Pflicht**: ohne ihn melden Diagnose und `paraph verify-audit` einen Fehler, weil sich Zeitstempel sonst von jemandem mit Serverzugriff selbst erzeugen ließen. In Docker als Secret `secrets/tsa_ca.pem` (leer = kein Zeitstempeldienst); `install.sh` fragt die Datei ab. Für FreeTSA liegt das Wurzelzertifikat bei (`docker/tsa/freetsa-root-ca.pem`, SHA-256 `a6379e7c…1d18aabc`, gültig bis 2041). |
| `ANCHOR_INTERVAL_MINUTES` | `60` | Abstand der externen Verankerung in Minuten, mindestens 5. Zusätzlich wird jeder Abschluss zeitnah verankert. |

Jeden Zeitstempel prüft Paraph vollständig, bevor er zählt (`src/server/pdf/timestamp.ts`): Signatur des Dienstes, Hashwert (Imprint), Nonce der eigenen Anfrage und Verwendungszweck des Zertifikats. Eine Antwort, die nicht zur Anfrage passt, wird verworfen. Zur Verankerung siehe [Kapitel 7](07-sicherheit.md#externe-verankerung).

## Webhooks

| Variable | Standard | Zweck |
|---|---|---|
| `WEBHOOK_ALLOW_HOSTS` | – | Kommagetrennte Hostnamen oder IPs, die trotz SSRF-Schutz erreichbar sein dürfen, z. B. `n8n.lan,192.168.1.20`. Für diese Hosts ist auch `http://` erlaubt. |
| `WEBHOOK_ALLOW_PRIVATE_NETWORKS` | `false` | Schaltet den Schutz vor internen Zielen vollständig ab. Nicht empfohlen; besser einzelne Hosts freigeben. |

## Anmeldung per OIDC (z. B. authentik)

| Variable | Standard | Zweck |
|---|---|---|
| `OIDC_ISSUER` | – | Issuer-URL des Anbieters. Schaltet OIDC ein. Immer `https://`; `http://` nur für `localhost`/`127.0.0.1` oder mit `DEV_MODE=true`. |
| `OIDC_CLIENT_ID` | leer | Client-ID. |
| `OIDC_CLIENT_SECRET` | leer | Client-Secret (auch als `OIDC_CLIENT_SECRET_FILE`). |
| `OIDC_NAME` | `SSO` (`.env.example`: `authentik`) | Beschriftung der Anmeldeschaltfläche („Mit authentik anmelden“). |
| `OIDC_SCOPES` | `openid email profile` | Angeforderte Scopes. Bei authentik enthält `profile` bereits den Claim `groups`. |
| `OIDC_ALLOWED_GROUPS` | leer | Kommagetrennte Gruppennamen. Gesetzt: Anmeldung nur, wenn der Claim `groups` mindestens eine davon enthält. Leer: keine Einschränkung. |
| `OIDC_AUTO_CREATE_USERS` | `false` | Unbekannte Personen erhalten beim ersten OIDC-Login ein Konto. |
| `OIDC_DEFAULT_ROLE` | leer | Nur mit `OIDC_AUTO_CREATE_USERS=true`: neue Konten treten der ältesten Organisation mit dieser Rolle bei. Erlaubt sind nur `member` und `viewer`; andere Werte verhindern den Start. Leer: Beitritt nur per Einladung. |
| `OIDC_TRUST_EMAIL` | `false` | Bestehende Konten auch dann per E-Mail verknüpfen, wenn der Anbieter `email_verified` nicht als `true` meldet. Nur setzen, wenn ausschließlich die Verwaltung E-Mail-Adressen im Anbieter pflegt. |

### Verhalten

- Bekannte OIDC-Konten werden über Issuer und Subjekt (`sub`) erkannt, nicht über die E-Mail-Adresse.
- **Verknüpfung beim ersten Login:** Ein bestehendes Paraph-Konto mit derselben E-Mail-Adresse wird nur verknüpft, wenn der Anbieter `email_verified: true` liefert (oder `OIDC_TRUST_EMAIL=true`). Die Verknüpfung steht als „SSO-Konto verknüpft“ im Aktivitätsprotokoll. Gesperrte Konten werden nie verknüpft.
- **Zwei-Faktor:** Hat eine Person in Paraph TOTP aktiviert, fragt Paraph den Code auch nach der OIDC-Anmeldung ab. Empfohlen ist trotzdem, die Mehrfaktor-Anmeldung im Anbieter zu erzwingen; Personen ohne eigenes TOTP sind sonst nur so stark geschützt wie ihr Konto beim Anbieter.
- **Fehler** (Abbruch beim Anbieter, abgelaufener Anmeldevorgang, Anbieter nicht erreichbar, fehlende Gruppe, gesperrtes Konto, kein Konto, keine Organisation) führen zurück zur Anmeldeseite mit einer verständlichen Meldung. Technische Details stehen nur im Server-Log (`OIDC-Anmeldung fehlgeschlagen`).
- Ohne Organisation (Konto neu angelegt, kein `OIDC_DEFAULT_ROLE`) bleibt die Person angemeldet und sieht den Hinweis, sich einladen zu lassen; ein Einladungslink funktioniert danach direkt.
- Eine vor der Anmeldung im Browser vorhandene Sitzung wird verworfen; die neue Sitzung erhält ein frisches Token.

### authentik einrichten (Schritt für Schritt)

Getestet mit authentik 2026.8.5. Bezeichnungen der Admin-Oberfläche auf Englisch.

1. **Signaturschlüssel:** *System → Certificates*. Das mitgelieferte „authentik Self-signed Certificate“ genügt; alternativ ein eigenes Schlüsselpaar erzeugen. Ohne Signing Key signiert authentik mit dem Client-Secret (HS256) – bitte einen Schlüssel wählen (RS256).
2. **Gruppe** (optional, für `OIDC_ALLOWED_GROUPS`): *Directory → Groups → Create*, z. B. `paraph-nutzer`, und die berechtigten Personen hinzufügen.
3. **E-Mail-Bestätigung:** Das Standard-Mapping „authentik default OAuth Mapping: OpenID 'email'“ meldet `email_verified` **immer als `false`**. Damit Paraph bestehende Konten verknüpft, unter *Customization → Property Mappings → Create → Scope Mapping* ein eigenes Mapping anlegen:
   - Name: `Paraph: email (bestätigt)`, Scope name: `email`
   - Expression (Beispiel: bestätigt, wenn das Benutzerattribut `email_verified` gesetzt ist):
     ```python
     return {
         "email": request.user.email,
         "email_verified": bool(request.user.attributes.get("email_verified", False)),
     }
     ```
   - Pflegt ausschließlich die Verwaltung die E-Mail-Adressen (keine Selbstregistrierung, keine Änderung durch die Nutzer), kann die Expression auch `"email_verified": True` liefern – oder Sie setzen in Paraph `OIDC_TRUST_EMAIL=true`.
   - Ohne bestätigte E-Mail funktionieren nur bereits verknüpfte und automatisch angelegte Konten.
4. **Provider:** *Applications → Providers → Create → OAuth2/OpenID Provider*
   - Name: `Paraph`
   - Authorization flow: `default-provider-authorization-implicit-consent` (oder `explicit-consent`, wenn eine Zustimmungsseite gewünscht ist)
   - Client type: **Confidential**; Client ID und Client Secret notieren
   - Redirect URIs: Modus *Strict*, `${APP_URL}/api/auth/oidc/callback`, z. B. `https://sign.kanzlei.example/api/auth/oidc/callback` (exakt wie `APP_URL`, ohne Schrägstrich am Ende)
   - Grant types: **authorization_code** muss aktiviert sein (sonst antwortet authentik mit `invalid_request`)
   - Signing Key: der Schlüssel aus Schritt 1
   - Advanced protocol settings → Scopes: `openid`, `profile` und das eigene E-Mail-Mapping aus Schritt 3 (statt des Standard-Mappings `email`)
   - Subject mode: Standard (*Based on the User's hashed ID*) beibehalten. Ein Wechsel ändert `sub`; bestehende Verknüpfungen greifen dann nicht mehr.
5. **Application:** *Applications → Applications → Create*, Name `Paraph`, Slug `paraph`, Provider aus Schritt 4. Unter *Policy / Group / User Bindings* kann der Zugriff zusätzlich in authentik beschränkt werden (z. B. Gruppe `paraph-nutzer` binden). Abgewiesene Personen sehen dann die Meldung von authentik („Permission denied“) und kommen gar nicht erst zu Paraph zurück.
6. **MFA:** im Authentication-Flow von authentik eine Authenticator-Validation-Stage erzwingen (empfohlen).
7. **Paraph konfigurieren** (`.env`) und neu starten:
   ```ini
   OIDC_ISSUER=https://auth.kanzlei.example/application/o/paraph/
   OIDC_CLIENT_ID=…
   OIDC_CLIENT_SECRET_FILE=/run/secrets/oidc_client_secret
   OIDC_NAME=authentik
   OIDC_ALLOWED_GROUPS=paraph-nutzer
   OIDC_AUTO_CREATE_USERS=false
   ```
   Die Issuer-URL zeigt authentik beim Provider als „OpenID Configuration Issuer“ an (mit Schrägstrich am Ende).
8. **Prüfen:** Abmelden, auf der Anmeldeseite „Mit authentik anmelden“ wählen. Bei Problemen zeigt das Server-Log den Grund (`docker compose logs paraph | grep OIDC`).

Weitere Hinweise: [Kapitel 4](04-administration.md#anmeldung-per-oidc-authentik).

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

Dateien werden vor dem Hochladen verschlüsselt (AES-256-GCM, Schlüssel je Datei aus dem Hauptschlüssel abgeleitet); der Bucket enthält nur Chiffrat. Seit 0.2.0 enthält die Sicherung auch bei S3 alle Dokumente. Siehe [Kapitel 6](06-sicherung.md#s3).

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
- **Sicherung:** Die Paraph-Sicherung liest alle Dokumente, die die Datenbank kennt, aus dem Bucket und schreibt sie in die verschlüsselte Sicherungsdatei. Eine zusätzliche Replikation des Buckets (zweiter Standort, `mc mirror`, `rclone sync`) bleibt sinnvoll, ist aber nicht Voraussetzung für die Wiederherstellung. Ohne den Hauptschlüssel ist auch eine Bucket-Kopie unlesbar.

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

Diese Werte werden nur gelesen und unter Einstellungen → System angezeigt („Anbieter konfiguriert, nicht verifiziert“). Es gibt keine Anbieter-Implementierung. Vorgänge mit Stufe `qes` lassen sich nicht versenden, auch wenn diese Variablen gesetzt sind. Siehe [Kapitel 10](10-einschraenkungen.md).

## Sicherung

| Variable | Standard | Zweck |
|---|---|---|
| `BACKUP_INTERVAL_HOURS` | `24` | Abstand der automatischen Sicherung in Stunden. `0` schaltet sie ab. |
| `BACKUP_KEEP` | `14` | Anzahl aufbewahrter automatischer Sicherungen; ältere werden gelöscht. |
| `BACKUP_DIR` | `DATA_DIR/backups` (in Docker `/backups`) | Zielordner. Wird direkt aus der Umgebung gelesen; `BACKUP_DIR_FILE` wirkt nicht. |
| `BACKUP_PASSPHRASE_FILE` | in Docker `/run/secrets/backup_passphrase` | Datei mit der Wiederherstellungs-Passphrase. Gesetzt: jede Sicherung enthält den Hauptschlüssel und lässt sich mit der Passphrase öffnen. `docker-compose.yml` bindet `secrets/backup_passphrase` als Docker-Secret ein. Alternativ `BACKUP_PASSPHRASE` direkt. |

Einzelheiten: [Kapitel 6](06-sicherung.md).

## Monitoring

| Variable | Standard | Zweck |
|---|---|---|
| `METRICS_TOKEN` | – | Schaltet `/metrics` (Prometheus-Textformat) frei. Abruf nur mit `Authorization: Bearer <METRICS_TOKEN>`. Ohne Token oder mit falschem Token antwortet Paraph mit 404. |

Die Metriken enthalten nur Zählwerte, keine personenbezogenen Daten: Schemaversion, Hintergrundaufgaben nach Zustand, E-Mails der letzten 7 Tage nach Zustand, Vorgänge nach Status (ohne Testmodus), Alter der letzten Sicherung, Anker ohne Zeitstempel, freier Speicher.

## Nur in `docker-compose.yml`

Diese Variablen wertet Docker Compose aus, nicht Paraph:

| Variable | Standard | Zweck |
|---|---|---|
| `PARAPH_ENV_FILE` | `.env` | Pfad der Umgebungsdatei für den Paraph-Container. |
| `PARAPH_IMAGE` | `paraph:local` | Image-Name. `install.sh` trägt `paraph:<Version>` ein, `update.sh` das jeweils neue Image. |
| `PARAPH_VERSION` | `0.2.0` | Build-Argument; wird im Image zu `PARAPH_BUILD_VERSION`. |
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

## Sonstiges

| Variable | Standard | Zweck |
|---|---|---|
| `PARAPH_BUILD_VERSION` | `0.2.0-dev` (im Image die Build-Version, z. B. `0.2.0`) | Angezeigte Versionsnummer. Wird direkt aus der Umgebung gelesen. |

## Einstellungen in der Oberfläche

Viele Einstellungen liegen nicht in `.env`, sondern je Organisation in der Datenbank: Sichtbarkeit der Vorgänge, Standard-Ablauf und -Erinnerung, Aufbewahrung, Zeitzone, Sprache, Link zu den Datenschutzhinweisen, Branding, E-Mail-Texte, eigene Domain, Einbettungs-Herkünfte, Siegelzertifikat. Siehe [Kapitel 4](04-administration.md).
