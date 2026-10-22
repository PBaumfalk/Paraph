// Konfiguration ausschließlich über Umgebungsvariablen und Secret-Dateien (*_FILE).
import { readFileSync, existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

function env(name: string, fallback?: string): string | undefined {
  const fileVar = process.env[`${name}_FILE`];
  if (fileVar) {
    try {
      return readFileSync(fileVar, 'utf8').trim();
    } catch {
      throw new Error(`${name}_FILE zeigt auf eine nicht lesbare Datei: ${fileVar}`);
    }
  }
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function bool(name: string, fallback = false): boolean {
  const v = env(name);
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'ja', 'on'].includes(v.toLowerCase());
}

function int(name: string, fallback: number): number {
  const v = env(name);
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) throw new Error(`${name} muss eine Zahl sein`);
  return n;
}

/**
 * TRUST_PROXY: „true“ bedeutet bewusst NICHT „allem vertrauen“, sondern genau einem Proxy-Hop. Sonst könnte jeder
 * Client per X-Forwarded-For eine beliebige IP vortäuschen (Audit-Trail, Rate-Limits). Alternativ: Anzahl der
 * Hops (z. B. 2 bei CDN + Proxy) oder kommagetrennte Proxy-Adressen/Netze (z. B. 172.16.0.0/12).
 */
export function trustProxySetting(v: string | undefined): boolean | number | string[] {
  if (v === undefined || ['0', 'false', 'no', 'nein', 'off', ''].includes(v.toLowerCase())) return false;
  if (['1', 'true', 'yes', 'ja', 'on'].includes(v.toLowerCase())) return 1;
  if (/^\d+$/.test(v)) return Number(v);
  return v.split(',').map((x) => x.trim()).filter(Boolean);
}

export interface Config {
  appUrl: string;
  host: string;
  port: number;
  dataDir: string;
  masterKey: Buffer;
  masterKeySource: 'env' | 'file' | 'generated';
  setupCode?: string;
  trustProxy: boolean | number | string[];
  logLevel: string;
  maxUploadBytes: number;
  maxPages: number;
  smtp?: { url: string; from: string };
  gotenbergUrl?: string;
  tsaUrl?: string;
  tsaCaPem?: string;
  webhookAllowPrivate: boolean;
  webhookAllowHosts: string[];
  oidc?: { issuer: string; clientId: string; clientSecret: string; name: string; autoCreate: boolean };
  s3?: { endpoint?: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; sessionToken?: string; forcePathStyle: boolean; prefix?: string };
  sms?: { url: string; token?: string; sender?: string };
  qes?: { name: string; baseUrl: string; clientId: string; clientSecret: string; tokenUrl?: string };
  backup: { intervalHours: number; keep: number };
  anchorIntervalMinutes: number;
  metricsToken?: string;
  devMode: boolean;
  version: string;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const dataDir = resolve(overrides.dataDir ?? env('DATA_DIR', './data')!);
  mkdirSync(dataDir, { recursive: true });

  // Hauptschlüssel für die Verschlüsselung gespeicherter Dokumente.
  // Empfehlung: MASTER_KEY_FILE aus einem Docker-Secret. Fehlt er, wird einmalig ein Schlüssel
  // unter DATA_DIR/secrets erzeugt (mit Warnung) – er muss dann gesondert gesichert werden.
  let masterKey: Buffer;
  let masterKeySource: Config['masterKeySource'];
  const mk = env('MASTER_KEY');
  if (overrides.masterKey) {
    masterKey = overrides.masterKey;
    masterKeySource = 'env';
  } else if (mk) {
    masterKey = Buffer.from(mk, 'base64');
    masterKeySource = process.env.MASTER_KEY_FILE ? 'file' : 'env';
  } else {
    const dir = join(dataDir, 'secrets');
    const file = join(dir, 'master.key');
    if (existsSync(file)) {
      masterKey = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
    } else {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      masterKey = randomBytes(32);
      writeFileSync(file, masterKey.toString('base64') + '\n', { mode: 0o600 });
      chmodSync(file, 0o600);
    }
    masterKeySource = 'generated';
  }
  if (masterKey.length !== 32) throw new Error('MASTER_KEY muss 32 Byte (Base64) lang sein. Erzeugen: openssl rand -base64 32');

