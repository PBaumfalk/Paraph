// Datenbankgestützte Hintergrundverarbeitung. Jobs überleben Neustarts; jeder Job wird
// per Lease exklusiv gesperrt und bei Fehlern mit Backoff erneut versucht.
import type { Ctx } from '../context.js';
import { id } from '../lib/crypto.js';

export type JobHandler = (ctx: Ctx, payload: any) => Promise<void>;
const handlers = new Map<string, JobHandler>();

export function registerJob(type: string, h: JobHandler) {
  handlers.set(type, h);
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

/** Holt einen fälligen Job und sperrt ihn atomar. */
function claim(ctx: Ctx): { id: string; type: string; payload: string; attempts: number } | undefined {
  const now = ctx.now();
  return ctx.db.transaction(() => {
    const job = ctx.db
      .prepare(
        `SELECT id, type, payload, attempts FROM jobs
         WHERE (status = 'queued' AND run_at <= ?) OR (status = 'running' AND locked_until < ?)
         ORDER BY run_at LIMIT 1`,
      )
      .get(now.toISOString(), now.toISOString()) as any;
    if (!job) return undefined;
    ctx.db
      .prepare(`UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_until = ? WHERE id = ?`)
      .run(new Date(now.getTime() + 5 * 60_000).toISOString(), job.id);
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
  } catch (e: any) {
    const attempts = job.attempts + 1;
    const final = attempts >= MAX_ATTEMPTS;
    const delay = Math.min(2 ** attempts * 5_000, 60 * 60_000);
    ctx.log.warn({ job: job.id, type: job.type, attempts, err: String(e?.message ?? e) }, 'Job fehlgeschlagen');
    ctx.db
      .prepare(`UPDATE jobs SET status = ?, run_at = ?, last_error = ?, locked_until = NULL, unique_key = CASE WHEN ? THEN NULL ELSE unique_key END WHERE id = ?`)
      .run(final ? 'failed' : 'queued', new Date(ctx.now().getTime() + delay).toISOString(), String(e?.stack ?? e).slice(0, 2000), final ? 1 : 0, job.id);
  }
  return true;
}

/** Arbeitet alle fälligen Jobs ab (für Tests und Kommandozeile). */
export async function drain(ctx: Ctx, max = 1000) {
  let n = 0;
  while (n < max && (await runOnce(ctx))) n++;
  return n;
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
  const timers = periodic.map((p) => {
    const run = () => enqueue(ctx, p.type, {}, { uniqueKey: `periodic:${p.type}` });
    run();
    return setInterval(run, p.everyMs);
  });
  return () => {
    stopped = true;
    clearInterval(t);
    timers.forEach(clearInterval);
  };
}
