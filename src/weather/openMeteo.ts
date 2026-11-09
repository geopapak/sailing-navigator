import { DEG, norm360 } from '../performance/angles';
import { CONSENSUS_ID, CONSENSUS_MODELS } from './models';
import type { GridForecast, LatLonBox } from './types';


export interface OpenMeteoRequest {
  box: LatLonBox;
  /** Grid spacing in degrees. */
  step: number;
  /** A model id, 'best_match', or 'consensus' (mean of CONSENSUS_MODELS). */
  model: string;
  /** First and last day to fetch (YYYY-MM-DD, UTC). */
  startDate: string;
  endDate: string;
}

/** Grid node coordinates covering the box (inclusive edges). */
export function gridAxes(box: LatLonBox, step: number): { lats: number[]; lons: number[] } {
  const axis = (a: number, b: number) => {
    const n = Math.max(1, Math.round((b - a) / step));
    return Array.from({ length: n + 1 }, (_, i) => Number((a + ((b - a) * i) / n).toFixed(4)));
  };
  return { lats: axis(box.south, box.north), lons: axis(box.west, box.east) };
}

const MAX_LOCATIONS_PER_REQUEST = 100;

/** The Open-Meteo model ids a request needs. */
export function requestModels(model: string): string[] {
  if (model === CONSENSUS_ID) return CONSENSUS_MODELS;
  return model && model !== 'best_match' ? [model] : [];
}

export function forecastParams(lat: string, lon: string, models: string[], startDate: string, endDate: string): URLSearchParams {
  const p = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    wind_speed_unit: 'kn',
    timezone: 'GMT',
    timeformat: 'unixtime',
    start_date: startDate,
    end_date: endDate,
    cell_selection: 'sea',
  });
  if (models.length) p.set('models', models.join(','));
  return p;
}

/** Builds request URLs (chunked) for all grid points, row-major (lat, then lon). */
export function buildUrls(req: OpenMeteoRequest): { urls: string[]; lats: number[]; lons: number[] } {
  const { lats, lons } = gridAxes(req.box, req.step);
  const pts: [number, number][] = [];
  for (const la of lats) for (const lo of lons) pts.push([la, lo]);
  const urls: string[] = [];
  const models = requestModels(req.model);
  for (let i = 0; i < pts.length; i += MAX_LOCATIONS_PER_REQUEST) {
    const chunk = pts.slice(i, i + MAX_LOCATIONS_PER_REQUEST);
    const p = forecastParams(chunk.map((c) => c[0]).join(','), chunk.map((c) => c[1]).join(','), models, req.startDate, req.endDate);
    urls.push(`https://api.open-meteo.com/v1/forecast?${p.toString()}`);
  }
  return { urls, lats, lons };
}

type Series = (number | null)[];
export interface OMLocation {
  hourly?: { time: number[] } & Record<string, Series | number[] | undefined>;
}

/** Raw per-model planes with NaN where the model has no value. */
interface RawGrid {
  model: string;
  speed: Float64Array;
  dir: Float64Array;
  gust?: Float64Array;
}

/** Variable key for a model: suffixed only when several models were requested. */
const key = (v: string, model: string, multi: boolean) => (multi ? `${v}_${model}` : v);

function readRaw(locations: OMLocation[], models: string[], nt: number): RawGrid[] {
  const n = locations.length;
  const multi = models.length > 1;
  const names = models.length ? models : ['best_match'];
  return names.map((m) => {
    const speed = new Float64Array(nt * n).fill(NaN);
    const dir = new Float64Array(nt * n).fill(NaN);
    const gust = new Float64Array(nt * n).fill(NaN);
    let hasGust = false;
    locations.forEach((loc, k) => {
      const h = loc.hourly!;
      if (h.time.length !== nt) throw new Error('Ασυνεπής χρονοσειρά στην πρόγνωση.');
      const s = h[key('wind_speed_10m', m, multi)] as Series | undefined;
      const d = h[key('wind_direction_10m', m, multi)] as Series | undefined;
      const g = h[key('wind_gusts_10m', m, multi)] as Series | undefined;
      for (let it = 0; it < nt; it++) {
        const sv = s?.[it];
        const dv = d?.[it];
        const gv = g?.[it];
        if (sv != null) speed[it * n + k] = sv;
        if (dv != null) dir[it * n + k] = dv;
        if (gv != null) {
          gust[it * n + k] = gv;
          hasGust = true;
        }
      }
    });
    return { model: m, speed, dir, gust: hasGust ? gust : undefined };
  });
}

/** Replace NaN with the previous valid hour of the same point (or the first valid one, or 0). */
function fillGaps(a: Float64Array, n: number, nt: number): number[] {
  const out = new Array<number>(a.length);
  for (let k = 0; k < n; k++) {
    let last = NaN;
    for (let it = 0; it < nt && Number.isNaN(last); it++) last = a[it * n + k];
    if (Number.isNaN(last)) last = 0;
    for (let it = 0; it < nt; it++) {
      const v = a[it * n + k];
      if (!Number.isNaN(v)) last = v;
      out[it * n + k] = last;
    }
  }
  return out;
}

