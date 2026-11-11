/**
 * Laylines to the next mark (P-019), without AI: from the polar's optimum beat /
 * gybe angles, the (averaged) true wind direction and our position and course.
 * Flat-earth maths around the mark (fine for the few miles of a race leg).
 */
import type { LatLon } from './geo';
import { norm180, norm360 } from '../performance/angles';

export type Leg = 'up' | 'down' | 'reach';
export type Board = 'stbd' | 'port';

export interface LaylineInput {
  pos: LatLon;
  mark: LatLon;
  /** True wind direction (from), degrees true. */
  twd: number;
  /** Optimum beat angle (TWA) and gybe angle (TWA, e.g. 150) from the polar. */
  beatAngle: number;
  gybeAngle: number;
  /** Our course over ground or heading (true), if known. */
  course?: number;
  /** Speed (kn) along that course, for the time to the layline. */
  speed?: number;
}

export interface LaylineResult {
  leg: Leg;
  /** Headings (true) of the two boards for this leg. */
  heading: Record<Board, number>;
  /** Board we are on now (from course vs wind). */
  board?: Board;
  /** Distance (NM) along our board until the layline of the other board. */
  toLayNm?: number;
  /** Minutes until the layline at the current speed. */
  toLayMin?: number;
  /** We have sailed past the layline (extra distance if we go on). */
  overstood: boolean;
  /** The two laylines from the mark outwards, for drawing: [mark, far point]. */
  lines: Record<Board, [LatLon, LatLon]>;
}

const DEG = Math.PI / 180;
/** Degrees past a layline within which we still warn about overstanding. */
const OVERSTAND_MARGIN = 30;
const unit = (h: number) => ({ x: Math.sin(h * DEG), y: Math.cos(h * DEG) });

function project(origin: LatLon) {
  const k = Math.cos(origin.lat * DEG);
  return {
    to: (p: LatLon) => ({ x: (p.lon - origin.lon) * 60 * k, y: (p.lat - origin.lat) * 60 }),
    from: (x: number, y: number): LatLon => ({ lat: origin.lat + y / 60, lon: origin.lon + x / 60 / k }),
  };
}

/** Which board a course is on for a wind direction: wind over the starboard side = starboard. */
export function boardOf(course: number, twd: number): Board {
  return norm180(twd - course) >= 0 ? 'stbd' : 'port';
}

export function laylines(i: LaylineInput): LaylineResult {
  const pr = project(i.mark);
  const P = pr.to(i.pos);
  const dist = Math.hypot(P.x, P.y);
  // Bearing from us to the mark.
  const brg = norm360(Math.atan2(-P.x, -P.y) / DEG);
  const off = Math.abs(norm180(brg - i.twd));
  let leg: Leg = off < i.beatAngle ? 'up' : off > i.gybeAngle ? 'down' : 'reach';
  // Closer to a beat or to a run: decides which laylines a reach near them is measured against.
  const nearUp = off < (i.beatAngle + i.gybeAngle) / 2;
  const a = nearUp ? i.beatAngle : i.gybeAngle;
  const heading: Record<Board, number> = { stbd: norm360(i.twd - a), port: norm360(i.twd + a) };

  const len = Math.max(dist * 1.3, 0.3);
  const lineFor = (b: Board): [LatLon, LatLon] => {
    const u = unit(heading[b]);
    return [i.mark, pr.from(-u.x * len, -u.y * len)];
  };
  const lines = { stbd: lineFor('stbd'), port: lineFor('port') };
  const out: LaylineResult = { leg, heading, lines, overstood: false };
  // A reach well away from the laylines: nothing to tell.
  const margin = nearUp ? off - i.beatAngle : i.gybeAngle - off;
  if (i.course === undefined || (leg === 'reach' && margin > OVERSTAND_MARGIN)) return out;

  const board = boardOf(i.course, i.twd);
  const other: Board = board === 'stbd' ? 'port' : 'stbd';
  // Our board (from P along our heading) meets the other board's layline (M - r·u(h2)):
  // s·u(h) + r·u(h2) = M - P = -P.
  const u = unit(heading[board]);
  const w = unit(heading[other]);
  const det = u.x * w.y - u.y * w.x;
  if (Math.abs(det) < 1e-9) return out;
  const dx = -P.x;
  const dy = -P.y;
  const s = (dx * w.y - dy * w.x) / det;
  const r = (u.x * dy - u.y * dx) / det;
  if (leg !== 'reach' && r > 0 && s > 0) {
    out.board = board;
    out.toLayNm = s;
    if (i.speed !== undefined && i.speed > 0.5) out.toLayMin = (s / i.speed) * 60;
  } else if (r > 0 && s <= 0) {
    // Past the other board's layline and still sailing away from it: sailing extra distance.
    leg = nearUp ? 'up' : 'down';
    out.leg = leg;
    out.board = board;
    out.overstood = true;
  } else if (leg !== 'reach') {
    out.board = board;
  }
  return out;
}

/** Plain Greek, e.g. "Αναστροφή στη layline σε 0,4 NM (~3′)". */
export function laylineText(l: LaylineResult): string {
  if (l.leg === 'reach') return 'Η σημαδούρα πιάνεται χωρίς αναστροφή.';
  const word = l.leg === 'up' ? 'Αναστροφή' : 'Υποσταύρωση';
  if (l.overstood) return `Πέρασες τη layline: ${word.toLowerCase()} τώρα.`;
  if (l.toLayNm === undefined) return `${word}: η layline δεν είναι μπροστά με αυτές τις μούρες.`;
  const nm = l.toLayNm.toFixed(l.toLayNm < 1 ? 2 : 1).replace('.', ',');
  const min = l.toLayMin !== undefined ? ` (~${Math.max(1, Math.round(l.toLayMin))}′)` : '';
  return `${word} στη layline σε ${nm} NM${min}`;
}

/** Next tack/gybe on a computed route, from the change of board between steps. */
export function nextManoeuvre(track: readonly { t: number; twa: number }[], now: number): { at: number; kind: 'tack' | 'gybe' } | undefined {
  for (let k = 1; k < track.length; k++) {
    const a = track[k - 1];
    const b = track[k];
    if (b.t < now) continue;
    if (Math.sign(a.twa) !== Math.sign(b.twa) && a.twa !== 0 && b.twa !== 0) {
      return { at: b.t, kind: Math.abs(b.twa) < 90 ? 'tack' : 'gybe' };
    }
  }
  return undefined;
}
