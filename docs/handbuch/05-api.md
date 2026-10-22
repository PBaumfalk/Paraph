# 5. API, Webhooks, Einbettung

Die REST-API liegt unter `/api/v1`. Die vollständige Beschreibung aller Endpunkte liefert die Instanz selbst:

- **`/docs/api`** – lesbare Dokumentation in der Oberfläche
- **`/api/v1/openapi.json`** – OpenAPI-Dokument für Werkzeuge (Postman, n8n, Make, Codegeneratoren)

Dieses Kapitel erklärt die Konzepte und typische Abläufe.

## Authentifizierung mit API-Schlüsseln

Inhaber und Administratoren legen Schlüssel unter Einstellungen → API und Webhooks an. Jeder Schlüssel gehört zu einer Organisation, hat einen Namen, einen Modus und Berechtigungen (Scopes), optional ein Ablaufdatum.

```http
Authorization: Bearer pk_live_…
```

- `pk_live_…` arbeitet mit echten Daten, `pk_test_…` im Testmodus.
- Der Schlüssel wird **nur einmal** angezeigt. Paraph speichert nur einen SHA-256-Hash und die ersten 14 Zeichen zur Wiedererkennung.
- Abgelaufene oder widerrufene Schlüssel werden sofort mit HTTP 401 `invalid_api_key` abgewiesen.

| Scope | erlaubt |
|---|---|
| `envelopes:read` | Vorgänge lesen, Dateien herunterladen |
| `envelopes:write` | zusätzlich anlegen, ändern, versenden, widerrufen, erinnern |
| `templates:read` | Vorlagen lesen |
| `templates:write` | zusätzlich Vorlagen bearbeiten und veröffentlichen |
| `webhooks:manage` | Webhooks verwalten |
| `contacts:read` | Kontakte lesen |

Vorgänge aus einer Vorlage anlegen erfordert `envelopes:write` und `templates:read`. Team, Organisationseinstellungen, API-Schlüssel und Vor-Ort-Signatur sind nur in der Oberfläche verfügbar.

## Testmodus

Mit einem `pk_test_`-Schlüssel angelegte Vorgänge

- sind von echten Vorgängen getrennt; ein Live-Schlüssel sieht sie nicht und umgekehrt (Antwort 404),
- versenden keine E-Mails; die Signaturlinks stehen stattdessen in der Antwort (`signing_links`),
- liefern beim Anfordern eines Einmalcodes den Code in der Antwort (`testCode`),
- tragen im Ergebnis ein Wasserzeichen,
- lösen nur Webhooks aus, die im Modus `test` angelegt sind,
- werden nicht in Kontakte übernommen und nicht automatisch erinnert.

## Fehlerformat

Alle Fehler haben dieselbe Form:

```json
{ "error": { "code": "not_ready", "message": "Max Muster hat noch kein Unterschriftsfeld.", "details": { "problems": ["…"] } } }
```

| HTTP | `code` (Beispiele) | Bedeutung |
|---|---|---|
| 400 | `invalid_request`, `anchor_not_found`, `field_recipient` | Eingabe ungültig. Bei `invalid_request` nennt `details` Pfad und Meldung je Feld. |
| 401 | `invalid_api_key`, `unauthorized` | Nicht angemeldet oder Schlüssel ungültig |
| 403 | `forbidden` | Scope oder Rolle reicht nicht |
| 404 | `not_found` | Nicht vorhanden **oder** nicht sichtbar (fremde Organisation, anderer Modus) |
| 409 | `not_draft`, `already_sent`, `not_active` | Zustand passt nicht |
| 413 | `file_too_large` | Datei zu groß |
| 422 | `not_ready`, `form_ack_required`, `idempotency_mismatch`, `conversion_failed` | Fachlich nicht ausführbar |
| 429 | `rate_limited` | Zu viele Anfragen |
| 500 | `internal` | Serverfehler; Details nur im Log |

Rate-Limit: 600 Anfragen pro Minute und IP für `/api/`, an einzelnen Endpunkten weniger.

## Idempotency-Key

Für `POST /api/v1/envelopes`, `POST /api/v1/envelopes/{id}/send` und `POST /api/v1/templates/{id}/envelopes` kann ein Header `Idempotency-Key` (bis 200 Zeichen) mitgesendet werden.

- Gleicher Schlüssel und gleiche Anfrage (Methode, Pfad, Body): Paraph führt nichts erneut aus und liefert die gespeicherte Antwort mit Header `idempotent-replayed: true`.
- Gleicher Schlüssel, andere Anfrage: HTTP 422 `idempotency_mismatch`.
- Gespeichert werden nur Antworten unter 500, je API-Schlüssel bzw. Benutzer, für 48 Stunden.

