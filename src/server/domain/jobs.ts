// Datenbankgestützte Hintergrundverarbeitung. Jobs überleben Neustarts; jeder Job wird
// per Lease exklusiv gesperrt und bei Fehlern mit Backoff erneut versucht.
// Periodische Aufgaben merken sich ihren letzten erfolgreichen Lauf (meta „lastrun:<typ>“) und laufen nach
// einem Neustart nicht sofort erneut, sondern zum nächsten fälligen Zeitpunkt.
import type { Ctx } from '../context.js';
import { id } from '../lib/crypto.js';

export type JobHandler = (ctx: Ctx, payload: any) => Promise<void>;
const handlers = new Map<string, JobHandler>();
type FailureListener = (ctx: Ctx, job: { id: string; type: string; error: string }) => void;
const failureListeners: FailureListener[] = [];

export function registerJob(type: string, h: JobHandler) {
  handlers.set(type, h);
}

/** Wird aufgerufen, wenn ein Job endgültig scheitert (nach allen Wiederholungen). */
export function onJobFailed(l: FailureListener) {
  failureListeners.push(l);
}

export function enqueue(ctx: Ctx, type: string, payload: unknown, opts: { uniqueKey?: string; runAt?: Date } = {}) {
  const now = ctx.now().toISOString();
  const runAt = (opts.runAt ?? ctx.now()).toISOString();
  if (opts.uniqueKey) {
    const r = ctx.db
      .prepare(
        `INSERT INTO jobs (id, type, payload, unique_key, status, run_at, created_at) VALUES (?, ?, ?, ?, 'queued', ?, ?)
         ON CONFLICT(unique_key) DO NOTHING`,
      )
      .run(id('job'), type, JSON.stringify(payload), opts.uniqueKey, runAt, now);
    return r.changes > 0;
  }
  ctx.db.prepare(`INSERT INTO jobs (id, type, payload, status, run_at, created_at) VALUES (?, ?, ?, 'queued', ?, ?)`).run(id('job'), type, JSON.stringify(payload), runAt, now);
  return true;
}

const MAX_ATTEMPTS = 8;
// Sperrdauer je Jobtyp: lange Aufgaben dürfen nach einem Absturz nicht vorzeitig doppelt starten
const LEASE_MS: Record<string, number> = { backup_auto: 60 * 60_000, finalize_envelope: 20 * 60_000, retention_purge: 30 * 60_000 };

/** Holt einen fälligen Job und sperrt ihn atomar. */
function claim(ctx: Ctx): { id: string; type: string; payload: string; attempts: number; unique_key: string | null } | undefined {
  const now = ctx.now();
  return ctx.db.transaction(() => {
    const job = ctx.db
      .prepare(
        `SELECT id, type, payload, attempts, unique_key FROM jobs
         WHERE (status = 'queued' AND run_at <= ?) OR (status = 'running' AND locked_until < ?)
         ORDER BY run_at LIMIT 1`,
      )
      .get(now.toISOString(), now.toISOString()) as any;
    if (!job) return undefined;
    ctx.db
      .prepare(`UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_until = ? WHERE id = ?`)
      .run(new Date(now.getTime() + (LEASE_MS[job.type] ?? 5 * 60_000)).toISOString(), job.id);
    return job;
  }).immediate();
}

export async function runOnce(ctx: Ctx): Promise<boolean> {
  const job = claim(ctx);
  if (!job) return false;
  const h = handlers.get(job.type);
  try {
    if (!h) throw new Error(`Kein Handler für ${job.type}`);
    await h(ctx, JSON.parse(job.payload));
    ctx.db.prepare(`UPDATE jobs SET status = 'done', finished_at = ?, unique_key = NULL, last_error = NULL WHERE id = ?`).run(ctx.now().toISOString(), job.id);
    if (job.unique_key?.startsWith('periodic:')) {
      ctx.db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`).run(`lastrun:${job.type}`, ctx.now().toISOString());
    }
  } catch (e: any) {
    const attempts = job.attempts + 1;
    const final = attempts >= MAX_ATTEMPTS;
    const delay = Math.min(2 ** attempts * 5_000, 60 * 60_000);
    const msg = String(e?.message ?? e);
    ctx.log.warn({ job: job.id, type: job.type, attempts, err: msg }, 'Job fehlgeschlagen');
    ctx.db
      .prepare(`UPDATE jobs SET status = ?, run_at = ?, last_error = ?, locked_until = NULL, unique_key = CASE WHEN ? THEN NULL ELSE unique_key END WHERE id = ?`)
      .run(final ? 'failed' : 'queued', new Date(ctx.now().getTime() + delay).toISOString(), String(e?.stack ?? e).slice(0, 2000), final ? 1 : 0, job.id);
    if (final) {
      ctx.log.error({ job: job.id, type: job.type, err: msg }, 'Job endgültig fehlgeschlagen');
      // Periodische Aufgabe erst zum nächsten regulären Zeitpunkt neu einplanen (keine Endlosschleife)
      if (job.unique_key?.startsWith('periodic:')) ctx.db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`).run(`lastrun:${job.type}`, ctx.now().toISOString());
      for (const l of failureListeners) {
        try {
          l(ctx, { id: job.id, type: job.type, error: msg });
        } catch (err) {
          ctx.log.error({ err }, 'Fehlerbenachrichtigung fehlgeschlagen');
        }
      }
    }
  }
  return true;
}

