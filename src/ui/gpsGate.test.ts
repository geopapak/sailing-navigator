import { describe, expect, it } from 'vitest';
import { queryGeoPermission, shouldWatchGps, toGeoPermission } from './gpsGate';

describe('shouldWatchGps', () => {
  it('does not watch at load while the permission is not stored (no prompt on refresh)', () => {
    expect(shouldWatchGps({ enabled: true, permission: 'prompt', requested: false })).toBe(false);
    expect(shouldWatchGps({ enabled: true, permission: 'unknown', requested: false })).toBe(false);
  });

  it('watches at load when the permission is already granted', () => {
    expect(shouldWatchGps({ enabled: true, permission: 'granted', requested: false })).toBe(true);
  });

  it('watches when denied, to show how to allow it (the browser does not prompt)', () => {
    expect(shouldWatchGps({ enabled: true, permission: 'denied', requested: false })).toBe(true);
  });

  it('watches after a user action, whatever the permission says', () => {
    for (const permission of ['prompt', 'unknown', 'granted', 'denied'] as const)
      expect(shouldWatchGps({ enabled: true, permission, requested: true })).toBe(true);
  });

  it('never watches with the switch off', () => {
    for (const permission of ['prompt', 'unknown', 'granted', 'denied'] as const)
      expect(shouldWatchGps({ enabled: false, permission, requested: true })).toBe(false);
  });
});

describe('toGeoPermission', () => {
  it('keeps the three known states and maps anything else to unknown', () => {
    expect(toGeoPermission('granted')).toBe('granted');
    expect(toGeoPermission('denied')).toBe('denied');
    expect(toGeoPermission('prompt')).toBe('prompt');
    expect(toGeoPermission(undefined)).toBe('unknown');
    expect(toGeoPermission('default')).toBe('unknown');
  });
});

describe('queryGeoPermission', () => {
  it('is unknown without a Permissions API (older Safari)', async () => {
    expect((await queryGeoPermission(undefined)).permission).toBe('unknown');
    expect((await queryGeoPermission({} as never)).permission).toBe('unknown');
  });

  it('is unknown when the query throws or rejects', async () => {
    const throws = {
      query: () => {
        throw new TypeError('not supported');
      },
    };
    const rejects = { query: () => Promise.reject(new TypeError('not supported')) };
    expect((await queryGeoPermission(throws)).permission).toBe('unknown');
    expect((await queryGeoPermission(rejects)).permission).toBe('unknown');
  });

  it('is unknown when the query never answers', async () => {
    const hangs = { query: () => new Promise<never>(() => undefined) };
    expect((await queryGeoPermission(hangs, 10)).permission).toBe('unknown');
  });

  it('returns the state and the status object', async () => {
    const status = { state: 'granted' };
    const r = await queryGeoPermission({ query: async () => status });
    expect(r.permission).toBe('granted');
    expect(r.status).toBe(status);
    expect((await queryGeoPermission({ query: async () => ({ state: 'prompt' }) })).permission).toBe('prompt');
  });
});
