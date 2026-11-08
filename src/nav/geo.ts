import { DEG, norm360 } from '../performance/angles';

export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_R_NM = 3440.065;
export const MS_TO_KT = 1.943844;

/** Great-circle distance in nautical miles. */
export function distanceNm(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial great-circle bearing from a to b, degrees true [0, 360). */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const φ1 = a.lat * DEG;
  const φ2 = b.lat * DEG;
  const dλ = (b.lon - a.lon) * DEG;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return norm360(Math.atan2(y, x) / DEG);
}

/** Velocity made good on course (towards a mark), kt. Negative = moving away. */
export function vmc(speed: number, course: number, bearingToMark: number): number {
  return speed * Math.cos((course - bearingToMark) * DEG);
}

/** SOG (kt) and COG (deg true) from two timestamped fixes; undefined if too close in time/space. */
export function sogCogFromFixes(
  a: LatLon & { t: number },
  b: LatLon & { t: number },
  minDistNm = 0.002,
): { sog: number; cog: number } | undefined {
  const dtH = (b.t - a.t) / 3_600_000;
  if (dtH <= 0) return undefined;
  const d = distanceNm(a, b);
  if (d < minDistNm) return undefined;
  return { sog: d / dtH, cog: bearingDeg(a, b) };
}

/** Formats a coordinate as degrees and decimal minutes, e.g. 37°52.341'N. */
export function formatDM(value: number, isLat: boolean): string {
  const hemi = isLat ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  const v = Math.abs(value);
  const d = Math.floor(v);
  const m = (v - d) * 60;
  return `${d}°${m.toFixed(3).padStart(6, '0')}'${hemi}`;
}
