// Static servers for the service-worker flows (P-045, flows 5–6), localhost only.
// Two slots, so Chromium and WebKit run side by side without sharing state:
//   http://localhost:4174 (chromium-375-sw) and http://localhost:4175 (webkit-iphone-sw).
// Each serves version A (e2e/.out/dist-sw-a) or B (dist-sw-b); a test switches it with
//   GET /__e2e/version?v=a|b[&critical=1]
// No caching headers, so the browser's update check always sees the current sw.js.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '.out');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

function slot(port) {
  const state = { v: 'a', critical: false };
  const server = createServer(async (req, res) => {
    const host = req.headers.host ?? '';
    if (host !== `localhost:${port}` && host !== `127.0.0.1:${port}`) {
      res.writeHead(421).end();
      return;
    }
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    if (url.pathname === '/__e2e/version') {
      if (url.searchParams.get('v')) state.v = url.searchParams.get('v') === 'b' ? 'b' : 'a';
      state.critical = url.searchParams.get('critical') === '1';
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(state));
      return;
    }
    const dir = join(root, `dist-sw-${state.v}`);
    let file = normalize(join(dir, decodeURIComponent(url.pathname)));
    if (!file.startsWith(dir)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    } catch {
      // SPA fallback for paths without an extension.
      if (!extname(file)) file = join(dir, 'index.html');
    }
    try {
      let body = await readFile(file);
      if (url.pathname === '/version.json' && state.critical) {
        const info = JSON.parse(body.toString('utf8'));
        body = Buffer.from(JSON.stringify({ ...info, critical: true, criticalVersions: [info.version] }));
      }
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  server.listen(port, 'localhost', () => console.log(`e2e sw slot http://localhost:${port}`));
}

slot(4174);
slot(4175);
