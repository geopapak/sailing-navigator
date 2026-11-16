import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { lat: number; lon: number }[] = [];
vi.mock('./nauticalStyle', () => ({
  fetchDepthInfo: vi.fn(async (lat: number, lon: number) => {
    calls.push({ lat, lon });
    return { d: { depth: 12, min: 11, max: 13 }, land: false };
  }),
}));

import { cachedDepth, chartDepthAt, claimAhead, resetDepthCache, slotFor } from './depthCache';

/** 1′ of latitude = 1 nm. */
const P = (latMin: number) => ({ lat: 37 + latMin / 60, lon: 23.5 });
const T0 = Date.UTC(2026, 10, 16, 9, 0, 0);

describe('chart depth budget (P-036 AC 7, QA fix 6)', () => {
  beforeEach(() => {
    resetDepthCache();
    calls.length = 0;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('at most one request a minute in total; the cell answers without a request', async () => {
    expect(await chartDepthAt(P(0), T0)).toMatchObject({ land: false });
    expect(await chartDepthAt(P(1), T0 + 10_000)).toBeUndefined();
    expect(calls).toHaveLength(1);
    // Same ~200 m cell: from the cache.
    expect(await chartDepthAt(P(0.01), T0 + 20_000)).toBeDefined();
    expect(calls).toHaveLength(1);
    expect(await chartDepthAt(P(1), T0 + 60_000)).toBeDefined();
    expect(calls).toHaveLength(2);
  });

  it('ahead goes first, but «Βάθος εδώ» gets every 2nd slot while both want one', async () => {
    const who: string[] = [];
    for (let i = 0; i < 6; i++) {
      const t = T0 + i * 60_000;
      claimAhead(t);
      // «Βάθος εδώ» keeps asking every 5″ (busy budget); then the alert, then the depth here.
      if (i > 0) expect(await chartDepthAt(P(i * 2), t - 5_000, 'here')).toBeUndefined();
      const a = await chartDepthAt(P(i * 2 + 1), t, 'ahead');
      const h = await chartDepthAt(P(i * 2), t, 'here');
      who.push(a ? 'ahead' : h ? 'here' : '-');
    }
    expect(calls).toHaveLength(6);
    expect(who).toEqual(['ahead', 'here', 'ahead', 'here', 'ahead', 'here']);
  });

  it('with nobody waiting for the depth here, ahead has every slot', async () => {
    for (let i = 0; i < 3; i++) {
      claimAhead(T0 + i * 60_000);
      expect(slotFor('ahead', T0 + i * 60_000)).toBe(true);
      expect(await chartDepthAt(P(i), T0 + i * 60_000, 'ahead')).toBeDefined();
    }
    expect(calls).toHaveLength(3);
    // While ahead samples and had the last slot, «here» may take the next free one.
    claimAhead(T0 + 170_000);
    expect(slotFor('here', T0 + 170_000)).toBe(false); // the minute's budget is not free yet
    expect(slotFor('here', T0 + 180_000)).toBe(true);
  });

  it('reaching a cell sampled ahead gives the depth here without a request', async () => {
    claimAhead(T0);
    await chartDepthAt(P(0.3), T0, 'ahead');
    expect(cachedDepth(P(0.3), T0 + 120_000)).toBeDefined();
    expect(await chartDepthAt(P(0.3), T0 + 120_000, 'here')).toBeDefined();
    expect(calls).toHaveLength(1);
  });

  it('offline: no request at all', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(await chartDepthAt(P(0), T0, 'ahead')).toBeUndefined();
    expect(await chartDepthAt(P(0), T0 + 90_000, 'here')).toBeUndefined();
    expect(calls).toHaveLength(0);
  });
});
