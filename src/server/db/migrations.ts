// Datenbankmigrationen. Jede Migration läuft genau einmal in einer Transaktion.
// Bestehende Migrationen werden nie verändert – Änderungen kommen als neue Migration dazu.

export const migrations: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: 'grundschema',
    sql: `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT,
  totp_secret_enc TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  oidc_subject TEXT UNIQUE,
  locale TEXT NOT NULL DEFAULT 'de',
  is_instance_admin INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  disabled_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  branding TEXT NOT NULL DEFAULT '{}',
  settings TEXT NOT NULL DEFAULT '{}',
  custom_domain TEXT UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL
);

CREATE TABLE memberships (
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX memberships_user ON memberships(user_id);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id TEXT REFERENCES orgs(id) ON DELETE SET NULL,
  csrf TEXT NOT NULL,
  mfa_pending INTEGER NOT NULL DEFAULT 0,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('live','test')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  expires_at TEXT,
  revoked_at TEXT
);
CREATE INDEX api_keys_org ON api_keys(org_id);

CREATE TABLE blobs (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX blobs_org ON blobs(org_id);

CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'org' CHECK (visibility IN ('private','org')),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  current_version INTEGER NOT NULL DEFAULT 0,
  draft TEXT NOT NULL DEFAULT '{}',
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX templates_org ON templates(org_id);

-- Veröffentlichte Vorlagenversionen sind unveränderlich.
CREATE TABLE template_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (template_id, version)
);
CREATE TRIGGER template_versions_immutable BEFORE UPDATE ON template_versions
BEGIN SELECT RAISE(ABORT, 'Vorlagenversionen sind unveränderlich'); END;

CREATE TABLE envelopes (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  api_key_id TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('draft','sent','completed','declined','voided','expired')),
  test_mode INTEGER NOT NULL DEFAULT 0,
  signing_order TEXT NOT NULL DEFAULT 'parallel' CHECK (signing_order IN ('parallel','sequential')),
  template_version_id TEXT,
  form_classes TEXT NOT NULL DEFAULT '[]',
  form_ack_by TEXT,
  form_ack_at TEXT,
  signature_level TEXT NOT NULL DEFAULT 'ses' CHECK (signature_level IN ('ses','qes')),
  locale TEXT NOT NULL DEFAULT 'de',
  expires_at TEXT,
  reminder_days INTEGER NOT NULL DEFAULT 0,
  allow_delegation INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  external_ref TEXT,
  public_form_id TEXT,
  void_reason TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT,
  completed_at TEXT,
  finished_at TEXT
);
CREATE INDEX envelopes_org_status ON envelopes(org_id, status, updated_at);

CREATE TABLE envelope_documents (
  id TEXT PRIMARY KEY,
  envelope_id TEXT NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  source_blob_id TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'pdf',
  blob_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  pages TEXT NOT NULL,
  warnings TEXT NOT NULL DEFAULT '[]',
  text_excerpt TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX envelope_documents_env ON envelope_documents(envelope_id);

CREATE TABLE recipients (
  id TEXT PRIMARY KEY,
  envelope_id TEXT NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('signer','approver','filler','viewer','witness')),
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  phone TEXT,
  routing_order INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('created','waiting','sent','opened','completed','declined','delegated','voided')),
  auth_method TEXT NOT NULL DEFAULT 'none' CHECK (auth_method IN ('none','email_otp','sms_otp','access_code')),
  access_code_hash TEXT,
  token_hash TEXT UNIQUE,
  token_issued_at TEXT,
  delegated_from TEXT,
  witness_for TEXT,
  in_person_host TEXT,
  color INTEGER NOT NULL DEFAULT 0,
  last_reminded_at TEXT,
  sent_at TEXT,
  opened_at TEXT,
  completed_at TEXT,
  declined_at TEXT,
  decline_reason TEXT,
  consent_at TEXT,
  auth_at TEXT,
  completion_key TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX recipients_env ON recipients(envelope_id);

CREATE TABLE recipient_attachments (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  name TEXT NOT NULL,
  blob_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE fields (
  id TEXT PRIMARY KEY,
  envelope_id TEXT NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES envelope_documents(id) ON DELETE CASCADE,
  recipient_id TEXT REFERENCES recipients(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  type TEXT NOT NULL,
  page INTEGER NOT NULL,
  x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL,
  required INTEGER NOT NULL DEFAULT 1,
  label TEXT NOT NULL DEFAULT '',
  config TEXT NOT NULL DEFAULT '{}',
  value TEXT,
  filled_at TEXT
);
CREATE INDEX fields_env ON fields(envelope_id);
CREATE INDEX fields_recipient ON fields(recipient_id);

CREATE TABLE signatures (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('signature','initials')),
  method TEXT NOT NULL CHECK (method IN ('drawn','typed','uploaded')),
  blob_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  typed_text TEXT,
  created_at TEXT NOT NULL
);

-- Manipulationsnachweisbarer Audit-Trail: Hash-Kette je Vorgang, Einträge sind unveränderlich.
CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  envelope_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,
  actor TEXT NOT NULL,
  data TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  UNIQUE (envelope_id, seq)
);
CREATE INDEX audit_events_org ON audit_events(org_id, id);
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'Audit-Ereignisse sind unveränderlich'); END;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
WHEN (SELECT value FROM meta WHERE key = 'audit_purge_allowed') IS NOT '1'
BEGIN SELECT RAISE(ABORT, 'Audit-Ereignisse sind unveränderlich'); END;

-- Ergebnisse eines abgeschlossenen Vorgangs. Einmal geschrieben, nie überschrieben.
CREATE TABLE envelope_results (
  envelope_id TEXT PRIMARY KEY REFERENCES envelopes(id) ON DELETE CASCADE,
  final_blob_id TEXT NOT NULL,
  final_sha256 TEXT NOT NULL,
  certificate_blob_id TEXT NOT NULL,
  certificate_sha256 TEXT NOT NULL,
  audit_blob_id TEXT NOT NULL,
  audit_sha256 TEXT NOT NULL,
  evidence_blob_id TEXT NOT NULL,
  evidence_sha256 TEXT NOT NULL,
  seal_info TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER envelope_results_immutable BEFORE UPDATE ON envelope_results
BEGIN SELECT RAISE(ABORT, 'Ergebnisse sind unveränderlich'); END;

CREATE TABLE final_documents (
  envelope_id TEXT NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  name TEXT NOT NULL,
  blob_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  PRIMARY KEY (envelope_id, document_id)
);
CREATE TRIGGER final_documents_immutable BEFORE UPDATE ON final_documents
BEGIN SELECT RAISE(ABORT, 'Ergebnisse sind unveränderlich'); END;

-- Register aller gesicherten Hashwerte für die unabhängige Prüfung.
CREATE TABLE hash_register (
  sha256 TEXT NOT NULL,
  envelope_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (sha256, envelope_id, kind)
);

CREATE TABLE otp_challenges (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE signer_sessions (
  id_hash TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'session' CHECK (kind IN ('session','embed','inperson')),
  authenticated INTEGER NOT NULL DEFAULT 0,
  auth_method TEXT,
  host_user_id TEXT,
  origin TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE webhooks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events TEXT NOT NULL,
  secret_enc TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'live',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','delivered','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_status_code INTEGER,
  last_error TEXT,
  created_at TEXT NOT NULL,
  delivered_at TEXT
);
CREATE INDEX webhook_deliveries_due ON webhook_deliveries(status, next_attempt_at);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  unique_key TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('queued','running','done','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  run_at TEXT NOT NULL,
  locked_until TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX jobs_due ON jobs(status, run_at);

CREATE TABLE emails (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  envelope_id TEXT,
  recipient_id TEXT,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  text_body TEXT NOT NULL,
  html_body TEXT NOT NULL,
  reply_to TEXT,
  from_name TEXT,
  attachments TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('queued','sent','failed','suppressed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE TABLE idempotency_keys (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (scope, key)
);

CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  phone TEXT,
  note TEXT NOT NULL DEFAULT '',
  last_used_at TEXT,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (org_id, email)
);

CREATE TABLE public_forms (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  require_otp INTEGER NOT NULL DEFAULT 1,
  max_submissions INTEGER,
  submissions INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT,
  user_id TEXT,
  api_key_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT NOT NULL DEFAULT '{}',
  ip TEXT,
  ts TEXT NOT NULL
);
CREATE INDEX activity_org ON activity(org_id, id);

CREATE TABLE seal_keys (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  label TEXT NOT NULL,
  key_enc TEXT NOT NULL,
  cert_chain TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('generated','uploaded')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
`,
  },
];
