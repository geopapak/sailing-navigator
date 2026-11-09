import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './worker';
import { makeTools } from './agent';
import { TRE_IRENE } from '../src/boat/treIrene';
import type { ChatContext } from '../src/ai/chat';

const env: Env = { ANTHROPIC_API_KEY: 'test-key', ACCESS_CODE: 'secret', ALLOWED_ORIGINS: 'https://geopapak.github.io', WINDY_KEY: 'wk' };
const ORIGIN = 'https://geopapak.github.io';
const ctx: ChatContext = { now: '2026-11-09T12:00:00+02:00', boat: TRE_IRENE, others: [{ name: 'Rival', scoring: TRE_IRENE.scoring.map((o) => ({ ...o, tot: o.tot * 0.98, tod: o.tod + 10 })) }] };

const post = (path: string, body: unknown) =>
  new Request(`https://w${path}`, { method: 'POST', body: JSON.stringify(body), headers: { Origin: ORIGIN, 'x-access-code': 'secret', 'content-type': 'application/json' } });

const msg = (content: unknown[], stop_reason = 'end_turn') => ({
  id: 'm',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content,
  stop_reason,
  usage: { input_tokens: 1, output_tokens: 1 },
});

afterEach(() => vi.unstubAllGlobals());

describe('advisor agent tools', () => {
  const tools = Object.fromEntries(makeTools(ctx).map((t) => [t.name, t]));

  it('computes targets and sails from the boat polars', async () => {
    const out = JSON.parse((await tools.boat_targets.run({ tws: 12, twa: 45 })) as string);
    expect(out.boat).toBe(TRE_IRENE.name);
    expect(out.beat.twa).toBeGreaterThan(30);
    expect(out.beat.bsp).toBeGreaterThan(5);
    expect(out.run.twa).toBeGreaterThan(130);
    expect(out.sail.recommended).toBeTruthy();
  });

  it('does ratings math against an opponent', async () => {
    const out = JSON.parse((await tools.ratings_math.run({ distance_nm: 20, elapsed_min: 180, opponent: 'riv', opponent_elapsed_min: 175 })) as string);
    expect(out.opponent).toBe('Rival');
    expect(out.corrected.length).toBe(TRE_IRENE.scoring.length);
    expect(out.vs[0].maxElapsedToTie.ToT).toMatch(/^\d+:\d\d:\d\d$/);
    expect(await tools.ratings_math.run({ distance_nm: 20, opponent: 'nobody' })).toContain('Δεν βρέθηκε');
  });

  it('resolves places for distance and bearing', async () => {
    const out = JSON.parse((await tools.distance_bearing.run({ from: 'Πειραιάς', to: 'Αίγινα' })) as string);
    expect(out.distanceNm).toBeGreaterThan(10);
    expect(out.distanceNm).toBeLessThan(16);
    expect(out.bearingTrue).toBeGreaterThan(200);
    expect(await tools.distance_bearing.run({ from: 'Ατλαντίδα', to: '37.9,23.6' })).toContain('Άγνωστο σημείο');
  });
});

describe('/chat endpoint', () => {
  it('runs the tool loop, caches the library and returns text with sources', async () => {
    const bodies: Record<string, unknown>[] = [];
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const r = new Request(input, init);
        bodies.push(JSON.parse(await r.text()));
        n++;
        const body =
          n === 1
            ? msg([{ type: 'tool_use', id: 'tu1', name: 'boat_targets', input: { tws: 12 } }], 'tool_use')
            : msg([
                {
                  type: 'text',
                  text: 'Όρτσα **42°** στα 12 kt.',
                  citations: [{ type: 'web_search_result_location', url: 'https://example.org/a', title: 'Πηγή', cited_text: 'x', encrypted_index: 'e' }],
                },
              ]);
        return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
      }),
    );
    const res = await worker.fetch(post('/chat', { messages: [{ role: 'user', text: 'Γωνία όρτσας;' }], context: ctx }), env);
    expect(res.status).toBe(200);
    const out = (await res.json()) as { text: string; tools: string[]; sources: { url: string }[] };
    expect(out.text).toContain('42°');
    expect(out.tools).toEqual(['boat_targets']);
    expect(out.sources[0].url).toBe('https://example.org/a');

    expect(bodies).toHaveLength(2);
    const first = bodies[0] as { system: { cache_control?: unknown; text: string }[]; tools: { name: string }[]; messages: { content: unknown }[]; fallbacks: string; model: string };
    expect(first.model).toBe('claude-opus-5-5');
    expect(first.fallbacks).toBe('default');
    expect(first.system.at(-1)!.cache_control).toEqual({ type: 'ephemeral' });
    expect(first.system.at(-1)!.text).toContain('Μελτέμι');
    expect(first.tools.map((t) => t.name)).toEqual(['boat_targets', 'ratings_math', 'weather_models', 'distance_bearing', 'web_search']);
    expect(JSON.stringify(first.messages[0].content)).toContain('<context>');
    // Second request carries the tool result computed by our code.
    const second = bodies[1] as { messages: { role: string; content: { type: string; content?: string }[] }[] };
    const result = second.messages.at(-1)!.content.find((c) => c.type === 'tool_result')!;
    expect(String(result.content)).toContain('"beat"');
  });

  it('validates the conversation', async () => {
    const bad = await worker.fetch(post('/chat', { messages: [{ role: 'assistant', text: 'x' }] }), env);
    expect(bad.status).toBe(400);
  });

  it('falls back to no web search when the organisation has it disabled', async () => {
    let n = 0;
    const seen: string[][] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const b = JSON.parse(await new Request(input, init).text());
        seen.push(b.tools.map((t: { name: string }) => t.name));
        n++;
        if (n === 1)
          return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'web search is not enabled for this organization' } }), { status: 400, headers: { 'content-type': 'application/json' } });
        return new Response(JSON.stringify(msg([{ type: 'text', text: 'ΟΚ' }])), { status: 200, headers: { 'content-type': 'application/json' } });
      }),
    );
    const res = await worker.fetch(post('/chat', { messages: [{ role: 'user', text: 'Γεια' }] }), env);
    expect(res.status).toBe(200);
    expect(seen[0]).toContain('web_search');
    expect(seen[1]).not.toContain('web_search');
  });
});

describe('/windy endpoint', () => {
  it('fetches each Windy model with the server key and converts units', async () => {
    const keys: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const b = JSON.parse(await new Request(input, init).text());
        keys.push(b.key);
        if (b.model === 'icon') return new Response(null, { status: 204 });
        return new Response(JSON.stringify({ ts: [1_800_000_000_000], 'wind_u-surface': [0], 'wind_v-surface': [-5] }), { status: 200 });
      }),
    );
    const res = await worker.fetch(post('/windy', { lat: 37.75, lon: 23.5 }), env);
    const out = (await res.json()) as { series: { short: string; tws: number[] }[] };
    expect(out.series.map((s) => s.short)).toEqual(['W·ICON-EU', 'W·GFS']);
    expect(out.series[0].tws[0]).toBeCloseTo(9.7, 1);
    expect(keys.every((k) => k === 'wk')).toBe(true);
  });

  it('says so when the server has no Windy key', async () => {
    const res = await worker.fetch(post('/windy', { lat: 37.75, lon: 23.5 }), { ...env, WINDY_KEY: undefined });
    expect(res.status).toBe(501);
  });
});
