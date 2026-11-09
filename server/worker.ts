/**
 * AI advisor backend (Cloudflare Worker).
 *
 * Keeps the Anthropic API key off the phone. The app posts numbers it has
 * already computed; Claude turns them into short tactical advice in Greek.
 *
 * Secrets (wrangler secret put …): ANTHROPIC_API_KEY, ACCESS_CODE
 * Vars (wrangler.toml): ALLOWED_ORIGINS — comma-separated list of app origins.
 */
import Anthropic from '@anthropic-ai/sdk';
import { REPLY_SCHEMA, SYSTEM_PROMPT, isReply, userMessage, validateContext } from '../src/ai/prompt';
import type { AdvisorResponse } from '../src/ai/types';

export interface Env {
  ANTHROPIC_API_KEY: string;
  ACCESS_CODE: string;
  ALLOWED_ORIGINS?: string;
}

const MODEL = 'claude-opus-5-5';
const MAX_BODY = 48 * 1024;

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = origin && (allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  return ok
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type, x-access-code',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : { Vary: 'Origin' };
}

function json(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors } });
}

/** Constant-time string comparison for the access code. */
function sameCode(a: string, b: string): boolean {
  if (!a || !b) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const cors = corsHeaders(req.headers.get('Origin'), env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const codeOk = sameCode((req.headers.get('x-access-code') ?? '').trim(), (env.ACCESS_CODE ?? '').trim());

    if (req.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, codeOk, configured: Boolean(env.ANTHROPIC_API_KEY) }, 200, cors);
    }
    if (req.method !== 'POST' || url.pathname !== '/advice') return json({ error: 'Not found' }, 404, cors);
    if (!codeOk) return json({ error: 'Λάθος κωδικός πρόσβασης.' }, 401, cors);
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'Ο server δεν έχει κλειδί Claude API.' }, 500, cors);

    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ error: 'Πολύ μεγάλο αίτημα.' }, 413, cors);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'Άκυρο JSON.' }, 400, cors);
    }
    const v = validateContext(body);
    if (!v.ok) return json({ error: v.error }, 400, cors);

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 50_000 });
    try {
      const res = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 6000,
        // On a policy decline, re-run on Anthropic's recommended fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        // Live advice must be quick; the pre-race briefing can think a little more.
        output_config: {
          effort: v.ctx.kind === 'live' ? 'low' : 'medium',
          format: { type: 'json_schema', schema: REPLY_SCHEMA as unknown as Record<string, unknown> },
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage(v.ctx) }],
      });

      if (res.stop_reason === 'refusal') return json({ error: 'Ο σύμβουλος δεν απάντησε σε αυτό το αίτημα.' }, 502, cors);
      if (res.stop_reason === 'max_tokens') return json({ error: 'Η απάντηση κόπηκε. Δοκίμασε ξανά.' }, 502, cors);
      const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      let reply: unknown;
      try {
        reply = JSON.parse(text);
      } catch {
        return json({ error: 'Μη αναγνώσιμη απάντηση από το μοντέλο.' }, 502, cors);
      }
      if (!isReply(reply)) return json({ error: 'Μη αναμενόμενη μορφή απάντησης.' }, 502, cors);
      reply.actions = reply.actions.slice(0, 4);
      const fallback = (res.usage.iterations ?? []).some((it) => it.type === 'fallback_message');
      const out: AdvisorResponse = { reply, model: res.model, fallback };
      return json(out, 200, cors);
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) return json({ error: 'Άκυρο κλειδί Claude API στον server.' }, 500, cors);
      if (e instanceof Anthropic.RateLimitError) return json({ error: 'Πολλά αιτήματα. Δοκίμασε σε λίγο.' }, 429, cors);
      if (e instanceof Anthropic.APIConnectionTimeoutError) return json({ error: 'Το μοντέλο άργησε. Δοκίμασε ξανά.' }, 504, cors);
      if (e instanceof Anthropic.APIError) return json({ error: `Σφάλμα Claude API (${e.status ?? '—'}).` }, 502, cors);
      return json({ error: 'Απρόσμενο σφάλμα στον server.' }, 500, cors);
    }
  },
};
