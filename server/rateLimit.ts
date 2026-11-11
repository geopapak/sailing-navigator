/**
 * Fixed-window counters in D1, keyed by a hash of the caller's IP address
 * (the address itself is never stored). Used against sign-up spam, password
 * guessing and free PDF readings from many throwaway accounts.
 *
 * Best-effort: if the table is missing or D1 fails, the request is allowed
 * (and an error line is logged), so accounts keep working during a deploy.
 */
import type { D1Database } from './accounts';
import { log } from './log';

export interface Limit {
  /** Name of the counter, e.g. "register". */
  scope: string;
  max: number;
  windowMs: number;
}

export const LIMITS = {
  register: { scope: 'register', max: 5, windowMs: 60 * 60_000 },
  login: { scope: 'login', max: 30, windowMs: 15 * 60_000 },
  /** Wrong passwords for one account from one connection. */
  loginFail: { scope: 'loginfail', max: 5, windowMs: 15 * 60_000 },
  forgot: { scope: 'forgot', max: 5, windowMs: 60 * 60_000 },
  /** Free (not AI-approved) PDF readings from one connection. */
  freePdf: { scope: 'freepdf', max: 6, windowMs: 24 * 60 * 60_000 },
} satisfies Record<string, Limit>;

/** The caller's IP as Cloudflare reports it. */
export function clientIp(req: Request): string {
  return req.headers.get('CF-Connecting-IP') ?? 'unknown';
}

/** Short, one-way id for an IP (not reversible to the address in practice). */
export async function ipKey(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`sailing-navigator:${ip}`));
  return [...new Uint8Array(buf).slice(0, 10)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const keyOf = (l: Limit, id: string) => `${l.scope}:${id}`;

/** Counts one event; false when the limit for this window is already used up. */
export async function hit(db: D1Database | undefined, l: Limit, id: string, now = Date.now()): Promise<boolean> {
  if (!db) return true;
  try {
    const row = await db
      .prepare(
        `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
         ON CONFLICT (key) DO UPDATE SET
           count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
           reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END
         RETURNING count`,
      )
      .bind(keyOf(l, id), now + l.windowMs, now, now)
      .first<{ count: number }>();
    return !row || row.count <= l.max;
  } catch (e) {
    log('error', { where: 'rateLimit', scope: l.scope, error: e instanceof Error ? e.message : String(e) });
    return true;
  }
}

/** True when the limit is used up, without counting. */
export async function isLimited(db: D1Database | undefined, l: Limit, id: string, now = Date.now()): Promise<boolean> {
  if (!db) return false;
  try {
    const row = await db.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?').bind(keyOf(l, id)).first<{ count: number; reset_at: number }>();
    return !!row && row.reset_at > now && row.count >= l.max;
  } catch {
    return false;
  }
}

export async function clear(db: D1Database | undefined, l: Limit, id: string): Promise<void> {
  if (!db) return;
  try {
    await db.prepare('DELETE FROM rate_limits WHERE key = ?').bind(keyOf(l, id)).run();
  } catch {
    /* best-effort */
  }
}

/** Drops expired counters (called now and then, e.g. on sign-up). */
export async function prune(db: D1Database | undefined, now = Date.now()): Promise<void> {
  if (!db) return;
  try {
    await db.prepare('DELETE FROM rate_limits WHERE reset_at <= ?').bind(now).run();
  } catch {
    /* best-effort */
  }
}
