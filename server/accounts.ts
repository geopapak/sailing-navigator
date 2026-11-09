/**
 * Accounts on Cloudflare D1: sign-up / sign-in with email + password
 * (PBKDF2-SHA256), opaque session tokens (only their hash is stored),
 * per-user sync of boats and courses, and the AI allow-list with a monthly
 * question limit, managed by the admin (ADMIN_EMAIL).
 */

/** The subset of Cloudflare's D1 API we use (kept local: no extra type package). */
import { log } from './log';

export interface D1Result<T = unknown> {
  results: T[];
  meta?: { changes?: number };
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export interface AccountEnv {
  DB?: D1Database;
  /** The owner's email: becomes admin with AI allowed. */
  ADMIN_EMAIL?: string;
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  pass_hash: string;
  pass_salt: string;
  created_at: number;
  is_admin: number;
  ai_allowed: number;
  ai_limit: number;
  ai_month: string | null;
  ai_count: number;
  failed_logins: number;
  locked_until: number;
  terms_version: number;
  terms_at: number | null;
  marketing: number;
  must_change_password: number;
  reset_requested_at: number | null;
  pdf_used: number;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  ai: { allowed: boolean; used: number; limit: number };
  /** Accepted the current Terms and Privacy policy. */
  termsOk: boolean;
  termsAt: number | null;
  /** Signed in with a temporary password: must set a new one. */
  mustChangePassword: boolean;
  /** Certificate (PDF) readings: free ones left (null = unlimited, for AI-approved users). */
  pdf: { used: number; left: number | null };
}

/** Bump when the Terms or Privacy policy change: everyone accepts again. */
export const TERMS_VERSION = 1;
/** Free certificate readings for users not (yet) approved for AI. */
export const FREE_PDF_READS = 3;

const SESSION_DAYS = 120;
const PBKDF2_ITER = 100_000; // Workers' maximum for PBKDF2.
const MAX_ITEMS = 500;
const MAX_ITEM_BYTES = 200 * 1024;
export const SYNC_KINDS = ['boat', 'course'] as const;

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer | Uint8Array) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));
const month = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 7);

export async function sha256(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256);
  return hex(bits);
}

function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const normEmail = (e: string) => e.trim().toLowerCase();
const isAdminEmail = (env: AccountEnv, email: string) =>
  !!env.ADMIN_EMAIL && env.ADMIN_EMAIL.split(',').map(normEmail).includes(normEmail(email));

export function publicUser(u: UserRow): PublicUser {
  const used = u.ai_month === month() ? u.ai_count : 0;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    isAdmin: !!u.is_admin,
    ai: { allowed: !!u.ai_allowed, used, limit: u.ai_limit },
    termsOk: (u.terms_version ?? 0) >= TERMS_VERSION,
    termsAt: u.terms_at ?? null,
    mustChangePassword: !!u.must_change_password,
    pdf: { used: u.pdf_used ?? 0, left: u.ai_allowed ? null : Math.max(0, FREE_PDF_READS - (u.pdf_used ?? 0)) },
  };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function db(env: AccountEnv): D1Database {
  if (!env.DB) throw new HttpError(501, 'Οι λογαριασμοί δεν έχουν ρυθμιστεί στον server.');
  return env.DB;
}

async function newSession(env: AccountEnv, userId: string): Promise<string> {
  const token = randomHex(32);
  const now = Date.now();
  await db(env)
    .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, now, now + SESSION_DAYS * 86_400_000)
    .run();
  return token;
}

