import type { LiveResult } from '../performance/targets';

/**
 * Small pure helpers for the in-session Live per kind (P-034).
 * The Greek words here are shown as they are; see also `src/ui/sessionText.ts`.
 */

/** Leg from the true wind angle: < 70° upwind, 70–120° reaching, > 120° downwind. */
export function legOf(twa: number): 'όρτσα' | 'πλαγιοδρομία' | 'πρίμα' {
  const a = Math.abs(twa);
  return a < 70 ? 'όρτσα' : a <= 120 ? 'πλαγιοδρομία' : 'πρίμα';
}

export interface PctSample {
  t: number;
  pct: number;
}

/** Window of the «% του στόχου» mean. */
export const PCT_WINDOW_MS = 15_000;

/** Adds a sample (percent of target) and drops the ones older than the window. */
export function pushPct(samples: PctSample[], t: number, pct: number | undefined, windowMs = PCT_WINDOW_MS): PctSample[] {
  const kept = samples.filter((s) => s.t > t - windowMs);
  return pct === undefined || !Number.isFinite(pct) ? kept : [...kept, { t, pct }];
}

/** Rolling mean of the samples in the window; undefined without samples. */
export function meanPct(samples: PctSample[], now: number, windowMs = PCT_WINDOW_MS): number | undefined {
  const s = samples.filter((x) => x.t > now - windowMs && x.t <= now);
  return s.length ? s.reduce((a, x) => a + x.pct, 0) / s.length : undefined;
}

/**
 * The line under «% του στόχου» (training): «στον στόχο» above 95%, else a hint
 * in the spirit of `adviceFor`: upwind open up (bear away), downwind come up.
 */
export function trainingHint(pct: number | undefined, r: Pick<LiveResult, 'mode' | 'twa' | 'targetTwa'> | undefined): string {
  if (pct === undefined || !r) return 'περιμένει ταχύτητα';
  if (pct > 95) return 'στον στόχο';
  const diff = r.targetTwa === undefined ? 0 : r.twa - r.targetTwa;
  if (r.mode === 'upwind') return `λίγο κάτω: άνοιξε ${Math.max(2, Math.round(-diff))}°`;
  if (r.mode === 'downwind') return `λίγο κάτω: ανέβα ${Math.max(3, Math.round(diff))}°`;
  return 'λίγο κάτω: έλεγξε το τριμάρισμα';
}

/** Depth from the chart: at most one request every 60″, and only online. */
export const DEPTH_EVERY_MS = 60_000;
export function depthDue(lastAt: number | undefined, now: number, online: boolean): boolean {
  return online && (lastAt === undefined || now - lastAt >= DEPTH_EVERY_MS);
}

export interface WindAt {
  t: number;
  tws: number;
  twd: number;
}

/** Wind change worth telling a cruise: ≥ 4 kn stronger or lighter, or ≥ 30° of direction. */
export const CHANGE_KT = 4;
export const CHANGE_DEG = 30;

/**
 * When the forecast wind changes from now (cruise «Καιρός», P-034): the first hour
 * that differs enough from the first sample, and how. Undefined: steady.
 */
export function nextChange(series: WindAt[]): { t: number; how: 'δυναμώνει' | 'εξασθενεί' | 'γυρίζει' } | undefined {
  const [first, ...rest] = series;
  if (!first) return undefined;
  for (const w of rest) {
    if (w.tws - first.tws >= CHANGE_KT) return { t: w.t, how: 'δυναμώνει' };
    if (first.tws - w.tws >= CHANGE_KT) return { t: w.t, how: 'εξασθενεί' };
    const d = Math.abs(((w.twd - first.twd + 540) % 360) - 180);
    if (d >= CHANGE_DEG && w.tws >= 4) return { t: w.t, how: 'γυρίζει' };
  }
  return undefined;
}
