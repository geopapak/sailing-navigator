/** Wind at a point and time. Speeds in knots, directions in degrees true (direction the wind comes FROM). */
export interface WindSample {
  tws: number;
  twd: number;
  gust?: number;
}

/** Anything that can answer "what is the wind here, then?". Implemented by forecast grids, constant wind, GRIB later. */
export interface WindField {
  /** Time coverage (ms since epoch, UTC). Outside it values are clamped to the nearest time. */
  start: number;
  end: number;
  at(lat: number, lon: number, t: number): WindSample;
}

/**
 * Regular lat/lon/time grid of wind, source-agnostic (Open-Meteo now, GRIB later).
 * Arrays are flattened as index = it * ny * nx + iy * nx + ix.
 */
export interface GridForecast {
  id: string;
  source: 'open-meteo' | 'grib' | 'manual';
  model: string;
  /** When it was fetched (ms). */
  fetchedAt: number;
  /** Ascending latitudes (ny). */
  lats: number[];
  /** Ascending longitudes (nx). */
  lons: number[];
  /** Ascending times (nt), ms UTC. */
  times: number[];
  /** Wind speed, kt. */
  speed: number[];
  /** Wind direction (from), degrees true. */
  dir: number[];
  /** Gusts, kt (optional). */
  gust?: number[];
}

export type LatLonBox = { south: number; west: number; north: number; east: number };

/** Saronic Gulf race area (incl. Hydra, Sounio, Corinth canal entrance). */
export const SARONIKOS_BOX: LatLonBox = { south: 37.25, west: 22.9, north: 38.1, east: 24.15 };
