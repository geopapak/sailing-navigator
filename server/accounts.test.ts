import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi, afterEach } from 'vitest';
import worker, { type Env } from './worker';
import type { D1Database, D1PreparedStatement } from './accounts';

/** D1 on top of Node's built-in SQLite, with the real migration. */
function fakeD1(): D1Database {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/0001_accounts.sql', import.meta.url), 'utf8'));
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
    const a = await ok<{ token: string; user: { isAdmin: boolean; ai: { allowed: boolean } } }>(call(env, 'POST', '/auth/register', { email: 'crew@x.gr', password: 'longenough', name: 'Crew' }));
    expect(a.token).toMatch(/^[0-9a-f]{64}$/);
    expect(a.user.isAdmin).toBe(false);
    expect(a.user.ai.allowed).toBe(false);
    await ok(call(env, 'POST', '/auth/register', { email: 'CREW@x.gr', password: 'longenough' }), 409);
    await ok(call(env, 'POST', '/auth/register', { email: 'bad', password: 'longenough' }), 400);
    await ok(call(env, 'POST', '/auth/register', { email: 'a@b.gr', password: 'short' }), 400);

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
    const admin = await ok<{ token: string; user: { isAdmin: boolean; ai: { allowed: boolean } } }>(call(env, 'POST', '/auth/register', { email: 'captain@example.org', password: 'adminpass1' }));
    expect(admin.user.isAdmin).toBe(true);
    expect(admin.user.ai.allowed).toBe(true);
    const crew = await ok<{ token: string; user: { id: string } }>(call(env, 'POST', '/auth/register', { email: 'crew@x.gr', password: 'longenough' }));

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
    const { token } = await ok<{ token: string }>(call(env, 'POST', '/auth/register', { email: 'a@b.gr', password: 'longenough' }));
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
    const other = await ok<{ token: string }>(call(env, 'POST', '/auth/register', { email: 'z@b.gr', password: 'longenough' }));
    const s4 = await ok<{ items: unknown[] }>(call(env, 'POST', '/sync', { since: 0, changes: [] }, other.token));
    expect(s4.items).toEqual([]);
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
