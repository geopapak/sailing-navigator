/**
 * Criterion 3: before anything else, each test build must talk to the fake server.
 * If not (e.g. a build that falls back to the production Worker), this fails and
 * Playwright skips every other project (they depend on `smoke`).
 */
import { test, expect } from './fixtures/app';
import { API_ORIGIN, SW_API_ORIGIN, verdict } from './fixtures/network-guard';

test('το build e2e μιλά μόνο με το https://api.e2e.example.test', async ({ app }) => {
  const first = app.page.waitForRequest((r) => r.url().endsWith('/config'));
  await app.open('/');
  const req = await first;
  expect(new URL(req.url()).origin, 'server του build:e2e').toBe(API_ORIGIN);
  // The bundle carries the e2e server; the guard catches any other host at run time.
  const html = await (await app.page.request.get('/')).text();
  const js = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
  expect(js, 'script της εφαρμογής').toBeTruthy();
  const code = await (await app.page.request.get(js!)).text();
  expect(code).toContain('api.e2e.example.test');
});

test('το build e2e-sw μιλά μόνο με το http://127.0.0.1:8788', async ({ app }) => {
  await app.page.request.get('http://localhost:4174/__e2e/version?v=a');
  const first = app.page.waitForRequest((r) => r.url().endsWith('/config'));
  await app.open('http://localhost:4174/');
  const req = await first;
  expect(new URL(req.url()).origin, 'server του build:e2e-sw').toBe(SW_API_ORIGIN);
});

test('αίτημα εκτός λίστας καταγράφεται και δεν φεύγει από τον υπολογιστή', async ({ app }) => {
  await app.open('/');
  const r = await app.page.evaluate(() => fetch('https://blocked.example.workers.dev/health').then(() => 'answered', () => 'failed'));
  expect(r).toBe('failed');
  expect(app.guard.violations).toEqual(['Αίτημα εκτός λίστας: blocked.example.workers.dev']);
  // Expected here: clear it so the fixture's final check passes.
  app.guard.violations.length = 0;
});

test('η φύλαξη δικτύου κόβει τα hosts παραγωγής', async ({ page }) => {
  expect(verdict('https://sailing-navigator-ai.example.workers.dev/health')).toBe('blocked');
  expect(verdict('https://someone.github.io/project-sailing/')).toBe('blocked');
  expect(verdict('https://navigator.pages.dev/')).toBe('blocked');
  expect(verdict('https://api.anthropic.com/v1/messages')).toBe('blocked');
  expect(verdict('http://localhost:8787/health')).toBe('blocked');
  expect(verdict('https://api.e2e.example.test/config')).toBe('api');
  expect(verdict('https://tiles.openfreemap.org/planet')).toBe('cut');
  await page.close();
});
