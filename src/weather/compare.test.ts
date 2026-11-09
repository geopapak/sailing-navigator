import { describe, expect, it } from 'vitest';
import { agreement, parseMultiModel, spreadAt, spreadTimeline, valueAt, type ModelSeries } from './compare';
import { buildUrls, parseOpenMeteo } from './openMeteo';
import { parseWindy } from './windy';
import { normalizeModel } from './models';

const H = 3_600_000;
const T0 = 1_800_000_000_000;
const series = (short: string, tws: number[], twd: number[]): ModelSeries => ({
  id: short,
  label: short,
  short,
  source: 'open-meteo',
  times: tws.map((_, i) => T0 + i * H),
  tws,
  twd,
  gust: tws.map(() => null),
});

describe('model comparison', () => {
  it('interpolates values, angles across north, and gaps', () => {
    const t = [T0, T0 + H];
    expect(valueAt(t, [10, 20], T0 + H / 2)).toBe(15);
    expect(valueAt(t, [350, 10], T0 + H / 2, true)).toBeCloseTo(0, 6);
    expect(valueAt(t, [10, null], T0 + H / 4)).toBe(10);
    expect(valueAt(t, [10, null], T0 + (3 * H) / 4)).toBeUndefined();
    expect(valueAt(t, [10, 20], T0 - 1)).toBeUndefined();
  });

  it('measures spread and agreement', () => {
    const close = [series('A', [12, 12], [0, 0]), series('B', [13, 13], [10, 10]), series('C', [11, 11], [350, 350])];
    const s = spreadAt(close, T0)!;
    expect(s.n).toBe(3);
    expect(s.meanTws).toBeCloseTo(12);
    expect(s.meanTwd < 2 || s.meanTwd > 358).toBe(true);
    expect(s.spreadTwd).toBeLessThan(10);
    expect(agreement(s)).toBe('good');
    expect(s.byModel.B).toEqual([13, 10]);

    const apart = [series('A', [6, 6], [0, 0]), series('B', [16, 16], [90, 90])];
    expect(agreement(spreadAt(apart, T0)!)).toBe('poor');
    expect(spreadTimeline(close, T0, T0 + H)).toHaveLength(2);
  });

  it('splits a multi-model Open-Meteo response and skips empty models', () => {
    const out = parseMultiModel(
      {
        hourly: {
          time: [1_800_000_000],
          wind_speed_10m_ecmwf_ifs: [10],
          wind_direction_10m_ecmwf_ifs: [20],
          wind_gusts_10m_ecmwf_ifs: [14],
          wind_speed_10m_gfs_seamless: [null],
          wind_direction_10m_gfs_seamless: [null],
        },
      },
      ['ecmwf_ifs', 'gfs_seamless'],
    );
    expect(out.map((s) => s.short)).toEqual(['ECMWF']);
    expect(out[0].times).toEqual([T0]);
  });

  it('builds a consensus grid with spread', () => {
    const { urls } = buildUrls({ box: { south: 37, west: 23, north: 37, east: 23 }, step: 0.1, model: 'consensus', startDate: 'a', endDate: 'b' });
    expect(decodeURIComponent(urls[0])).toContain('models=ecmwf_ifs,icon_seamless');
    const loc = {
      hourly: {
        time: [1_800_000_000, 1_800_003_600],
        wind_speed_10m_ecmwf_ifs: [10, 10],
        wind_direction_10m_ecmwf_ifs: [350, 350],
        wind_speed_10m_icon_seamless: [14, null],
        wind_direction_10m_icon_seamless: [10, null],
      },
    };
    const g = parseOpenMeteo([loc], [37], [23], 'consensus', 1);
    expect(g.members).toEqual(['ecmwf_ifs', 'icon_seamless']);
    expect(g.speed[0]).toBe(12);
    expect(g.dir[0] < 5 || g.dir[0] > 355).toBe(true);
    expect(g.spreadTws![0]).toBe(2);
    expect(g.spreadTwd![0]).toBeGreaterThan(5);
    // Second hour: only ECMWF left → its value, no spread.
    expect(g.speed[1]).toBe(10);
    expect(g.spreadTws![1]).toBe(0);
  });

  it('keeps old model ids working', () => {
    expect(normalizeModel('icon_eu')).toBe('icon_seamless');
    expect(normalizeModel('nonsense')).toBe('best_match');
    expect(normalizeModel('consensus')).toBe('consensus');
  });
});

describe('Windy', () => {
  it('converts u/v m/s to knots and direction from', () => {
    const s = parseWindy('gfs', 'GFS', { ts: [T0, T0 + H], 'wind_u-surface': [0, 5], 'wind_v-surface': [-5, null], 'gust-surface': [8, null] })!;
    // u=0, v=-5 → blowing towards south → from north, 9.7 kt.
    expect(s.tws[0]).toBeCloseTo(9.7, 1);
    expect(s.twd[0]).toBe(0);
    expect(s.gust[0]).toBeCloseTo(15.6, 1);
    expect(s.tws[1]).toBeNull();
    expect(s.source).toBe('windy');
    expect(parseWindy('gfs', 'GFS', {})).toBeUndefined();
  });
});
