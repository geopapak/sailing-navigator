/**
 * AI advisor backend (Cloudflare Worker).
 *
 * Keeps the Anthropic API key off the phone. The app posts numbers it has
 * already computed; Claude turns them into short tactical advice in Greek.
 *
 * Also: accounts (D1) with synced boats/courses, the advisor chat agent, and
 * a Windy proxy. AI routes need an approved account or the owner's access code.
 *
 * Secrets (wrangler secret put …): ANTHROPIC_API_KEY, ACCESS_CODE, ADMIN_EMAIL, WINDY_KEY (optional)
 * Vars (wrangler.toml): ALLOWED_ORIGINS — comma-separated list of app origins.
 * Bindings: DB (D1, migrations/).
 */
import Anthropic from '@anthropic-ai/sdk';
import { REPLY_SCHEMA, SYSTEM_PROMPT, isReply, userMessage, validateContext } from '../src/ai/prompt';
import type { AdvisorResponse } from '../src/ai/types';
import { WINDY_MODELS, WINDY_URL, parseWindy, windyBody } from '../src/weather/windy';
import type { ModelSeries } from '../src/weather/compare';
import { CHAT_LIMITS, validateChat } from '../src/ai/chat';
import { AgentError, runAgent } from './agent';
import {
  HttpError,
  changePassword,
  deleteAccount,
  listUsers,
  login,
  logout,
  publicUser,
  register,
  sessionUser,
  sync,
  updateUser,
  useAiQuota,
  type AccountEnv,
} from './accounts';

export interface Env extends AccountEnv {
  ANTHROPIC_API_KEY: string;
  ACCESS_CODE: string;
  ALLOWED_ORIGINS?: string;
  WINDY_KEY?: string;
  /** "0" turns off web search for the chat advisor. */
  WEB_SEARCH?: string;
}

const MODEL = 'claude-opus-5-5';
const MAX_BODY = 48 * 1024;

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = origin && (allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  return ok
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type, x-access-code, authorization',
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

/** Point forecast from Windy for the models that cover the Saronic. */
async function windy(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  if (!env.WINDY_KEY) return json({ error: 'Ο server δεν έχει κλειδί Windy.' }, 501, cors);
  let body: { lat?: unknown; lon?: unknown };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return json({ error: 'Άκυρο JSON.' }, 400, cors);
  }
  const { lat, lon } = body;
  if (typeof lat !== 'number' || typeof lon !== 'number' || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return json({ error: 'Άκυρη θέση.' }, 400, cors);
  }
  const results = await Promise.all(
    WINDY_MODELS.map(async (m): Promise<ModelSeries | string | undefined> => {
      try {
        const r = await fetch(WINDY_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(windyBody(env.WINDY_KEY!, lat, lon, m.id)),
        });
        if (r.status === 204) return undefined;
        if (!r.ok) return `Windy ${m.short}: σφάλμα ${r.status}`;
        return parseWindy(m.id, m.short, await r.json());
      } catch {
        return `Windy ${m.short}: δεν απάντησε`;
      }
    }),
  );
  const series = results.filter((x): x is ModelSeries => typeof x === 'object');
  const errors = results.filter((x): x is string => typeof x === 'string');
  if (!series.length && errors.length) return json({ error: errors[0] }, 502, cors);
  return json({ series }, 200, cors);
}

/** Maps Claude API failures to short Greek messages. */
function apiError(e: unknown, cors: Record<string, string>): Response {
  console.error('Claude API error:', e instanceof Error ? `${e.constructor.name}: ${e.message}` : e);
  if (e instanceof AgentError) return json({ error: e.message }, 502, cors);
  if (e instanceof Anthropic.BadRequestError && /credit balance/i.test(e.message))
    return json({ error: 'Δεν υπάρχει υπόλοιπο στον λογαριασμό Claude API (Plans & Billing στο Claude Console).' }, 502, cors);
  if (e instanceof Anthropic.AuthenticationError) return json({ error: 'Άκυρο κλειδί Claude API στον server.' }, 500, cors);
  if (e instanceof Anthropic.RateLimitError) return json({ error: 'Πολλά αιτήματα. Δοκίμασε σε λίγο.' }, 429, cors);
  if (e instanceof Anthropic.APIConnectionTimeoutError) return json({ error: 'Το μοντέλο άργησε. Δοκίμασε ξανά.' }, 504, cors);
  if (e instanceof Anthropic.APIError) return json({ error: `Σφάλμα Claude API (${e.status ?? '—'}).` }, 502, cors);
  return json({ error: 'Απρόσμενο σφάλμα στον server.' }, 500, cors);
}

async function readJson(req: Request, limit: number): Promise<{ ok: true; body: unknown } | { ok: false; status: number; error: string }> {
  const raw = await req.text();
  if (raw.length > limit) return { ok: false, status: 413, error: 'Πολύ μεγάλο αίτημα.' };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, status: 400, error: 'Άκυρο JSON.' };
  }
}