export async function register(
  env: AccountEnv,
  body: { email?: unknown; password?: unknown; name?: unknown; acceptTerms?: unknown; acceptPrivacy?: unknown; marketing?: unknown },
) {
  if (body.acceptTerms !== true || body.acceptPrivacy !== true) {
    throw new HttpError(400, 'Χρειάζεται αποδοχή των Όρων χρήσης και της Πολιτικής απορρήτου.');
  }
  const email = typeof body.email === 'string' ? normEmail(body.email) : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
  if (!EMAIL_RE.test(email) || email.length > 120) throw new HttpError(400, 'Άκυρο email.');
  if (password.length < 8 || password.length > 200) throw new HttpError(400, 'Ο κωδικός θέλει τουλάχιστον 8 χαρακτήρες.');
  const d = db(env);
  if (await d.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()) throw new HttpError(409, 'Υπάρχει ήδη λογαριασμός με αυτό το email.');
  const salt = randomHex(16);
  const admin = isAdminEmail(env, email) ? 1 : 0;
  const u: UserRow = {
    id: randomHex(12),
    email,
    name: name || email.split('@')[0],
    pass_hash: await hashPassword(password, salt),
    pass_salt: salt,
    created_at: Date.now(),
    is_admin: admin,
    ai_allowed: admin,
    ai_limit: admin ? 1000 : 100,
    ai_month: null,
    ai_count: 0,
    failed_logins: 0,
    locked_until: 0,
    terms_version: TERMS_VERSION,
    terms_at: Date.now(),
    marketing: body.marketing === true ? 1 : 0,
    must_change_password: 0,
    reset_requested_at: null,
    pdf_used: 0,
  };
  await d
    .prepare(
      `INSERT INTO users (id, email, name, pass_hash, pass_salt, created_at, is_admin, ai_allowed, ai_limit, terms_version, terms_at, marketing)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(u.id, u.email, u.name, u.pass_hash, u.pass_salt, u.created_at, u.is_admin, u.ai_allowed, u.ai_limit, u.terms_version, u.terms_at, u.marketing)
    .run();
  log('register', { user: u.id, admin: !!u.is_admin, marketing: !!u.marketing });
  return { token: await newSession(env, u.id), user: publicUser(u) };
}

export async function login(env: AccountEnv, body: { email?: unknown; password?: unknown }) {
  const email = typeof body.email === 'string' ? normEmail(body.email) : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const d = db(env);
  const u = await d.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  const now = Date.now();
  if (u && u.locked_until > now) throw new HttpError(429, 'Πολλές λάθος προσπάθειες. Δοκίμασε ξανά σε 15 λεπτά.');
  // Hash even for unknown emails so timing doesn't reveal which emails exist.
  const ok = u ? sameHex(await hashPassword(password, u.pass_salt), u.pass_hash) : (await hashPassword(password, '00'.repeat(16)), false);
  if (!u || !ok) {
    if (u) {
      const fails = u.failed_logins + 1;
      await d
        .prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?')
        .bind(fails >= 5 ? 0 : fails, fails >= 5 ? now + 15 * 60_000 : 0, u.id)
        .run();
    }
    log('login_failed', { user: u?.id ?? null, locked: !!u && u.failed_logins + 1 >= 5 });
    throw new HttpError(401, 'Λάθος email ή κωδικός.');
  }
  const admin = isAdminEmail(env, u.email);
  if (admin && (!u.is_admin || !u.ai_allowed)) {
    u.is_admin = 1;
    u.ai_allowed = 1;
  }
  await d.prepare('UPDATE users SET failed_logins = 0, locked_until = 0, is_admin = ?, ai_allowed = ? WHERE id = ?').bind(u.is_admin, u.ai_allowed, u.id).run();
  log('login', { user: u.id, temp: !!u.must_change_password });
  return { token: await newSession(env, u.id), user: publicUser(u) };
}

/** The signed-in user for a request (Authorization: Bearer <token>), if any. */
export async function sessionUser(env: AccountEnv, req: Request): Promise<{ user: UserRow; tokenHash: string } | undefined> {
  const h = req.headers.get('Authorization') ?? '';
  const m = h.match(/^Bearer\s+([0-9a-f]{64})$/i);
  if (!m || !env.DB) return undefined;
  const tokenHash = await sha256(m[1].toLowerCase());
  const row = await env.DB.prepare(
    'SELECT u.*, s.expires_at AS s_expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?',
  )
    .bind(tokenHash)
    .first<UserRow & { s_expires: number }>();
  if (!row || row.s_expires < Date.now()) return undefined;
  return { user: row, tokenHash };
}

export async function logout(env: AccountEnv, tokenHash: string) {
  await db(env).prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Forgot my password" without email: marks the request for the admin, who
 * hands out a temporary password. Same answer whether or not the email exists.
 */
export async function requestReset(env: AccountEnv, body: { email?: unknown }) {
  const email = typeof body.email === 'string' ? normEmail(body.email) : '';
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Άκυρο email.');
  const r = await db(env).prepare('UPDATE users SET reset_requested_at = ? WHERE email = ?').bind(Date.now(), email).run();
  log('password_reset_requested', { known: (r.meta?.changes ?? 0) > 0 });
  return { ok: true };
}

export async function acceptTerms(env: AccountEnv, u: UserRow, body: { version?: unknown }) {
  if (body.version !== TERMS_VERSION) throw new HttpError(409, 'Οι όροι άλλαξαν· ανανέωσε την εφαρμογή.');
  const at = Date.now();
  await db(env).prepare('UPDATE users SET terms_version = ?, terms_at = ? WHERE id = ?').bind(TERMS_VERSION, at, u.id).run();
  return { user: publicUser({ ...u, terms_version: TERMS_VERSION, terms_at: at }) };
}

/** Everything stored about the user (GDPR portability). */
export async function exportData(env: AccountEnv, u: UserRow) {
  const items = await db(env)
    .prepare('SELECT kind, id, data, updated_at FROM items WHERE user_id = ? AND deleted = 0')
    .bind(u.id)
    .all<{ kind: string; id: string; data: string | null; updated_at: number }>();
  return {
    exportedAt: new Date().toISOString(),
    account: {
      email: u.email,
      name: u.name,
      createdAt: new Date(u.created_at).toISOString(),
      termsVersion: u.terms_version,
      termsAcceptedAt: u.terms_at ? new Date(u.terms_at).toISOString() : null,
      marketingEmails: !!u.marketing,
      aiAllowed: !!u.ai_allowed,
      aiQuestionsThisMonth: u.ai_month === month() ? u.ai_count : 0,
      certificateReadings: u.pdf_used,
    },
    boats: items.results.filter((r) => r.kind === 'boat').map((r) => (r.data ? JSON.parse(r.data) : null)),
    courses: items.results.filter((r) => r.kind === 'course').map((r) => (r.data ? JSON.parse(r.data) : null)),
  };
}

/** Checks the certificate-reading allowance before the (paid) AI call. */
export function canReadPdf(u: UserRow): void {
  if (!u.ai_allowed && (u.pdf_used ?? 0) >= FREE_PDF_READS) {
    throw new HttpError(403, `Χρησιμοποίησες τις ${FREE_PDF_READS} δωρεάν αναγνώσεις πιστοποιητικού. Ζήτα από τον διαχειριστή να σου ενεργοποιήσει το AI.`);
  }
}

export async function countPdfRead(env: AccountEnv, u: UserRow) {
  await db(env).prepare('UPDATE users SET pdf_used = pdf_used + 1 WHERE id = ?').bind(u.id).run();
}

/**
 * Counts one AI question against the user's monthly limit. Throws when the
 * user is not approved or the limit is reached.
 */
export async function useAiQuota(env: AccountEnv, u: UserRow): Promise<void> {
  if (!u.ai_allowed) throw new HttpError(403, 'Ο σύμβουλος AI δεν έχει ενεργοποιηθεί για τον λογαριασμό σου. Ζήτα έγκριση από τον διαχειριστή.');
  const m = month();
  const used = u.ai_month === m ? u.ai_count : 0;
  if (used >= u.ai_limit) throw new HttpError(429, `Έφτασες το μηνιαίο όριο (${u.ai_limit} ερωτήσεις). Ζήτα αύξηση από τον διαχειριστή.`);
  await db(env).prepare('UPDATE users SET ai_month = ?, ai_count = ? WHERE id = ?').bind(m, used + 1, u.id).run();
}

export interface SyncItem {
  kind: string;
  id: string;
  /** JSON of the boat/course; absent when deleted. */
  data?: unknown;
  updatedAt: number;
  deleted?: boolean;
}

/**
 * Two-way sync: stores the client's changes (last write wins by updatedAt)
 * and returns everything changed on the server since `since` (server clock).
 */
export async function sync(env: AccountEnv, u: UserRow, body: { since?: unknown; changes?: unknown }) {
  const d = db(env);
  const since = typeof body.since === 'number' && body.since > 0 ? body.since : 0;
  const changes = Array.isArray(body.changes) ? (body.changes as SyncItem[]) : [];
  if (changes.length > MAX_ITEMS) throw new HttpError(413, 'Πάρα πολλές αλλαγές.');
  const now = Date.now();
  type Row = { kind: string; id: string; data: string | null; updated_at: number; deleted: number; server_at: number };
  const existing = await d.prepare('SELECT kind, id, updated_at FROM items WHERE user_id = ?').bind(u.id).all<Pick<Row, 'kind' | 'id' | 'updated_at'>>();
  const have = new Map(existing.results.map((r) => [`${r.kind}:${r.id}`, r.updated_at]));
  const accepted = new Set<string>();
  const rejected: { kind: string; id: string }[] = [];
  const stmts: D1PreparedStatement[] = [];
  for (const c of changes) {
    if (!c || !SYNC_KINDS.includes(c.kind as (typeof SYNC_KINDS)[number]) || typeof c.id !== 'string' || c.id.length > 100) continue;
    if (typeof c.updatedAt !== 'number' || !Number.isFinite(c.updatedAt)) continue;
    const key = `${c.kind}:${c.id}`;
    const at = Math.round(c.updatedAt);
    const prev = have.get(key);
    if (prev !== undefined && prev >= at) {
      // The server has the same or a newer version: send it back unless identical.
      if (prev > at) rejected.push({ kind: c.kind, id: c.id });
      continue;
    }
    const data = c.deleted ? null : JSON.stringify(c.data ?? null);
    if (data && data.length > MAX_ITEM_BYTES) throw new HttpError(413, 'Πολύ μεγάλο προφίλ σκάφους.');
    if (prev === undefined && !c.deleted && have.size + accepted.size >= MAX_ITEMS) {
      throw new HttpError(413, `Όριο ${MAX_ITEMS} σκαφών/διαδρομών ανά λογαριασμό.`);
    }
    accepted.add(key);
    stmts.push(
      d
        .prepare(
          `INSERT INTO items (user_id, kind, id, data, updated_at, deleted, server_at) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id, kind, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at,
             deleted = excluded.deleted, server_at = excluded.server_at`,
        )
        .bind(u.id, c.kind, c.id, data, at, c.deleted ? 1 : 0, now),
    );
  }
  if (stmts.length) await d.batch(stmts);
  const toItem = (r: Row): SyncItem => ({ kind: r.kind, id: r.id, updatedAt: r.updated_at, deleted: !!r.deleted, data: r.data ? JSON.parse(r.data) : undefined });
  // Everything changed since `since`, minus what this request itself just wrote.
  const rows = await d.prepare('SELECT kind, id, data, updated_at, deleted, server_at FROM items WHERE user_id = ? AND server_at > ?').bind(u.id, since).all<Row>();
  const out = new Map<string, SyncItem>();
  for (const r of rows.results) if (!accepted.has(`${r.kind}:${r.id}`)) out.set(`${r.kind}:${r.id}`, toItem(r));
  for (const k of rejected) {
    if (out.has(`${k.kind}:${k.id}`)) continue;
    const r = await d.prepare('SELECT kind, id, data, updated_at, deleted, server_at FROM items WHERE user_id = ? AND kind = ? AND id = ?').bind(u.id, k.kind, k.id).first<Row>();
    if (r) out.set(`${k.kind}:${k.id}`, toItem(r));
  }
  if (accepted.size || out.size) log('sync', { user: u.id, pushed: accepted.size, pulled: out.size });
  return { now, items: [...out.values()] };
}

// ---- Admin -------------------------------------------------------------

export async function listUsers(env: AccountEnv) {
  const rows = await db(env).prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 500').all<UserRow>();
  return rows.results.map((u) => ({ ...publicUser(u), createdAt: u.created_at, resetRequestedAt: u.reset_requested_at ?? null }));
}

export async function updateUser(env: AccountEnv, id: string, body: { aiAllowed?: unknown; aiLimit?: unknown; resetPassword?: unknown }) {
  const d = db(env);
  const u = await d.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  if (!u) throw new HttpError(404, 'Δεν βρέθηκε ο χρήστης.');
  let tempPassword: string | undefined;
  if (typeof body.aiAllowed === 'boolean') u.ai_allowed = body.aiAllowed ? 1 : 0;
  if (typeof body.aiLimit === 'number' && body.aiLimit >= 0 && body.aiLimit <= 10_000) u.ai_limit = Math.round(body.aiLimit);
  const stmts = [d.prepare('UPDATE users SET ai_allowed = ?, ai_limit = ? WHERE id = ?').bind(u.ai_allowed, u.ai_limit, id)];
  if (body.resetPassword === true) {
    // No email service: the admin hands the temporary password to the user.
    tempPassword = randomHex(5);
    const salt = randomHex(16);
    stmts.push(
      d
        .prepare(
          'UPDATE users SET pass_hash = ?, pass_salt = ?, failed_logins = 0, locked_until = 0, must_change_password = 1, reset_requested_at = NULL WHERE id = ?',
        )
        .bind(await hashPassword(tempPassword, salt), salt, id),
      d.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    );
  }
  await d.batch(stmts);
  log('admin_update', { user: id, aiAllowed: !!u.ai_allowed, aiLimit: u.ai_limit, resetPassword: !!tempPassword });
  return { user: publicUser(u), tempPassword };
}

export async function changePassword(env: AccountEnv, u: UserRow, tokenHash: string, body: { current?: unknown; next?: unknown }) {
  const cur = typeof body.current === 'string' ? body.current : '';
  const next = typeof body.next === 'string' ? body.next : '';
  // After a temporary password the user just signed in with it: no need to type it again.
  if (!u.must_change_password && !sameHex(await hashPassword(cur, u.pass_salt), u.pass_hash)) throw new HttpError(401, 'Λάθος τρέχων κωδικός.');
  if (next.length < 8 || next.length > 200) throw new HttpError(400, 'Ο νέος κωδικός θέλει τουλάχιστον 8 χαρακτήρες.');
  const salt = randomHex(16);
  const d = db(env);
  await d.batch([
    d.prepare('UPDATE users SET pass_hash = ?, pass_salt = ?, must_change_password = 0 WHERE id = ?').bind(await hashPassword(next, salt), salt, u.id),
    // Other devices sign in again with the new password.
    d.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(u.id, tokenHash),
  ]);
  log('password_changed', { user: u.id, afterTemp: !!u.must_change_password });
  return { user: publicUser({ ...u, must_change_password: 0 }) };
}

export async function deleteAccount(env: AccountEnv, u: UserRow) {
  const d = db(env);
  await d.batch([
    d.prepare('DELETE FROM items WHERE user_id = ?').bind(u.id),
    d.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
    d.prepare('DELETE FROM users WHERE id = ?').bind(u.id),
  ]);
  log('account_deleted', { user: u.id });
}
