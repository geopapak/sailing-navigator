import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { D1Database, D1PreparedStatement } from './accounts';
import { CACHE_MAX_AGE_MS, cacheGet, cachePut, fileHash } from './pdfCache';

function fakeD1(withTable = true): D1Database {
  const sql = new DatabaseSync(':memory:');
  if (withTable) sql.exec(readFileSync(new URL('../migrations/0003_pdf_cache.sql', import.meta.url), 'utf8'));
  const stmt = (q: string, args: unknown[] = []): D1PreparedStatement => ({
    bind: (...v: unknown[]) => stmt(q, v),
    first: async <T,>() => (sql.prepare(q).get(...(args as never[])) as T) ?? null,
    all: async <T,>() => ({ results: sql.prepare(q).all(...(args as never[])) as T[] }),
    run: async () => {
      const r = sql.prepare(q).run(...(args as never[]));
      return { results: [], meta: { changes: Number(r.changes) } };
    },
  });
  return { prepare: (q) => stmt(q), batch: async (list) => Promise.all(list.map((s) => s.run())) };
}

describe('PDF result cache', () => {
  it('hashes by kind, type and content', async () => {
    const a = await fileHash('certificate', 'application/pdf', 'QUJD');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await fileHash('certificate', 'application/pdf', 'QUJD')).toBe(a);
    expect(await fileHash('entrylist', 'application/pdf', 'QUJD')).not.toBe(a);
    expect(await fileHash('certificate', 'image/png', 'QUJD')).not.toBe(a);
    expect(await fileHash('certificate', 'application/pdf', 'QUJE')).not.toBe(a);
  });

  it('stores, returns and expires results', async () => {
    const db = fakeD1();
    const t = 1_800_000_000_000;
    await cachePut(db, 'certificate', 'h1', { gph: 560 }, 'claude-opus-5-5', t);
    expect(await cacheGet(db, 'certificate', 'h1', t + 1000)).toEqual({ result: { gph: 560 }, model: 'claude-opus-5-5' });
    expect(await cacheGet(db, 'entrylist', 'h1', t)).toBeUndefined();
    expect(await cacheGet(db, 'certificate', 'h1', t + CACHE_MAX_AGE_MS.certificate + 1)).toBeUndefined();
  });

  it('never breaks a reading when the database is missing or not migrated', async () => {
    const db = fakeD1(false);
    await expect(cachePut(db, 'certificate', 'h', {}, 'm')).resolves.toBeUndefined();
    expect(await cacheGet(db, 'certificate', 'h')).toBeUndefined();
    expect(await cacheGet(undefined, 'certificate', 'h')).toBeUndefined();
  });
});