Verwenden Sie z. B. eine eindeutige Kennung aus Ihrem System (`akte-123-vollmacht-2026-10-22`).

## Vorgang in einem Aufruf anlegen und versenden

`POST /api/v1/envelopes` legt Entwurf, Dokumente, Beteiligte und Felder an und versendet auf Wunsch sofort. Schlägt ein Teil fehl, wird der halbe Entwurf wieder gelöscht.

Felder lassen sich statt über Koordinaten über einen **Ankertext** platzieren. Paraph sucht den Text im Dokument und setzt das Feld unter dessen Fundstelle. `offset_x`, `offset_y`, `width`, `height` sind in Punkt (1 pt = 1/72 Zoll); Standard 160 × 40 pt. `occurrence` wählt das n-te Vorkommen. Wird der Text nicht gefunden: HTTP 400 `anchor_not_found`.

```sh
curl -X POST https://sign.kanzlei.example/api/v1/envelopes \
  -H "Authorization: Bearer $PARAPH_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: akte-123-vollmacht" \
  -d @- <<EOF
{
  "title": "Vollmacht Müller ./. Schmidt",
  "message": "Bitte unterschreiben Sie die Vollmacht.",
  "external_ref": "123/26",
  "expires_in_days": 14,
  "documents": [
    { "name": "Vollmacht.pdf", "file_base64": "$(base64 < Vollmacht.pdf | tr -d '\n')" }
  ],
  "recipients": [
    { "ref": "mandant", "kind": "signer", "name": "Max Müller", "email": "max@example.org", "auth_method": "email_otp" }
  ],
  "fields": [
    { "type": "signature", "recipient": "mandant", "anchor": { "text": "Unterschrift Mandant", "offset_y": 4 } },
    { "type": "signed_date", "recipient": "mandant", "anchor": { "text": "Datum", "offset_y": 4, "width": 100, "height": 20 } }
  ],
  "send": true
}
EOF
```

`recipient` in Feldern verweist auf `ref`, auf die Rolle (`role`) oder auf die E-Mail-Adresse einer Person. Ohne `anchor` sind `document` (Index oder ID), `page` (ab 0), `x`, `y`, `w`, `h` (normiert 0 bis 1, Ursprung oben links) anzugeben.

Grenzen: 20 Dokumente, 30 Beteiligte, 1000 Felder je Vorgang; 60 MB je Anfrage.

### Formhinweise im API-Aufruf

Hat der Vorgang Formklassen (`form_classes`), die eine strengere Form als EES verlangen, lehnt der Versand mit HTTP 422 `form_ack_required` ab. `details.rules` nennt die betroffenen Regeln. Nach Prüfung senden Sie erneut mit `"acknowledge_form_risk": true`. Die Bestätigung wird mit dem API-Schlüssel im Audit-Trail vermerkt. Siehe [Kapitel 8](08-recht.md).

## Vorlage verwenden

```sh
curl -X POST https://sign.kanzlei.example/api/v1/templates/tpl_…/envelopes \
  -H "Authorization: Bearer $PARAPH_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "recipients": { "mandant": { "name": "Max Müller", "email": "max@example.org" } },
    "prefill": { "aktenzeichen": "123/26", "gegenstand": "Kündigungsschutzklage" },
    "title": "Vollmacht {{mandant.name}} – {{aktenzeichen}}",
    "external_ref": "123/26"
  }'
```

- `recipients` nach Rollenschlüssel oder Rollenname. Rollen mit Standardangaben in der Vorlage können entfallen.
- `prefill` belegt Felder nach Feldschlüssel vor. Vorbelegte Felder sind standardmäßig schreibgeschützt. Unbekannte Feldschlüssel führen zu HTTP 400.
- Titel und Nachricht dürfen Platzhalter enthalten: `{{Rolle.name}}`, `{{Rolle.email}}` (Rolle als Schlüssel oder Name) sowie `{{feldschluessel}}` aus `prefill`.
- `send` ist hier standardmäßig `true`. Mit `"send": false` entsteht nur ein Entwurf.
- Verwendet wird die aktuelle veröffentlichte Version; `version` wählt eine bestimmte.

## Linkübergabe aus der Kanzleisoftware (`notify: false`)

Soll Paraph keine E-Mail versenden, weil Ihre Kanzleisoftware (z. B. j-lawyer) den Link selbst übermittelt, senden Sie mit `"notify": false`. Die Antwort enthält dann die Links:

```json
"signing_links": [
  { "recipient_id": "rcp_…", "email": "max@example.org", "url": "https://sign.kanzlei.example/s/…" }
]
```

Der Audit-Trail vermerkt den Kanal `link_handover`. Einen neuen Link ohne E-Mail erzeugt `POST /api/v1/envelopes/{id}/recipients/{rid}/link`; der bisherige Link wird damit ungültig.

Beachten Sie bei der Linkübergabe:

- `notify: false` gilt für den ganzen Vorgang: Auch spätere Personen (Reihenfolge `sequential`) und Vertretungen erhalten keine E-Mail, und automatische Erinnerungen entfallen. Ihr System erfährt per Webhook `recipient.notified`, wer an der Reihe ist, und holt den Link mit `POST …/recipients/{rid}/link`.
- Eine manuell ausgelöste Erinnerung (`…/remind`) versendet dagegen bewusst eine E-Mail und ersetzt den Link.
- Über `external_ref` (z. B. Aktenzeichen) finden Sie Vorgänge wieder: `GET /api/v1/envelopes?external_ref=123/26`.

## Einbettung der Signaturseite

Die Signaturseite lässt sich per `<iframe>` in eine eigene Anwendung einbetten. Der Vorlagen-Editor ist nicht einbettbar.

1. Erlaubte Herkünfte eintragen: Einstellungen → API und Webhooks → Einbettung (`embedOrigins`, z. B. `https://portal.kanzlei.example`).
2. Pro Aufruf einen Einbettungslink holen:
   ```sh
   curl -X POST https://sign.kanzlei.example/api/v1/envelopes/env_…/recipients/rcp_…/embed \
     -H "Authorization: Bearer $PARAPH_KEY" -H "Content-Type: application/json" \
     -d '{ "origin": "https://portal.kanzlei.example" }'
   # → { "url": "https://sign.kanzlei.example/embed/s/…", "expires_in": 600 }
   ```
   Der Link ist 10 Minuten gültig und nur einmal verwendbar. Die Person muss gerade an der Reihe sein.
3. Im iframe laden. Paraph setzt `Content-Security-Policy: frame-ancestors` auf die angegebene Herkunft.
4. Auf Nachrichten hören:
   ```js
   window.addEventListener('message', (e) => {
     if (e.origin !== 'https://sign.kanzlei.example') return;
     if (e.data?.type === 'paraph:completed') { /* e.data.envelope_id */ }
     if (e.data?.type === 'paraph:declined')  { /* … */ }
   });
   ```

Beim Anlegen des Einbettungslinks ist `origin` Pflicht und muss unter „Einbettung“ freigegeben sein. Die Nachrichten `paraph:completed` und `paraph:declined` gehen nur an genau diese Herkunft. Verlassen Sie sich für den Abschluss nicht allein auf `postMessage`, sondern prüfen Sie den Status per API oder Webhook.

## Webhooks

