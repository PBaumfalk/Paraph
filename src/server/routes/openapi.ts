import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context.js';
import { WEBHOOK_EVENTS } from '../domain/webhooks.js';
import { SCOPES } from '../domain/authz.js';
import { FIELD_TYPES, RECIPIENT_KINDS, AUTH_METHODS } from '../../shared/model.js';

const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
const json = (schema: any, example?: any) => ({ content: { 'application/json': { schema, ...(example ? { example } : {}) } } });
const ok = (schema: any, description = 'OK') => ({ description, ...json(schema) });
const errs = { '400': { $ref: '#/components/responses/Error' }, '401': { $ref: '#/components/responses/Error' }, '404': { $ref: '#/components/responses/Error' } };
const idParam = (name: string, d: string) => ({ name, in: 'path', required: true, schema: { type: 'string' }, description: d });

export function buildOpenApi(ctx: Ctx) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Paraph API',
      version: '1.0.0',
      description: [
        'REST-API von Paraph. Alle Funktionen der Oberfläche sind über diese API erreichbar – ohne Zusatzkosten oder Mengenbegrenzung.',
        '',
        '**Authentifizierung:** `Authorization: Bearer pk_live_…` (API-Schlüssel unter Einstellungen → API). Schlüssel mit `pk_test_` arbeiten im **Testmodus**: Vorgänge sind getrennt, E-Mails werden nicht versendet, Dokumente erhalten ein Wasserzeichen und Signaturlinks werden in der Antwort zurückgegeben.',
        '',
        '**Idempotenz:** POST-Aufrufe zum Anlegen und Versenden akzeptieren den Header `Idempotency-Key`. Wiederholte Aufrufe mit gleichem Schlüssel und gleichem Inhalt liefern die ursprüngliche Antwort (Header `idempotent-replayed: true`), 48 Stunden lang.',
        '',
        '**Versionierung:** Der Pfad enthält die Hauptversion (`/api/v1`). Innerhalb von v1 kommen nur abwärtskompatible Erweiterungen hinzu.',
        '',
        '**Webhooks:** Zustellung nach dem Schema von *Standard Webhooks*. Header `webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<base64>`; Signatur = HMAC-SHA256 mit dem Geheimnis (Base64 nach `whsec_`) über `${webhook-id}.${webhook-timestamp}.${body}`. Fehlgeschlagene Zustellungen werden bis zu 8-mal mit wachsendem Abstand wiederholt.',
        '',
        '**Koordinaten:** Felder werden in normierten Koordinaten (0–1) relativ zur *sichtbaren* Seite angegeben – Ursprung oben links, nach Seitendrehung und CropBox. Alternativ können Felder beim Anlegen über einen **Ankertext** platziert werden.',
        '',
        '**Fehler:** `{ "error": { "code": "…", "message": "…", "details": … } }`. Fremde oder unbekannte Objekte liefern immer 404.',
      ].join('\n'),
    },
    servers: [{ url: ctx.cfg.appUrl }],
    security: [{ bearer: [] }],
    tags: [
      { name: 'Vorgänge', description: 'Signaturvorgänge anlegen, versenden, verfolgen, widerrufen' },
      { name: 'Dokumente', description: 'Ergebnisse herunterladen, Audit-Trail' },
      { name: 'Vorlagen', description: 'Wiederverwendbare Vorlagen und Massenversand' },
      { name: 'Webhooks', description: 'Benachrichtigungen an eigene Systeme' },
      { name: 'Sonstiges' },
    ],
    paths: {
      '/api/v1/me': { get: { tags: ['Sonstiges'], summary: 'Eigener Zugang, Organisation, Berechtigungen', responses: { '200': ok({ type: 'object' }), ...errs } } },
      '/api/v1/envelopes': {
        get: {
          tags: ['Vorgänge'],
          summary: 'Vorgänge auflisten',
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Kommagetrennt: draft,sent,completed,declined,voided,expired' },
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'external_ref', in: 'query', schema: { type: 'string' }, description: 'Eigene Referenz, z. B. Akten-, Personal- oder Kundennummer' },
            { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 200 } },
            { name: 'before', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Blättern: updated_at des letzten Eintrags' },
          ],
          responses: { '200': ok({ type: 'object', properties: { data: { type: 'array', items: ref('EnvelopeSummary') } } }), ...errs },
        },
        post: {
          tags: ['Vorgänge'],
          summary: 'Vorgang anlegen – optional komplett mit Dokumenten, Empfängern, Feldern und Versand',
          parameters: [{ name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } }],
          requestBody: json(ref('EnvelopeCreate'), {
            title: 'Mandatsvereinbarung Müller',
            external_ref: '123/26',
            documents: [{ name: 'Mandatsvereinbarung.pdf', file_base64: 'JVBERi0xLjc…' }],
            recipients: [{ ref: 'kunde', name: 'Erika Müller', email: 'erika@example.org', auth_method: 'email_otp' }],
            fields: [
              { type: 'signature', recipient: 'kunde', anchor: { text: 'Unterschrift Kunde', offset_y: 4, width: 180, height: 40 } },
              { type: 'signed_date', recipient: 'kunde', document: 0, page: 0, x: 0.1, y: 0.85, w: 0.2, h: 0.03 },
            ],
            send: true,
          }),
          responses: { '201': ok(ref('Envelope'), 'Angelegt'), ...errs, '422': { $ref: '#/components/responses/Error' } },
        },
      },
      '/api/v1/envelopes/{id}': {
        parameters: [idParam('id', 'Vorgangs-ID')],
        get: { tags: ['Vorgänge'], summary: 'Vorgang mit Dokumenten, Empfängern, Feldern und Status', responses: { '200': ok(ref('Envelope')), ...errs } },
        patch: { tags: ['Vorgänge'], summary: 'Entwurf ändern', requestBody: json(ref('EnvelopeCreate')), responses: { '200': ok(ref('Envelope')), ...errs } },
        delete: { tags: ['Vorgänge'], summary: 'Entwurf löschen', responses: { '200': ok({ type: 'object' }), ...errs } },
      },
      '/api/v1/envelopes/{id}/documents': {
        parameters: [idParam('id', 'Vorgangs-ID')],
        post: {
          tags: ['Vorgänge'],
          summary: 'Dokument hochladen (PDF; DOCX/ODT/DOC/RTF mit Umwandlungsdienst)',
          requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } }, 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, file_base64: { type: 'string' } } } } } },
          responses: { '201': ok({ type: 'object' }), ...errs, '413': { $ref: '#/components/responses/Error' }, '422': { $ref: '#/components/responses/Error' } },
        },
      },
      '/api/v1/envelopes/{id}/recipients': {
        parameters: [idParam('id', 'Vorgangs-ID')],
        put: { tags: ['Vorgänge'], summary: 'Empfängerliste eines Entwurfs setzen', requestBody: json({ type: 'array', items: ref('RecipientInput') }), responses: { '200': ok({ type: 'object' }), ...errs } },
      },
      '/api/v1/envelopes/{id}/fields': {
        parameters: [idParam('id', 'Vorgangs-ID')],
        put: { tags: ['Vorgänge'], summary: 'Felder eines Entwurfs setzen', requestBody: json({ type: 'array', items: ref('FieldInput') }), responses: { '200': ok({ type: 'object' }), ...errs } },
      },
      '/api/v1/envelopes/{id}/send': {
        parameters: [idParam('id', 'Vorgangs-ID'), { name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } }],
        post: {
          tags: ['Vorgänge'],
          summary: 'Versenden',
          description: '`notify: false` versendet keine E-Mails; die persönlichen Signaturlinks werden einmalig in `signing_links` zurückgegeben (Übergabe aus eigenen Systemen). Bei Formhinweisen (z. B. § 623 BGB) ist `acknowledge_form_risk: true` erforderlich; die Bestätigung wird protokolliert.',
          requestBody: json({ type: 'object', properties: { notify: { type: 'boolean', default: true }, acknowledge_form_risk: { type: 'boolean' } } }),
          responses: { '200': ok(ref('Envelope')), ...errs, '422': { $ref: '#/components/responses/Error' } },
        },
      },
      '/api/v1/envelopes/{id}/void': { parameters: [idParam('id', 'Vorgangs-ID')], post: { tags: ['Vorgänge'], summary: 'Widerrufen (alle offenen Links werden ungültig)', requestBody: json({ type: 'object', properties: { reason: { type: 'string' } } }), responses: { '200': ok(ref('Envelope')), ...errs } } },
      '/api/v1/envelopes/{id}/recipients/{rid}/remind': { parameters: [idParam('id', 'Vorgangs-ID'), idParam('rid', 'Empfänger-ID')], post: { tags: ['Vorgänge'], summary: 'Erinnerung senden (neuer Link, der alte wird ungültig)', responses: { '200': ok({ type: 'object' }), ...errs } } },
      '/api/v1/envelopes/{id}/recipients/{rid}/link': { parameters: [idParam('id', 'Vorgangs-ID'), idParam('rid', 'Empfänger-ID')], post: { tags: ['Vorgänge'], summary: 'Neuen Signaturlink ausstellen (ohne E-Mail)', responses: { '200': ok({ type: 'object', properties: { url: { type: 'string' } } }), ...errs } } },
      '/api/v1/envelopes/{id}/recipients/{rid}/embed': {
        parameters: [idParam('id', 'Vorgangs-ID'), idParam('rid', 'Empfänger-ID')],
        post: { tags: ['Vorgänge'], summary: 'Einbettungslink (10 Minuten, einmalig) für iframe', description: 'Die Herkunft muss in den Einstellungen freigegeben sein. Die eingebettete Seite meldet per `postMessage` `{ type: "paraph:completed" | "paraph:declined" | "paraph:delegated", envelope_id }` an das Elternfenster.', requestBody: json({ type: 'object', properties: { origin: { type: 'string', format: 'uri' } } }), responses: { '200': ok({ type: 'object', properties: { url: { type: 'string' }, expires_in: { type: 'integer' } } }), ...errs } },
      },
      '/api/v1/envelopes/{id}/audit': { parameters: [idParam('id', 'Vorgangs-ID')], get: { tags: ['Dokumente'], summary: 'Audit-Trail mit Kettenprüfung', responses: { '200': ok({ type: 'object' }), ...errs } } },
      '/api/v1/envelopes/{id}/files/{kind}': {
        parameters: [idParam('id', 'Vorgangs-ID'), { name: 'kind', in: 'path', required: true, schema: { type: 'string' }, description: '`final`, `certificate`, `audit`, `evidence` oder eine Dokument-ID (einzelnes finales Dokument)' }],
        get: { tags: ['Dokumente'], summary: 'Ergebnisdatei herunterladen', responses: { '200': { description: 'Datei', content: { 'application/pdf': {}, 'application/zip': {}, 'application/json': {} } }, ...errs, '409': { $ref: '#/components/responses/Error' } } },
      },
      '/api/v1/templates': {
        get: { tags: ['Vorlagen'], summary: 'Vorlagen auflisten', responses: { '200': ok({ type: 'object' }), ...errs } },
        post: { tags: ['Vorlagen'], summary: 'Vorlage anlegen', requestBody: json({ type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' }, visibility: { enum: ['private', 'org'] } } }), responses: { '201': ok({ type: 'object' }), ...errs } },
      },
      '/api/v1/templates/{id}': { parameters: [idParam('id', 'Vorlagen-ID')], get: { tags: ['Vorlagen'], summary: 'Vorlage mit Versionen', responses: { '200': ok({ type: 'object' }), ...errs } } },
      '/api/v1/templates/{id}/draft': { parameters: [idParam('id', 'Vorlagen-ID')], put: { tags: ['Vorlagen'], summary: 'Entwurf speichern (Rollen, Felder, Einstellungen)', requestBody: json({ type: 'object' }), responses: { '200': ok({ type: 'object' }), ...errs } } },
      '/api/v1/templates/{id}/documents': { parameters: [idParam('id', 'Vorlagen-ID')], post: { tags: ['Vorlagen'], summary: 'Dokument zur Vorlage hochladen', responses: { '201': ok({ type: 'object' }), ...errs } } },
      '/api/v1/templates/{id}/publish': { parameters: [idParam('id', 'Vorlagen-ID')], post: { tags: ['Vorlagen'], summary: 'Neue unveränderliche Version veröffentlichen', requestBody: json({ type: 'object', properties: { note: { type: 'string' } } }), responses: { '200': ok({ type: 'object' }), ...errs } } },
      '/api/v1/templates/{id}/envelopes': {
        parameters: [idParam('id', 'Vorlagen-ID'), { name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } }],
        post: {
          tags: ['Vorlagen'],
          summary: 'Vorgang aus Vorlage erzeugen (und versenden)',
          requestBody: json(ref('UseTemplate'), { recipients: { kunde: { name: 'Erika Müller', email: 'erika@example.org' } }, prefill: { vertragsnummer: '123/26' }, external_ref: '123/26' }),
          responses: { '201': ok(ref('Envelope')), ...errs, '422': { $ref: '#/components/responses/Error' } },
        },
      },
      '/api/v1/templates/{id}/bulk': {
        parameters: [idParam('id', 'Vorlagen-ID'), { name: 'dry_run', in: 'query', schema: { type: 'boolean', default: true } }],
        post: { tags: ['Vorlagen'], summary: 'Massenversand aus CSV/XLSX (zuerst Probelauf)', requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } }, responses: { '200': ok({ type: 'object' }), ...errs } },
      },
      '/api/v1/webhooks': {
        get: { tags: ['Webhooks'], summary: 'Webhooks mit letzten Zustellungen', responses: { '200': ok({ type: 'object' }), ...errs } },
        post: { tags: ['Webhooks'], summary: 'Webhook anlegen (Geheimnis wird nur einmal angezeigt)', requestBody: json({ type: 'object', required: ['url', 'events'], properties: { url: { type: 'string' }, events: { type: 'array', items: { enum: ['*', ...WEBHOOK_EVENTS] } }, description: { type: 'string' } } }), responses: { '201': ok({ type: 'object' }), ...errs } },
      },
      '/api/v1/webhooks/{id}': { parameters: [idParam('id', 'Webhook-ID')], patch: { tags: ['Webhooks'], summary: 'Webhook ändern', responses: { '200': ok({ type: 'object' }) } }, delete: { tags: ['Webhooks'], summary: 'Webhook löschen', responses: { '200': ok({ type: 'object' }) } } },
      '/api/v1/webhooks/{id}/test': { parameters: [idParam('id', 'Webhook-ID')], post: { tags: ['Webhooks'], summary: 'Testereignis senden', responses: { '200': ok({ type: 'object' }) } } },
      '/api/public/verify/hash': { post: { tags: ['Sonstiges'], security: [], summary: 'Prüfstelle: Hash gegen das Register prüfen', requestBody: json({ type: 'object', properties: { sha256: { type: 'string' } } }), responses: { '200': ok({ type: 'object' }) } } },
      '/api/health/ready': { get: { tags: ['Sonstiges'], security: [], summary: 'Bereitschaft (Datenbank, Speicher)', responses: { '200': ok({ type: 'object' }), '503': ok({ type: 'object' }, 'Nicht bereit') } } },
    },
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', description: `API-Schlüssel. Berechtigungen: ${SCOPES.join(', ')}` } },
      responses: { Error: { description: 'Fehler', ...json({ type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } } } }) } },
      schemas: {
        EnvelopeSummary: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, status: { enum: ['draft', 'sent', 'completed', 'declined', 'voided', 'expired'] }, external_ref: { type: ['string', 'null'] }, recipients: { type: 'array', items: { type: 'object' } } } },
        Envelope: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, status: { type: 'string' }, test_mode: { type: 'boolean' }, documents: { type: 'array', items: { type: 'object' } }, recipients: { type: 'array', items: { type: 'object' } }, fields: { type: 'array', items: { type: 'object' } }, result: { type: ['object', 'null'], description: 'Hashes und Siegelangaben nach Abschluss' }, signing_links: { type: 'array', items: { type: 'object' }, description: 'Nur bei notify:false oder im Testmodus' } } },
        EnvelopeCreate: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string' },
            message: { type: 'string' },
            signing_order: { enum: ['parallel', 'sequential'] },
            expires_in_days: { type: 'integer' },
            reminder_days: { type: 'integer', description: '0 = keine automatischen Erinnerungen' },
            allow_delegation: { type: 'boolean' },
            external_ref: { type: 'string' },
            metadata: { type: 'object', additionalProperties: { type: 'string' } },
            form_classes: { type: 'array', items: { type: 'string' }, description: 'IDs aus /api/v1/form-rules' },
            documents: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, file_base64: { type: 'string' } } } },
            recipients: { type: 'array', items: ref('RecipientInput') },
            fields: { type: 'array', items: { oneOf: [ref('FieldInput'), ref('AnchorField')] } },
            send: { type: 'boolean' },
            notify: { type: 'boolean' },
            acknowledge_form_risk: { type: 'boolean' },
          },
        },
        RecipientInput: {
          type: 'object',
          required: ['name', 'email'],
          properties: {
            ref: { type: 'string', description: 'Eigener Bezeichner für Feldzuordnungen' },
            role: { type: 'string' },
            kind: { enum: [...RECIPIENT_KINDS] },
            name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            routing_order: { type: 'integer', description: 'Gleiche Zahl = parallel, höhere Zahl = später' },
            auth_method: { enum: [...AUTH_METHODS] },
            access_code: { type: 'string' },
            witness_for: { type: 'string' },
          },
        },
        FieldInput: {
          type: 'object',
          required: ['type', 'document', 'recipient', 'page', 'x', 'y', 'w', 'h'],
          properties: {
            key: { type: 'string' },
            type: { enum: [...FIELD_TYPES] },
            document: { oneOf: [{ type: 'integer' }, { type: 'string' }] },
            recipient: { type: 'string', description: 'Empfänger-ID, ref, Rolle oder E-Mail' },
            page: { type: 'integer', description: '0-basiert' },
            x: { type: 'number' },
            y: { type: 'number' },
            w: { type: 'number' },
            h: { type: 'number' },
            required: { type: 'boolean' },
            label: { type: 'string' },
            value: { type: 'string', description: 'Vorbelegung' },
            config: { type: 'object', description: 'options, validation, condition, formula, readonly, …' },
          },
        },
        AnchorField: {
          type: 'object',
          required: ['type', 'recipient', 'anchor'],
          properties: {
            type: { enum: [...FIELD_TYPES] },
            recipient: { type: 'string' },
            anchor: { type: 'object', properties: { text: { type: 'string' }, occurrence: { type: 'integer' }, offset_x: { type: 'number', description: 'pt' }, offset_y: { type: 'number', description: 'pt, positiv = nach unten' }, width: { type: 'number' }, height: { type: 'number' } } },
          },
        },
        UseTemplate: {
          type: 'object',
          required: ['recipients'],
          properties: {
            recipients: { type: 'object', additionalProperties: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, auth_method: { type: 'string' } } } },
            prefill: { type: 'object', additionalProperties: { type: 'string' } },
            title: { type: 'string', description: 'Platzhalter wie {{Kunde.name}} möglich' },
            send: { type: 'boolean' },
            notify: { type: 'boolean' },
            version: { type: 'integer' },
            external_ref: { type: 'string' },
          },
        },
      },
    },
  };
}

export function openapiRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/api/v1/openapi.json', async () => buildOpenApi(ctx));
}
