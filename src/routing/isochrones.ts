import type { BoatProfile } from '../boat/types';
import { bearingDeg, distanceNm, type LatLon } from '../nav/geo';
import { DEG, norm360, twaFromTwd } from '../performance/angles';
import { polarSpeed } from '../performance/polar';
import { modeFor, type SailingMode } from '../performance/targets';
import { optimums } from '../performance/polar';
import { recommendSail } from '../performance/sails';
import type { WindField } from '../weather/types';
import type { LandIndex } from './land';

export interface Mark extends LatLon {
  id: string;
  name: string;
}

export interface RouteOptions {
  /** Time step, minutes. */
  stepMin: number;
  /** Heading resolution, degrees. */
  headingStep: number;
  /** Pruning sector width (bearing from leg start), degrees. */
  sectorDeg: number;
  /** Time lost per tack / gybe, seconds. */
  tackPenaltySec: number;
  gybePenaltySec: number;
  /** Give up after this many hours on one leg. */
  maxHours: number;
  /** Keep every n-th isochrone for display. */
  keepIsochroneEvery: number;
}

export const DEFAULT_ROUTE_OPTIONS: RouteOptions = {
  stepMin: 10,
  headingStep: 3,
  sectorDeg: 2,
  tackPenaltySec: 40,
  gybePenaltySec: 25,
  maxHours: 48,
  keepIsochroneEvery: 3,
};

export interface TrackPoint extends LatLon {
  /** Time at this point (ms). */
  t: number;
  /** Heading sailed FROM this point to the next (deg true). */
  heading: number;
  /** Signed TWA on that heading (+ starboard). */
  twa: number;
  tws: number;
  twd: number;
  bsp: number;
  mode: SailingMode;
  sailId?: string;
}

export interface LegResult {
  from: Mark;
  to: Mark;
  start: number;
  end: number;
  durationSec: number;
  rhumbNm: number;
  sailedNm: number;
  /** Time-weighted average TWS and vector-average TWD. */
  avgTws: number;
  avgTwd: number;
  maxTws: number;
  /** Fraction of time in each mode. */
  modeShare: Record<SailingMode, number>;
  /** Sail periods in order. */
  sails: { sailId: string; from: number; to: number }[];
  tacks: number;
  gybes: number;
  track: TrackPoint[];
  isochrones: LatLon[][];
}

export interface RouteResult {
  legs: LegResult[];
  start: number;
  end: number;
  elapsedSec: number;
  rhumbNm: number;
  sailedNm: number;
}

export class RoutingError extends Error {}

interface Node extends LatLon {
  parent: Node | null;
  heading: number;
  twa: number; // signed TWA used to reach this node
  tws: number;
  twd: number;
  bsp: number;
  dist: number; // from leg start, NM
}

/** Consistent with the earth radius used by distanceNm (3440.065 NM). */
const NM_PER_DEG_LAT = (3440.065 * Math.PI) / 180;

/** Moves `d` NM from p on heading h (flat-earth, fine for steps of a few NM). */
export function project(p: LatLon, h: number, d: number): LatLon {
  const lat = p.lat + (d * Math.cos(h * DEG)) / NM_PER_DEG_LAT;
  const lon = p.lon + (d * Math.sin(h * DEG)) / (NM_PER_DEG_LAT * Math.cos(p.lat * DEG));
  return { lat, lon };
}

function speedFor(boat: BoatProfile, tws: number, twa: number): number {
  return polarSpeed(boat.polar!, tws, twa) * (boat.performanceFactor || 1);
}

function maneuverPenalty(prevTwa: number | undefined, twa: number, o: RouteOptions): number {
  if (prevTwa === undefined || prevTwa === 0 || twa === 0 || Math.sign(prevTwa) === Math.sign(twa)) return 0;
  return Math.abs(twa) < 90 ? o.tackPenaltySec : o.gybePenaltySec;
}

/**
 * Isochrone routing for one leg. At each time step every frontier point tries
 * all headings, moves at polar speed in the local wind, and the frontier is
 * pruned to the farthest point (from the leg start) in each bearing sector.
 * Moves that cross the coastline are discarded. The leg ends at the first step
 * from which the mark can be reached directly.
 */