/** Arbeitet alle fälligen Jobs ab (für Tests und Kommandozeile). */
export async function drain(ctx: Ctx, max = 1000) {
  let n = 0;
  while (n < max && (await runOnce(ctx))) n++;
  return n;
}

/** Plant eine periodische Aufgabe zum nächsten fälligen Zeitpunkt ein (höchstens einmal gleichzeitig). */
export function schedulePeriodic(ctx: Ctx, type: string, everyMs: number) {
  const last = ctx.db.prepare(`SELECT value FROM meta WHERE key = ?`).get(`lastrun:${type}`) as { value: string } | undefined;
  const due = last ? new Date(new Date(last.value).getTime() + everyMs) : ctx.now();
  return enqueue(ctx, type, {}, { uniqueKey: `periodic:${type}`, runAt: due > ctx.now() ? due : ctx.now() });
}

/** Wieder einreihen: endgültig gescheiterten Job erneut versuchen (Administration). */
export function retryJob(ctx: Ctx, jobId: string) {
  const r = ctx.db.prepare(`UPDATE jobs SET status = 'queued', attempts = 0, run_at = ?, last_error = NULL WHERE id = ? AND status = 'failed'`).run(ctx.now().toISOString(), jobId);
  return r.changes === 1;
}

export function startWorker(ctx: Ctx, periodic: { type: string; everyMs: number }[]) {
  let stopped = false;
  let busy = false;
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      while (!stopped && (await runOnce(ctx)));
    } catch (e) {
      ctx.log.error({ err: e }, 'Worker-Fehler');
    } finally {
      busy = false;
    }
  };
  const t = setInterval(tick, 1000);
  const plan = () => {
    for (const p of periodic) {
      try {
        schedulePeriodic(ctx, p.type, p.everyMs);
      } catch (e) {
        ctx.log.error({ err: e, type: p.type }, 'Planung fehlgeschlagen');
      }
    }
  };
  plan();
  // Jede Minute nachplanen; vorhandene Einträge bleiben dank unique_key unberührt
  const planner = setInterval(plan, 60_000);
  ctx.db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('worker_started', ?)`).run(ctx.now().toISOString());
  return () => {
    stopped = true;
    clearInterval(t);
    clearInterval(planner);
  };
}

/** Zustand des Workers für Diagnose und Monitoring. */
export function workerStatus(ctx: Ctx) {
  const now = ctx.now().toISOString();
  const q = (sql: string, ...a: unknown[]) => (ctx.db.prepare(sql).get(...a) as any).n as number;
  return {
    queued: q(`SELECT COUNT(*) AS n FROM jobs WHERE status = 'queued'`),
    overdue: q(`SELECT COUNT(*) AS n FROM jobs WHERE status = 'queued' AND run_at < ?`, new Date(ctx.now().getTime() - 10 * 60_000).toISOString()),
    running: q(`SELECT COUNT(*) AS n FROM jobs WHERE status = 'running' AND locked_until >= ?`, now),
    stale: q(`SELECT COUNT(*) AS n FROM jobs WHERE status = 'running' AND locked_until < ?`, now),
    failed: q(`SELECT COUNT(*) AS n FROM jobs WHERE status = 'failed'`),
    retrying: q(`SELECT COUNT(*) AS n FROM jobs WHERE status = 'queued' AND attempts > 0`),
    last_runs: Object.fromEntries((ctx.db.prepare(`SELECT key, value FROM meta WHERE key LIKE 'lastrun:%'`).all() as any[]).map((r) => [r.key.slice(8), r.value])),
  };
}
