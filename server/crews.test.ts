import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import worker, { type Env } from './worker';
import type { D1Database, D1PreparedStatement } from './accounts';

/** Crews with invitations (P-022) over the real routes, on an in-memory D1. */
function fakeD1(): D1Database {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  for (const f of ['0001_accounts.sql', '0002_terms_reset_pdf.sql', '0003_pdf_cache.sql', '0004_rate_limits.sql', '0005_crews.sql'])
    sql.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
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
const mkEnv = (): Env => ({ ANTHROPIC_API_KEY: 'k', ACCESS_CODE: 'owner', ALLOWED_ORIGINS: ORIGIN, ADMIN_EMAIL: 'captain@example.test', DB: fakeD1() });
let ipN = 1;
async function call<T = Record<string, unknown>>(env: Env, method: string, path: string, body?: unknown, token?: string, status = 200): Promise<T> {
  const headers: Record<string, string> = { Origin: ORIGIN, 'content-type': 'application/json', 'CF-Connecting-IP': `203.0.113.${ipN++ % 250}` };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await worker.fetch(new Request(`https://w${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
  const j = (await r.json()) as T;
  expect(r.status, JSON.stringify(j)).toBe(status);
  return j;
}
const user = async (env: Env, name: string) =>
  (
    await call<{ token: string }>(env, 'POST', '/auth/register', {
      email: `${name.split(' ')[0].toLowerCase()}${ipN}@example.test`,
      password: 'long-password-1',
      name,
      acceptTerms: true,
      acceptPrivacy: true,
    })
  ).token;

async function setup() {
  const env = mkEnv();
  const owner = await user(env, 'Γιώργος');
  const mate = await user(env, 'Μαρία Π');
  const other = await user(env, 'Κώστας');
  const { crew } = await call<{ crew: { id: string } }>(env, 'POST', '/crews', { boatId: 'b1', boatName: 'ΑΣΤΑΡΤΗ', sailNo: 'GRE-1234' }, owner);
  return { env, owner, mate, other, crewId: crew.id };
}
const join = async (env: Env, owner: string, crewId: string, who: string, body: Record<string, unknown> = {}) => {
  const inv = await call<{ token: string }>(env, 'POST', `/crews/${crewId}/invites`, { kind: 'crew' }, owner);
  await call(env, 'POST', `/invites/${inv.token}/accept`, body, who);
  return inv.token;
};

/** A shared training exactly as the app sends it (P-035). */
const training = (over: Record<string, unknown> = {}, summary: Record<string, unknown> = {}) => ({
  kind: 'training',
  name: 'Προπόνηση όρτσα',
  start: Date.now() - 3_600_000,
  goal: 'upwind',
  note: '  Δουλέψαμε το τζένοα  ',
  summary: {
    durationSec: 5400,
    distanceNm: 8.2,
    twsMin: 8,
    twsMax: 14,
    avgPct: 93,
    pausedSec: 600,
    indicative: false,
    laps: [
      { n: 1, sec: 900, pct: 91, sail: 'J1', helm: 'Α', trim: 'τζένοα πιο μέσα' },
      { n: 2, sec: 870, pct: 95, helm: 'Β' },
    ],
    pctTable: [{ leg: 'upwind', band: '8–12', pct: 94 }],
    manoeuvres: [{ kind: 'tack', count: 12, avgRecoverSec: 9, bestRecoverSec: 6 }],
    ...summary,
  },
  ...over,
});

describe('crews and invitations (P-022)', () => {
  it('invite link: one use; the athlete card is seen only by owner and member', async () => {
    const { env, owner, mate, other, crewId } = await setup();
    const inv = await call<{ token: string }>(env, 'POST', `/crews/${crewId}/invites`, { kind: 'crew' }, owner);
    const pre = await call(env, 'GET', `/invites/${inv.token}`, undefined, mate);
    expect(pre).toMatchObject({ boatName: 'ΑΣΤΑΡΤΗ', owner: 'Γιώργος', kind: 'crew' });
    await call(env, 'POST', `/invites/${inv.token}/accept`, { athleteCard: 'ΕΙΟ 12345' }, mate);
    await call(env, 'POST', `/invites/${inv.token}/accept`, {}, other, 410);

    const o = await call<{ owned: { members: { name: string; athleteCard: string | null }[] }[] }>(env, 'GET', '/crews', undefined, owner);
    expect(o.owned[0].members).toEqual([expect.objectContaining({ name: 'Μαρία Π', athleteCard: 'ΕΙΟ 12345' })]);
    const m = await call<{ member: { athleteCard: string; crew: Record<string, unknown>[] }[] }>(env, 'GET', '/crews', undefined, mate);
    expect(m.member[0].athleteCard).toBe('ΕΙΟ 12345');
    expect(m.member[0].crew[0]).not.toHaveProperty('athleteCard');
    expect((await call<{ member: unknown[] }>(env, 'GET', '/crews', undefined, other)).member).toEqual([]);
  });

  it('only the owner invites and shares races; members only read and can leave', async () => {
    const { env, owner, mate, crewId } = await setup();
    await call(env, 'POST', `/crews/${crewId}/invites`, { kind: 'crew' }, mate, 404);
    await join(env, owner, crewId, mate);
    const plan = {
      name: 'Χειμερινό 3η',
      start: Date.now() + 86_400_000,
      courseName: 'Φάληρο',
      marks: [{ name: 'Πάνω', lat: 37.9, lon: 23.6 }],
      note: 'Στις 10 στη μαρίνα',
      crew: [{ name: 'Μαρία Π', role: 'helm' }],
      track: [1, 2, 3],
    };
    await call(env, 'PUT', `/crews/${crewId}/races/r1`, plan, mate, 404);
    await call(env, 'PUT', `/crews/${crewId}/races/r1`, plan, owner);
    const m = await call<{ member: { races: { data: Record<string, unknown> }[] }[] }>(env, 'GET', '/crews', undefined, mate);
    expect(m.member[0].races[0].data).toMatchObject({ name: 'Χειμερινό 3η', note: 'Στις 10 στη μαρίνα', crew: [{ name: 'Μαρία Π', role: 'helm' }] });
    expect(m.member[0].races[0].data).not.toHaveProperty('track');
    await call(env, 'PATCH', `/crews/${crewId}/members/me`, { athleteCard: '42' }, mate);
    expect((await call<{ member: { athleteCard: string }[] }>(env, 'GET', '/crews', undefined, mate)).member[0].athleteCard).toBe('42');
    await call(env, 'DELETE', `/crews/${crewId}/members/me`, undefined, mate);
    expect((await call<{ member: unknown[] }>(env, 'GET', '/crews', undefined, mate)).member).toEqual([]);
  });

  it('a guest sees only their race and loses access after it', async () => {
    const { env, owner, mate, other, crewId } = await setup();
    await call(env, 'PUT', `/crews/${crewId}/races/old`, { name: 'Παλιός', start: Date.now() - 3 * 86_400_000 }, owner);
    await call(env, 'PUT', `/crews/${crewId}/races/next`, { name: 'Επόμενος', start: Date.now() + 86_400_000 }, owner);
    const g1 = await call<{ token: string }>(env, 'POST', `/crews/${crewId}/invites`, { kind: 'guest', raceId: 'next' }, owner);
    await call(env, 'POST', `/invites/${g1.token}/accept`, {}, mate);
    const m = await call<{ member: { kind: string; races: { raceId: string }[] }[] }>(env, 'GET', '/crews', undefined, mate);
    expect(m.member[0].kind).toBe('guest');
    expect(m.member[0].races.map((r) => r.raceId)).toEqual(['next']);
    const g2 = await call<{ token: string }>(env, 'POST', `/crews/${crewId}/invites`, { kind: 'guest', raceId: 'old' }, owner);
    await call(env, 'POST', `/invites/${g2.token}/accept`, {}, other);
    expect((await call<{ member: unknown[] }>(env, 'GET', '/crews', undefined, other)).member).toEqual([]);
  });

  it('crew notes go only to the owner and permanent crew of that sail number', async () => {
    const { env, owner, mate, other, crewId } = await setup();
    await join(env, owner, crewId, mate);
    const note = (id: string, sailNo: string, text: string) => ({ kind: 'note', id, updatedAt: Date.now(), data: { id, scope: 'crew', sailNo, text } });
    await call(env, 'POST', '/sync', { since: 0, changes: [note('n1', '1234', 'ρεύμα στο Φλέβες'), note('n2', '999', 'άλλο σκάφος')] }, mate);
    // A stranger who only knows the public sail number gets nothing.
    await call(env, 'POST', '/sync', { since: 0, changes: [{ kind: 'boat', id: 'x', updatedAt: Date.now(), data: { id: 'x', isOwn: true, sailNumber: 'GRE 1234' } }] }, other);
    const o = await call<{ notes: { text: string; author: string }[] }>(env, 'GET', '/notes/crew', undefined, owner);
    expect(o.notes.map((n) => n.text)).toEqual(['ρεύμα στο Φλέβες']);
    expect(o.notes[0].author).toBe('Μαρία');
    expect((await call<{ notes: unknown[] }>(env, 'GET', '/notes/crew', undefined, other)).notes).toEqual([]);
  });

  it('export contains my crews and my card; deleting the owner account removes the crew', async () => {
    const { env, owner, mate, crewId } = await setup();
    await join(env, owner, crewId, mate, { athleteCard: '777' });
    const ex = await call<{ memberships: { athleteCard: string }[] }>(env, 'GET', '/me/export', undefined, mate);
    expect(ex.memberships[0].athleteCard).toBe('777');
    const exo = await call<{ ownedCrews: { members: Record<string, unknown>[] }[] }>(env, 'GET', '/me/export', undefined, owner);
    expect(exo.ownedCrews[0].members[0]).not.toHaveProperty('athleteCard');
    // GDPR export also carries what the owner shared with the crew (races and trainings).
    await call(env, 'PUT', `/crews/${crewId}/races/t1`, training(), owner);
    const exr = await call<{ ownedCrews: { races: { raceId: string; data: { kind?: string } }[] }[] }>(env, 'GET', '/me/export', undefined, owner);
    expect(exr.ownedCrews[0].races).toEqual([expect.objectContaining({ raceId: 't1', data: expect.objectContaining({ kind: 'training' }) })]);
    await call(env, 'DELETE', '/me', undefined, owner);
    expect((await call<{ member: unknown[] }>(env, 'GET', '/crews', undefined, mate)).member).toEqual([]);
  });

  it('rejects a bad card number and needs the current terms', async () => {
    const { env, owner, mate, crewId } = await setup();
    const inv = await call<{ token: string }>(env, 'POST', `/crews/${crewId}/invites`, {}, owner);
    await call(env, 'POST', `/invites/${inv.token}/accept`, { athleteCard: '<script>' }, mate, 400);
    await (env.DB as D1Database).prepare('UPDATE users SET terms_version = 2').run();
    await call(env, 'POST', `/invites/${inv.token}/accept`, {}, mate, 409);
  });

  it('shares a training summary with the crew under a strict schema (P-035)', async () => {
    const { env, owner, mate, crewId } = await setup();
    await join(env, owner, crewId, mate);
    await call(env, 'PUT', `/crews/${crewId}/races/t1`, training({ extra: 'dropped' }, { laps: [{ n: 1, sec: 900, pct: null, sail: ` ${'Σ'.repeat(70)} `, helm: 'Γ' }] }), owner);
    const m = await call<{ member: { races: { data: Record<string, unknown> }[] }[] }>(env, 'GET', '/crews', undefined, mate);
    const data = m.member[0].races[0].data as { summary: { laps: { sail: string }[] } } & Record<string, unknown>;
    expect(data).toMatchObject({ kind: 'training', name: 'Προπόνηση όρτσα', goal: 'upwind', note: 'Δουλέψαμε το τζένοα' });
    expect(data).not.toHaveProperty('extra');
    expect(data.summary.laps[0].sail).toHaveLength(60);
    // A missing goal is a free session.
    await call(env, 'PUT', `/crews/${crewId}/races/t2`, training({ goal: undefined }), owner);
    const m2 = await call<{ member: { races: { raceId: string; data: { goal?: string } }[] }[] }>(env, 'GET', '/crews', undefined, mate);
    expect(m2.member[0].races.find((r) => r.raceId === 't2')?.data.goal).toBe('free');
  });

  it('refuses positions, bad values and cruises in a shared training (P-035)', async () => {
    const { env, owner, crewId } = await setup();
    const put = (body: unknown, status: number) => call(env, 'PUT', `/crews/${crewId}/races/t1`, body, owner, status);
    // Any track, marks, fixes or coordinates, at any depth.
    await put(training({ track: [[37.9, 23.6]] }), 400);
    await put(training({ marks: [] }), 400);
    await put(training({}, { fixes: [] }), 400);
    await put(training({}, { laps: [{ n: 1, sec: 1, pct: 1, lat: 37.9 }] }), 400);
    await put(training({}, { pctTable: [{ leg: 'upwind', band: '8–12', pct: 1, where: { lon: 23.6 } }] }), 400);
    await put(training({ start: { latitude: 1 } }), 400);
    // Strict values.
    await put(training({ goal: 'racing' }), 400);
    await put(training({}, { durationSec: 'long' }), 400);
    await put(training({}, { avgPct: Number.NaN }), 200); // NaN → null in JSON, which is allowed for avgPct…
    await put(training({}, { durationSec: null }), 400); // …but not for the duration.
    await put(training({}, { indicative: 'yes' }), 400);
    await put(training({}, { laps: [{ n: 1, sec: 1, pct: 1, helm: 'Γιώργος' }] }), 400);
    await put(training({}, { laps: Array.from({ length: 101 }, (_, i) => ({ n: i + 1, sec: 60, pct: null })) }), 400);
    await put(training({}, { pctTable: Array.from({ length: 31 }, () => ({ leg: 'reach', band: '4–8', pct: null })) }), 400);
    await put(training({}, { pctTable: [{ leg: 'sideways', band: '4–8', pct: null }] }), 400);
    await put(training({}, { manoeuvres: [{ kind: 'tack', count: 1, avgRecoverSec: null, bestRecoverSec: null }, { kind: 'gybe', count: 1, avgRecoverSec: null, bestRecoverSec: null }, { kind: 'tack', count: 1, avgRecoverSec: null, bestRecoverSec: null }] }), 400);
    await put(training({ summary: undefined }), 400);
    await put(training({ name: '' }), 400);
    // A cruise is never shared; unknown kinds neither.
    await put({ kind: 'cruise', name: 'Βόλτα', start: Date.now() }, 400);
    await put({ kind: 'party', name: 'Χ', start: Date.now() }, 400);
    // 100 laps are fine; the stored size limit still applies (Greek text counts as bytes).
    const lap = (i: number) => ({ n: i + 1, sec: 60, pct: 90, sail: 'Σ'.repeat(60), helm: 'Α', trim: 'Τ'.repeat(60) });
    await put(training({}, { laps: Array.from({ length: 100 }, (_, i) => ({ n: i + 1, sec: 60, pct: 90, helm: 'Α' })) }), 200);
    const big = await put(training(
        { name: 'Ο'.repeat(80), note: 'Ν'.repeat(500) },
        { laps: Array.from({ length: 100 }, (_, i) => lap(i)), pctTable: Array.from({ length: 30 }, () => ({ leg: 'downwind', band: 'Ζ'.repeat(20), pct: 88.5 })) },
      ), 413);
    expect(big).toEqual({ error: 'Πολύ μεγάλο.' });
    // The race plan is unchanged: marks with coordinates are still shared for a race.
    await put({ kind: 'race', name: 'Αγώνας', start: Date.now(), marks: [{ name: 'Π', lat: 37.9, lon: 23.6 }] }, 200);
  });

  it('a guest cannot be invited to a shared training, nor see one (P-035)', async () => {
    const { env, owner, mate, crewId } = await setup();
    await call(env, 'PUT', `/crews/${crewId}/races/t1`, training(), owner);
    const r = await call<{ error: string }>(env, 'POST', `/crews/${crewId}/invites`, { kind: 'guest', raceId: 't1' }, owner, 400);
    expect(r.error).toBe('Ο καλεσμένος χρειάζεται αγώνα.');
    // Invited to a race that the owner later replaces with a training: the guest sees nothing.
    await call(env, 'PUT', `/crews/${crewId}/races/r1`, { name: 'Αγώνας', start: Date.now() + 86_400_000 }, owner);
    const g = await call<{ token: string }>(env, 'POST', `/crews/${crewId}/invites`, { kind: 'guest', raceId: 'r1' }, owner);
    await call(env, 'POST', `/invites/${g.token}/accept`, {}, mate);
    await call(env, 'PUT', `/crews/${crewId}/races/r1`, training(), owner);
    const m = await call<{ member: { races: unknown[] }[] }>(env, 'GET', '/crews', undefined, mate);
    expect(m.member[0].races).toEqual([]);
  });
});