export function routeLeg(
  boat: BoatProfile,
  from: Mark,
  to: Mark,
  startTime: number,
  wind: WindField,
  land: Pick<LandIndex, 'crosses'>,
  opts: Partial<RouteOptions> = {},
  startTwa?: number,
): LegResult {
  if (!boat.polar) throw new RoutingError(`Το σκάφος «${boat.name}» δεν έχει polars.`);
  const o = { ...DEFAULT_ROUTE_OPTIONS, ...opts };
  const dt = o.stepMin * 60;
  const legDist = distanceNm(from, to);
  const maxDist = legDist * 2.5 + 5;
  const nSectors = Math.ceil(360 / o.sectorDeg);
  const maxSteps = Math.ceil((o.maxHours * 3600) / dt);

  const root: Node = { ...from, parent: null, heading: 0, twa: startTwa ?? 0, tws: 0, twd: 0, bsp: 0, dist: 0 };
  let frontier: Node[] = [root];
  const isochrones: LatLon[][] = [];
  let t = startTime;

  for (let step = 0; step < maxSteps; step++) {
    // 1) Can any frontier point reach the mark within this step?
    let best: { node: Node; arrive: number; h: number; twa: number; tws: number; twd: number; bsp: number } | null = null;
    for (const n of frontier) {
      const d = distanceNm(n, to);
      const w = wind.at(n.lat, n.lon, t);
      const h = bearingDeg(n, to);
      const twa = twaFromTwd(w.twd, h);
      const bsp = speedFor(boat, w.tws, twa);
      if (bsp < 0.05) continue;
      const pen = maneuverPenalty(n.twa || undefined, twa, o);
      const secs = (d / bsp) * 3600 + pen;
      if (secs > dt) continue;
      if (land.crosses(n, to)) continue;
      const arrive = t + secs * 1000;
      if (!best || arrive < best.arrive) best = { node: n, arrive, h, twa, tws: w.tws, twd: w.twd, bsp };
    }
    if (best) {
      const track = buildTrack(boat, best.node, startTime, o);
      // Last segment from best.node to the mark.
      const last = track[track.length - 1];
      last.heading = best.h;
      last.twa = best.twa;
      last.tws = best.tws;
      last.twd = best.twd;
      last.bsp = best.bsp;
      last.mode = modeOf(boat, best.tws, best.twa);
      last.sailId = recommendSail(boat, best.tws, best.twa)?.id;
      track.push({ ...to, t: best.arrive, heading: best.h, twa: best.twa, tws: best.tws, twd: best.twd, bsp: best.bsp, mode: last.mode, sailId: last.sailId });
      return summarize(from, to, startTime, best.arrive, legDist, track, isochrones);
    }

    // 2) Expand.
    const bins: (Node | undefined)[] = new Array(nSectors);
    for (const n of frontier) {
      const w = wind.at(n.lat, n.lon, t);
      for (let h = 0; h < 360; h += o.headingStep) {
        const twa = twaFromTwd(w.twd, h);
        const bsp = speedFor(boat, w.tws, twa);
        if (bsp < 0.05) continue;
        const pen = maneuverPenalty(n.twa || undefined, twa, o);
        const d = (bsp * Math.max(0, dt - pen)) / 3600;
        if (d <= 0) continue;
        const p = project(n, h, d);
        const dist = distanceNm(from, p);
        if (distanceNm(p, to) > maxDist) continue;
        const sector = Math.floor(norm360(bearingDeg(from, p)) / o.sectorDeg) % nSectors;
        const cur = bins[sector];
        if (cur && cur.dist >= dist) continue;
        if (land.crosses(n, p)) continue;
        bins[sector] = { ...p, parent: n, heading: h, twa, tws: w.tws, twd: w.twd, bsp, dist };
      }
    }
    frontier = bins.filter((b): b is Node => !!b);
    if (frontier.length === 0) throw new RoutingError(`Δεν βρέθηκε διαδρομή προς «${to.name}» (στεριά ή άπνοια).`);
    t += dt * 1000;
    if ((step + 1) % o.keepIsochroneEvery === 0) isochrones.push(frontier.map((n) => ({ lat: n.lat, lon: n.lon })));
  }
  throw new RoutingError(`Το σκέλος προς «${to.name}» ξεπερνά τις ${o.maxHours} ώρες.`);
}

function modeOf(boat: BoatProfile, tws: number, twa: number): SailingMode {
  const opt = optimums(boat.polar!, tws);
  return modeFor(twa, opt.beat.angle, opt.run.angle);
}

/** Track from the root to `end` (exclusive of the final approach). Each point carries the move that left it. */
function buildTrack(boat: BoatProfile, end: Node, startTime: number, o: RouteOptions): TrackPoint[] {
  const chain: Node[] = [];
  for (let n: Node | null = end; n; n = n.parent) chain.push(n);
  chain.reverse();
  const pts: TrackPoint[] = chain.map((n, i) => ({
    lat: n.lat,
    lon: n.lon,
    t: startTime + i * o.stepMin * 60_000,
    heading: 0,
    twa: 0,
    tws: 0,
    twd: 0,
    bsp: 0,
    mode: 'reach' as SailingMode,
  }));
  // The move stored on chain[i+1] departed from chain[i].
  for (let i = 0; i + 1 < chain.length; i++) {
    const m = chain[i + 1];
    Object.assign(pts[i], {
      heading: m.heading,
      twa: m.twa,
      tws: m.tws,
      twd: m.twd,
      bsp: m.bsp,
      mode: modeOf(boat, m.tws, m.twa),
      sailId: recommendSail(boat, m.tws, m.twa)?.id,
    });
  }
  return pts;
}

