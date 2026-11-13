import { distanceNm } from '../nav/geo';
import type { Race, TrackPoint } from './types';
import { recordFrom } from './session';
import { isPaused, lastPauseEnd } from './pauses';

/**
 * Forgotten session (P-033): ask «Τελείωσε;» when the boat has not moved for
 * 2 hours, and in any case after 24 hours.
 */

export const IDLE_MS = 2 * 3600_000;
export const STALE_MS = 24 * 3600_000;
/** Points within this distance of the last one count as "not moving". */
export const IDLE_RADIUS_NM = 0.05;
/** …and with SOG below this. */
export const IDLE_SOG_KT = 0.5;

const moving = (p: TrackPoint) => (p.sog ?? 0) >= IDLE_SOG_KT;

/**
 * When the boat last moved. Walking back from the last point, the first point
 * that moves (SOG ≥ 0.5 kt) gives its own time; the first one more than 0.05 nm
 * away gives the time we arrived after it. A last point that still moves counts
 * at its time (so no new point for 2 hours is idle too). When every point stayed
 * put, or there is none, `from` (the start of recording).
 */
export function lastMovement(track: TrackPoint[], from = 0): number {
  if (!track.length) return from;
  const last = track[track.length - 1];
  if (moving(last)) return Math.max(from, last.t);
  for (let i = track.length - 1; i > 0; i--) {
    const p = track[i - 1];
    if (moving(p)) return Math.max(from, p.t);
    if (distanceNm(p, last) > IDLE_RADIUS_NM) return Math.max(from, track[i].t);
  }
  return from;
}

/** True when the boat has not moved for `ms` (2 hours by default). */
export function isIdle(track: TrackPoint[], now: number, ms = IDLE_MS, from = 0): boolean {
  return now - lastMovement(track, from) >= ms;
}

export type ForgottenPrompt =
  | { kind: 'idle'; lastMove: number }
  | { kind: 'stale'; lastMove: number; hours: number };

/**
 * Which prompt to show now for a running session, if any. «Όχι, συνεχίζω» moves
 * the reference: the idle prompt comes back after another 2 idle hours, the
 * 24-hour one after another 24 hours. The 24-hour prompt wins when both apply.
 * While paused only the 24-hour prompt is asked.
 */
export function forgottenPrompt(r: Race, now: number): ForgottenPrompt | undefined {
  if (r.status !== 'running') return undefined;
  const from = recordFrom(r);
  if (now < from) return undefined;
  const lastMove = lastMovement(r.track, from);
  if (now - r.start >= STALE_MS && now - Math.max(r.start, r.staleAskedAt ?? 0) >= STALE_MS)
    return { kind: 'stale', lastMove, hours: Math.floor((now - r.start) / 3600_000) };
  // Not moving during a pause is the point of the pause: no idle prompt then, nor right after it (P-039 AC 17).
  if (isPaused(r)) return undefined;
  if (now - Math.max(lastMove, r.idleAskedAt ?? 0, lastPauseEnd(r) ?? 0) >= IDLE_MS) return { kind: 'idle', lastMove };
  return undefined;
}

/** Patch for «Όχι, συνεχίζω». After the 24-hour prompt the idle one waits too. */
export function keepGoing(p: ForgottenPrompt, now: number): Partial<Race> {
  return p.kind === 'stale' ? { staleAskedAt: now, idleAskedAt: now } : { idleAskedAt: now };
}
