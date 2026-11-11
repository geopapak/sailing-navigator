import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi, afterEach } from 'vitest';
import worker, { type Env } from './worker';
import type { D1Database, D1PreparedStatement } from './accounts';

/** D1 on top of Node's built-in SQLite, with the real migration. */
function fakeD1(): D1Database {
  const sql = new DatabaseSync(':memory:');
  for (const f of ['0001_accounts.sql', '0002_terms_reset_pdf.sql', '0003_pdf_cache.sql', '0004_rate_limits.sql', '0005_crews.sql']) sql.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
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
const mkEnv = (): Env => ({ ANTHROPIC_API_KEY: 'k', ACCESS_CODE: 'owner', ALLOWED_ORIGINS: ORIGIN, ADMIN_EMAIL: 'Captain@Example.org', DB: fakeD1() });

function call(env: Env, method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { Origin: ORIGIN, 'content-type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return worker.fetch(new Request(`https://w${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
}
async function ok<T = Record<string, unknown>>(p: Promise<Response>, status = 200): Promise<T> {
  const r = await p;
  const j = await r.json();
  expect(r.status, JSON.stringify(j)).toBe(status);
  return j as T;
}

afterEach(() => vi.unstubAllGlobals());

describe('accounts', () => {
  it('registers, signs in, rejects bad passwords and locks after five failures', async () => {
    const env = mkEnv();
    const a = await ok<{ token: string; user: { isAdmin: boolean; ai: { allowed: boolean } } }>(call(env, 'POST', '/auth/register', { email: 'crew@x.gr', password: 'longenough', name: 'Crew', acceptTerms: true, acceptPrivacy: true }));
    expect(a.token).toMatch(/^[0-9a-f]{64}$/);
    expect(a.user.isAdmin).toBe(false);
    expect(a.user.ai.allowed).toBe(false);
    await ok(call(env, 'POST', '/auth/register', { email: 'CREW@x.gr', password: 'longenough', acceptTerms: true, acceptPrivacy: true }), 409);
    await ok(call(env, 'POST', '/auth/register', { email: 'bad', password: 'longenough', acceptTerms: true, acceptPrivacy: true }), 400);
    await ok(call(env, 'POST', '/auth/register', { email: 'a@b.gr', password: 'short', acceptTerms: true, acceptPrivacy: true }), 400);

    const me = await ok<{ user: { email: string } }>(call(env, 'GET', '/me', undefined, a.token));
    expect(me.user.email).toBe('crew@x.gr');
    await ok(call(env, 'GET', '/me', undefined, 'f'.repeat(64)), 401);

    await ok(call(env, 'POST', '/auth/login', { email: 'crew@x.gr', password: 'longenough' }));
    for (let i = 0; i < 5; i++) await ok(call(env, 'POST', '/auth/login', { email: 'crew@x.gr', password: 'wrong-pass' }), 401);
    await ok(call(env, 'POST', '/auth/login', { email: 'crew@x.gr', password: 'longenough' }), 429);

    await ok(call(env, 'POST', '/auth/logout', {}, a.token));
    await ok(call(env, 'GET', '/me', undefined, a.token), 401);
  });

  it('makes the configured email the admin, who approves AI for others', async () => {
    const env = mkEnv();
    const admin = await ok<{ token: string; user: { isAdmin: boolean; ai: { allowed: boolean } } }>(call(env, 'POST', '/auth/register', { email: 'captain@example.org', password: 'adminpass1', acceptTerms: true, acceptPrivacy: true }));
    expect(admin.user.isAdmin).toBe(true);
    expect(admin.user.ai.allowed).toBe(true);
    const crew = await ok<{ token: string; user: { id: string } }>(call(env, 'POST', '/auth/register', { email: 'crew@x.gr', password: 'longenough', acceptTerms: true, acceptPrivacy: true }));

    // Not approved yet → no AI.
    await ok(call(env, 'POST', '/chat', { messages: [{ role: 'user', text: 'Γεια' }] }, crew.token), 403);
    await ok(call(env, 'GET', '/admin/users', undefined, crew.token), 403);

    const list = await ok<{ users: { id: string; email: string }[] }>(call(env, 'GET', '/admin/users', undefined, admin.token));
    expect(list.users.map((u) => u.email).sort()).toEqual(['captain@example.org', 'crew@x.gr']);
    await ok(call(env, 'POST', `/admin/users/${crew.user.id}`, { aiAllowed: true, aiLimit: 1 }, admin.token));

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'Καλώς ήρθες.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const r = await ok<{ text: string }>(call(env, 'POST', '/chat', { messages: [{ role: 'user', text: 'Γεια' }] }, crew.token));
    expect(r.text).toBe('Καλώς ήρθες.');
    // Monthly limit of 1 reached.
    await ok(call(env, 'POST', '/chat', { messages: [{ role: 'user', text: 'Ξανά' }] }, crew.token), 429);
    const me = await ok<{ user: { ai: { used: number; limit: number } } }>(call(env, 'GET', '/me', undefined, crew.token));
    expect(me.user.ai).toMatchObject({ used: 1, limit: 1 });

    // Password reset by the admin invalidates sessions and gives a temporary password.
    const reset = await ok<{ tempPassword: string }>(call(env, 'POST', `/admin/users/${crew.user.id}`, { resetPassword: true }, admin.token));
    await ok(call(env, 'GET', '/me', undefined, crew.token), 401);
    await ok(call(env, 'POST', '/auth/login', { email: 'crew@x.gr', password: reset.tempPassword }));
  });

  it('syncs boats between devices with last-write-wins and deletions', async () => {
    const env = mkEnv();
    const { token } = await ok<{ token: string }>(call(env, 'POST', '/auth/register', { email: 'a@b.gr', password: 'longenough', acceptTerms: true, acceptPrivacy: true }));
    // Device 1 uploads two boats.
    const s1 = await ok<{ now: number; items: unknown[] }>(
      call(env, 'POST', '/sync', { since: 0, changes: [
        { kind: 'boat', id: 'b1', data: { name: 'One' }, updatedAt: 1000 },
        { kind: 'boat', id: 'b2', data: { name: 'Two' }, updatedAt: 1000 },
        { kind: 'evil', id: 'x', data: {}, updatedAt: 1 },
      ] }, token),
    );
    expect(s1.items).toEqual([]);
    // Device 2 pulls everything.
    const s2 = await ok<{ now: number; items: { id: string; data: { name: string } }[] }>(call(env, 'POST', '/sync', { since: 0, changes: [] }, token));
    expect(s2.items.map((i) => i.id).sort()).toEqual(['b1', 'b2']);
    // Device 2 edits b1 (newer) and deletes b2; device 1 sends an older edit of b1.
    await ok(call(env, 'POST', '/sync', { since: s2.now, changes: [
      { kind: 'boat', id: 'b1', data: { name: 'One v2' }, updatedAt: 2000 },
      { kind: 'boat', id: 'b2', deleted: true, updatedAt: 2000 },
    ] }, token));
    const s3 = await ok<{ items: { id: string; deleted: boolean; data?: { name: string } }[] }>(
      call(env, 'POST', '/sync', { since: s1.now, changes: [{ kind: 'boat', id: 'b1', data: { name: 'One stale' }, updatedAt: 1500 }] }, token),
    );
    const b1 = s3.items.find((i) => i.id === 'b1')!;
    const b2 = s3.items.find((i) => i.id === 'b2')!;
    expect(b1.data!.name).toBe('One v2');
    expect(b2.deleted).toBe(true);
    // Other users never see these.
    const other = await ok<{ token: string }>(call(env, 'POST', '/auth/register', { email: 'z@b.gr', password: 'longenough', acceptTerms: true, acceptPrivacy: true }));
    const s4 = await ok<{ items: unknown[] }>(call(env, 'POST', '/sync', { since: 0, changes: [] }, other.token));
    expect(s4.items).toEqual([]);
  });

  it('requires accepting the terms, and asks existing users to accept new ones', async () => {
    const env = mkEnv();
    await ok(call(env, 'POST', '/auth/register', { email: 'x@y.gr', password: 'longenough' }), 400);
    const r = await ok<{ token: string; user: { termsOk: boolean; termsAt: number } }>(
      call(env, 'POST', '/auth/register', { email: 'x@y.gr', password: 'longenough', acceptTerms: true, acceptPrivacy: true, marketing: true }),
    );
    expect(r.user.termsOk).toBe(true);
    expect(r.user.termsAt).toBeGreaterThan(0);
    // An account from before the terms existed.
    (env.DB as D1Database).prepare('UPDATE users SET terms_version = 0').run();
    const me = await ok<{ user: { termsOk: boolean } }>(call(env, 'GET', '/me', undefined, r.token));
    expect(me.user.termsOk).toBe(false);
    await ok(call(env, 'POST', '/me/terms', { version: 99 }, r.token), 409);
    const acc = await ok<{ user: { termsOk: boolean } }>(call(env, 'POST', '/me/terms', { version: 3 }, r.token));
    expect(acc.user.termsOk).toBe(true);
  });

  it('handles forgotten passwords through the admin with a temporary password', async () => {
    const env = mkEnv();
    const admin = await ok<{ token: string }>(call(env, 'POST', '/auth/register', { email: 'captain@example.org', password: 'adminpass1', acceptTerms: true, acceptPrivacy: true }));
    const crew = await ok<{ token: string; user: { id: string } }>(call(env, 'POST', '/auth/register', { email: 'crew@x.gr', password: 'longenough', acceptTerms: true, acceptPrivacy: true }));
    // Same answer for unknown emails.
    await ok(call(env, 'POST', '/auth/forgot', { email: 'nobody@x.gr' }));
    await ok(call(env, 'POST', '/auth/forgot', { email: 'crew@x.gr' }));
    const list = await ok<{ users: { email: string; resetRequestedAt: number | null }[] }>(call(env, 'GET', '/admin/users', undefined, admin.token));
    expect(list.users.find((u) => u.email === 'crew@x.gr')!.resetRequestedAt).toBeGreaterThan(0);

    const reset = await ok<{ tempPassword: string }>(call(env, 'POST', `/admin/users/${crew.user.id}`, { resetPassword: true }, admin.token));
    const li = await ok<{ token: string; user: { mustChangePassword: boolean } }>(call(env, 'POST', '/auth/login', { email: 'crew@x.gr', password: reset.tempPassword }));
    expect(li.user.mustChangePassword).toBe(true);
    // No current password needed right after a temporary one.
    const ch = await ok<{ user: { mustChangePassword: boolean } }>(call(env, 'POST', '/me/password', { next: 'brand-new-pass' }, li.token));
    expect(ch.user.mustChangePassword).toBe(false);
    // From now on the current password is required again.
    await ok(call(env, 'POST', '/me/password', { next: 'another-pass-1' }, li.token), 401);
    await ok(call(env, 'POST', '/auth/login', { email: 'crew@x.gr', password: 'brand-new-pass' }));
    const after = await ok<{ users: { email: string; resetRequestedAt: number | null }[] }>(call(env, 'GET', '/admin/users', undefined, admin.token));
    expect(after.users.find((u) => u.email === 'crew@x.gr')!.resetRequestedAt).toBeNull();
  });

  it('exports all of a user\'s data', async () => {
    const env = mkEnv();
    const { token } = await ok<{ token: string }>(call(env, 'POST', '/auth/register', { email: 'a@b.gr', password: 'longenough', name: 'Άννα', acceptTerms: true, acceptPrivacy: true }));
    await ok(call(env, 'POST', '/sync', { since: 0, changes: [{ kind: 'boat', id: 'b1', data: { name: 'One' }, updatedAt: 1 }] }, token));
    const x = await ok<{ account: { email: string; name: string; termsAcceptedAt: string }; boats: { name: string }[]; courses: unknown[] }>(call(env, 'GET', '/me/export', undefined, token));
    expect(x.account).toMatchObject({ email: 'a@b.gr', name: 'Άννα' });
    expect(x.account.termsAcceptedAt).toMatch(/^\d{4}-/);
    expect(x.boats).toEqual([{ name: 'One' }]);
    expect(JSON.stringify(x)).not.toContain('pass_hash');
  });

  it('reads a certificate with the AI, within 3 free readings', async () => {
    const env = mkEnv();
    const { token } = await ok<{ token: string }>(call(env, 'POST', '/auth/register', { email: 'a@b.gr', password: 'longenough', acceptTerms: true, acceptPrivacy: true }));
    const extract = {
      isCertificate: true,
      boat: { name: 'Αστάρτη', sailNumber: 'GRE-1', design: 'X', orcRef: 'R', certificateType: 'ORC Club', validUntil: '2027-12-31', loa: 12, beam: 4, draft: 2, displacement: 9000, crewWeight: 700, gph: 600, cdl: 10 },
      polar: { tws: [6, 8], beatAngle: [44, 42], beatVMG: [4, 5], rows: [{ twa: 90, speeds: [6, 7] }], runVMG: [4, 5], gybeAngle: [145, 150] },
      scoring: [{ label: 'Coastal/Long Distance', tod: 600, tot: 1 }],
      sails: [],
      uncertain: [],
    };
    const bodies: { messages: { content: { type: string; source?: { media_type: string } }[] }[]; output_config: { format: { type: string } } }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(JSON.parse(await new Request(input, init).text()));
        return new Response(
          JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(extract) }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );
    const pdf = (i: number) => btoa(`%PDF-1.4 test ${i}`);
    for (let i = 0; i < 3; i++) {
      const r = await ok<{ extract: { boat: { name: string } } }>(call(env, 'POST', '/certificate', { data: pdf(i), mediaType: 'application/pdf' }, token));
      expect(r.extract.boat.name).toBe('Αστάρτη');
    }
    expect(bodies[0].messages[0].content[0]).toMatchObject({ type: 'document', source: { media_type: 'application/pdf' } });
    expect(bodies[0].output_config.format.type).toBe('json_schema');
    // Fourth new file needs AI approval…
    await ok(call(env, 'POST', '/certificate', { data: pdf(3), mediaType: 'application/pdf' }, token), 403);
    // …but a file already read comes back from the cache, free.
    const again = await ok<{ cached: boolean }>(call(env, 'POST', '/certificate', { data: pdf(0), mediaType: 'application/pdf' }, token));
    expect(again.cached).toBe(true);
    expect(bodies).toHaveLength(3);
    const me = await ok<{ user: { pdf: { used: number; left: number } } }>(call(env, 'GET', '/me', undefined, token));
    expect(me.user.pdf).toEqual({ used: 3, left: 0 });
    await ok(call(env, 'POST', '/certificate', { data: pdf(0), mediaType: 'application/pdf' }), 401);
  });

  it('still accepts the owner access code for AI', async () => {
    const env = mkEnv();
    const r = await worker.fetch(
      new Request('https://w/chat', { method: 'POST', headers: { Origin: ORIGIN, 'x-access-code': 'nope' }, body: '{}' }),
      env,
    );
    expect(r.status).toBe(401);
  });
});
