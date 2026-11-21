import { span } from '../format';
import { distanceNm, type LatLon } from '../nav/geo';
import type { Mark } from '../routing/isochrones';
import { kindOf, sessionStats } from './session';
import type { Race, TrackPoint } from './types';

/**
 * Cruise v1 (P-036): destination, distance left along the route, ETA, top speed,
 * arrival and the rules of the two safety alerts (shallow water, arrival).
 * Pure helpers; the screens live in `src/ui/CruiseViews.tsx`.
 */

/** Speed of the estimate when there are no earlier cruises (kt). */
export const CRUISE_DEFAULT_KT = 5.5;
/** «ΦΤΑΝΕΙΣ»: the destination is this close along the route (nm). */
export const ARRIVE_ALERT_NM = 0.5;
/**
 * «ΦΤΑΝΕΙΣ» and «άφιξη» are armed only once the boat has been farther than this from
 * the destination (along the route) since it was set: a return to the own marina does not
 * «arrive» at the start (hysteresis over the 0,5 nm of the alert).
 */
export const ARRIVE_ARM_NM = 0.6;
/** «άφιξη» in the summary: the first time we are this close to the destination (nm). */
export const ARRIVED_NM = 0.1;
/** A mark of a saved route counts as passed inside this radius (as `markPassings`). */
export const PASS_NM = 0.15;
/** «ΡΗΧΑ ΜΠΡΟΣΤΑ» below this depth (m). */
export const SHALLOW_M = 5;
/** With the sounder, the alert re-arms once the depth is back at this (m), so it does not flap. */
export const SHALLOW_CLEAR_M = 6;
/** The chart sample is taken this far ahead on the course over ground (nm). */
export const AHEAD_NM = 0.3;
/** At most one EMODnet `depth_sample` per minute per device. */
export const SAMPLE_EVERY_MS = 60_000;
/** … and only when moving faster than this (kt). */
export const SAMPLE_MIN_SOG = 1;
/** EMODnet gives up after this long (slow 3G). */
export const SAMPLE_TIMEOUT_MS = 8_000;
/** ETA from the mean SOG of the last 10′. */
export const ETA_WINDOW_MS = 10 * 60_000;
/** Below this mean speed there is no ETA (kt). */
export const ETA_MIN_KT = 0.3;
/** Top speed: the highest mean SOG over 30″. */
export const MAX_WINDOW_MS = 30_000;
/** Recent destinations kept per account. */
export const RECENT_MAX = 5;

/** A point picked on the map (or a recent one). */
export interface DestPoint {
  name: string;
  lat: number;
  lon: number;
}

/** What «Πού πάμε;» picked: a point, a saved route, or nothing. */
export type CruiseDest =
  | { kind: 'point'; point: DestPoint }
  | { kind: 'course'; id?: string; name: string; marks: Mark[] }
  | { kind: 'none' };

type DestFields = 'marks' | 'courseId' | 'courseName' | 'dest' | 'arrivedAt' | 'arriveArmed' | 'arriveFired';

/** The session fields of a destination (marks = the destination as a route); any arrival is cleared. */
export function destPatch(d: CruiseDest): Pick<Race, DestFields> {
  const clear = { arrivedAt: undefined, arriveArmed: undefined, arriveFired: undefined };
  if (d.kind === 'point') {
    const p = d.point;
    return { marks: [{ id: 'dest', name: p.name, lat: p.lat, lon: p.lon }], courseId: undefined, courseName: undefined, dest: { ...p }, ...clear };
  }
  if (d.kind === 'course') return { marks: d.marks.map((m) => ({ ...m })), courseId: d.id, courseName: d.name, dest: undefined, ...clear };
  return { marks: [], courseId: undefined, courseName: undefined, dest: undefined, ...clear };
}

/**
 * Arrival state of the running cruise, every step (P-036 AC 7, 9): arms once the boat is
 * > 0,6 nm from the destination along the route, then gives the distance for «ΦΤΑΝΕΙΣ»
 * (not after it was shown for this destination, even after a reload) and «άφιξη» at 0,1 nm.
 * `patch`: what to write on the session (only when something changes).
 */
