import { describe, expect, it } from 'vitest';
import { navMode, sheetMode } from './hooks';

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
