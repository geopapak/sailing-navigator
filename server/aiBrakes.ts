/**
 * Cost brakes for paid AI calls (P-016):
 * - AI_DISABLED = "1" stops every paid call at once (kill switch);
 * - one user (or one connection using the access code) can ask at most a few times per minute;
 * - the access code no longer means "no limits": it is counted per connection per hour;
 * - all paid calls together stop at AI_GLOBAL_MONTHLY_LIMIT per month.
 */
import type { D1Database } from './accounts';
import { HttpError } from './accounts';
import { log } from './log';
import { hit, type Limit } from './rateLimit';

export interface BrakeEnv {
  DB?: D1Database;
  /** "1" turns off every paid AI call. */
  AI_DISABLED?: string;
  /** Paid AI calls per month for the whole server (default below). */
  AI_GLOBAL_MONTHLY_LIMIT?: string;
}

export const DEFAULT_GLOBAL_MONTHLY = 1000;

export const AI_LIMITS = {
  /** Questions per minute from one account. */
  perMinute: { scope: 'aimin', max: 6, windowMs: 60_000 },
  /** Calls per hour from one connection using the owner's access code. */
  codePerHour: { scope: 'aicode', max: 40, windowMs: 60 * 60_000 },
} satisfies Record<string, Limit>;

export function aiDisabled(env: BrakeEnv): boolean {
  return (env.AI_DISABLED ?? '').trim() === '1';
}

export function globalMonthlyLimit(env: BrakeEnv): number {
  const n = Number((env.AI_GLOBAL_MONTHLY_LIMIT ?? '').trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_GLOBAL_MONTHLY;
}

const monthKey = (now: number) => new Date(now).toISOString().slice(0, 7);

/** Throws 503 when paid AI is switched off. */
export function assertAiOn(env: BrakeEnv): void {
  if (aiDisabled(env)) throw new HttpError(503, 'Ο σύμβουλος AI είναι προσωρινά κλειστός. Δοκίμασε αργότερα.');
}

/**
 * Per-caller speed limit: `who` is the user id, or the hashed IP for access-code calls.
 * Throws 429 when used up.
 */
export async function assertCallerPace(env: BrakeEnv, who: { user?: string; ipKey?: string }, now = Date.now()): Promise<void> {
  if (who.user) {
    if (!(await hit(env.DB, AI_LIMITS.perMinute, who.user, now))) {
      throw new HttpError(429, 'Πολλές ερωτήσεις σε λίγο χρόνο. Περίμενε ένα λεπτό και ξαναρώτα.');
    }
    return;
  }
  if (who.ipKey && !(await hit(env.DB, AI_LIMITS.codePerHour, who.ipKey, now))) {
    throw new HttpError(429, 'Πολλές ερωτήσεις με τον κωδικό πρόσβασης αυτή την ώρα. Δοκίμασε αργότερα.');
  }
}

/** Counts one paid call against the server-wide monthly cap; throws 503 when reached. */
export async function useGlobalBudget(env: BrakeEnv, now = Date.now()): Promise<void> {
  const max = globalMonthlyLimit(env);
  const limit: Limit = { scope: 'aiglobal', max, windowMs: 32 * 24 * 60 * 60_000 };
  if (!(await hit(env.DB, limit, monthKey(now), now))) {
    log('ai', { kind: 'global-cap', month: monthKey(now), max });
    throw new HttpError(503, 'Ο σύμβουλος AI έφτασε το μηνιαίο όριο της υπηρεσίας. Θα ανοίξει ξανά τον επόμενο μήνα.');
  }
}
