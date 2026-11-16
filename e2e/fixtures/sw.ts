/**
 * Fixture for the service-worker flows (5–6, `@sw`): the app comes from e2e/sw-serve.mjs
 * (version A or B) and talks to the fake Worker on 127.0.0.1:8788, not to `page.route`.
 * The guard still watches every request the page shows (criterion 2, indirect form),
 * and the fake server's log must hold no AI call nobody asked for.
 */
import { test as base, expect, type Page } from '@playwright/test';
import type { CallLog, Scenario } from './handlers';
import { SW_API_ORIGIN, verdict, outsideText, type Guard } from './network-guard';
import { TEST_EMAIL, TEST_PASSWORD } from './data/user';

/** Saturday 14/11/2026 01:50 Athens: ten minutes before the 02:00 update time. */
export const T_BEFORE_2AM = new Date('2026-11-14T01:50:00+02:00').getTime();

export class RemoteWorker {
  constructor(readonly slot: string) {}
  private async control(path: string, body?: unknown) {
    const r = await fetch(`${SW_API_ORIGIN}/__e2e/${path}?slot=${this.slot}`, { method: 'POST', body: JSON.stringify(body ?? {}) });
    return (await r.json()) as { log: CallLog[]; forbidden: string[]; unknown: string[] };
  }
  reset = (s: Partial<Scenario>) => this.control('reset', s);
  set = (s: Partial<Scenario>) => this.control('set', s);
  state = () => this.control('log');
  async calls(path: string) {
    return (await this.state()).log.filter((c) => c.path === path);
  }
}

export interface SwApp {
  page: Page;
  server: RemoteWorker;
  guard: Guard;
  origin: string;
  /** Which version the local static server hands out (A or B, optionally critical). */
  serve: (v: 'a' | 'b', critical?: boolean) => Promise<void>;
  /** Opens the app, waits for the service worker and reloads so that it controls the page. */
  install: () => Promise<void>;
  signIn: () => Promise<void>;
  advance: (ms: number, stepMs?: number) => Promise<void>;
  /** What the app does on focus: looks for a new version (≥ 60″ after the last look). */
  checkForUpdate: () => Promise<void>;
  waitingWorker: () => Promise<boolean>;
  useSimulator: () => Promise<void>;
  tab: (name: string) => Promise<void>;
}

type Fixtures = { scenario: Partial<Scenario>; clockStart: number; sw: SwApp };

export const test = base.extend<Fixtures>({
  scenario: [{}, { option: true }],
  clockStart: [T_BEFORE_2AM, { option: true }],
  sw: async ({ page, context, scenario, clockStart, baseURL }, use) => {
    const origin = baseURL!;
    const slot = new URL(origin).port;
    const server = new RemoteWorker(slot);
    await server.reset(scenario);
    const serve = async (v: 'a' | 'b', critical = false) => {
      await fetch(`${origin}/__e2e/version?v=${v}${critical ? '&critical=1' : ''}`);
    };
    await serve('a');
    // No `context.route` here: in Chromium it makes the page bypass the service worker.
    // The guard watches every request the context shows (Chromium also refuses to resolve any
    // outside host, see `launchOptions` in playwright.config.ts).
    const guard: Guard = { violations: [], cut: [] };
    context.on('request', (r) => {
      const v = verdict(r.url());
      if (v === 'blocked' && !guard.violations.includes(outsideText(r.url()))) guard.violations.push(outsideText(r.url()));
    });
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.clock.install({ time: clockStart });

    const advance = async (ms: number, stepMs = 5000) => {
      for (let left = ms; left > 0; left -= stepMs) {
        await page.clock.runFor(Math.min(stepMs, left));
        await page.waitForTimeout(15);
      }
    };
    const tab = async (name: string) => {
      await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
    };
    const sw: SwApp = {
      page,
      server,
      guard,
      origin,
      serve,
      install: async () => {
        await page.goto('/');
        await page.evaluate(async () => {
          const reg = await navigator.serviceWorker.ready;
          const w = reg.active;
          if (w && w.state !== 'activated') await new Promise<void>((ok) => w.addEventListener('statechange', () => w.state === 'activated' && ok()));
        });
        await page.reload();
        await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      },
      signIn: async () => {
        await page.getByRole('textbox', { name: 'Email' }).fill(TEST_EMAIL);
        await page.getByLabel('Κωδικός').fill(TEST_PASSWORD);
        await page.getByRole('button', { name: 'Σύνδεση', exact: true }).click();
      },
      advance,
      checkForUpdate: async () => {
        await advance(61_000, 10_000);
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      },
      waitingWorker: () => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting),
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
      tab,
    };

    await use(sw);

    const st = await server.state();
    const problems = [
      ...guard.violations,
      ...st.forbidden.map((f) => `Κλήση AI που δεν ζήτησε το test: ${f}`),
      ...pageErrors.map((e) => `Σφάλμα στη σελίδα: ${e}`),
    ];
    await serve('a');
    expect(problems, 'Φύλαξη δικτύου / AI / σφάλματα σελίδας').toEqual([]);
  },
});

export { expect };
