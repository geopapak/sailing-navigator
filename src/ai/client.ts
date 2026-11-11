import type { AdvisorContext, AdvisorResponse } from './types';

export interface AdvisorConfig {
  url: string;
  /** Owner's access code (optional when signed in). */
  code: string;
  /** Account session token. */
  token?: string;
}

/** Server configuration from the app settings. */
export function advisorConfig(s: { aiUrl: string; aiCode: string; authToken: string }): AdvisorConfig {
  return { url: s.aiUrl, code: s.aiCode, token: s.authToken || undefined };
}

/** Whether the AI features can be called: a server and either an account or the access code. */
export const advisorReady = (c: AdvisorConfig) => c.url.trim() !== '' && (c.code.trim() !== '' || !!c.token);

export class AdvisorError extends Error {}

const base = (url: string) => url.trim().replace(/\/+$/, '');

async function call(cfg: AdvisorConfig, path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AdvisorError('Χωρίς σύνδεση στο internet. Ο σύμβουλος AI θέλει δίκτυο.');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(`${base(cfg.url)}${path}`, {
      ...init,
      signal: ctl.signal,
      headers: {
        'content-type': 'application/json',
        ...(cfg.code.trim() ? { 'x-access-code': cfg.code.trim() } : {}),
        ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new AdvisorError('Ο σύμβουλος δεν απάντησε εγκαίρως. Δοκίμασε ξανά.');
    throw new AdvisorError('Δεν απαντά η υπηρεσία της εφαρμογής. Έλεγξε τη σύνδεση στο internet.');
  } finally {
    clearTimeout(timer);
  }
}

export async function askAdvisor(cfg: AdvisorConfig, ctx: AdvisorContext): Promise<AdvisorResponse> {
  const res = await call(cfg, '/advice', { method: 'POST', body: JSON.stringify(ctx) }, 70_000);
  const data = (await res.json().catch(() => ({}))) as Partial<AdvisorResponse> & { error?: string };
  if (!res.ok || !data.reply) throw new AdvisorError(data.error ?? `Σφάλμα server (${res.status}).`);
  return data as AdvisorResponse;
}

export async function checkAdvisor(cfg: AdvisorConfig): Promise<string> {
  const res = await call(cfg, '/health', { method: 'GET' }, 10_000);
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    codeOk?: boolean;
    configured?: boolean;
    user?: { ai: { allowed: boolean; used: number; limit: number } };
  };
  if (!res.ok || !data.ok) return `Ο server απάντησε με σφάλμα (${res.status}).`;
  if (!data.configured) return 'Ο server λειτουργεί αλλά δεν έχει κλειδί Claude API.';
  if (data.codeOk) return 'OK — ο σύμβουλος είναι έτοιμος (κωδικός ιδιοκτήτη).';
  if (data.user) {
    if (!data.user.ai.allowed) return 'Συνδεδεμένος, αλλά ο σύμβουλος AI δεν έχει εγκριθεί ακόμα για τον λογαριασμό σου.';
    return `OK — ο σύμβουλος είναι έτοιμος (${data.user.ai.used}/${data.user.ai.limit} ερωτήσεις αυτόν τον μήνα).`;
  }
  if (cfg.code.trim()) return 'Ο server λειτουργεί, αλλά ο κωδικός πρόσβασης είναι λάθος.';
  return 'Ο server λειτουργεί. Συνδέσου στον λογαριασμό σου για τον σύμβουλο AI.';
}

/** Windy point forecast through our server (it holds the Windy key). */
export async function fetchWindySeries(cfg: AdvisorConfig, lat: number, lon: number): Promise<import('../weather/compare').ModelSeries[]> {
  const res = await call(cfg, '/windy', { method: 'POST', body: JSON.stringify({ lat, lon }) }, 20_000);
  const data = (await res.json().catch(() => ({}))) as { series?: import('../weather/compare').ModelSeries[]; error?: string };
  if (res.status === 501) throw new AdvisorError('τα μοντέλα Windy δεν έχουν ενεργοποιηθεί ακόμα.');
  if (!res.ok) throw new AdvisorError(data.error ?? `Windy: σφάλμα server (${res.status}).`);
  return data.series ?? [];
}

/** Asks the advisor agent (chat). */
export async function askChat(cfg: AdvisorConfig, req: import('./chat').ChatRequest): Promise<import('./chat').ChatResponse> {
  const res = await call(cfg, '/chat', { method: 'POST', body: JSON.stringify(req) }, 110_000);
  const data = (await res.json().catch(() => ({}))) as Partial<import('./chat').ChatResponse> & { error?: string };
  if (!res.ok || typeof data.text !== 'string') throw new AdvisorError(data.error ?? `Σφάλμα server (${res.status}).`);
  return data as import('./chat').ChatResponse;
}
