/**
 * Compare many weather models at one point: what each one says, where they
 * agree, how far apart they are. The spread is the honest answer to "how
 * sure is the forecast?".
 */
import { DEG, norm360 } from '../performance/angles';
import { MODELS } from './models';
import { forecastParams, getOpenMeteoJson, type OMLocation } from './openMeteo';

export interface ModelSeries {
  id: string;
  label: string;
  short: string;
  source: 'open-meteo' | 'windy';
  /** ms UTC, hourly. */
  times: number[];
  tws: (number | null)[];
  twd: (number | null)[];
  gust: (number | null)[];
}

export interface WaveSeries {
  times: number[];
  /** Significant wave height, m. */
  height: (number | null)[];
  /** Direction waves come from, °. */
  dir: (number | null)[];
  /** Period, s. */
  period: (number | null)[];
}

export interface Comparison {
  lat: number;
  lon: number;
  place: string;
  start: number;
  end: number;
  fetchedAt: number;
  series: ModelSeries[];
  waves?: WaveSeries;
  /** Why Windy is missing, if it is. */
  windyNote?: string;
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Splits a multi-model Open-Meteo point response into one series per model. */
export function parseMultiModel(loc: OMLocation, models: string[]): ModelSeries[] {
  const h = loc.hourly;
  if (!h) return [];
  const times = h.time.map((s) => s * 1000);
  const out: ModelSeries[] = [];
  for (const id of models) {
    const tws = h[`wind_speed_10m_${id}`] as (number | null)[] | undefined;
    const twd = h[`wind_direction_10m_${id}`] as (number | null)[] | undefined;
    if (!tws || !twd || !tws.some((x) => x != null)) continue;
    const gust = (h[`wind_gusts_10m_${id}`] as (number | null)[] | undefined) ?? tws.map(() => null);
    const m = MODELS.find((x) => x.id === id);
    out.push({ id, label: m?.label ?? id, short: m?.short ?? id, source: 'open-meteo', times, tws, twd, gust });
  }
  return out;
}

export async function fetchModelSeries(lat: number, lon: number, start: number, end: number, signal?: AbortSignal): Promise<ModelSeries[]> {
  const ids = MODELS.map((m) => m.id);
  const p = forecastParams(lat.toFixed(4), lon.toFixed(4), ids, isoDate(start), isoDate(end));
  const json = (await getOpenMeteoJson(`https://api.open-meteo.com/v1/forecast?${p}`, signal)) as OMLocation;
  return parseMultiModel(json, ids);
}

export async function fetchWaves(lat: number, lon: number, start: number, end: number, signal?: AbortSignal): Promise<WaveSeries | undefined> {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: 'wave_height,wave_direction,wave_period',
    timezone: 'GMT',
    timeformat: 'unixtime',
    start_date: isoDate(start),
    end_date: isoDate(end),
    cell_selection: 'sea',
  });
  const j = (await getOpenMeteoJson(`https://marine-api.open-meteo.com/v1/marine?${p}`, signal)) as {
    hourly?: { time: number[]; wave_height: (number | null)[]; wave_direction: (number | null)[]; wave_period: (number | null)[] };
  };
  const h = j.hourly;
  if (!h || !h.wave_height?.some((x) => x != null)) return undefined;
  return { times: h.time.map((s) => s * 1000), height: h.wave_height, dir: h.wave_direction, period: h.wave_period };
}

/** Value of an hourly series at t (linear between hours, undefined outside or on gaps). */
export function valueAt(times: number[], xs: (number | null)[], t: number, angle = false): number | undefined {
  if (!times.length || t < times[0] || t > times[times.length - 1]) return undefined;
  let i = Math.min(times.length - 2, Math.max(0, Math.floor((t - times[0]) / 3_600_000)));
  while (i > 0 && times[i] > t) i--;
  while (i < times.length - 2 && times[i + 1] < t) i++;
  const a = xs[i];
  const b = times.length > 1 ? xs[i + 1] : a;
  const f = times.length > 1 ? (t - times[i]) / (times[i + 1] - times[i]) : 0;
  if (a == null) return f > 0.5 && b != null ? b : undefined;
  if (b == null) return f < 0.5 ? a : undefined;
  if (!angle) return a + (b - a) * f;
  let d = norm360(b - a);
  if (d > 180) d -= 360;
  return norm360(a + d * f);
}

