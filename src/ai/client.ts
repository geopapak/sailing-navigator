import type { AdvisorContext, AdvisorResponse } from './types';

export interface AdvisorConfig {
  url: string;
  code: string;
}

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
      headers: { 'content-type': 'application/json', 'x-access-code': cfg.code.trim(), ...(init.headers ?? {}) },
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new AdvisorError('Ο σύμβουλος δεν απάντησε εγκαίρως. Δοκίμασε ξανά.');
    throw new AdvisorError('Δεν βρέθηκε ο server. Έλεγξε τη διεύθυνση στις Ρυθμίσεις και τη σύνδεση.');
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
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; codeOk?: boolean; configured?: boolean };
  if (!res.ok || !data.ok) return `Ο server απάντησε με σφάλμα (${res.status}).`;
  if (!data.configured) return 'Ο server λειτουργεί αλλά δεν έχει κλειδί Claude API.';
  if (!data.codeOk) return 'Ο server λειτουργεί, αλλά ο κωδικός πρόσβασης είναι λάθος.';
  return 'OK — ο σύμβουλος είναι έτοιμος.';
}

/** Windy point forecast through our server (it holds the Windy key). */
export async function fetchWindySeries(cfg: AdvisorConfig, lat: number, lon: number): Promise<import('../weather/compare').ModelSeries[]> {
  const res = await call(cfg, '/windy', { method: 'POST', body: JSON.stringify({ lat, lon }) }, 20_000);
  const data = (await res.json().catch(() => ({}))) as { series?: import('../weather/compare').ModelSeries[]; error?: string };
  if (res.status === 501) throw new AdvisorError('δεν έχει μπει κλειδί Windy στον server.');
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