  const appUrl = (overrides.appUrl ?? env('APP_URL', 'http://localhost:8080')!).replace(/\/+$/, '');
  const smtpUrl = env('SMTP_URL');
  const oidcIssuer = env('OIDC_ISSUER');
  const s3Bucket = env('S3_BUCKET');
  const smsUrl = env('SMS_GATEWAY_URL');
  const qesUrl = env('QES_CSC_BASE_URL');

  const cfg: Config = {
    appUrl,
    host: env('HOST', '0.0.0.0')!,
    port: int('PORT', 8080),
    dataDir,
    masterKey,
    masterKeySource,
    setupCode: env('SETUP_CODE'),
    trustProxy: trustProxySetting(env('TRUST_PROXY')),
    logLevel: env('LOG_LEVEL', 'info')!,
    maxUploadBytes: int('MAX_UPLOAD_MB', 25) * 1024 * 1024,
    maxPages: int('MAX_PAGES', 500),
    smtp: smtpUrl ? { url: smtpUrl, from: env('MAIL_FROM', 'Paraph <no-reply@localhost>')! } : undefined,
    gotenbergUrl: env('GOTENBERG_URL'),
    tsaUrl: env('TSA_URL'),
    tsaCaPem: env('TSA_CA'), // PEM-Bündel; üblich als TSA_CA_FILE
    webhookAllowPrivate: bool('WEBHOOK_ALLOW_PRIVATE_NETWORKS', false),
    webhookAllowHosts: (env('WEBHOOK_ALLOW_HOSTS', '') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    oidc: oidcIssuer
      ? {
          issuer: oidcIssuer,
          clientId: env('OIDC_CLIENT_ID', '')!,
          clientSecret: env('OIDC_CLIENT_SECRET', '')!,
          name: env('OIDC_NAME', 'SSO')!,
          autoCreate: bool('OIDC_AUTO_CREATE_USERS', false),
        }
      : undefined,
    s3: s3Bucket
      ? {
          endpoint: env('S3_ENDPOINT'),
          region: env('S3_REGION', 'us-east-1')!,
          bucket: s3Bucket,
          accessKeyId: env('S3_ACCESS_KEY_ID', '')!,
          secretAccessKey: env('S3_SECRET_ACCESS_KEY', '')!,
          sessionToken: env('S3_SESSION_TOKEN') || undefined,
          // Mit eigenem Endpunkt (MinIO, Garage, Ceph …) ist Pfadstil üblich, bei AWS der virtual-hosted-Stil.
          forcePathStyle: bool('S3_FORCE_PATH_STYLE', !!env('S3_ENDPOINT')),
          prefix: env('S3_PREFIX') || undefined,
        }
      : undefined,
    sms: smsUrl ? { url: smsUrl, token: env('SMS_GATEWAY_TOKEN'), sender: env('SMS_SENDER') } : undefined,
    qes: qesUrl
      ? {
          name: env('QES_PROVIDER_NAME', 'QES-Anbieter')!,
          baseUrl: qesUrl,
          clientId: env('QES_CSC_CLIENT_ID', '')!,
          clientSecret: env('QES_CSC_CLIENT_SECRET', '')!,
          tokenUrl: env('QES_CSC_TOKEN_URL'),
        }
      : undefined,
    backup: { intervalHours: int('BACKUP_INTERVAL_HOURS', 24), keep: int('BACKUP_KEEP', 14) },
    anchorIntervalMinutes: Math.max(5, int('ANCHOR_INTERVAL_MINUTES', 60)),
    metricsToken: env('METRICS_TOKEN'),
    devMode: bool('DEV_MODE', false),
    version: process.env.PARAPH_BUILD_VERSION ?? '0.1.0-dev',
    ...overrides,
  };
  cfg.masterKey = masterKey;
  cfg.masterKeySource = masterKeySource;
  return cfg;
}
