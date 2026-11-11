import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './worker';
import type { D1Database, D1PreparedStatement } from './accounts';
import { parseAisStream } from './race';

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
  return { prepare: (q) => stmt(q), batch: async (list) => Promise.all(list.map((s) => s.run())) };
}

const ORIGIN = 'https://geopapak.github.io';
const ORC_KEY = 'orc_' + 'a'.repeat(64);
const mkEnv = (extra: Partial<Env> = {}): Env => ({ ANTHROPIC_API_KEY: 'k', ACCESS_CODE: 'c', ALLOWED_ORIGINS: ORIGIN, DB: fakeD1(), ...extra });

async function signup(env: Env, email = 'a@b.gr', name = ''): Promise<string> {
  const r = await worker.fetch(
    new Request('https://w/auth/register', {
      method: 'POST',
      headers: { Origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ email, name, password: 'longenough', acceptTerms: true, acceptPrivacy: true }),
    }),
    env,
  );
  return ((await r.json()) as { token: string }).token;
}
const get = (env: Env, path: string, token?: string) => worker.fetch(new Request(`https://w${path}`, { headers: { Origin: ORIGIN, ...(token ? { Authorization: `Bearer ${token}` } : {}) } }), env);

afterEach(() => vi.unstubAllGlobals());

