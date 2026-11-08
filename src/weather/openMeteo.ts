import type { GridForecast, LatLonBox } from './types';

export const OPEN_METEO_MODELS: { id: string; label: string }[] = [
  { id: 'best_match', label: 'Αυτόματο (best match)' },
  { id: 'icon_eu', label: 'DWD ICON-EU (7 km)' },
  { id: 'ecmwf_ifs025', label: 'ECMWF IFS (25 km)' },
  { id: 'gfs_seamless', label: 'NOAA GFS' },
  { id: 'meteofrance_seamless', label: 'Météo-France ARPEGE' },
];

export interface OpenMeteoRequest {
  box: LatLonBox;
  /** Grid spacing in degrees. */
  step: number;
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

/** Builds request URLs (chunked) for all grid points, row-major (lat, then lon). */
export function buildUrls(req: OpenMeteoRequest): { urls: string[]; lats: number[]; lons: number[] } {
  const { lats, lons } = gridAxes(req.box, req.step);
  const pts: [number, number][] = [];
  for (const la of lats) for (const lo of lons) pts.push([la, lo]);
  const urls: string[] = [];
  for (let i = 0; i < pts.length; i += MAX_LOCATIONS_PER_REQUEST) {
    const chunk = pts.slice(i, i + MAX_LOCATIONS_PER_REQUEST);
    const p = new URLSearchParams({
      latitude: chunk.map((c) => c[0]).join(','),
      longitude: chunk.map((c) => c[1]).join(','),
      hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      wind_speed_unit: 'kn',
      timezone: 'GMT',
      timeformat: 'unixtime',
      start_date: req.startDate,
      end_date: req.endDate,
      cell_selection: 'sea',
    });
    if (req.model && req.model !== 'best_match') p.set('models', req.model);
    urls.push(`https://api.open-meteo.com/v1/forecast?${p.toString()}`);
  }
  return { urls, lats, lons };
}

interface OMLocation {
  hourly?: {
    time: number[];
    wind_speed_10m: (number | null)[];
    wind_direction_10m: (number | null)[];
    wind_gusts_10m?: (number | null)[];
  };
}

/**
 * Converts Open-Meteo responses (one entry per grid point, row-major) to a GridForecast.
 * Missing values (null) are filled from the previous valid hour of the same point, or 0.
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
  if (!first) throw new Error('Η απάντηση δεν έχει ωριαία δεδομένα.');
  const times = first.time.map((s) => s * 1000);
  const nt = times.length;
  const speed = new Array<number>(nt * n);
  const dir = new Array<number>(nt * n);
  const gust = new Array<number>(nt * n);
  let hasGust = true;
  locations.forEach((loc, k) => {
    const h = loc.hourly;
    if (!h || h.time.length !== nt) throw new Error('Ασυνεπής χρονοσειρά στην πρόγνωση.');
    let ls = 0;
    let ld = 0;
    let lg = 0;
    for (let it = 0; it < nt; it++) {
      const s = h.wind_speed_10m[it];
      const d = h.wind_direction_10m[it];
      const g = h.wind_gusts_10m?.[it];
      if (s !== null && s !== undefined) ls = s;
      if (d !== null && d !== undefined) ld = d;
      if (g !== null && g !== undefined) lg = g;
      else if (!h.wind_gusts_10m) hasGust = false;
      speed[it * n + k] = ls;
      dir[it * n + k] = ld;
      gust[it * n + k] = lg;
    }
  });
  return {
    id: `open-meteo:${model}:${fetchedAt}`,
    source: 'open-meteo',
    model,
    fetchedAt,
    lats,
    lons,
    times,
    speed,
    dir,
    gust: hasGust ? gust : undefined,
  };
}

/** Fetches a forecast grid from Open-Meteo. */
export async function fetchOpenMeteo(req: OpenMeteoRequest, signal?: AbortSignal): Promise<GridForecast> {
  const { urls, lats, lons } = buildUrls(req);
  const parts: OMLocation[] = [];
  for (const url of urls) {
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
    const json = await res.json();
    parts.push(...(Array.isArray(json) ? json : [json]));
  }
  return parseOpenMeteo(parts, lats, lons, req.model);
}
