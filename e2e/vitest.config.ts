import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Only the repo checks of the E2E suite (P-045 criterion 5); the Playwright specs are not Vitest tests.
export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: { environment: 'node', include: ['e2e/**/*.test.ts'], exclude: ['e2e/.out/**', 'node_modules/**'] },
});
