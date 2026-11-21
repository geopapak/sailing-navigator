/**
 * Visual tour of the app (screenshots + caption + visible text per step) for usability reviews.
 * Not part of `npm run e2e` / CI: the main config ignores e2e/tour/, and tour.spec.ts skips
 * itself unless it runs under this config. Same fixtures as the E2E suite: fake Worker,
 * network guard, fake clock, simulator, made-up test user; nothing reaches a real server.
 * Output: $TOUR_OUT (default e2e/.out/tour, gitignored), with an index.md built at the end.
 */
import { defineConfig, devices } from '@playwright/test';

process.env.SN_TOUR = '1';

const context = {
  locale: 'el-GR',
  timezoneId: 'Europe/Athens',
  geolocation: { latitude: 37.9, longitude: 23.66 },
};
const chromiumOnlyLocal = {
  launchOptions: { args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] },
};
const phone = { ...devices['Pixel 5'], viewport: { width: 375, height: 812 }, ...context, ...chromiumOnlyLocal };

export default defineConfig({
  testDir: '.',
  testMatch: /tour\.spec\.ts$/,
  outputDir: '../.out/tour-results',
  timeout: 240_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 3,
  fullyParallel: true,
  reporter: [['list']],
  globalSetup: '../global-setup.ts',
  globalTeardown: './index-teardown.ts',
  use: {
    // A missing element fails its step in seconds, not at the test timeout.
    actionTimeout: 15_000,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    serviceWorkers: 'block',
    baseURL: 'http://localhost:4173',
  },
  webServer: [
    {
      command: 'npx vite preview --outDir e2e/.out/dist --port 4173 --strictPort --host localhost',
      cwd: '../..',
      url: 'http://localhost:4173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'node e2e/sw-serve.mjs',
      cwd: '../..',
      url: 'http://localhost:4174/__e2e/version',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
  projects: [
    { name: 'tour', grepInvert: /@sw/, use: phone },
    // The update prompt needs the real service worker (versions A and B from e2e/sw-serve.mjs).
    { name: 'tour-sw', grep: /@sw/, workers: 1, use: { ...phone, serviceWorkers: 'allow', baseURL: 'http://localhost:4174' } },
  ],
});
