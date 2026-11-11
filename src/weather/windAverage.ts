/**
 * Rolling average of the measured true wind (P-018). One reading on a shift can
 * spoil the whole re-route, so re-routing uses the mean of the last few minutes.
 */
export type WindFrom = 'instruments' | 'typed' | 'heading' | 'cog';

export interface WindReading {
  t: number;
  tws: number;
  twd: number;
  from: WindFrom;
}

export interface WindMean {
  tws: number;
  twd: number;
  /** Number of readings used. */
  n: number;
  /** Minutes covered (first to last reading, at least 1 when there are readings). */
  minutes: number;
  /** True when any reading came from GPS course instead of heading/instruments. */
  fromCog: boolean;
}

export const AVG_WINDOW_MS = 4 * 60_000;
/** Below this speed over ground the GPS course is noise. */
export const MIN_SOG_FOR_COG = 2;
const MIN_GAP_MS = 10_000;
const KEEP = 60;

const readings: WindReading[] = [];

/** Adds a reading (at most one per 10 s; older than the window are dropped). */
export function pushWind(r: WindReading): void {
  if (!Number.isFinite(r.tws) || !Number.isFinite(r.twd)) return;
  const last = readings[readings.length - 1];
  if (last && r.t - last.t < MIN_GAP_MS) readings[readings.length - 1] = r;
  else readings.push(r);
  while (readings.length > KEEP || (readings.length && readings[0].t < r.t - AVG_WINDOW_MS * 2)) readings.shift();
}

export function clearWind(): void {
  readings.length = 0;
}

/** Mean of the readings in the last `windowMs` (direction as a vector mean). */
export function meanWind(now = Date.now(), windowMs = AVG_WINDOW_MS, list: readonly WindReading[] = readings): WindMean | undefined {
  const recent = list.filter((r) => r.t >= now - windowMs && r.t <= now + 1000);
  if (!recent.length) return undefined;
  let x = 0;
  let y = 0;
  let s = 0;
  for (const r of recent) {
    const a = (r.twd * Math.PI) / 180;
    x += Math.sin(a);
    y += Math.cos(a);
    s += r.tws;
  }
  const twd = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
  const span = recent[recent.length - 1].t - recent[0].t;
  return {
    tws: s / recent.length,
    twd,
    n: recent.length,
    minutes: Math.max(1, Math.round(span / 60_000)),
    fromCog: recent.some((r) => r.from === 'cog'),
  };
}

/** Plain-Greek label for the re-route note, e.g. "μέσος όρος 4′ από 12 μετρήσεις". */
export function meanLabel(m: WindMean): string {
  const base = m.n === 1 ? 'μία μέτρηση' : `μέσος όρος ${m.minutes}′ από ${m.n} μετρήσεις`;
  return m.fromCog ? `${base}, ≈ από την πορεία GPS` : base;
}
