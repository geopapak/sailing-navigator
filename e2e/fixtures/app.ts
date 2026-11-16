/**
 * The `app` test fixture (P-045): network guard + fake Worker + fake clock +
 * GPS call counter, and helpers that walk the app like a user.
 * Every test fails when the browser asked for a host outside the list, when an
 * AI route was called without the test asking for it, or when the page threw.
 */
import { test as base, expect, type Page } from '@playwright/test';
import { FakeWorker, type Scenario } from './handlers';
import { routeHandler } from './server';
import { installGuard, type Guard } from './network-guard';
import { TEST_EMAIL, TEST_PASSWORD } from './data/user';

/** Saturday 14/11/2026 10:00 Athens: the fake clock starts here in every test. */
export const T0 = new Date('2026-11-14T10:00:00+02:00').getTime();
export const FALIRO = { latitude: 37.9, longitude: 23.66 };

/** Counts the phone GPS calls across reloads (a call = a permission prompt when not decided). */
const GEO_COUNTER = `(() => {
  const KEY = '__geoCalls';
  const read = () => { try { return Number(sessionStorage.getItem(KEY) || '0'); } catch { return 0; } };
  Object.defineProperty(window, '__geoCalls', { get: read, configurable: true });
  const g = navigator.geolocation;
  if (!g) return;
  for (const m of ['watchPosition', 'getCurrentPosition']) {
    const orig = g[m].bind(g);
    g[m] = (...a) => { try { sessionStorage.setItem(KEY, String(read() + 1)); } catch {} return orig(...a); };
  }
})();`;

export interface AppFixture {
  page: Page;
  server: FakeWorker;
  guard: Guard;
  /** Opens the app (the fake clock is already installed). */
  open: (path?: string) => Promise<void>;
  /** Signs in from the sign-in screen with the test user. */
  signIn: (email?: string) => Promise<void>;
  /** Merges values into the app's stored settings (IndexedDB) and reloads. */
  setSettings: (patch: Record<string, unknown>) => Promise<void>;
  /** Moves the fake clock forward in steps, letting React render between them. */
  advance: (ms: number, stepMs?: number) => Promise<void>;
  geoCalls: () => Promise<number>;
  /** Settings → «Όργανα σκάφους» → «Προσομοίωση (για δοκιμή)» → «Σύνδεση». */
  useSimulator: () => Promise<void>;
  /** «Νέα έξοδος» → Προπόνηση → «● Έναρξη προπόνησης». */
  startTraining: () => Promise<void>;
  /** Bottom tab bar. */
  tab: (name: 'Αρχική' | 'Ιστορικό' | 'Σκάφη' | 'Ρυθμίσεις' | 'Live' | 'Χάρτης' | 'Σύμβουλος') => Promise<void>;
}

type Fixtures = {
  scenario: Partial<Scenario>;
  clockStart: number;
  app: AppFixture;
};

export const test = base.extend<Fixtures>({
  scenario: [{}, { option: true }],
  clockStart: [T0, { option: true }],
  app: async ({ page, context, scenario, clockStart }, use, testInfo) => {
    const server = new FakeWorker();
    server.reset(scenario);
    const guard = await installGuard(context, routeHandler(server));
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await context.addInitScript(GEO_COUNTER);
    await page.clock.install({ time: clockStart });

    const advance = async (ms: number, stepMs = 5000) => {
      let left = ms;
      while (left > 0) {
        const d = Math.min(stepMs, left);
        await page.clock.runFor(d);
        // Real time for React, Dexie and the fetch handlers to catch up.
        await page.waitForTimeout(15);
        left -= d;
      }
    };

    const tab: AppFixture['tab'] = async (name) => {
      await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
    };

    const app: AppFixture = {
      page,
      server,
      guard,
      open: async (path = '/') => {
        await page.goto(path);
      },
      signIn: async (email = TEST_EMAIL) => {
        await page.getByRole('textbox', { name: 'Email' }).fill(email);
        await page.getByLabel('Κωδικός').fill(TEST_PASSWORD);
        await page.getByRole('button', { name: 'Σύνδεση', exact: true }).click();
      },
      setSettings: async (patch) => {
        await page.evaluate(async (p) => {
          const db = await new Promise<IDBDatabase>((res, rej) => {
            const r = indexedDB.open('sailing-navigator');
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
          });
          const tx = db.transaction('kv', 'readwrite');
          const kv = tx.objectStore('kv');
          const cur = await new Promise<{ key: string; value: Record<string, unknown> } | undefined>((res) => {
            const g = kv.get('settings');
            g.onsuccess = () => res(g.result);
          });
          kv.put({ key: 'settings', value: { ...(cur?.value ?? {}), ...p } });
          await new Promise((res) => (tx.oncomplete = res));
          db.close();
        }, patch);
        await page.reload();
      },
      advance,
      geoCalls: () => page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls),
      useSimulator: async () => {
        await tab('Ρυθμίσεις');
        const card = page.getByTestId('instruments-card');
        await card.getByRole('combobox').selectOption({ label: 'Προσομοίωση (για δοκιμή)' });
        await expect(card.getByRole('combobox')).toHaveValue('simulator');
        // Two settings writes back to back can race (seen once in WebKit 320 px): tap again until connected.
        await expect(async () => {
          const connect = card.getByRole('button', { name: 'Σύνδεση', exact: true });
          if (await connect.isVisible()) await connect.click();
          await expect(card.getByText(/Συνδεδεμένο/)).toBeVisible({ timeout: 3000 });
        }).toPass({ timeout: 15_000 });
        await tab('Αρχική');
      },
      startTraining: async () => {
        await page.getByRole('button', { name: /^Προπόνηση:/ }).click();
        await page.getByRole('button', { name: '● Έναρξη προπόνησης' }).click();
        await expect(page.getByTestId('session-end')).toBeVisible();
      },
      tab,
    };

    await use(app);

    // Criteria 2–4: nothing outside the list, no AI call nobody asked for, no page crash.
    const problems = [
      ...guard.violations,
      ...server.forbidden.map((f) => `Κλήση AI που δεν ζήτησε το test: ${f}`),
      ...pageErrors.map((e) => `Σφάλμα στη σελίδα: ${e}`),
    ];
    if (server.unknown.length) await testInfo.attach('unknown-routes', { body: server.unknown.join('\n') });
    expect(problems, 'Φύλαξη δικτύου / AI / σφάλματα σελίδας').toEqual([]);
  },
});

export { expect };

/** No horizontal scroll, and nothing of the bottom bars sticks out of the screen (criterion 54). */
export async function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const out: string[] = [];
    if (document.documentElement.scrollWidth > w) out.push(`scrollWidth ${document.documentElement.scrollWidth} > ${w}`);
    for (const el of document.querySelectorAll<HTMLElement>('.tabbar button, .sbar button, .net-strip button, .sticky-actions button')) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.left < -1 || r.right > w + 1)) out.push(`${el.textContent?.trim()} έξω από την οθόνη (${Math.round(r.left)}–${Math.round(r.right)})`);
    }
    return out;
  });
}
