import type { Race } from './types';
import { isPaused, lastPauseEnd } from './pauses';

/** Recording starts 10 minutes before the start signal. */
export const RECORD_BEFORE_MS = 10 * 60_000;

/**
 * Minutes since the last track point of a running race (P-013), or 0 when the
 * hole is shorter than `minMinutes`. Before recording begins there is no hole.
 */
export function trackGap(r: Race, now: number, minMinutes = 1): number {
  // No gap is looked for while paused, and the pause itself is not a hole (P-039 AC 17).
  if (r.status !== 'running' || isPaused(r)) return 0;
  const from = r.start - RECORD_BEFORE_MS;
  if (now < from) return 0;
  const last = Math.max(r.track.length ? r.track[r.track.length - 1].t : 0, from, lastPauseEnd(r) ?? 0);
  const min = (now - last) / 60_000;
  return min >= minMinutes ? Math.max(1, Math.round(min)) : 0;
}
