import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './worker';

const env: Env = { ANTHROPIC_API_KEY: 'test-key', ACCESS_CODE: 'secret', ALLOWED_ORIGINS: 'https://geopapak.github.io' };
const ORIGIN = 'https://geopapak.github.io';
const ctx = { kind: 'live', now: '2026-11-09T12:00:00+02:00', boat: { name: 'TRE IRENE', performanceFactor: 1, sails: [] }, live: { tws: 10, twa: 42 } };

const req = (path: string, init: RequestInit = {}, code = 'secret') =>
  new Request(`https://worker.example${path}`, { ...init, headers: { Origin: ORIGIN, 'x-access-code': code, 'content-type': 'application/json', ...(init.headers ?? {}) } });

/** Fake Anthropic Messages API response. */
function mockAnthropic(body: object, status = 200) {
  const calls: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const r = new Request(input, init);
      calls.push({ url: r.url, headers: r.headers, body: JSON.parse(await r.text()) });
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }),
  );
  return calls;
}

const message = (text: string, extra: object = {}) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 10, output_tokens: 10 },
  ...extra,
});

afterEach(() => vi.unstubAllGlobals());

describe('advisor worker', () => {
  it('answers CORS preflight only for allowed origins', async () => {
    const ok = await worker.fetch(new Request('https://w/advice', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const bad = await worker.fetch(new Request('https://w/advice', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env);
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('reports health and whether the access code matches', async () => {
    const r = await worker.fetch(req('/health', { method: 'GET' }, 'wrong'), env);
    expect(await r.json()).toEqual({ ok: true, codeOk: false, configured: true, windy: false, orc: false, aisstream: false, accounts: false });
  });

  it('rejects a wrong access code without calling the API', async () => {
    const calls = mockAnthropic(message('{}'));
    const r = await worker.fetch(req('/advice', { method: 'POST', body: JSON.stringify(ctx) }, 'nope'), env);
    expect(r.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('rejects malformed context', async () => {
    mockAnthropic(message('{}'));
    const r = await worker.fetch(req('/advice', { method: 'POST', body: JSON.stringify({ kind: 'live' }) }), env);
    expect(r.status).toBe(400);
  });

  it('calls Claude with structured output and fallbacks, and returns the reply', async () => {
    const reply = { summary: 'Καλή ταχύτητα.', actions: [{ text: 'Κράτα 42°', when: 'now' }], caution: '' };
    const calls = mockAnthropic(message(JSON.stringify(reply)));
    const r = await worker.fetch(req('/advice', { method: 'POST', body: JSON.stringify({ ...ctx, question: 'Πώς πάμε;' }) }), env);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ reply, model: 'claude-opus-5-5', fallback: false });

    expect(calls).toHaveLength(1);
    const c = calls[0];
    expect(c.url).toContain('/v1/messages');
    expect(c.headers.get('x-api-key') ?? c.headers.get('authorization')).toMatch(/test-key/);
    expect(c.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(c.body.model).toBe('claude-opus-5-5');
    expect(c.body.fallbacks).toBe('default');
    expect(c.body).not.toHaveProperty('thinking');
    const oc = c.body.output_config as { effort: string; format: { type: string } };
    expect(oc.effort).toBe('low');
    expect(oc.format.type).toBe('json_schema');
    const msgs = c.body.messages as { content: string }[];
    expect(msgs[0].content).toContain('Πώς πάμε;');
  });

  it('maps refusals and unparseable output to errors', async () => {
    mockAnthropic(message('', { stop_reason: 'refusal', content: [] }));
    expect((await worker.fetch(req('/advice', { method: 'POST', body: JSON.stringify(ctx) }), env)).status).toBe(502);
    mockAnthropic(message('not json'));
    expect((await worker.fetch(req('/advice', { method: 'POST', body: JSON.stringify(ctx) }), env)).status).toBe(502);
  });

  it('maps an invalid API key to a clear error', async () => {
    mockAnthropic({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401);
    const r = await worker.fetch(req('/advice', { method: 'POST', body: JSON.stringify(ctx) }), env);
    expect(r.status).toBe(500);
    expect(((await r.json()) as { error: string }).error).toContain('κλειδί');
  });
});
