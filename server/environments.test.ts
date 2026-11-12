import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * P-044: production and staging must never share a Worker, a database or an app origin.
 * A tiny reader for the flat `key = "value"` lines of wrangler.toml, grouped by table.
 */
function readToml(text: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = { '': {} };
  let table = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const head = /^\[\[?([^\]]+)\]\]?$/.exec(line);
    if (head) {
      table = head[1].trim();
      out[table] ??= {};
      continue;
    }
    const kv = /^([A-Za-z_]+)\s*=\s*"?([^"]*)"?/.exec(line);
    if (kv) out[table][kv[1]] = kv[2];
  }
  return out;
}

const toml = readToml(readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8'));
const envStaging = Object.fromEntries(
  readFileSync(new URL('../.env.staging', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);

describe('environments (P-044)', () => {
  it('keeps the production config unchanged', () => {
    expect(toml[''].name).toBe('sailing-navigator-ai');
    expect(toml.vars.ALLOWED_ORIGINS).toBe('https://geopapak.github.io');
    expect(toml.vars.ENVIRONMENT).toBeUndefined();
    expect(toml.d1_databases).toMatchObject({ binding: 'DB', database_name: 'sailing-navigator', migrations_dir: 'migrations' });
  });

  it('gives staging its own Worker, database, origin and logs', () => {
    expect(toml['env.staging'].name).toBe('sailing-navigator-ai-staging');
    const vars = toml['env.staging.vars'];
    expect(vars.ENVIRONMENT).toBe('staging');
    expect(vars.ALLOWED_ORIGINS).toBeTruthy();
    expect(vars.ALLOWED_ORIGINS).not.toContain('github.io');
    const db = toml['env.staging.d1_databases'];
    expect(db).toMatchObject({ binding: 'DB', database_name: 'sailing-navigator-staging', migrations_dir: 'migrations' });
    expect(db.database_id).not.toBe(toml.d1_databases.database_id);
    expect(toml['env.staging.observability'].enabled).toBe('true');
  });

  it('builds the test app against the staging server only, without secrets', () => {
    expect(envStaging.VITE_APP_ENV).toBe('staging');
    expect(envStaging.VITE_SERVER_URL).toMatch(/^https:\/\/sailing-navigator-ai-staging\./);
    expect(Object.keys(envStaging).every((k) => k.startsWith('VITE_'))).toBe(true);
    expect(Object.values(envStaging).join(' ')).not.toMatch(/sk-ant|@/);
  });
});
