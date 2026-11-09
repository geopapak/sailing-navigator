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
      headers: { 'content-type': 'application/json', 'x-access-code': cfg.code, ...(init.headers ?? {}) },
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