/**
 * Mean of several models per cell and hour. Speed and gust are averaged as
 * scalars, direction as a speed-weighted vector. Also returns the spread:
 * standard deviation of speed (kt) and angular deviation of direction (°).
 */
export function consensus(raws: RawGrid[], size: number) {
  const speed = new Float64Array(size).fill(NaN);
  const dir = new Float64Array(size).fill(NaN);
  const gust = new Float64Array(size).fill(NaN);
  const spreadTws = new Array<number>(size);
  const spreadTwd = new Array<number>(size);
  for (let i = 0; i < size; i++) {
    let c = 0;
    let s = 0;
    let s2 = 0;
    let ex = 0;
    let ey = 0;
    let wx = 0;
    let wy = 0;
    let g = 0;
    let gc = 0;
    for (const r of raws) {
      const v = r.speed[i];
      if (Number.isNaN(v) || Number.isNaN(r.dir[i])) continue;
      const a = r.dir[i] * DEG;
      c++;
      s += v;
      s2 += v * v;
      ex += Math.sin(a);
      ey += Math.cos(a);
      wx += v * Math.sin(a);
      wy += v * Math.cos(a);
      const gv = r.gust?.[i];
      if (gv !== undefined && !Number.isNaN(gv)) {
        g += gv;
        gc++;
      }
    }
    if (c === 0) {
      spreadTws[i] = 0;
      spreadTwd[i] = 0;
      continue;
    }
    const mean = s / c;
    speed[i] = mean;
    dir[i] = wx === 0 && wy === 0 ? 0 : norm360(Math.atan2(wx, wy) / DEG);
    if (gc) gust[i] = g / gc;
    spreadTws[i] = Math.sqrt(Math.max(0, s2 / c - mean * mean));
    const R = Math.min(1, Math.hypot(ex, ey) / c);
    spreadTwd[i] = Math.sqrt(2 * (1 - R)) / DEG;
  }
  return { speed, dir, gust, spreadTws, spreadTwd, members: raws.map((r) => r.model) };
}

const round = (xs: number[], d: number) => xs.map((x) => Math.round(x * 10 ** d) / 10 ** d);

/**
 * Converts Open-Meteo responses (one entry per grid point, row-major) to a GridForecast.
 * `model` may be a single id, 'best_match', or 'consensus'.
 * Missing values (null) are filled from the previous valid hour of the same point.
 */
export function parseOpenMeteo(
  locations: OMLocation[],
  lats: number[],
  lons: number[],
  model: string,
  fetchedAt = Date.now(),
): GridForecast {
  const n = lats.length * lons.length;
  if (locations.length !== n) throw new Error(`Αναμένονταν ${n} σημεία, ήρθαν ${locations.length}.`);
  const first = locations[0].hourly;
  if (!first || locations.some((l) => !l.hourly)) throw new Error('Η απάντηση δεν έχει ωριαία δεδομένα.');
  const times = first.time.map((s) => s * 1000);
  const nt = times.length;
  const raws = readRaw(locations, requestModels(model), nt);

  const base = { id: `open-meteo:${model}:${fetchedAt}`, source: 'open-meteo' as const, model, fetchedAt, lats, lons, times };
  if (model === CONSENSUS_ID) {
    const usable = raws.filter((r) => r.speed.some((v) => !Number.isNaN(v)));
    if (usable.length === 0) throw new Error('Κανένα μοντέλο δεν έδωσε δεδομένα.');
    const c = consensus(usable, nt * n);
    return {
      ...base,
      speed: round(fillGaps(c.speed, n, nt), 2),
      dir: round(fillGaps(c.dir, n, nt), 1),
      gust: round(fillGaps(c.gust, n, nt), 2),
      members: c.members,
      spreadTws: round(c.spreadTws, 2),
      spreadTwd: round(c.spreadTwd, 1),
    };
  }
  const r = raws[0];
  return {
    ...base,
    speed: fillGaps(r.speed, n, nt),
    dir: fillGaps(r.dir, n, nt),
    gust: r.gust ? fillGaps(r.gust, n, nt) : undefined,
  };
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    let reason = '';
    try {
      reason = (await res.json()).reason ?? '';
    } catch {
      /* ignore */
    }
    throw new Error(`Open-Meteo: σφάλμα ${res.status}${reason ? ` (${reason})` : ''}`);
  }
  return res.json();
}

/** Fetches a forecast grid from Open-Meteo. */
export async function fetchOpenMeteo(req: OpenMeteoRequest, signal?: AbortSignal): Promise<GridForecast> {
  const { urls, lats, lons } = buildUrls(req);
  const parts: OMLocation[] = [];
  for (const url of urls) {
    const json = await getJson(url, signal);
    parts.push(...((Array.isArray(json) ? json : [json]) as OMLocation[]));
  }
  return parseOpenMeteo(parts, lats, lons, req.model);
}

export { getJson as getOpenMeteoJson };