/** The advisor chat: agent with tools and the reference library. */
async function chat(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const r = await readJson(req, CHAT_LIMITS.body);
  if (!r.ok) return json({ error: r.error }, r.status, cors);
  const v = validateChat(r.body);
  if (!v.ok) return json({ error: v.error }, 400, cors);
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 80_000 });
  const webSearch = env.WEB_SEARCH !== '0';
  try {
    return json(await runAgent(client, v.req, { webSearch }), 200, cors);
  } catch (e) {
    // If web search is not enabled for the organisation, answer without it.
    if (webSearch && e instanceof Anthropic.BadRequestError && /web.?search/i.test(e.message)) {
      try {
        return json(await runAgent(client, v.req, { webSearch: false }), 200, cors);
      } catch (e2) {
        return apiError(e2, cors);
      }
    }
    return apiError(e, cors);
  }
}

async function body(req: Request, limit = 64 * 1024): Promise<Record<string, unknown>> {
  const r = await readJson(req, limit);
  if (!r.ok) throw new HttpError(r.status, r.error);
  if (!r.body || typeof r.body !== 'object') throw new HttpError(400, 'Άκυρο αίτημα.');
  return r.body as Record<string, unknown>;
}

/** /auth/*, /me, /sync, /admin/* */
async function accountRoutes(req: Request, env: Env, path: string): Promise<unknown> {
  const m = req.method;
  if (m === 'POST' && path === '/auth/register') return register(env, await body(req));
  if (m === 'POST' && path === '/auth/login') return login(env, await body(req));
  const s = await sessionUser(env, req);
  if (!s) throw new HttpError(401, 'Χρειάζεται σύνδεση.');
  const u = s.user;
  if (m === 'POST' && path === '/auth/logout') return logout(env, s.tokenHash).then(() => ({ ok: true }));
  if (m === 'GET' && path === '/me') return { user: publicUser(u) };
  if (m === 'POST' && path === '/me/password') return changePassword(env, u, await body(req)).then(() => ({ ok: true }));
  if (m === 'DELETE' && path === '/me') return deleteAccount(env, u).then(() => ({ ok: true }));
  if (m === 'POST' && path === '/sync') return sync(env, u, await body(req, 4 * 1024 * 1024));
  if (path.startsWith('/admin/')) {
    if (!u.is_admin) throw new HttpError(403, 'Μόνο για διαχειριστή.');
    if (m === 'GET' && path === '/admin/users') return { users: await listUsers(env) };
    const um = path.match(/^\/admin\/users\/([0-9a-f]{24})$/);
    if (m === 'POST' && um) return updateUser(env, um[1], await body(req));
  }
  throw new HttpError(404, 'Not found');
}

const ACCOUNT_PATHS = /^\/(auth\/|me$|me\/|sync$|admin\/)/;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const cors = corsHeaders(req.headers.get('Origin'), env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (ACCOUNT_PATHS.test(path)) return json(await accountRoutes(req, env, path), 200, cors);

      const codeOk = sameCode((req.headers.get('x-access-code') ?? '').trim(), (env.ACCESS_CODE ?? '').trim());
      if (req.method === 'GET' && path === '/health') {
        const s = await sessionUser(env, req).catch(() => undefined);
        return json(
          {
            ok: true,
            codeOk,
            configured: Boolean(env.ANTHROPIC_API_KEY),
            windy: Boolean(env.WINDY_KEY),
            accounts: Boolean(env.DB),
            user: s ? publicUser(s.user) : undefined,
          },
          200,
          cors,
        );
      }
      const aiRoute = req.method === 'POST' && (path === '/advice' || path === '/chat' || path === '/windy');
      if (!aiRoute) return json({ error: 'Not found' }, 404, cors);

      // AI routes: the owner's access code, or a signed-in user approved by the admin (counted per month).
      if (!codeOk) {
        const s = await sessionUser(env, req);
        if (!s) return json({ error: req.headers.get('x-access-code') ? 'Λάθος κωδικός πρόσβασης.' : 'Συνδέσου στον λογαριασμό σου για τον σύμβουλο AI.' }, 401, cors);
        if (path === '/windy') {
          if (!s.user.ai_allowed) throw new HttpError(403, 'Το Windy είναι διαθέσιμο σε εγκεκριμένους λογαριασμούς.');
        } else {
          await useAiQuota(env, s.user);
        }
      }
      if (path === '/windy') return windy(req, env, cors);
      if (!env.ANTHROPIC_API_KEY) return json({ error: 'Ο server δεν έχει κλειδί Claude API.' }, 500, cors);
      if (path === '/chat') return chat(req, env, cors);
      return advice(req, env, cors);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, cors);
      console.error('Server error:', e instanceof Error ? `${e.constructor.name}: ${e.message}` : e);
      return json({ error: 'Απρόσμενο σφάλμα στον server.' }, 500, cors);
    }
  },
};

/** Quick structured advice (Live / plan cards). */
async function advice(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const r = await readJson(req, MAX_BODY);
  if (!r.ok) return json({ error: r.error }, r.status, cors);
  const v = validateContext(r.body);
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
    return apiError(e, cors);
  }
}
