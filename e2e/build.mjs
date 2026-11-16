// Builds of the app for the E2E tests (P-045). Never the production server:
//   main  → mode `e2e`    (.env.e2e:    https://api.e2e.example.test, flows 1–4)
//   sw    → mode `e2e-sw` (.env.e2e-sw: http://127.0.0.1:8788, flows 5–6), twice:
//           version A (0.0.1) and version B (0.0.2; plain dotted numbers, as the critical check compares them) for the update flow.
// Usage: node e2e/build.mjs [main|sw|all]   (type checking runs first in `npm run build:e2e`)
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = (d) => resolve(root, 'e2e/.out', d);
const what = process.argv[2] ?? 'all';

// The GitHub Pages base path must never leak into the test builds.
delete process.env.BASE_PATH;

async function one(mode, outDir, version) {
  if (version) process.env.npm_package_version = version;
  const t = Date.now();
  await build({ root, mode, logLevel: 'warn', build: { outDir, emptyOutDir: true } });
  console.log(`e2e build ${mode}${version ? ` ${version}` : ''} → ${outDir} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
}

const pkgVersion = process.env.npm_package_version;
if (what === 'main' || what === 'all') await one('e2e', out('dist'), pkgVersion);
if (what === 'sw' || what === 'all') {
  await one('e2e-sw', out('dist-sw-a'), '0.0.1');
  await one('e2e-sw', out('dist-sw-b'), '0.0.2');
}
