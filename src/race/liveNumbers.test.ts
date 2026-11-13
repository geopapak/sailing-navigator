import { describe, expect, it } from 'vitest';
import { depthDue, legOf, meanPct, nextChange, pushPct, trainingHint } from './liveNumbers';

describe('in-session Live numbers (P-034)', () => {
  it('leg from TWA: < 70 upwind, 70–120 reaching, > 120 downwind', () => {
    expect(legOf(42)).toBe('όρτσα');
    expect(legOf(-69)).toBe('όρτσα');
    expect(legOf(70)).toBe('πλαγιοδρομία');
    expect(legOf(120)).toBe('πλαγιοδρομία');
    expect(legOf(-150)).toBe('πρίμα');
  });

  it('15″ rolling mean of % of target', () => {
    let s = pushPct([], 0, 90);
    s = pushPct(s, 2_000, 100);
    s = pushPct(s, 4_000, undefined);
    expect(meanPct(s, 4_000)).toBe(95);
    s = pushPct(s, 16_000, 80);
    // The sample at 0 has left the window.
    expect(s.map((x) => x.t)).toEqual([2_000, 16_000]);
    expect(meanPct(s, 16_000)).toBe(90);
    expect(meanPct([], 0)).toBeUndefined();
  });

  it('hint under the %: on target, or open up / come up', () => {
    expect(trainingHint(undefined, undefined)).toBe('περιμένει ταχύτητα');
    expect(trainingHint(97, { mode: 'upwind', twa: 41, targetTwa: 41 })).toBe('στον στόχο');
    expect(trainingHint(91, { mode: 'upwind', twa: 38, targetTwa: 41 })).toBe('λίγο κάτω: άνοιξε 3°');
    expect(trainingHint(91, { mode: 'upwind', twa: 41, targetTwa: 41 })).toBe('λίγο κάτω: άνοιξε 2°');
    expect(trainingHint(91, { mode: 'downwind', twa: 150, targetTwa: 145 })).toBe('λίγο κάτω: ανέβα 5°');
    expect(trainingHint(91, { mode: 'downwind', twa: 145, targetTwa: 145 })).toBe('λίγο κάτω: ανέβα 3°');
  });

  it('chart depth at most once every 60″ and only online', () => {
    expect(depthDue(undefined, 0, true)).toBe(true);
    expect(depthDue(0, 59_000, true)).toBe(false);
    expect(depthDue(0, 60_000, true)).toBe(true);
    expect(depthDue(undefined, 0, false)).toBe(false);
  });
});

describe('cruise weather: when the wind changes (P-034)', () => {
  const H = 3600_000;
  it('first hour that is 4 kn stronger/lighter or 30° off', () => {
    expect(nextChange([])).toBeUndefined();
    expect(nextChange([{ t: 0, tws: 12, twd: 0 }, { t: H, tws: 13, twd: 10 }])).toBeUndefined();
    expect(nextChange([{ t: 0, tws: 12, twd: 0 }, { t: H, tws: 13, twd: 0 }, { t: 2 * H, tws: 8, twd: 0 }])).toEqual({ t: 2 * H, how: 'εξασθενεί' });
    expect(nextChange([{ t: 0, tws: 8, twd: 350 }, { t: H, tws: 12, twd: 350 }])).toEqual({ t: H, how: 'δυναμώνει' });
    expect(nextChange([{ t: 0, tws: 10, twd: 350 }, { t: H, tws: 10, twd: 25 }])).toEqual({ t: H, how: 'γυρίζει' });
  });
});