export interface Spread {
  n: number;
  meanTws: number;
  meanTwd: number;
  minTws: number;
  maxTws: number;
  /** Std dev of TWS across models, kt. */
  spreadTws: number;
  /** Angular deviation of TWD across models, °. */
  spreadTwd: number;
  /** Model short name → [tws, twd]. */
  byModel: Record<string, [number, number]>;
}

export function spreadAt(series: ModelSeries[], t: number): Spread | undefined {
  const vals: { s: string; tws: number; twd: number }[] = [];
  for (const m of series) {
    const tws = valueAt(m.times, m.tws, t);
    const twd = valueAt(m.times, m.twd, t, true);
    if (tws !== undefined && twd !== undefined) vals.push({ s: m.short, tws, twd });
  }
  if (!vals.length) return undefined;
  const n = vals.length;
  const mean = vals.reduce((a, v) => a + v.tws, 0) / n;
  const sd = Math.sqrt(vals.reduce((a, v) => a + (v.tws - mean) ** 2, 0) / n);
  let ex = 0;
  let ey = 0;
  let wx = 0;
  let wy = 0;
  for (const v of vals) {
    ex += Math.sin(v.twd * DEG);
    ey += Math.cos(v.twd * DEG);
    wx += v.tws * Math.sin(v.twd * DEG);
    wy += v.tws * Math.cos(v.twd * DEG);
  }
  const R = Math.min(1, Math.hypot(ex, ey) / n);
  return {
    n,
    meanTws: mean,
    meanTwd: norm360(Math.atan2(wx || ex, wy || ey) / DEG),
    minTws: Math.min(...vals.map((v) => v.tws)),
    maxTws: Math.max(...vals.map((v) => v.tws)),
    spreadTws: sd,
    spreadTwd: Math.sqrt(2 * (1 - R)) / DEG,
    byModel: Object.fromEntries(vals.map((v) => [v.s, [Math.round(v.tws * 10) / 10, Math.round(v.twd)]])),
  };
}

export type Agreement = 'good' | 'fair' | 'poor';

/**
 * How much to trust the forecast. Light air is judged on speed only for
 * direction, since below ~5 kt models disagree on direction by nature.
 */
export function agreement(s: Spread): Agreement {
  const dirLimit = s.meanTws < 5 ? [40, 80] : [15, 35];
  if (s.spreadTws > 4 || s.spreadTwd > dirLimit[1]) return 'poor';
  if (s.spreadTws > 2 || s.spreadTwd > dirLimit[0]) return 'fair';
  return 'good';
}

export const AGREEMENT_TEXT: Record<Agreement, string> = {
  good: 'Τα μοντέλα συμφωνούν',
  fair: 'Μέτρια συμφωνία',
  poor: 'Τα μοντέλα διαφωνούν',
};

/** Hourly rows between from and to (inclusive), for tables and the advisor. */
export function spreadTimeline(series: ModelSeries[], from: number, to: number, everyH = 1): { t: number; s: Spread }[] {
  const out: { t: number; s: Spread }[] = [];
  const step = everyH * 3_600_000;
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
    const s = spreadAt(series, t);
    if (s) out.push({ t, s });
  }
  return out;
}

export async function fetchComparison(
  lat: number,
  lon: number,
  place: string,
  start: number,
  end: number,
  windy?: (lat: number, lon: number) => Promise<ModelSeries[]>,
  signal?: AbortSignal,
): Promise<Comparison> {
  const from = Math.min(start, Date.now()) - 3_600_000;
  const to = end + 3_600_000;
  const [series, waves, w] = await Promise.all([
    fetchModelSeries(lat, lon, from, to, signal),
    fetchWaves(lat, lon, from, to, signal).catch(() => undefined),
    windy
      ? windy(lat, lon).then(
          (s) => ({ s, note: s.length ? undefined : 'Το Windy δεν έδωσε δεδομένα.' }),
          (e: Error) => ({ s: [] as ModelSeries[], note: e.message }),
        )
      : Promise.resolve({ s: [] as ModelSeries[], note: undefined }),
  ]);
  if (!series.length) throw new Error('Κανένα μοντέλο δεν έδωσε δεδομένα για αυτό το σημείο.');
  return { lat, lon, place, start, end, fetchedAt: Date.now(), series: [...series, ...w.s], waves, windyNote: w.note };
}
