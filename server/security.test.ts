import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './worker';
import type { D1Database, D1PreparedStatement } from './accounts';
import { LIMITS, hit, isLimited } from './rateLimit';

/** Protections found missing in the 0.8.4 security review. */
function fakeD1(withLimits = true): D1Database {
  const sql = new DatabaseSync(':memory:');
  const files = ['0001_accounts.sql', '0002_terms_reset_pdf.sql', '0003_pdf_cache.sql', ...(withLimits ? ['0004_rate_limits.sql'] : [])];
  for (const f of files) sql.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  const stmt = (q: string, args: unknown[] = []): D1PreparedStatement => ({
    bind: (...v: unknown[]) => stmt(q, v),
    first: async <T,>() => (sql.prepare(q).get(...(args as never[])) as T) ?? null,
    all: async <T,>() => ({ results: sql.prepare(q).all(...(args as never[])) as T[] }),
    run: async () => {
      const r = sql.prepare(q).run(...(args as never[]));
      return { results: [], meta: { changes: Number(r.changes) } };
    },
  });
  return {
    prepare: (q) => stmt(q),
    batch: async (list) => {
      const out = [];
      for (const s of list) out.push(await s.run());
      return out;
    },
  };
}

const ORIGIN = 'https://geopapak.github.io';
const mkEnv = (db = fakeD1()): Env => ({ ANTHROPIC_API_KEY: 'k', ACCESS_CODE: 'owner', ALLOWED_ORIGINS: ORIGIN, ADMIN_EMAIL: 'captain@example.org', DB: db });
const terms = { acceptTerms: true, acceptPrivacy: true };