export function arriveStep(
  r: Pick<Race, 'arriveArmed' | 'arriveFired' | 'arrivedAt'>,
  o: { key?: string; leftNm?: number; toLastNm?: number; hasFix: boolean; now: number },
): { patch?: Pick<Race, 'arriveArmed' | 'arrivedAt'>; alertNm?: number } {
  if (!o.key || !o.hasFix || o.leftNm === undefined) return {};
  const armedNow = r.arriveArmed !== o.key && o.leftNm > ARRIVE_ARM_NM;
  const armed = r.arriveArmed === o.key || armedNow;
  if (!armed) return {};
  const patch: Pick<Race, 'arriveArmed' | 'arrivedAt'> = {};
  if (armedNow) patch.arriveArmed = o.key;
  if (!r.arrivedAt && o.toLastNm !== undefined && o.toLastNm <= ARRIVED_NM) patch.arrivedAt = o.now;
  return { patch: Object.keys(patch).length ? patch : undefined, alertNm: r.arriveFired === o.key ? undefined : o.leftNm };
}

/** Name of the session's destination, if it has one. */
export function destName(r: Pick<Race, 'dest' | 'courseName' | 'marks'>): string | undefined {
  if (!r.marks?.length) return undefined;
  return r.dest?.name || r.courseName || r.marks[r.marks.length - 1].name || undefined;
}

/** Identity of the destination, so «ΦΤΑΝΕΙΣ» comes once per destination. */
export function destKey(r: Pick<Race, 'dest' | 'courseId' | 'marks'>): string | undefined {
  const last = r.marks?.[r.marks.length - 1];
  if (!last) return undefined;
  return `${r.courseId ?? 'pt'}:${last.lat.toFixed(5)},${last.lon.toFixed(5)}:${r.marks.length}`;
}

/** «Αίγινα · λιμάνι» → place «Αίγινα», detail «λιμάνι» (the tile's two lines, as in the prototype). */
export function splitName(name: string): { place: string; detail?: string } {
  const i = name.indexOf(' · ');
  return i < 0 ? { place: name } : { place: name.slice(0, i), detail: name.slice(i + 3) };
}

/** «Αναψυχή · Αίγινα» or «Αναψυχή». */
export function cruiseTitle(r: Pick<Race, 'dest' | 'courseName' | 'marks'>): string {
  const n = destName(r);
  return n ? `Αναψυχή · ${splitName(n).place}` : 'Αναψυχή';
}

/** Title of any session in lists and summaries: the cruise names its destination. */
export function sessionTitle(r: Race): string {
  if (kindOf(r) === 'cruise') return cruiseTitle(r);
  return r.name;
}

/** Length of a route through the marks (nm). */
export function routeNm(marks: LatLon[]): number {
  let d = 0;
  for (let i = 1; i < marks.length; i++) d += distanceNm(marks[i - 1], marks[i]);
  return d;
}

/**
 * Index of the mark we sail to: the marks are passed in order, each one when a
 * point comes inside `radius` (0,15 nm, as `markPassings`). `marks.length`: all passed.
 */
export function cruiseNext(points: LatLon[], marks: LatLon[], radius = PASS_NM): number {
  let next = 0;
  for (const p of points) {
    if (next >= marks.length) break;
    // A point may pass more than one mark (e.g. two marks close together).
    while (next < marks.length && distanceNm(p, marks[next]) <= radius) next += 1;
  }
  return next;
}

/** Distance left along the route: to the next mark, then mark to mark to the end (nm). */
export function remainingNm(pos: LatLon, marks: LatLon[], next: number): number {
  if (next >= marks.length) return marks.length ? distanceNm(pos, marks[marks.length - 1]) : 0;
  return distanceNm(pos, marks[next]) + routeNm(marks.slice(next));
}

/** A step between two track points longer than this is a pause or a lost GPS: no speed from it (s). */
export const SOG_GAP_SEC = 300;
/** A step longer than this is a GPS jump (nm). */
export const SOG_JUMP_NM = 2;
/** A speed above this is a GPS jump, not a sailing boat (kt). */
export const SOG_MAX_KT = 30;

type SogPoint = Pick<TrackPoint, 't' | 'sog'> & Partial<Pick<TrackPoint, 'lat' | 'lon'>>;

/**
 * The track's speeds (sorted by time): the point's own `sog`, else distance / time from
 * the point before (P-056 §ΣΤ), without jumps > 2 nm, speeds > 30 kt or gaps (pauses).
 */
