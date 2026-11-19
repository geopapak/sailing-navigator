/**
 * Finish line detection (P-040 AC 14–23). The line goes through the finish F (the last mark),
 * at right angles to the last leg P → F, 0,15 NM to each side. A crossing counts in any
 * direction of travel, but only once the detection is armed and only from P's side.
 * Pure functions: the GPS effect in RaceContext calls `finishStep` on every position.
 */
import { distanceNm, type LatLon } from '../nav/geo';
import type { Mark } from '../routing/isochrones';
import { kindOf } from './session';
import { marksSource } from './sessionMarks';
import type { FinishCross, Race } from './types';

/** Half length of the line (NM). */
export const FINISH_HALF_NM = 0.15;
/** After «Όχι»: back on P's side and this far from the line before a new crossing counts (Π9). */
export const REARM_NM = 0.1;
/** A crossing found across a longer gap between two positions is «περίπου» (Π10). */
export const APPROX_GAP_MS = 30_000;
/** Positions with a known accuracy worse than this are not used (Π14). */
export const MAX_ACCURACY_M = 50;

export interface FinishLine {
  /** The finish F. */
  f: LatLon;
  /** The previous mark P. */
  p: LatLon;
  /** Unit vector along the last leg (P → F), in the local NM plane (x east, y north). */
  ux: number;
  uy: number;
  /** cos(latitude of F), for the local plane. */
  k: number;
}

export interface Pos extends LatLon {
  t: number;
}

/** Local plane around F in NM: x east, y north. */
const local = (line: FinishLine, q: LatLon) => ({ x: (q.lon - line.f.lon) * 60 * line.k, y: (q.lat - line.f.lat) * 60 });

/** The finish line of a course; undefined with fewer than 2 marks or when P and F are ≤ 0,30 NM apart. */
export function finishLine(marks: Mark[]): FinishLine | undefined {
  if (marks.length < 2) return undefined;
  const f = marks[marks.length - 1];
  const p = marks[marks.length - 2];
  if (distanceNm(p, f) <= 2 * FINISH_HALF_NM) return undefined;
  const k = Math.cos((f.lat * Math.PI) / 180);
  const dx = (f.lon - p.lon) * 60 * k;
  const dy = (f.lat - p.lat) * 60;
  const n = Math.hypot(dx, dy);
  return { f: { lat: f.lat, lon: f.lon }, p: { lat: p.lat, lon: p.lon }, ux: dx / n, uy: dy / n, k };
}

/**
 * Signed distance (NM) from the line, along the last leg: < 0 on P's side, > 0 past the line.
 * (The line is infinite here; `along` tells whether a point is within its ±0,15 NM.)
 */
export function sideOf(q: LatLon, line: FinishLine): number {
  const v = local(line, q);
  return v.x * line.ux + v.y * line.uy;
}

/** Offset (NM) along the line from F (signed, positive to the left of the leg). */
function along(q: LatLon, line: FinishLine): number {
  const v = local(line, q);
  return -v.x * line.uy + v.y * line.ux;
}

/** Distance (NM) from the segment of the line (F ± 0,15 NM). */
export function distanceToLine(q: LatLon, line: FinishLine): number {
  const s = Math.abs(sideOf(q, line));
  const a = Math.abs(along(q, line));
  return a <= FINISH_HALF_NM ? s : Math.hypot(s, a - FINISH_HALF_NM);
}

/**
 * The crossing between two consecutive positions: `prev` on P's side, `next` past the line or on
 * it, and the straight track between them through the ±0,15 NM. Its time is interpolated by the
 * ratio of the distances from the line and rounded to the second.
 */
export function crossing(prev: Pos, next: Pos, line: FinishLine): { t: number } | undefined {
  const s0 = sideOf(prev, line);
  const s1 = sideOf(next, line);
  if (!(s0 < 0) || !(s1 >= 0)) return undefined;
  const f = -s0 / (s1 - s0);
  const a0 = along(prev, line);
  const a1 = along(next, line);
  if (Math.abs(a0 + f * (a1 - a0)) > FINISH_HALF_NM + 1e-9) return undefined;
  return { t: Math.round((prev.t + f * (next.t - prev.t)) / 1000) * 1000 };
}

/** The race is running and its detection can arm: a race, our boat, a line, after the start. */
function canDetect(r: Race, now: number): boolean {
  return r.status === 'running' && kindOf(r) === 'race' && now >= r.start && r.entries.some((e) => e.own) && !!finishLine(r.marks);
}

/**
 * Whether the detection should arm now (AC 15): every mark before the finish is passed (the
 * next mark is the finish, from `nextMarkInfo`'s rounding rule, never `markPassings`), or the
 * start signal of a straight 2-point course. `pos` is our position now (not yet in the track).
 */
export function shouldArm(r: Race, now: number, pos?: LatLon): boolean {
  if (r.finishArmedAt !== undefined || !canDetect(r, now)) return false;
  if (r.marks.length === 2) return true;
  const own = r.entries.find((e) => e.own)!;
  const withPos = pos ? { ...r, fixes: [...r.fixes, { entryId: own.id, t: now, lat: pos.lat, lon: pos.lon, source: 'own' as const }] } : r;
  const m = marksSource(withPos, { nextMark: 1 });
  return m.next >= r.marks.length - 1;
}

/** An unanswered crossing: the sheet «Τερματίσατε στις …;» is up (and outranks every other sheet). */
export const finishPending = (r: Pick<Race, 'finishCross' | 'status'> | undefined): boolean =>
  !!r && r.status === 'running' && !!r.finishCross && !r.finishCross.answered;

/** A crossing would count now: armed, and no crossing yet or «Όχι» followed by the way back (AC 18, 21). */
export function isArmed(r: Race, now: number): boolean {
  if (r.finishArmedAt === undefined || !canDetect(r, now)) return false;
  const c = r.finishCross;
  return !c || (c.answered === 'no' && !!c.rearmed);
}

export interface FinishStep {
  /** What to store in the race now (one `put`, only when something changed). */
  patch?: Partial<Race>;
  /** A new crossing was found: sound, vibration, sheet. */
  crossed?: FinishCross;
}

/**
 * One GPS position (AC 17): arms, re-arms after «Όχι», and finds a crossing between the previous
 * position (in memory, or the last track point after a reload) and this one.
 */
export function finishStep(r: Race, prev: Pos | undefined, cur: Pos, now: number): FinishStep {
  if (!canDetect(r, now)) return {};
  const line = finishLine(r.marks)!;
  const patch: Partial<Race> = {};
  let armedAt = r.finishArmedAt;
  if (armedAt === undefined && shouldArm(r, now, cur)) armedAt = patch.finishArmedAt = now;
  if (armedAt === undefined) return {};
  let fc = r.finishCross;
  if (fc?.answered === 'no' && !fc.rearmed && sideOf(cur, line) < 0 && distanceToLine(cur, line) > REARM_NM) {
    fc = patch.finishCross = { ...fc, rearmed: true };
  }
  const armed = !fc || (fc.answered === 'no' && !!fc.rearmed);
  if (armed && prev && prev.t < cur.t) {
    const c = crossing(prev, cur, line);
    if (c) {
      const gap = cur.t - prev.t;
      const cross: FinishCross = gap > APPROX_GAP_MS ? { t: c.t, approx: true, gapSec: Math.round(gap / 1000) } : { t: c.t };
      patch.finishCross = cross;
      return { patch, crossed: cross };
    }
  }
  return Object.keys(patch).length ? { patch } : {};
}