function call(env: Env, method: string, path: string, body?: unknown, opts: { token?: string; ip?: string; origin?: string; base?: string } = {}) {
  const headers: Record<string, string> = { Origin: opts.origin ?? ORIGIN, 'content-type': 'application/json', 'CF-Connecting-IP': opts.ip ?? '203.0.113.1' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  return worker.fetch(new Request(`${opts.base ?? 'https://w'}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
}
const status = async (p: Promise<Response>) => (await p).status;

afterEach(() => vi.unstubAllGlobals());

describe('rate limits', () => {
  it('counts per window and resets after it', async () => {
    const db = fakeD1();
    const l = { scope: 't', max: 2, windowMs: 1000 };
    expect(await hit(db, l, 'x', 0)).toBe(true);
    expect(await hit(db, l, 'x', 10)).toBe(true);
    expect(await isLimited(db, l, 'x', 20)).toBe(true);
    expect(await hit(db, l, 'x', 20)).toBe(false);
    expect(await hit(db, l, 'y', 20)).toBe(true);
    expect(await hit(db, l, 'x', 1001)).toBe(true);
  });

  it('lets requests through when the table is missing (deploy before migration)', async () => {
    const db = fakeD1(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await hit(db, LIMITS.register, 'x')).toBe(true);
    expect(await status(call(mkEnv(db), 'POST', '/auth/register', { email: 'a@b.gr', password: 'longenough', ...terms }))).toBe(200);
  });

  it('limits sign-ups per connection', async () => {
    const env = mkEnv();
    for (let i = 0; i < LIMITS.register.max; i++) expect(await status(call(env, 'POST', '/auth/register', { email: `u${i}@b.gr`, password: 'longenough', ...terms }))).toBe(200);
    expect(await status(call(env, 'POST', '/auth/register', { email: 'more@b.gr', password: 'longenough', ...terms }))).toBe(429);
    expect(await status(call(env, 'POST', '/auth/register', { email: 'other@b.gr', password: 'longenough', ...terms }, { ip: '198.51.100.7' }))).toBe(200);
  });

  it('limits "forgot password" requests per connection', async () => {
    const env = mkEnv();
    for (let i = 0; i < LIMITS.forgot.max; i++) expect(await status(call(env, 'POST', '/auth/forgot', { email: `x${i}@b.gr` }))).toBe(200);
    expect(await status(call(env, 'POST', '/auth/forgot', { email: 'y@b.gr' }))).toBe(429);
  });
});

describe('login lockout', () => {
  it('a stranger with wrong passwords cannot lock the owner out', async () => {
    const env = mkEnv();
    await call(env, 'POST', '/auth/register', { email: 'crew@b.gr', password: 'longenough', ...terms }, { ip: '198.51.100.1' });
    for (let i = 0; i < 5; i++) expect(await status(call(env, 'POST', '/auth/login', { email: 'crew@b.gr', password: 'wrong' }, { ip: '203.0.113.9' }))).toBe(401);
    expect(await status(call(env, 'POST', '/auth/login', { email: 'crew@b.gr', password: 'longenough' }, { ip: '203.0.113.9' }))).toBe(429);
    expect(await status(call(env, 'POST', '/auth/login', { email: 'crew@b.gr', password: 'longenough' }, { ip: '198.51.100.1' }))).toBe(200);
  });

  it('locks the account everywhere after many failures from many connections', async () => {
    const env = mkEnv();
    await call(env, 'POST', '/auth/register', { email: 'crew@b.gr', password: 'longenough', ...terms });
    for (let i = 0; i < 50; i++) await call(env, 'POST', '/auth/login', { email: 'crew@b.gr', password: 'wrong' }, { ip: `10.0.${Math.floor(i / 4)}.${i}` });
    expect(await status(call(env, 'POST', '/auth/login', { email: 'crew@b.gr', password: 'longenough' }, { ip: '192.0.2.200' }))).toBe(429);
  });
});

describe('admin', () => {
  it('ADMIN_EMAIL makes only the first admin', async () => {
    const env = mkEnv();
    const first = await (await call(env, 'POST', '/auth/register', { email: 'captain@example.org', password: 'longenough', ...terms })).json();
    expect(first.user.isAdmin).toBe(true);
    // A second listed email signing up (or signing in) while an admin exists does not become admin.
    const env2 = mkEnv();
    env2.ADMIN_EMAIL = 'captain@example.org,mate@example.org';
    await call(env2, 'POST', '/auth/register', { email: 'captain@example.org', password: 'longenough', ...terms });
    const mate = await (await call(env2, 'POST', '/auth/register', { email: 'mate@example.org', password: 'longenough', ...terms }, { ip: '198.51.100.2' })).json();
    expect(mate.user.isAdmin).toBe(false);
    const again = await (await call(env2, 'POST', '/auth/login', { email: 'mate@example.org', password: 'longenough' })).json();
    expect(again.user.isAdmin).toBe(false);
  });
});

describe('free PDF readings', () => {
  it('are limited per connection across accounts', async () => {
    const env = mkEnv();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify({ isCertificate: false, uncertain: [] }) }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    let n = 0;
    const statuses: number[] = [];
    for (let a = 0; a < 3; a++) {
      const { token } = await (await call(env, 'POST', '/auth/register', { email: `p${a}@b.gr`, password: 'longenough', ...terms }, { ip: `198.51.100.${10 + a}` })).json();
      for (let i = 0; i < 3; i++) statuses.push(await status(call(env, 'POST', '/certificate', { data: btoa(`%PDF-1.4 t ${n++}`), mediaType: 'application/pdf' }, { token })));
    }
    expect(statuses.filter((s) => s === 429)).toHaveLength(9 - LIMITS.freePdf.max);
    expect(statuses.slice(0, LIMITS.freePdf.max).every((s) => s !== 429)).toBe(true);
  });
});

describe('CORS and headers', () => {
  it('allows local pages only on a local server', async () => {
    const env = mkEnv();
    const prod = await call(env, 'GET', '/health', undefined, { origin: 'http://localhost:5173' });
    expect(prod.headers.get('access-control-allow-origin')).toBeNull();
    const dev = await call(env, 'GET', '/health', undefined, { origin: 'http://localhost:5173', base: 'http://127.0.0.1:8787' });
    expect(dev.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('sends security headers', async () => {
    const r = await call(mkEnv(), 'GET', '/me');
    expect(r.status).toBe(401);
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
  });
});

describe('AI cost brakes (P-016)', () => {
  const ask = (env: Env, opts: { code?: string; token?: string; ip?: string; path?: string } = {}) => {
    const headers: Record<string, string> = { Origin: ORIGIN, 'content-type': 'application/json', 'CF-Connecting-IP': opts.ip ?? '203.0.113.9' };
    if (opts.code) headers['x-access-code'] = opts.code;
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    return worker.fetch(new Request(`https://w${opts.path ?? '/advice'}`, { method: 'POST', headers, body: '{}' }), env);
  };

  it('kill switch stops paid calls before anything else, even with the access code', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const env = { ...mkEnv(), AI_DISABLED: '1' };
    const r = await ask(env, { code: 'owner' });
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/προσωρινά κλειστός/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('the access code is paced per connection (no longer unlimited)', async () => {
    const env = mkEnv();
    const { ipKey } = await import('./rateLimit');
    const { AI_LIMITS } = await import('./aiBrakes');
    const id = await ipKey('203.0.113.9');
    for (let i = 0; i < AI_LIMITS.codePerHour.max; i++) await hit(env.DB, AI_LIMITS.codePerHour, id);
    const r = await ask(env, { code: 'owner' });
    expect(r.status).toBe(429);
    // Another connection is not affected by this counter (it fails later, on the empty body).
    expect((await ask(env, { code: 'owner', ip: '198.51.100.7' })).status).not.toBe(429);
  });

  it('server-wide monthly cap returns 503 and is read from the env', async () => {
    const env = { ...mkEnv(), AI_GLOBAL_MONTHLY_LIMIT: '2' };
    const { useGlobalBudget } = await import('./aiBrakes');
    await useGlobalBudget(env);
    await useGlobalBudget(env);
    const r = await ask(env, { code: 'owner' });
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/μηνιαίο όριο της υπηρεσίας/);
  });

  it('one account can ask at most a few times per minute', async () => {
    const { assertCallerPace, AI_LIMITS } = await import('./aiBrakes');
    const env = mkEnv();
    const now = 1_800_000_000_000;
    for (let i = 0; i < AI_LIMITS.perMinute.max; i++) await assertCallerPace(env, { user: 'u1' }, now);
    await expect(assertCallerPace(env, { user: 'u1' }, now)).rejects.toMatchObject({ status: 429 });
    await expect(assertCallerPace(env, { user: 'u2' }, now)).resolves.toBeUndefined();
    // A minute later the counter starts again.
    await expect(assertCallerPace(env, { user: 'u1' }, now + 61_000)).resolves.toBeUndefined();
  });

  it('defaults: global cap 1000, anything not "1" keeps AI on', async () => {
    const { globalMonthlyLimit, aiDisabled } = await import('./aiBrakes');
    expect(globalMonthlyLimit({})).toBe(1000);
    expect(globalMonthlyLimit({ AI_GLOBAL_MONTHLY_LIMIT: 'abc' })).toBe(1000);
    expect(aiDisabled({ AI_DISABLED: '0' })).toBe(false);
  });
});
