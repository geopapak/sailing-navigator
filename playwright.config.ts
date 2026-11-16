/**
 * End-to-end tests (P-045, docs/product/specs/e2e-tests.md). They run only on the
 * `build:e2e` builds (server: https://api.e2e.example.test or http://127.0.0.1:8788),
 * never on the live site, never with real accounts, never with a paid AI call.
 */
import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;
const OUT = 'e2e/.out';

const context = {
  locale: 'el-GR',
  timezoneId: 'Europe/Athens',
  geolocation: { latitude: 37.9, longitude: 23.66 },
};
/**
 * Chromium refuses to resolve any host outside the test hosts: a second brake behind the
 * network guard, also for requests a service worker makes. (WebKit has no such switch.)
 */
const chromiumOnlyLocal = {
  launchOptions: { args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] },
};
const pixel = (width: number, height: number) => ({ ...devices['Pixel 5'], viewport: { width, height }, ...context, ...chromiumOnlyLocal });

const SW = /(update|offline)\.spec\.ts$/;

export default defineConfig({
  testDir: 'e2e',
  // Only the Playwright specs (e2e/*.test.ts are Vitest checks run by `npm test`).
  testMatch: /\.spec\.ts$/,
  outputDir: `${OUT}/test-results`,
  timeout: 60_000,
  expect: { timeout: 7_000 },
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
  fullyParallel: true,
  forbidOnly: CI,
  reporter: [
    ['list'],
    ['html', { outputFolder: `${OUT}/report`, open: 'never' }],
    ['json', { outputFile: `${OUT}/results.json` }],
    ...(CI ? ([['github']] as const) : []),
  ],
  globalSetup: './e2e/global-setup.ts',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    serviceWorkers: 'block',
    baseURL: 'http://localhost:4173',
  },
  webServer: [
    {
      command: 'npx vite preview --outDir e2e/.out/dist --port 4173 --strictPort --host localhost',
      url: 'http://localhost:4173',
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      command: 'node e2e/sw-serve.mjs',
      url: 'http://localhost:4174/__e2e/version',
      reuseExistingServer: !CI,
      timeout: 30_000,
    },
  ],
  projects: [
    // Criterion 3: the first test checks which server each build talks to; nothing else runs otherwise.
    { name: 'smoke', testMatch: /smoke\.spec\.ts$/, use: { ...pixel(375, 812), serviceWorkers: 'allow' } },
    {
      name: 'chromium-375',
      testIgnore: [/smoke\.spec\.ts$/, SW],
      grepInvert: /@narrow-only/,
      dependencies: ['smoke'],
      use: pixel(375, 812),
    },
    {
      name: 'webkit-iphone',
      testIgnore: [/smoke\.spec\.ts$/, SW],
      grepInvert: /@narrow-only/,
      dependencies: ['smoke'],
      use: { ...devices['iPhone 13 mini'], ...context },
    },
    { name: 'chromium-320', grep: /@narrow/, testIgnore: [/smoke\.spec\.ts$/, SW], dependencies: ['smoke'], use: pixel(320, 640) },
    { name: 'webkit-320', grep: /@narrow/, testIgnore: [/smoke\.spec\.ts$/, SW], dependencies: ['smoke'], use: { ...devices['iPhone SE'], ...context } },
    // Flows 5–6 with the real service worker (@sw): one slot per browser, one test at a time per slot.
    {
      name: 'chromium-375-sw',
      testMatch: SW,
      workers: 1,
      dependencies: ['smoke'],
      use: { ...pixel(375, 812), serviceWorkers: 'allow', baseURL: 'http://localhost:4174' },
    },
    {
      name: 'webkit-iphone-sw',
      testMatch: SW,
      workers: 1,
      dependencies: ['smoke'],
      use: { ...devices['iPhone 13 mini'], ...context, serviceWorkers: 'allow', baseURL: 'http://localhost:4175' },
    },
  ],
});
