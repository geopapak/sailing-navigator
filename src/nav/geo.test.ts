import { describe, expect, it } from 'vitest';
import { bearingDeg, distanceNm, formatDM, sogCogFromFixes, vmc } from './geo';

describe('geo', () => {
  it('one minute of latitude ≈ 1 NM', () => {
    expect(distanceNm({ lat: 37.9, lon: 23.6 }, { lat: 37.9 + 1 / 60, lon: 23.6 })).toBeCloseTo(1.0, 2);
  });
  it('bearings', () => {
    expect(bearingDeg({ lat: 37.9, lon: 23.6 }, { lat: 38, lon: 23.6 })).toBeCloseTo(0, 6);
    expect(bearingDeg({ lat: 37.9, lon: 23.6 }, { lat: 37.9, lon: 23.7 })).toBeCloseTo(90, 1);
  });
  it('vmc', () => {
    expect(vmc(8, 60, 0)).toBeCloseTo(4, 9);
    expect(vmc(8, 180, 0)).toBeCloseTo(-8, 9);
  });
  it('sog/cog from fixes', () => {
    const a = { lat: 37.9, lon: 23.6, t: 0 };
    const b = { lat: 37.9 + 1 / 60, lon: 23.6, t: 600_000 }; // 1 NM in 10 min
    const r = sogCogFromFixes(a, b)!;
    expect(r.sog).toBeCloseTo(6, 1);
    expect(r.cog).toBeCloseTo(0, 3);
    expect(sogCogFromFixes(a, { ...a, t: 1000 })).toBeUndefined();
  });
  it('formats degrees/minutes', () => {
    expect(formatDM(37.8723, true)).toBe("37°52.338'N");
    expect(formatDM(-0.5, false)).toBe("0°30.000'W");
  });
});
