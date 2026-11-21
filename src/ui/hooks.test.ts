import { describe, expect, it } from 'vitest';
import { bandReserve, barFits, navMode, sheetMode } from './hooks';

describe('navMode (P-049 A11)', () => {
  it('keeps the bottom bar on a portrait phone', () => {
    expect(navMode(375, 812, 17)).toBe('bottom');
    expect(navMode(320, 640, 23)).toBe('bottom');
  });

  it('moves to a side rail on a low landscape phone', () => {
    // 844×390: 390 / 17 ≈ 22.9em high.
    expect(navMode(844, 390, 17)).toBe('side');
    expect(navMode(667, 375, 20)).toBe('side');
  });

  it('counts the height in em of the text size setting, not in 16 px', () => {
    // 1024×600 is 35.3em high at 17 px (bottom), 26.1em at 23 px («Πολύ μεγάλα»: side).
    expect(navMode(1024, 600, 17)).toBe('bottom');
    expect(navMode(1024, 600, 23)).toBe('side');
  });

  it('stays at the bottom on a tablet or laptop in landscape', () => {
    expect(navMode(1024, 768, 17)).toBe('bottom');
    expect(navMode(1280, 800, 17)).toBe('bottom');
  });

  it('never goes to the side when the screen is square or portrait', () => {
    expect(navMode(400, 400, 17)).toBe('bottom');
    expect(navMode(390, 844, 23)).toBe('bottom');
  });

  it('agrees with the side sheet rule on a low landscape screen', () => {
    for (const [w, h, fs] of [
      [844, 390, 17],
      [740, 360, 20],
      [1024, 600, 23],
    ] as const) {
      expect(navMode(w, h, fs)).toBe('side');
      expect(sheetMode(w, h, fs)).toBe('side');
    }
  });
});

describe('fallbackSogCog (P-056 KA-ΣΤ1)', () => {
  const T = 1_000_000;
  // 0.001° of latitude ≈ 111 m.
  const at = (sec: number, dLat = 0) => ({ t: T + sec * 1000, lat: 37.9 + dLat, lon: 23.6 });
  it('works from fixes 10–120″ old, also sparse ones', async () => {
    const { fallbackSogCog } = await import('./hooks');
    // 60″ apart, 0.001° north ≈ 111 m in 60 s ≈ 3,6 kt.
    const d = fallbackSogCog([at(0)], at(60, 0.001))!;
    expect(d.sog).toBeCloseTo(3.6, 1);
    expect(Math.round(d.cog!)).toBe(0);
    // Too new or too old: nothing.
    expect(fallbackSogCog([at(0)], at(5, 0.001))).toBeUndefined();
    expect(fallbackSogCog([at(0)], at(130, 0.001))).toBeUndefined();
  });
  it('prefers a fix of the last 30″ (no long chord after a tack)', async () => {
    const { fallbackSogCog } = await import('./hooks');
    // 100″ ago south of here, 20″ ago east of here: the course is the recent one (west).
    const hist = [{ t: T, lat: 37.899, lon: 23.6 }, { t: T + 80_000, lat: 37.9, lon: 23.6005 }];
    const d = fallbackSogCog(hist, { t: T + 100_000, lat: 37.9, lon: 23.6 })!;
    expect(Math.round(d.cog!)).toBe(270);
  });
  it('still: less than 4 m in 30″ or more → 0,0 and no COG', async () => {
    const { fallbackSogCog } = await import('./hooks');
    expect(fallbackSogCog([at(0)], at(40, 0.00002))).toEqual({ sog: 0 });
    // Under 30″ and under 4 m: not known yet.
    expect(fallbackSogCog([at(0)], at(15, 0.00002))).toBeUndefined();
  });
});

describe('Live bar fit rule (P-056 §Ι)', () => {
  it('sticky only when the screen, the band reserve and the bar fit, on one row', () => {
    // 390×844 «Κανονικά»: screen ends at 640, bar 64, tab bar 76 → 768 visible.
    expect(barFits({ screenEnd: 640, reserve: bandReserve(48, 17), bar: 64, avail: 768, oneRow: true })).toBe(true);
    // 320×568 «Πολύ μεγάλα»: the screen alone is taller than the visible part.
    expect(barFits({ screenEnd: 900, reserve: 0, bar: 120, avail: 492, oneRow: false })).toBe(false);
    // Fits in height but the buttons wrapped: in the flow.
    expect(barFits({ screenEnd: 300, reserve: 0, bar: 130, avail: 768, oneRow: false })).toBe(false);
    // ~20 px short once the band reserve is counted (375×812): in the flow.
    expect(barFits({ screenEnd: 620, reserve: bandReserve(48, 17), bar: 64, avail: 736, oneRow: true })).toBe(false);
  });
  it('reserves only the difference between the band and the «Οθόνη αγώνα» row', () => {
    expect(bandReserve(48, 17)).toBeCloseTo(4.8 * 17 + 12 - 48);
    expect(bandReserve(undefined, 17)).toBe(0);
    expect(bandReserve(200, 17)).toBe(0);
  });
});
