/** Normalises an angle to [0, 360). */
export function norm360(a: number): number {
  const r = a % 360;
  return r < 0 ? r + 360 : r;
}

/** Normalises an angle to (-180, 180]. */
export function norm180(a: number): number {
  const r = norm360(a);
  return r > 180 ? r - 360 : r;
}

/**
 * Signed true wind angle from true wind direction and the boat's heading
 * (both in the same reference, true or magnetic).
 * Positive = wind over the starboard side (starboard tack), negative = port.
 */
export function twaFromTwd(twd: number, heading: number): number {
  return norm180(twd - heading);
}

/** TWD from heading and signed TWA (inverse of twaFromTwd). */
export function twdFromTwa(twa: number, heading: number): number {
  return norm360(heading + twa);
}

/** Absolute TWA folded to [0, 180] (polars are symmetric). */
export function absTwa(twa: number): number {
  return Math.abs(norm180(twa));
}

export const DEG = Math.PI / 180;

/** Magnetic → true: true = magnetic + declination (east positive). */
export function magToTrue(mag: number, declination: number): number {
  return norm360(mag + declination);
}

/** True → magnetic. */
export function trueToMag(tru: number, declination: number): number {
  return norm360(tru - declination);
}
