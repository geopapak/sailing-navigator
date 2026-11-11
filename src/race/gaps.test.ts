import { describe, expect, it } from 'vitest';
import { trackGap } from './gaps';
import type { Race } from './types';

const race = (over: Partial<Race>): Race => ({ status: 'running', start: 1_000_000_000, track: [], ...over }) as Race;

describe('track gaps (P-013)', () => {
  it('no gap before recording starts or when not running', () => {
    const r = race({});
    expect(trackGap(r, r.start - 11 * 60_000)).toBe(0);
    expect(trackGap(race({ status: 'finished' }), r.start + 60 * 60_000)).toBe(0);
  });

  it('minutes since the last point, after the threshold', () => {
    const r = race({ track: [{ t: 1_000_000_000, lat: 0, lon: 0 }] as Race['track'] });
    expect(trackGap(r, r.start + 20_000)).toBe(0);
    expect(trackGap(r, r.start + 20_000, 0.25)).toBe(1);
    expect(trackGap(r, r.start + 7 * 60_000)).toBe(7);
  });

  it('counts from the start of recording when there is no point yet', () => {
    const r = race({});
    expect(trackGap(r, r.start - 5 * 60_000)).toBe(5);
  });
});
