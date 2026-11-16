/**
 * Network guard (P-045, criteria 2–4): the browser may talk only to the app on
 * localhost and to the fake Worker. Map tiles, forecasts and depths are cut off.
 * Anything else — above all *.workers.dev, *.github.io, *.pages.dev — fails the test
 * with «Αίτημα εκτός λίστας: <host>» and never leaves the computer.
 */
import type { BrowserContext, Route } from '@playwright/test';

export const API_ORIGIN = 'https://api.e2e.example.test';
export const SW_API_ORIGIN = 'http://127.0.0.1:8788';
export const APP_PORT = 4173;
/** Service-worker flows: one slot per browser (e2e/sw-serve.mjs). */
export const SW_APP_PORTS = [4174, 4175];

/** Allowed but never answered: external map / weather / depth services. */
const CUT_OFF = [/^tiles\.openfreemap\.org$/, /^tiles\.openseamap\.org$/, /(^|\.)emodnet-bathymetry\.eu$/, /(^|\.)open-meteo\.com$/];
/** Called out by name in the failure (production and staging hosts). */
const NEVER = [/\.workers\.dev$/, /\.github\.io$/, /\.pages\.dev$/, /(^|\.)anthropic\.com$/];

export type HostVerdict = 'app' | 'api' | 'sw-api' | 'cut' | 'blocked';

export function verdict(url: string): HostVerdict {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'blocked';
  }
  if (u.protocol === 'data:' || u.protocol === 'blob:') return 'app';
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (local && [APP_PORT, ...SW_APP_PORTS].map(String).includes(u.port)) return 'app';
  if (u.origin === API_ORIGIN) return 'api';
  if (u.origin === SW_API_ORIGIN) return 'sw-api';
  if (NEVER.some((r) => r.test(u.hostname))) return 'blocked';
  if (CUT_OFF.some((r) => r.test(u.hostname))) return 'cut';
  return 'blocked';
}

export const outsideText = (url: string) => {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* keep the raw text */
  }
  return `Αίτημα εκτός λίστας: ${host}`;
};

export interface Guard {
  violations: string[];
  cut: string[];
}

/**
 * Installs the guard on a context. `api` answers the fake Worker's requests;
 * everything not allowed is aborted (it never leaves the computer) and recorded.
 */
export async function installGuard(context: BrowserContext, api: (route: Route) => Promise<void>): Promise<Guard> {
  const g: Guard = { violations: [], cut: [] };
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    const v = verdict(url);
    // The fake Worker on 127.0.0.1:8788 answers by itself (flows 5–6).
    if (v === 'app' || v === 'sw-api') return route.continue();
    if (v === 'api') return api(route);
    if (v === 'cut') {
      g.cut.push(url);
      return route.abort('internetdisconnected');
    }
    g.violations.push(outsideText(url));
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket(/.*/, (ws) => {
    g.violations.push(outsideText(ws.url()));
    ws.close();
  });
  return g;
}