export function trackSpeeds(track: SogPoint[]): { t: number; sog: number }[] {
  const pts = [...track].sort((a, b) => a.t - b.t);
  const out: { t: number; sog: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.sog !== undefined && Number.isFinite(p.sog)) {
      out.push({ t: p.t, sog: p.sog });
      continue;
    }
    const q = pts[i - 1];
    if (!q || p.lat === undefined || p.lon === undefined || q.lat === undefined || q.lon === undefined) continue;
    const dt = (p.t - q.t) / 1000;
    if (!(dt > 0) || dt > SOG_GAP_SEC) continue;
    const d = distanceNm({ lat: q.lat, lon: q.lon }, { lat: p.lat, lon: p.lon });
    const kt = (d / dt) * 3600;
    if (d > SOG_JUMP_NM || !Number.isFinite(kt) || kt > SOG_MAX_KT) continue;
    out.push({ t: p.t, sog: kt });
  }
  return out;
}

/** Mean SOG over the window before `now`, from the track (its speeds, or from its positions); else the speed given (the GPS now). */
export function meanSog(track: SogPoint[], now: number, windowMs = ETA_WINDOW_MS, current?: number): number | undefined {
  const s = trackSpeeds(track.filter((p) => p.t > now - windowMs - SOG_GAP_SEC * 1000 && p.t <= now))
    .filter((p) => p.t > now - windowMs)
    .map((p) => p.sog);
  if (current !== undefined && Number.isFinite(current)) s.push(current);
  return s.length ? s.reduce((a, x) => a + x, 0) / s.length : undefined;
}

/** ETA at a speed: when and in how many seconds; none when (almost) still. */
export function etaFrom(nm: number, kt: number | undefined, now: number): { at: number; sec: number } | undefined {
  if (kt === undefined || !Number.isFinite(kt) || kt < ETA_MIN_KT || !Number.isFinite(nm)) return undefined;
  const sec = (Math.max(0, nm) / kt) * 3600;
  return { at: now + sec * 1000, sec };
}

/**
 * Top speed of a cruise: the highest mean SOG over 30″ (every window starting at a
 * point and holding at least two points), not one noisy GPS point. Undefined without such a window.
 */
export function maxSog30(track: SogPoint[], windowMs = MAX_WINDOW_MS): number | undefined {
  const pts = trackSpeeds(track);
  let best: number | undefined;
  for (let i = 0; i < pts.length; i++) {
    let sum = 0;
    let n = 0;
    for (let j = i; j < pts.length && pts[j].t - pts[i].t <= windowMs; j++) {
      sum += pts[j].sog;
      n += 1;
    }
    if (n >= 2 && (best === undefined || sum / n > best)) best = sum / n;
  }
  return best;
}

/**
 * When we arrived: the first point within 0,1 nm of the destination once every
 * earlier mark of the route was passed (a round route ends where it starts), and only
 * after the boat was > 0,6 nm from it along the route (no «arrival» at a start next to it).
 */
export function arrivalTime(track: Pick<TrackPoint, 't' | 'lat' | 'lon'>[], marks: LatLon[], radius = ARRIVED_NM): number | undefined {
  if (!marks.length) return undefined;
  const last = marks.length - 1;
  let next = 0;
  let far = false;
  for (const p of [...track].sort((a, b) => a.t - b.t)) {
    while (next < last && distanceNm(p, marks[next]) <= PASS_NM) next += 1;
    if (!far && remainingNm(p, marks, next) > ARRIVE_ARM_NM) far = true;
    if (far && next === last && distanceNm(p, marks[last]) <= radius) return p.t;
  }
  return undefined;
}

/** Sane range of the estimate speed (kt): GPS jumps must not make a 110 kn «mean». */
export const ESTIMATE_MIN_KT = 2;
export const ESTIMATE_MAX_KT = 15;

/**
 * Speed of the estimate in «Πού πάμε;»: the mean SOG of the last 3 cruises, else 5,5 kt.
 * Robust to GPS jumps: a cruise whose mean is above its best 30″ mean (a jump in the
 * distance) counts at that 30″ value, one with no sane speed is skipped, and the result
 * is kept within 2–15 kt.
 */