describe('race endpoints', () => {
  it('reads an entry list with the AI and counts it against the PDF allowance', async () => {
    const env = mkEnv();
    const token = await signup(env);
    const extract = {
      isEntryList: true,
      event: 'Χειμερινό 3',
      entries: [
        { name: 'ΑΣΤΑΡΤΗ', sailNo: 'GRE-1234', className: 'ORC B', mmsi: '239 112 233', club: 'ΠΟΙΑΘ' },
        { name: 'ΘΕΤΙΣ', sailNo: 'GRE-301', className: 'ORC B', mmsi: '12', club: '' },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(extract) }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const r = await worker.fetch(
      new Request('https://w/entrylist', {
        method: 'POST',
        headers: { Origin: ORIGIN, 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data: btoa('%PDF-1.4'), mediaType: 'application/pdf' }),
      }),
      env,
    );
    const out = (await r.json()) as { entries: { name: string; mmsi: string }[] };
    expect(r.status).toBe(200);
    expect(out.entries.map((e) => e.mmsi)).toEqual(['239112233', '']);
    const me = (await (await get(env, '/me', token)).json()) as { user: { pdf: { used: number } } };
    expect(me.user.pdf.used).toBe(1);
  });

  it('answers the same file again from the cache: no AI call, not counted, even for another user', async () => {
    const env = mkEnv();
    const token = await signup(env);
    const extract = { isEntryList: true, event: 'Χειμερινό 4', entries: [{ name: 'ΑΣΤΑΡΤΗ', sailNo: 'GRE-1234', className: 'ORC B', mmsi: '', club: '' }] };
    const ai = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(extract) }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', ai);
    const upload = (t: string, data = btoa('%PDF-1.4 list')) =>
      worker.fetch(
        new Request('https://w/entrylist', {
          method: 'POST',
          headers: { Origin: ORIGIN, 'content-type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({ data, mediaType: 'application/pdf' }),
        }),
        env,
      );
    expect((await upload(token)).status).toBe(200);
    const again = (await (await upload(token)).json()) as { event: string; entries: { sailNo: string }[]; cached?: boolean };
    expect(again).toMatchObject({ event: 'Χειμερινό 4', cached: true });
    expect(again.entries[0].sailNo).toBe('GRE-1234');
    const other = await signup(env, 'c@d.gr');
    expect(((await (await upload(other)).json()) as { cached?: boolean }).cached).toBe(true);
    expect(ai).toHaveBeenCalledTimes(1);
    const me = (await (await get(env, '/me', token)).json()) as { user: { pdf: { used: number } } };
    expect(me.user.pdf.used).toBe(1);
    // A different file is a new reading.
    await upload(token, btoa('%PDF-1.4 other list'));
    expect(ai).toHaveBeenCalledTimes(2);
  });

  it('looks a boat up in the ORC API, without the key ever reaching the logs', async () => {
    const env = mkEnv({ ORC_API_KEY: ORC_KEY });
    const token = await signup(env);
    const urls: string[] = [];
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((l: string) => void logs.push(String(l)));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: RequestInfo | URL) => {
        urls.push(String(u));
        return new Response(
          JSON.stringify({
            rms: [{ RefNo: '034X', SailNo: 'GRE-1234', YachtName: 'ASTARTI', GPH: 560, APHD: 560, APHT: 600 / 560, OSN: 580, TMF_Offshore: 600 / 580 }],
            ScoringOptions: [],
          }),
          { status: 200 },
        );
      }),
    );
    const r = await get(env, '/orc/boat?sailNo=gre%201234', token);
    const out = (await r.json()) as { found: boolean; boat: { name: string; scoring: { id: string; tod: number }[] } };
    expect(out.found).toBe(true);
    expect(out.boat.name).toBe('ASTARTI');
    expect(out.boat.scoring.find((o) => o.id === 'coastal')!.tod).toBe(580);
    expect(urls[0]).toContain('/DownBoatRMS?');
    expect(urls[0]).toContain('SailNo=GRE-1234');
    expect(logs.join('\n')).not.toContain(ORC_KEY);
    vi.restoreAllMocks();
  });

  it('says when the optional keys are missing, and needs sign-in', async () => {
    const env = mkEnv();
    const token = await signup(env);
    expect((await get(env, '/orc/boat?sailNo=GRE-1', token)).status).toBe(501);
    expect((await get(env, '/ais?mmsi=239112233', token)).status).toBe(501);
    expect((await get(env, '/orc/boat?sailNo=GRE-1')).status).toBe(401);
  });

  it('writes race lessons for an approved account and counts the question', async () => {
    const env = mkEnv({ ADMIN_EMAIL: 'a@b.gr' });
    const token = await signup(env);
    let sent = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
        sent = String(init?.body ?? '');
        const out = { lessons: [{ text: 'Η αναστροφή στο 1:05 κόστισε ~1:50.', impact: '~2 λεπτά' }] };
        return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
    const post = (summary: unknown) =>
      worker.fetch(
        new Request('https://w/analysis', {
          method: 'POST',
          headers: { Origin: ORIGIN, 'content-type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ summary }),
        }),
        env,
      );
    const r = await post({ totals: { tacks: 11 } });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { lessons: { impact: string }[] }).lessons[0].impact).toBe('~2 λεπτά');
    expect(sent).toContain('"tacks\\":11');
    const me = (await (await get(env, '/me', token)).json()) as { user: { ai: { used: number } } };
    expect(me.user.ai.used).toBe(1);
    expect((await post('x'.repeat(30_000))).status).toBe(413);
  });

  it('the same public sail number alone no longer shares crew notes (P-022: crew members only)', async () => {
    const env = mkEnv();
    const sync = (token: string, changes: unknown[]) =>
      worker.fetch(
        new Request('https://w/sync', {
          method: 'POST',
          headers: { Origin: ORIGIN, 'content-type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ since: 0, changes }),
        }),
        env,
      );
    const skipper = await signup(env, 'skipper@b.gr', 'Νίκος Π.');
    const crew = await signup(env, 'crew@b.gr', 'Μαρία');
    const other = await signup(env, 'other@b.gr', 'Άλλος');
    const boat = (sailNumber: string) => ({ kind: 'boat', id: 'b1', updatedAt: 1, data: { id: 'b1', name: 'X', sailNumber, isOwn: true } });
    const n = (id: string, scope: string) => ({ kind: 'note', id, updatedAt: 1, data: { id, scope, sailNo: 'GRE-4711', place: 'Αίγινα', text: id, dirs: [], speeds: [], lat: 37.7, lon: 23.4, radiusNm: 1 } });
    await sync(skipper, [boat('GRE-4711'), n('shared', 'crew'), n('private', 'me')]);
    await sync(crew, [boat('gre 4711')]);
    await sync(other, [boat('GRE-1')]);
    const list = async (t: string) => ((await (await get(env, '/notes/crew', t)).json()) as { notes: { text: string; author: string }[] }).notes;
    // Sharing with the crew now goes through crew invitations (see crews.test.ts).
    expect(await list(crew)).toEqual([]);
    expect(await list(other)).toEqual([]);
    expect(await list(skipper)).toEqual([]);
    expect((await get(env, '/notes/crew')).status).toBe(401);
  });

  it('parses aisstream.io position messages', () => {
    const p = parseAisStream(
      JSON.stringify({
        MessageType: 'StandardClassBPositionReport',
        MetaData: { MMSI: 239112233, ShipName: 'ASTARTI   ', latitude: 37.81, longitude: 23.55, time_utc: '2026-11-14 10:15:02.123 +0000 UTC' },
        Message: { StandardClassBPositionReport: { Sog: 6.8, Cog: 312 } },
      }),
    )!;
    expect(p).toMatchObject({ mmsi: '239112233', lat: 37.81, lon: 23.55, sog: 6.8, cog: 312, name: 'ASTARTI' });
    expect(p.t).toBe(Date.UTC(2026, 10, 14, 10, 15, 2));
    expect(parseAisStream('{}')).toBeUndefined();
  });
});
