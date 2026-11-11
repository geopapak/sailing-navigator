/**
 * Result cache for AI readings of uploaded files. The same certificate or
 * entry list uploaded again (by anyone) is answered from D1: no tokens, no
 * waiting. Keyed by SHA-256 of the file plus a version, so a change to the
 * prompt/schema starts a fresh cache. Only the extracted technical data is
 * stored — not the file and not the uploader.
 *
 * The cache is best-effort: any database error falls back to a normal reading.
 */
import type { D1Database } from './accounts';

export type CacheKind = 'certificate' | 'entrylist';

/** Bump when the prompt or schema of a kind changes. */
export const CACHE_VERSION: Record<CacheKind, number> = { certificate: 1, entrylist: 1 };

/** Certificates are yearly; entry lists matter for one regatta. */
export const CACHE_MAX_AGE_MS: Record<CacheKind, number> = {
  certificate: 400 * 86_400_000,
  entrylist: 120 * 86_400_000,
};

/** SHA-256 (hex) of the file's base64 text — same bytes give the same text. */
export async function fileHash(kind: CacheKind, mediaType: string, base64: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${kind}:v${CACHE_VERSION[kind]}:${mediaType}:${base64}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function cacheGet<T>(db: D1Database | undefined, kind: CacheKind, hash: string, now = Date.now()): Promise<{ result: T; model: string } | undefined> {
  if (!db) return undefined;
  try {
    const row = await db
      .prepare('SELECT result, model, created_at FROM pdf_cache WHERE kind = ? AND hash = ?')
      .bind(kind, hash)
      .first<{ result: string; model: string; created_at: number }>();
    if (!row || now - row.created_at > CACHE_MAX_AGE_MS[kind]) return undefined;
    await db.prepare('UPDATE pdf_cache SET hits = hits + 1 WHERE kind = ? AND hash = ?').bind(kind, hash).run();
    return { result: JSON.parse(row.result) as T, model: row.model };
  } catch {
    return undefined;
  }
}

export async function cachePut(db: D1Database | undefined, kind: CacheKind, hash: string, result: unknown, model: string, now = Date.now()): Promise<void> {
  if (!db) return;
  try {
    await db
      .prepare('INSERT OR REPLACE INTO pdf_cache (kind, hash, result, model, created_at, hits) VALUES (?, ?, ?, ?, ?, 0)')
      .bind(kind, hash, JSON.stringify(result), model, now)
      .run();
  } catch {
    /* best-effort */
  }
}
