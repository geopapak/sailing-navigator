import { DEG, norm360 } from '../performance/angles';
import { bracket } from '../performance/polar';
import type { GridForecast, WindField, WindSample } from './types';

/** u/v components (direction of travel, east/north) from TWS and TWD (from). */
export function toUV(tws: number, twd: number): [number, number] {
  return [-tws * Math.sin(twd * DEG), -tws * Math.cos(twd * DEG)];
}

/** TWD (from) for u/v components. */
export function dirFromUV(u: number, v: number): number {
  return norm360(Math.atan2(-u, -v) / DEG);
}

/** Constant wind everywhere, at all times. */
export function uniformField(tws: number, twd: number): WindField {
  const s: WindSample = { tws, twd: norm360(twd) };
  return { start: -Infinity, end: Infinity, at: () => s };
}

/**
 * Wind field over a regular grid: bilinear in space, linear in time, clamped at
 * the edges. Direction is interpolated as a vector (no 359°/1° wrap issues),
 * speed as a scalar (so veering winds don't lose strength).
 */
export function gridField(f: GridForecast): WindField {
  const nx = f.lons.length;
  const ny = f.lats.length;
  const plane = nx * ny;
  // Precompute unit vectors for direction interpolation.
  const ux = new Float64Array(f.dir.length);
  const uy = new Float64Array(f.dir.length);
  for (let i = 0; i < f.dir.length; i++) {
    ux[i] = Math.sin(f.dir[i] * DEG);
    uy[i] = Math.cos(f.dir[i] * DEG);
  }
  const one = (xs: number[]) => (x: number): [number, number] => (xs.length === 1 ? [0, 0] : bracket(xs, x));
  const bx = one(f.lons);
  const by = one(f.lats);
  const bt = one(f.times);

  return {
    start: f.times[0],
    end: f.times[f.times.length - 1],
    at(lat, lon, t) {
      const [ix, fx] = bx(lon);
      const [iy, fy] = by(lat);
      const [it, ft] = bt(t);
      const ix1 = Math.min(ix + 1, nx - 1);
      const iy1 = Math.min(iy + 1, ny - 1);
      const it1 = Math.min(it + 1, f.times.length - 1);
      let spd = 0;
      let sx = 0;
      let sy = 0;
      let gst = 0;
      const corners: [number, number][] = [
        [it * plane, 1 - ft],
        [it1 * plane, ft],
      ];
      for (const [toff, wt] of corners) {
        if (wt === 0) continue;
        const cells: [number, number][] = [
          [toff + iy * nx + ix, (1 - fx) * (1 - fy)],
          [toff + iy * nx + ix1, fx * (1 - fy)],
          [toff + iy1 * nx + ix, (1 - fx) * fy],
          [toff + iy1 * nx + ix1, fx * fy],
        ];
        for (const [k, w] of cells) {
          const ww = w * wt;
          if (ww === 0) continue;
          spd += f.speed[k] * ww;
          sx += ux[k] * ww * f.speed[k];
          sy += uy[k] * ww * f.speed[k];
          if (f.gust) gst += f.gust[k] * ww;
        }
      }
      const twd = sx === 0 && sy === 0 ? f.dir[it * plane + iy * nx + ix] : norm360(Math.atan2(sx, sy) / DEG);
      return f.gust ? { tws: spd, twd, gust: gst } : { tws: spd, twd };
    },
  };
}

/**
 * Corrects a forecast with what we actually measure on board: speeds scaled by
 * `twsFactor`, directions rotated by `twdOffset` degrees.
 */
export function calibratedField(base: WindField, twsFactor: number, twdOffset: number): WindField {
  return {
    start: base.start,
    end: base.end,
    at(lat, lon, t) {
      const w = base.at(lat, lon, t);
      return {
        tws: w.tws * twsFactor,
        twd: norm360(w.twd + twdOffset),
        gust: w.gust !== undefined ? w.gust * twsFactor : undefined,
      };
    },
  };
}

/** Calibration that maps the forecast at a point to an observed wind. */
export function calibrationFrom(forecast: WindSample, observed: WindSample): { twsFactor: number; twdOffset: number } {
  const twsFactor = forecast.tws > 0.5 ? Math.min(3, Math.max(0.3, observed.tws / forecast.tws)) : 1;
  let twdOffset = norm360(observed.twd - forecast.twd);
  if (twdOffset > 180) twdOffset -= 360;
  return { twsFactor, twdOffset };
}