function summarize(
  from: Mark,
  to: Mark,
  start: number,
  end: number,
  rhumbNm: number,
  track: TrackPoint[],
  isochrones: LatLon[][],
): LegResult {
  let sailed = 0;
  let wTot = 0;
  let twsSum = 0;
  let ux = 0;
  let uy = 0;
  let maxTws = 0;
  let tacks = 0;
  let gybes = 0;
  const modeT: Record<SailingMode, number> = { upwind: 0, reach: 0, downwind: 0 };
  const sails: LegResult['sails'] = [];
  for (let i = 0; i + 1 < track.length; i++) {
    const a = track[i];
    const b = track[i + 1];
    const dtS = (b.t - a.t) / 1000;
    sailed += distanceNm(a, b);
    wTot += dtS;
    twsSum += a.tws * dtS;
    ux += Math.sin(a.twd * DEG) * dtS;
    uy += Math.cos(a.twd * DEG) * dtS;
    maxTws = Math.max(maxTws, a.tws);
    modeT[a.mode] += dtS;
    if (i > 0) {
      const p = track[i - 1];
      if (p.twa && a.twa && Math.sign(p.twa) !== Math.sign(a.twa)) {
        if (Math.abs(a.twa) < 90) tacks++;
        else gybes++;
      }
    }
    if (a.sailId) {
      const last = sails[sails.length - 1];
      if (last && last.sailId === a.sailId) last.to = b.t;
      else sails.push({ sailId: a.sailId, from: a.t, to: b.t });
    }
  }
  const share = (x: number) => (wTot > 0 ? x / wTot : 0);
  smoothSails(sails, track);
  return {
    from,
    to,
    start,
    end,
    durationSec: (end - start) / 1000,
    rhumbNm,
    sailedNm: sailed,
    avgTws: wTot > 0 ? twsSum / wTot : 0,
    avgTwd: norm360(Math.atan2(ux, uy) / DEG),
    maxTws,
    modeShare: { upwind: share(modeT.upwind), reach: share(modeT.reach), downwind: share(modeT.downwind) },
    sails,
    tacks,
    gybes,
    track,
    isochrones,
  };
}

/** Sail periods shorter than this are absorbed by their neighbours (no 10-minute spinnaker hoists). */
export const MIN_SAIL_PERIOD_MS = 20 * 60_000;

/**
 * Removes sail flip-flops near rule boundaries: short periods are merged into
 * the longer neighbour, and the track points are relabelled to match.
 */
export function smoothSails(sails: LegResult['sails'], track: TrackPoint[]): void {
  let changed = true;
  while (changed && sails.length > 1) {
    changed = false;
    let iMin = -1;
    let dMin = Infinity;
    sails.forEach((s, i) => {
      const d = s.to - s.from;
      if (d < MIN_SAIL_PERIOD_MS && d < dMin) {
        dMin = d;
        iMin = i;
      }
    });
    if (iMin < 0) break;
    const prev = sails[iMin - 1];
    const next = sails[iMin + 1];
    const target = !prev ? next : !next ? prev : prev.to - prev.from >= next.to - next.from ? prev : next;
    if (target === prev) prev.to = sails[iMin].to;
    else next.from = sails[iMin].from;
    sails.splice(iMin, 1);
    // Merge equal neighbours created by the removal.
    for (let i = sails.length - 1; i > 0; i--) {
      if (sails[i].sailId === sails[i - 1].sailId) {
        sails[i - 1].to = sails[i].to;
        sails.splice(i, 1);
      }
    }
    changed = true;
  }
  for (const p of track) {
    const s = sails.find((x) => p.t >= x.from && p.t < x.to) ?? (p.t >= (sails[sails.length - 1]?.to ?? Infinity) ? sails[sails.length - 1] : undefined);
    if (s) p.sailId = s.sailId;
  }
}

/** Routes a whole course mark by mark; each leg starts when the previous one ends. */
export function routeCourse(
  boat: BoatProfile,
  marks: Mark[],
  startTime: number,
  wind: WindField,
  land: Pick<LandIndex, 'crosses'>,
  opts: Partial<RouteOptions> = {},
): RouteResult {
  if (marks.length < 2) throw new RoutingError('Χρειάζονται τουλάχιστον 2 σημεία (εκκίνηση και τερματισμός).');
  const legs: LegResult[] = [];
  let t = startTime;
  let lastTwa: number | undefined;
  for (let i = 0; i + 1 < marks.length; i++) {
    const leg = routeLeg(boat, marks[i], marks[i + 1], t, wind, land, opts, lastTwa);
    legs.push(leg);
    t = leg.end;
    lastTwa = leg.track[leg.track.length - 1]?.twa;
  }
  return {
    legs,
    start: startTime,
    end: t,
    elapsedSec: (t - startTime) / 1000,
    rhumbNm: legs.reduce((s, l) => s + l.rhumbNm, 0),
    sailedNm: legs.reduce((s, l) => s + l.sailedNm, 0),
  };
}
