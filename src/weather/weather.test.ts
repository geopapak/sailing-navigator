import { describe, expect, it } from 'vitest';
import { calibratedField, calibrationFrom, dirFromUV, gridField, toUV, uniformField } from './field';
import { buildUrls, gridAxes, parseOpenMeteo } from './openMeteo';
import type { GridForecast } from './types';

describe('u/v', () => {
  it('round-trips directions', () => {
    for (const d of [0, 45, 90, 180, 270, 359]) {
      const [u, v] = toUV(10, d);
      expect(dirFromUV(u, v)).toBeCloseTo(d % 360, 6);
    }
    // north wind blows towards south
    const [u, v] = toUV(10, 0);
    expect(u).toBeCloseTo(0, 9);
    expect(v).toBeCloseTo(-10, 9);
  });
});

function grid(partial: Partial<GridForecast>): GridForecast {
  return {
    id: 't',
    source: 'manual',
    model: 'test',
    fetchedAt: 0,
    lats: [37, 38],
    lons: [23, 24],
    times: [0, 3600_000],
    speed: [10, 10, 10, 10, 20, 20, 20, 20],
    dir: [350, 350, 10, 10, 350, 350, 10, 10],
    ...partial,
  };
}

describe('gridField', () => {
  it('returns node values exactly', () => {
    const f = gridField(grid({}));
    expect(f.at(37, 23, 0).tws).toBeCloseTo(10);
    expect(f.at(37, 23, 0).twd).toBeCloseTo(350);
    expect(f.at(38, 24, 3600_000).twd).toBeCloseTo(10);
  });

  it('interpolates direction across north without wrapping wrong', () => {
    const f = gridField(grid({}));
    const w = f.at(37.5, 23.5, 0);
    expect(Math.min(w.twd, 360 - w.twd)).toBeLessThan(1e-6); // ≈ 0°/360°
    expect(w.tws).toBeCloseTo(10);
  });

  it('interpolates speed in time and clamps outside', () => {
    const f = gridField(grid({}));
    expect(f.at(37, 23, 1800_000).tws).toBeCloseTo(15);
    expect(f.at(37, 23, -1e9).tws).toBeCloseTo(10);
    expect(f.at(37, 23, 1e12).tws).toBeCloseTo(20);
    expect(f.at(30, 10, 0).tws).toBeCloseTo(10); // clamped in space
  });
});

describe('calibration', () => {
  it('scales and rotates', () => {
    const c = calibrationFrom({ tws: 10, twd: 350 }, { tws: 12, twd: 5 });
    expect(c.twsFactor).toBeCloseTo(1.2);
    expect(c.twdOffset).toBeCloseTo(15);
    const f = calibratedField(uniformField(10, 350), c.twsFactor, c.twdOffset);
    const w = f.at(0, 0, 0);
    expect(w.tws).toBeCloseTo(12);
    expect(w.twd).toBeCloseTo(5);
  });
});

describe('Open-Meteo', () => {
  it('builds grid axes and chunked URLs', () => {
    const ax = gridAxes({ south: 37, west: 23, north: 37.2, east: 23.3 }, 0.1);
    expect(ax.lats).toEqual([37, 37.1, 37.2]);
    expect(ax.lons).toEqual([23, 23.1, 23.2, 23.3]);
    const { urls } = buildUrls({
      box: { south: 37, west: 23, north: 38, east: 24.9 },
      step: 0.1,
      model: 'icon_eu',
      startDate: '2026-11-08',
      endDate: '2026-11-09',
    });
    expect(urls.length).toBe(3); // 11 × 20 = 220 points → 3 requests
    expect(urls[0]).toContain('models=icon_eu');
    expect(urls[0]).toContain('wind_speed_unit=kn');
  });

  it('parses responses row-major and fills gaps', () => {
    const loc = (s: number, d: number) => ({
      hourly: {
        time: [1_800_000_000, 1_800_003_600],
        wind_speed_10m: [s, null],
        wind_direction_10m: [d, d + 10],
        wind_gusts_10m: [s + 5, s + 6],
      },
    });
    const g = parseOpenMeteo([loc(1, 0), loc(2, 90), loc(3, 180), loc(4, 270)], [37, 38], [23, 24], 'm', 5);
    expect(g.times).toEqual([1_800_000_000_000, 1_800_003_600_000]);
    expect(g.speed).toEqual([1, 2, 3, 4, 1, 2, 3, 4]); // nulls filled from previous hour
    expect(g.dir.slice(4)).toEqual([10, 100, 190, 280]);
    const f = gridField(g);
    expect(f.at(38, 23, 1_800_000_000_000).tws).toBe(3);
    expect(() => parseOpenMeteo([loc(1, 0)], [37, 38], [23, 24], 'm')).toThrow();
  });
});