export function estimateKt(races: Race[]): number {
  const kts = races
    .filter((r) => kindOf(r) === 'cruise' && r.status === 'finished')
    .sort((a, b) => (b.finish ?? b.start) - (a.finish ?? a.start))
    .map((r) => {
      const avg = sessionStats(r).avgKt;
      if (avg === undefined || !Number.isFinite(avg)) return undefined;
      const max = maxSog30(r.track);
      return max !== undefined && avg > max ? max : avg;
    })
    .filter((x): x is number => x !== undefined && x > 0.5 && x <= ESTIMATE_MAX_KT * 2)
    .slice(0, 3);
  if (!kts.length) return CRUISE_DEFAULT_KT;
  const m = kts.reduce((a, x) => a + x, 0) / kts.length;
  return Math.min(ESTIMATE_MAX_KT, Math.max(ESTIMATE_MIN_KT, m));
}

/**
 * The ETA frozen by a pause (P-036 «Παύση»), the same in every view and after a reload:
 * from the last track point before the pause, at the 10′ mean SOG before it.
 */
export function pausedEta(track: Pick<TrackPoint, 't' | 'lat' | 'lon' | 'sog'>[], marks: LatLon[], next: number, pauseFrom: number): { at: number; sec: number } | undefined {
  if (!marks.length) return undefined;
  const before = track.filter((p) => p.t <= pauseFrom);
  const last = before[before.length - 1];
  if (!last) return undefined;
  return etaFrom(remainingNm(last, marks, next), meanSog(before, pauseFrom), pauseFrom);
}

/** «45′» or «2 ώ 05′». Alias of `span` (src/format). */
export const durText = (sec: number): string => span(sec);

/** Interval the cruise track was written at (15″ or 30″), from the gaps between points. */
export function trackIntervalSec(track: Pick<TrackPoint, 't'>[], fallback: 15 | 30): 15 | 30 {
  const gaps: number[] = [];
  for (let i = 1; i < track.length; i++) {
    const g = (track[i].t - track[i - 1].t) / 1000;
    if (g > 5 && g < 60) gaps.push(g);
  }
  if (!gaps.length) return fallback;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] < 22.5 ? 15 : 30;
}

/** Adds a destination to the recent ones (newest first, no duplicates nearer than ~90 m, at most 5). */
export function pushRecent(list: DestPoint[], d: DestPoint, max = RECENT_MAX): DestPoint[] {
  const same = (x: DestPoint) => distanceNm(x, d) < 0.05;
  return [{ name: d.name, lat: d.lat, lon: d.lon }, ...list.filter((x) => !same(x))].slice(0, max);
}

/** The point `nm` ahead on a course (deg true). */
export function aheadOf(p: LatLon, cogDeg: number, nm: number): LatLon {
  const k = Math.PI / 180;
  const nmPerDeg = (3440.065 * Math.PI) / 180;
  return {
    lat: p.lat + (nm * Math.cos(cogDeg * k)) / nmPerDeg,
    lon: p.lon + (nm * Math.sin(cogDeg * k)) / (nmPerDeg * Math.cos(p.lat * k)),
  };
}

/** Grid cell (~200 m) of the depth cache: one EMODnet answer serves the whole cell. */
export function depthCell(p: LatLon, sizeM = 200): string {
  const dLat = sizeM / 1852 / 60;
  const dLon = dLat / Math.cos((p.lat * Math.PI) / 180);
  return `${Math.floor(p.lat / dLat)}:${Math.floor(p.lon / dLon)}`;
}

/** Whether to ask EMODnet for the depth ahead now: online, moving, at most once a minute. */
export function sampleDue(lastAt: number | undefined, now: number, o: { online: boolean; sog?: number }): boolean {
  return o.online && (o.sog ?? 0) > SAMPLE_MIN_SOG && (lastAt === undefined || now - lastAt >= SAMPLE_EVERY_MS);
}

/** Where the depth reading for the shallow alert comes from. */
export interface DepthReading {
  depth: number;
  from: 'sounder' | 'chart';
  /** Chart: how far ahead the sample was (nm). */
  aheadNm?: number;
}

/**
 * Shallow state machine: «ΡΗΧΑ ΜΠΡΟΣΤΑ» once per shallow stretch. Returns the new
 * stretch start (undefined: not shallow) and whether this reading opens a new stretch.
 * Without a reading nothing changes; a deep reading (sounder ≥ 6 m, chart ≥ 5 m) ends it.
 */
export function shallowStretch(since: number | undefined, x: DepthReading | undefined, now: number): number | undefined {
  if (!x || !Number.isFinite(x.depth)) return since;
  if (x.depth < SHALLOW_M) return since ?? now;
  const clear = x.from === 'sounder' ? SHALLOW_CLEAR_M : SHALLOW_M;
  return x.depth >= clear ? undefined : since;
}
