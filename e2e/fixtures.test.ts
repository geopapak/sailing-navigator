/**
 * P-045 criterion 5: the E2E fixtures and settings hold only fake data. The CI traces
 * of a public repo can be read by anyone, so: emails only @example.test, nothing that
 * looks like a key or token, no production / staging URL.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SELF = 'e2e/fixtures.test.ts';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (n === '.out' || n === 'node_modules') return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const SCANNED = [
  ...files(join(root, 'e2e')),
  join(root, 'playwright.config.ts'),
  join(root, '.env.e2e'),
  join(root, '.env.e2e-sw'),
  join(root, '.github/workflows/e2e.yml'),
].map((p) => relative(root, p).replace(/\\/g, '/'));

export function problems(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)) {
    // `@playwright/test`-like package names have no dot before the TLD part we match; real emails do.
    if (m[1] !== 'example.test') out.push(`email εκτός @example.test: ${m[0]}`);
  }
  if (/sk-ant-[A-Za-z0-9_-]{8,}/.test(text)) out.push('κείμενο που μοιάζει με κλειδί Anthropic (sk-ant-)');
  if (/gh[pousr]_[A-Za-z0-9]{20,}/.test(text)) out.push('κείμενο που μοιάζει με token GitHub');
  if (/Bearer\s+[A-Za-z0-9._~+/-]{32,}/.test(text)) out.push('Bearer με token πραγματικού μήκους');
  for (const m of text.matchAll(/[A-Za-z0-9.-]+\.(workers\.dev|github\.io|pages\.dev)/g)) {
    // The guard and its own test name these hosts on purpose, only under made-up subdomains.
    if (!/(^|\.)example\.|^blocked\.|^someone\.|^navigator\.pages\.dev$/.test(m[0])) out.push(`URL παραγωγής/staging: ${m[0]}`);
  }
  return out;
}

describe('E2E fixtures: μόνο ψεύτικα δεδομένα (P-045)', () => {
  it('ο έλεγχος πιάνει email, κλειδιά και URLs παραγωγής', () => {
    const at = '@';
    expect(problems(`a${at}gmail.com`)).toHaveLength(1);
    expect(problems(`crew${at}example.test`)).toHaveLength(0);
    expect(problems(['sk', 'ant', 'api03abcdefghijkl'].join('-'))).toHaveLength(1);
    expect(problems(`Bearer ${'x'.repeat(40)}`)).toHaveLength(1);
    expect(problems(`Bearer e2e-token-0001`)).toHaveLength(0);
    expect(problems(['https://sailing-navigator-ai.geo', 'workers.dev'].join('.'))).toHaveLength(1);
  });

  for (const f of SCANNED.filter((f) => f !== SELF)) {
    it(f, () => {
      let text: string;
      try {
        text = readFileSync(join(root, f), 'utf8');
      } catch {
        return; // e.g. the workflow before it exists
      }
      expect(problems(text)).toEqual([]);
    });
  }
});
