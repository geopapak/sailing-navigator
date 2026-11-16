/**
 * The fake Worker behind `page.route` (flows 1–4): every request to
 * https://api.e2e.example.test is answered by the handlers, nothing goes out.
 */
import type { Route } from '@playwright/test';
import { FakeWorker } from './handlers';

export const cors = (origin: string) => ({
  'access-control-allow-origin': origin || '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization, x-access-code',
  'access-control-max-age': '600',
  vary: 'Origin',
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function routeHandler(worker: FakeWorker) {
  return async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = await req.allHeaders();
    let body: unknown;
    const raw = req.postData();
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    const res = worker.handle({ method: req.method(), path: url.pathname, query: url.searchParams, auth: headers.authorization, body });
    if (res.delayMs) await sleep(res.delayMs);
    if (res.abort) return route.abort('connectionreset');
    if (res.hang) {
      // Never answers; the page's own timeout aborts the request.
      return new Promise<void>(() => undefined);
    }
    return route.fulfill({
      status: res.status,
      headers: { ...cors(headers.origin ?? ''), 'content-type': 'application/json' },
      body: res.json === undefined ? '' : JSON.stringify(res.json),
    });
  };
}

export { FakeWorker };