Paraph meldet Ereignisse per HTTP-POST an Ihre Adresse. Das Format folgt der Spezifikation [Standard Webhooks](https://www.standardwebhooks.com/).

### Anlegen

Einstellungen → API und Webhooks oder `POST /api/v1/webhooks`:

```json
{ "url": "https://n8n.kanzlei.example/webhook/paraph", "events": ["envelope.completed", "envelope.declined"], "mode": "live" }
```

Die Antwort enthält einmalig das Geheimnis `whsec_…`. Paraph speichert es verschlüsselt.

Ereignisse: `envelope.sent`, `envelope.completed`, `envelope.declined`, `envelope.voided`, `envelope.expired`, `recipient.notified`, `recipient.viewed`, `recipient.signed`, `recipient.declined`, `recipient.delegated`, `template.published` oder `*` für alle.

### Anfrage

```http
POST /webhook/paraph
Content-Type: application/json
User-Agent: Paraph-Webhooks/1
webhook-id: evt_…
webhook-timestamp: 1792656000
webhook-signature: v1,K5o…=

{"id":"evt_…","type":"envelope.completed","created_at":"2026-10-22T09:00:00.000Z","test_mode":false,"data":{"envelope_id":"env_…", …}}
```

Signiert wird `webhook-id + "." + webhook-timestamp + "." + Body` mit HMAC-SHA256. Schlüssel ist der Base64-dekodierte Teil des Geheimnisses nach `whsec_`. Die Signatur steht Base64-kodiert nach `v1,`.

### Prüfen (Node.js)

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyParaph(rawBody, headers, secret) {
  const id = headers['webhook-id'];
  const ts = headers['webhook-timestamp'];
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // max. 5 Minuten alt
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${ts}.${rawBody}`).digest('base64');
  return headers['webhook-signature'].split(' ').some((s) => {
    const [v, sig] = s.split(',');
    return v === 'v1' && sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  });
}
```

### Prüfen (Python)

```python
import base64, hashlib, hmac, time

def verify_paraph(raw_body: bytes, headers: dict, secret: str) -> bool:
    msg_id = headers["webhook-id"]
    ts = headers["webhook-timestamp"]
    if abs(time.time() - int(ts)) > 300:
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signed = f"{msg_id}.{ts}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    return any(
        part.split(",", 1)[0] == "v1" and hmac.compare_digest(part.split(",", 1)[1], expected)
        for part in headers["webhook-signature"].split(" ")
    )
```

Prüfen Sie immer gegen den **unveränderten** Body, nicht gegen ein neu serialisiertes JSON. Alternativ funktionieren die offiziellen Standard-Webhooks-Bibliotheken.

### Zustellung und Wiederholung

- Erfolg ist jede Antwort mit Status 200 bis 299 innerhalb von 15 Sekunden. Weiterleitungen (3xx) werden nicht verfolgt und gelten als Fehler.
- Bei Fehlern wiederholt Paraph mit wachsendem Abstand (10 s, 20 s, 40 s, … höchstens 1 Stunde), **insgesamt bis zu 8 Versuche**. Danach gilt die Zustellung als fehlgeschlagen.
- Fehlgeschlagene Zustellungen lassen sich in der Oberfläche erneut auslösen (`POST /api/v1/webhooks/deliveries/{id}/retry`). Ein Testereignis sendet `POST /api/v1/webhooks/{id}/test`.
- Dieselbe `webhook-id` kann bei Wiederholungen mehrfach ankommen. Verarbeiten Sie Ereignisse idempotent.

### SSRF-Schutz

Paraph sendet Webhooks nicht an interne Adressen. Gesperrt sind u. a. `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `100.64.0.0/10`, Multicast, reservierte Bereiche und die entsprechenden IPv6-Bereiche. Ohne Freigabe ist nur `https://` erlaubt; Zugangsdaten in der URL sind verboten. Paraph löst den Hostnamen einmal auf, prüft die IP und verbindet sich genau mit dieser IP (kein DNS-Rebinding). Gesperrte Ziele werden ohne Wiederholung als fehlgeschlagen markiert.

Für interne Ziele wie n8n im LAN tragen Sie den Host in `WEBHOOK_ALLOW_HOSTS` ein, z. B. `WEBHOOK_ALLOW_HOSTS=n8n.lan,192.168.1.20`. Dann ist auch `http://` erlaubt.

## Beispiele für n8n und Make

Beide Werkzeuge können die API über einen HTTP-Knoten aufrufen. Die folgenden Aufrufe zeigen die nötigen Angaben.

Vorgänge mit Status abfragen:

```sh
curl -s "https://sign.kanzlei.example/api/v1/envelopes?status=sent,completed&limit=50" \
  -H "Authorization: Bearer $PARAPH_KEY"
```

Vorgang ansehen:

```sh
curl -s https://sign.kanzlei.example/api/v1/envelopes/env_… -H "Authorization: Bearer $PARAPH_KEY"
```

Finales PDF herunterladen, wenn `envelope.completed` eintrifft:

```sh
curl -s -o ergebnis.pdf https://sign.kanzlei.example/api/v1/envelopes/env_…/files/final \
  -H "Authorization: Bearer $PARAPH_KEY"
```

Weitere Dateiarten des Endpunkts `files/{kind}` sowie alle Parameter nennt `/docs/api`.

Person erinnern (erzeugt einen neuen Link):

```sh
curl -X POST https://sign.kanzlei.example/api/v1/envelopes/env_…/recipients/rcp_…/remind \
  -H "Authorization: Bearer $PARAPH_KEY"
```

Vorgang widerrufen:

```sh
curl -X POST https://sign.kanzlei.example/api/v1/envelopes/env_…/void \
  -H "Authorization: Bearer $PARAPH_KEY" -H "Content-Type: application/json" \
  -d '{ "reason": "Vertrag wird neu aufgesetzt" }'
```

Für eingehende Webhooks in n8n: Webhook-Knoten anlegen, dessen URL in Paraph eintragen und die Signatur in einem Code-Knoten mit dem Node.js-Beispiel oben prüfen. Läuft n8n im LAN, Host in `WEBHOOK_ALLOW_HOSTS` freigeben.
