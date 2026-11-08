import { describe, expect, it } from 'vitest';
import { TRE_IRENE } from '../boat/treIrene';
import { bracket, interp1, optimums, polarCurve, polarSpeed, NO_GO_TWA } from './polar';
import { validatePolar } from '../boat/validate';

const P = TRE_IRENE.polar!;
const DEG = Math.PI / 180;

describe('helpers', () => {
  it('bracket clamps and finds segments', () => {
    expect(bracket([4, 6, 8], 2)).toEqual([0, 0]);
    expect(bracket([4, 6, 8], 9)).toEqual([1, 1]);
    expect(bracket([4, 6, 8], 7)).toEqual([1, 0.5]);
    expect(bracket([4, 6, 8], 6)).toEqual([0, 1]);
  });
  it('interp1', () => {
    expect(interp1([0, 10], [0, 100], 2.5)).toBe(25);
    expect(interp1([0, 10], [0, 100], -5)).toBe(0);
    expect(interp1([0, 10], [0, 100], 50)).toBe(100);
  });
});

describe('TRE IRENE polar data', () => {
  it('is valid', () => {
    expect(validatePolar(P)).toEqual([]);
  });
});

describe('polarCurve', () => {
  it('includes beat, gybe, no-go and 180° points, sorted', () => {
    const c = polarCurve(P, 3); // 10 kt
    const twas = c.map((p) => p.twa);
    expect([...twas].sort((a, b) => a - b)).toEqual(twas);
    expect(c[0]).toEqual({ twa: NO_GO_TWA, bsp: 0 });
    const beat = c.find((p) => p.twa === 40.5)!;
    expect(beat.bsp).toBeCloseTo(5.16 / Math.cos(40.5 * DEG), 6);
    const gybe = c.find((p) => p.twa === 150.1)!;
    expect(gybe.bsp).toBeCloseTo(5.88 / Math.cos(29.9 * DEG), 6);
    expect(c[c.length - 1]).toEqual({ twa: 180, bsp: 5.88 });
  });

  it('handles a gybe angle below the last fixed TWA (4 kt: gybe 139.3° < 150°)', () => {
    const c = polarCurve(P, 0);
    const i = c.findIndex((p) => p.twa === 139.3);
    expect(c[i + 1].twa).toBe(150);
  });
});

describe('polarSpeed', () => {
  it('returns table values exactly at grid points', () => {
    expect(polarSpeed(P, 10, 90)).toBeCloseTo(7.97, 9);
    expect(polarSpeed(P, 24, 135)).toBeCloseTo(11.58, 9);
    expect(polarSpeed(P, 4, 52)).toBeCloseTo(4.02, 9);
  });

  it('interpolates linearly in TWS', () => {
    expect(polarSpeed(P, 11, 90)).toBeCloseTo((7.97 + 8.34) / 2, 9);
    expect(polarSpeed(P, 18, 110)).toBeCloseTo((9.28 + 9.7) / 2, 9);
  });

  it('interpolates linearly in TWA', () => {
    expect(polarSpeed(P, 10, 100)).toBeCloseTo((7.97 + 8.18) / 2, 9);
  });

  it('interpolates bilinearly', () => {
    const a = (7.97 + 8.18) / 2;
    const b = (8.34 + 8.63) / 2;
    expect(polarSpeed(P, 11, 100)).toBeCloseTo((a + b) / 2, 9);
  });

  it('is symmetric and folds angles', () => {
    expect(polarSpeed(P, 12, -75)).toBeCloseTo(8.31, 9);
    expect(polarSpeed(P, 12, 285)).toBeCloseTo(8.31, 9);
  });

  it('is zero inside the no-go zone and at zero wind', () => {
    expect(polarSpeed(P, 12, 0)).toBe(0);
    expect(polarSpeed(P, 12, 20)).toBe(0);
    expect(polarSpeed(P, 0, 90)).toBe(0);
  });

  it('scales proportionally below the lowest TWS and clamps above the highest', () => {
    expect(polarSpeed(P, 2, 90)).toBeCloseTo(4.49 / 2, 9);
    expect(polarSpeed(P, 30, 90)).toBeCloseTo(9.71, 9);
  });

  it('gives the run VMG speed at 180°', () => {
    expect(polarSpeed(P, 14, 180)).toBeCloseTo(7.4, 9);
  });
});

describe('optimums', () => {
  it('matches certificate at grid TWS', () => {
    const o = optimums(P, 10);
    expect(o.beat.angle).toBe(40.5);
    expect(o.beat.vmg).toBe(5.16);
    expect(o.beat.bsp).toBeCloseTo(6.786, 3);
    expect(o.run.angle).toBe(150.1);
    expect(o.run.vmg).toBe(5.88);
    expect(o.run.bsp).toBeCloseTo(6.783, 3);
  });

  it('interpolates between TWS', () => {
    const o = optimums(P, 9);
    expect(o.beat.angle).toBeCloseTo(41.4, 9);
    expect(o.beat.vmg).toBeCloseTo((4.51 + 5.16) / 2, 9);
  });

  it('beat VMG from the curve is the max VMG upwind (consistency check)', () => {
    // The certificate optimum should not be beaten by any other upwind angle on our curve.
    for (const tws of P.tws) {
      const o = optimums(P, tws);
      for (let a = 30; a <= 90; a += 0.5) {
        const vmg = polarSpeed(P, tws, a) * Math.cos(a * DEG);
        expect(vmg).toBeLessThanOrEqual(o.beat.vmg + 1e-9);
      }
    }
  });
});
