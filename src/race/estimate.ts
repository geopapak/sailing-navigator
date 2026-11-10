/**
 * Live corrected-time estimate. For each boat: where it is (last fix), how far
 * it still has to sail along the course, how long that takes with the current
 * wind and its polar (or ours scaled by GPH), then ToT/ToD. An estimate —
 * better near the finish and with fresh positions.
 */
import type { BoatProfile } from '../boat/types';
import { bearingDeg, distanceNm, type LatLon } from '../nav/geo';
import { computeLive } from '../performance/targets';
import { corrected } from '../scoring/corrected';
import type { Mark } from '../routing/isochrones';
import type { Race, RaceEntry, RaceFix } from './types';

export interface Wind {
  tws: number;
  /** Direction the wind comes from, °true. */
  twd: number;
}

const toRad = Math.PI / 180;
const signed = (a: number) => {
  const x = ((a % 360) + 360) % 360;
  return x > 180 ? x - 360 : x;
};

/** Speed made good along a bearing (kt), tacking or gybing when the course is too close to the wind. */
export function vmcAlong(boat: Pick<BoatProfile, 'polar' | 'performanceFactor'>, wind: Wind, bearing: number): number | undefined {
  if (!boat.polar) return undefined;
  const twa = Math.abs(signed(wind.twd - bearing));
  const r = computeLive({ ...(boat as BoatProfile), sails: [], sailRules: [], scoring: [] }, { tws: wind.tws, twa: Math.max(1, twa) });
  if (!r) return undefined;
  if (twa < r.beat.angle) return r.beat.vmg / Math.cos(twa * toRad);
  if (twa > r.run.angle) return r.run.vmg / Math.cos((180 - twa) * toRad);
  return r.polarBsp;
}

export function courseLengthNm(marks: Mark[]): number {
  let d = 0;
  for (let i = 1; i < marks.length; i++) d += distanceNm(marks[i - 1], marks[i]);
  return d;
}

/** Seconds to sail from `pos` via marks[next…] to the finish. */
export function timeToFinish(boat: Pick<BoatProfile, 'polar' | 'performanceFactor'>, wind: Wind, pos: LatLon, next: number, marks: Mark[]): number | undefined {
  let from = pos;
  let sec = 0;
  for (let i = Math.max(1, next); i < marks.length; i++) {
    const d = distanceNm(from, marks[i]);
    if (d > 0.001) {
      const v = vmcAlong(boat, wind, bearingDeg(from, marks[i]));
      if (!v || v <= 0.2) return undefined;
      sec += (d / v) * 3600;
    }
    from = marks[i];
  }
  return sec;
}

/** Next mark of a boat from its fixes: after the last rounding, else `fallback`. Also advances on a fix close to the mark. */
export function nextMarkOf(fixes: RaceFix[], marks: Mark[], fallback = 1, roundRadiusNm = 0.15): number {
  let next = fallback;
  for (const f of [...fixes].sort((a, b) => a.t - b.t)) {
    if (f.source === 'mark' && f.markIndex !== undefined) next = Math.max(next, f.markIndex + 1);
    else if (next < marks.length && distanceNm(f, marks[next]) <= roundRadiusNm) next += 1;
  }
  return Math.min(next, marks.length);
}

export interface EstimateRow {
  entryId: string;
  name: string;
  own: boolean;
  /** Projected elapsed and corrected time (s). */
  elapsed?: number;
  corrected?: number;
  /** Corrected seconds relative to us: + they are behind us, − they are ahead. */
  gap?: number;
  fix?: RaceFix;
  ageSec?: number;
  nextMark?: number;
  /** Why there is no estimate. */
  missing?: string;
  rank?: number;
}

/** The performance a boat is assumed to have: its own polar, or ours scaled by GPH. */
function perfOf(e: RaceEntry, own: RaceEntry | undefined): { boat: Pick<BoatProfile, 'polar' | 'performanceFactor'>; scale: number } | undefined {
  if (e.boat?.polar) return { boat: { polar: e.boat.polar, performanceFactor: e.boat.performanceFactor ?? 1 }, scale: 1 };
  if (own?.boat?.polar && e.boat?.gph && own.boat.gph) return { boat: { polar: own.boat.polar, performanceFactor: own.boat.performanceFactor ?? 1 }, scale: e.boat.gph / own.boat.gph };
  return undefined;
}

export function estimateRace(race: Race, wind: Wind | undefined, now = Date.now()): EstimateRow[] {
  const own = race.entries.find((e) => e.own);
  const dist = courseLengthNm(race.marks);
  const rows: EstimateRow[] = race.entries.map((e) => {
    const fixes = race.fixes.filter((f) => f.entryId === e.id);
    const fix = fixes.reduce<RaceFix | undefined>((a, f) => (!a || f.t > a.t ? f : a), undefined);
    const row: EstimateRow = { entryId: e.id, name: e.name, own: !!e.own, fix, ageSec: fix ? Math.max(0, (now - fix.t) / 1000) : undefined };
    const finished = race.results?.[e.id];
    const opt = e.boat?.scoring?.find((o) => o.id === race.scoringOptionId);
    if (!opt) return { ...row, missing: 'χωρίς βαθμολογία' };
    if (finished !== undefined) return { ...row, elapsed: finished, corrected: corrected(race.method, finished, opt, dist), nextMark: race.marks.length };
    if (!fix) return { ...row, missing: 'χωρίς θέση' };
    if (!wind) return { ...row, missing: 'χωρίς άνεμο' };
    const perf = perfOf(e, own);
    if (!perf) return { ...row, missing: 'χωρίς polars/GPH' };
    const next = nextMarkOf(fixes, race.marks);
    const rest = next >= race.marks.length ? 0 : timeToFinish(perf.boat, wind, fix, next, race.marks);
    if (rest === undefined) return { ...row, nextMark: next, missing: 'δεν υπολογίζεται' };
    const elapsed = (fix.t - race.start) / 1000 + rest * perf.scale;
    return { ...row, nextMark: next, elapsed, corrected: corrected(race.method, elapsed, opt, dist) };
  });
  const ownRow = rows.find((r) => r.own);
  const ranked = rows.filter((r) => r.corrected !== undefined).sort((a, b) => a.corrected! - b.corrected!);
  ranked.forEach((r, i) => (r.rank = i + 1));
  for (const r of rows) if (ownRow?.corrected !== undefined && r.corrected !== undefined) r.gap = r.corrected - ownRow.corrected;
  return [...ranked, ...rows.filter((r) => r.corrected === undefined)];
}

/** Position from "seen from us": quadrant and distance, relative to our heading. */
export function relativeFix(own: LatLon, headingTrue: number, side: 'ahead-l' | 'ahead-r' | 'behind-l' | 'behind-r', nm: number): LatLon {
  const rel = { 'ahead-l': -30, 'ahead-r': 30, 'behind-l': -150, 'behind-r': 150 }[side];
  const b = (headingTrue + rel) * toRad;
  const lat = own.lat + ((nm * Math.cos(b)) / 60);
  const lon = own.lon + ((nm * Math.sin(b)) / 60) / Math.cos(own.lat * toRad);
  return { lat, lon };
}

/** "+1:05" / "−0:48" from seconds. */
export function fmtGap(sec: number): string {
  const s = Math.round(Math.abs(sec));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const body = h ? `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
  return `${sec < 0 ? '−' : '+'}${body}`;
}
