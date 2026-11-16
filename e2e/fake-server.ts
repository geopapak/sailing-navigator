/**
 * The fake Worker on http://127.0.0.1:8788 for the service-worker flows (P-045, flows 5–6),
 * where `page.route` cannot be trusted. Same handlers as the `page.route` fixture.
 * Listens only on 127.0.0.1 and refuses any other Host. State is kept per app origin
 * (http://localhost:4174 Chromium, :4175 WebKit), so both browsers run side by side.
 * Control (from the test runner only): POST /__e2e/reset?slot=4174 {scenario},
 * GET /__e2e/log?slot=4174 → { log, forbidden, unknown }.
 */
import { createServer, type Server } from 'node:http';
import { FakeWorker, type Scenario } from './fixtures/handlers';
import { cors } from './fixtures/server';

export const FAKE_PORT = 8788;
const HOST = `127.0.0.1:${FAKE_PORT}`;

const workers = new Map<string, FakeWorker>();
const worker = (slot: string) => {
  let w = workers.get(slot);
  if (!w) workers.set(slot, (w = new FakeWorker()));
  return w;
};
const slotOf = (origin: string | undefined) => (origin ? (new URL(origin).port || '80') : 'none');

export function startFakeServer(): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.headers.host !== HOST) {
      res.writeHead(421).end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', `http://${HOST}`);
      const raw = Buffer.concat(chunks).toString('utf8');
      let body: unknown;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        body = raw;
      }
      if (url.pathname.startsWith('/__e2e/')) {
        const w = worker(url.searchParams.get('slot') ?? 'none');
        if (url.pathname === '/__e2e/reset') w.reset((body ?? {}) as Partial<Scenario>);
        if (url.pathname === '/__e2e/set') w.set((body ?? {}) as Partial<Scenario>);
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ log: w.log, forbidden: w.forbidden, unknown: w.unknown }));
        return;
      }
      const origin = req.headers.origin;
      const w = worker(slotOf(origin));
      const r = w.handle({ method: req.method ?? 'GET', path: url.pathname, query: url.searchParams, auth: req.headers.authorization, body });
      const send = () => {
        if (r.abort) return req.socket.destroy();
        if (r.hang) return; // never answers
        res.writeHead(r.status, { ...cors(origin ?? ''), 'content-type': 'application/json' }).end(r.json === undefined ? '' : JSON.stringify(r.json));
      };
      if (r.delayMs) setTimeout(send, r.delayMs);
      else send();
    });
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(FAKE_PORT, '127.0.0.1', () => ok(server));
  });
}
