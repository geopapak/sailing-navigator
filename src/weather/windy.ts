/**
 * Windy Point Forecast API (https://api.windy.com/point-forecast/docs).
 * Called only from our server, which holds the key. Pure helpers shared by
 * the worker and the tests.
 */
import { norm360 } from '../performance/angles';
import type { ModelSeries } from './compare';

export const WINDY_URL = 'https://api.windy.com/api/point-forecast/v2';

/** Windy models that cover the Saronic. */
export const WINDY_MODELS: { id: string; short: string }[] = [
  { id: 'iconEu', short: 'ICON-EU' },
  { id: 'gfs', short: 'GFS' },
  { id: 'icon', short: 'ICON' },
];

const MS_TO_KT = 1.943844;

export function windyBody(key: string, lat: number, lon: number, model: string) {
  return {
    lat: Math.round(lat * 100) / 100,
    lon: Math.round(lon * 100) / 100,
    model,
    parameters: ['wind', 'windGust'],
    levels: ['surface'],
    key,
  };
}

interface WindyResponse {
  ts?: number[];
  'wind_u-surface'?: (number | null)[];
  'wind_v-surface'?: (number | null)[];
  'gust-surface'?: (number | null)[];
}

/** u/v in m/s (towards east/north) → TWS kt and TWD (from). */
export function parseWindy(_model: string, short: string, r: WindyResponse): ModelSeries | undefined {
  const ts = r.ts ?? [];
  const u = r['wind_u-surface'];
  const v = r['wind_v-surface'];
  if (!ts.length || !u || !v) return undefined;
  const tws: (number | null)[] = [];
  const twd: (number | null)[] = [];
  const gust: (number | null)[] = [];
  ts.forEach((_, i) => {
    const a = u[i];
    const b = v[i];
    if (a == null || b == null) {
      tws.push(null);
      twd.push(null);
    } else {
      tws.push(Math.round(Math.hypot(a, b) * MS_TO_KT * 10) / 10);
      twd.push(Math.round(norm360((Math.atan2(-a, -b) * 180) / Math.PI)) % 360 || 0);
    }
    const g = r['gust-surface']?.[i];
    gust.push(g == null ? null : Math.round(g * MS_TO_KT * 10) / 10);
  });
  return { id: `windy:${short}`, label: `Windy · ${short}`, short: `W·${short}`, source: 'windy', times: ts, tws, twd, gust };
}
