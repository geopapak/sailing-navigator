/**
 * Post-race analysis from the recorded track: legs between marks, tacks and
 * gybes, % of target, and a compact summary for the AI. Plus GPX/CSV export.
 */
import { distanceNm } from '../nav/geo';
import type { Race, TrackPoint } from './types';
import { estimateRace, fmtGap } from './estimate';

export interface LegStats {
  from: string;
  to: string;
  start: number;
  end: number;
  durationSec: number;
  rhumbNm: number;
  sailedNm: number;
  avgPct?: number;
  avgTws?: number;
  tacks: number;
  gybes: number;
  mode: 'upwind' | 'reach' | 'downwind';
}

export interface RaceAnalysis {
  durationSec: number;
  sailedNm: number;
  courseNm: number;
  avgPct?: number;
  tacks: number;
  gybes: number;
  legs: LegStats[];
  /** % target over time, averaged in buckets (for the chart). */
  timeline: { t: number; pct: number }[];
  /** Moments worth a look: long stretches well under target. */
  lowSpots: { t: number; durationSec: number; avgPct: number; twa?: number; tws?: number }[];
  rank?: number;
  of: number;
  gaps: { name: string; gap?: number }[];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

/** Sailed distance along a track (nm), ignoring GPS jumps. */
export function sailed(track: TrackPoint[]): number {
  let d = 0;
  for (let i = 1; i < track.length; i++) {
    const step = distanceNm(track[i - 1], track[i]);
    if (step < 2) d += step; // ignore GPS jumps
  }
  return d;
}

/** Index in the track where each mark was passed (closest approach, in order). */
export function markPassings(track: TrackPoint[], marks: Race['marks'], radiusNm = 0.15): number[] {
  const out: number[] = [0];
  let k = 0;
  for (let m = 1; m < marks.length; m++) {
    if (k >= track.length - 1) break;
    let best = -1;
    let bestD = Infinity;
    for (let i = k + 1; i < track.length; i++) {
      const d = distanceNm(track[i], marks[m]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
      // Inside the radius and moving away again: that was the rounding.
      if (bestD <= radiusNm && d > bestD + 0.05) break;
    }
    if (best < 0) break;
    out.push(best);
    k = best;
  }
  if (out[out.length - 1] !== track.length - 1 && out.length < marks.length) out.push(track.length - 1);
  return out;
}

/** Tacks (bow through the wind upwind) and gybes (stern through downwind), from the TWA sign. A new side counts once it holds `minHoldSec`. */
export function countManoeuvres(track: TrackPoint[], minHoldSec = 30): { tacks: number; gybes: number; at: { t: number; kind: 'tack' | 'gybe' }[] } {
  const at: { t: number; kind: 'tack' | 'gybe' }[] = [];
  let side = 0;
  let cand: { side: number; t: number; twa: number } | undefined;
  for (const p of track) {
    if (p.twa === undefined || Math.abs(p.twa) < 1 || Math.abs(Math.abs(p.twa) - 90) < 15) continue;
    const s = Math.sign(p.twa);
    if (side === 0) side = s;
    else if (s === side) cand = undefined;
    else if (!cand) cand = { side: s, t: p.t, twa: p.twa };
    if (cand && s === cand.side && (p.t - cand.t) / 1000 >= minHoldSec) {
      at.push({ t: cand.t, kind: Math.abs(cand.twa) < 90 ? 'tack' : 'gybe' });
      side = cand.side;
      cand = undefined;
    }
  }
  return { tacks: at.filter((x) => x.kind === 'tack').length, gybes: at.filter((x) => x.kind === 'gybe').length, at };
}

function modeOf(points: TrackPoint[]): LegStats['mode'] {
  const twas = points.map((p) => (p.twa === undefined ? undefined : Math.abs(p.twa))).filter((x): x is number => x !== undefined);
  const a = avg(twas);
  if (a === undefined) return 'reach';
  return a < 70 ? 'upwind' : a > 120 ? 'downwind' : 'reach';
}

export function analyseRace(race: Race): RaceAnalysis {
  const track = [...race.track].sort((a, b) => a.t - b.t);
  const marks = race.marks;
  const courseNm = marks.slice(1).reduce((d, m, i) => d + distanceNm(marks[i], m), 0);
  const pass = track.length > 1 ? markPassings(track, marks) : [];
  const legs: LegStats[] = [];
  for (let i = 1; i < pass.length; i++) {
    const pts = track.slice(pass[i - 1], pass[i] + 1);
    if (pts.length < 2) continue;
    const man = countManoeuvres(pts);
    legs.push({
      from: marks[i - 1]?.name ?? `Σημείο ${i}`,
      to: marks[i]?.name ?? `Σημείο ${i + 1}`,
      start: pts[0].t,
      end: pts[pts.length - 1].t,
      durationSec: (pts[pts.length - 1].t - pts[0].t) / 1000,
      rhumbNm: marks[i] && marks[i - 1] ? distanceNm(marks[i - 1], marks[i]) : 0,
      sailedNm: sailed(pts),
      avgPct: avg(pts.map((p) => p.pct).filter((x): x is number => x !== undefined && x > 0.3 && x < 1.5)),
      avgTws: avg(pts.map((p) => p.tws).filter((x): x is number => x !== undefined)),
      tacks: man.tacks,
      gybes: man.gybes,
      mode: modeOf(pts),
    });
  }
  const man = countManoeuvres(track);
  const pcts = track.filter((p) => p.pct !== undefined && p.pct > 0.3 && p.pct < 1.5);
  const t0 = track[0]?.t ?? race.start;
  const t1 = track[track.length - 1]?.t ?? race.finish ?? race.start;
  const buckets = 60;
  const timeline: RaceAnalysis['timeline'] = [];
  if (pcts.length && t1 > t0) {
    const w = (t1 - t0) / buckets;
    for (let b = 0; b < buckets; b++) {
      const inB = pcts.filter((p) => p.t >= t0 + b * w && p.t < t0 + (b + 1) * w);
      const a = avg(inB.map((p) => p.pct!));
      if (a !== undefined) timeline.push({ t: t0 + (b + 0.5) * w, pct: a });
    }
  }
  // Stretches of at least 3 minutes under 90 %.
  const lowSpots: RaceAnalysis['lowSpots'] = [];
  let run: TrackPoint[] = [];
  const flush = () => {
    if (run.length > 1 && (run[run.length - 1].t - run[0].t) / 1000 >= 180) {
      lowSpots.push({
        t: run[0].t,
        durationSec: (run[run.length - 1].t - run[0].t) / 1000,
        avgPct: avg(run.map((p) => p.pct!))!,
        twa: avg(run.map((p) => p.twa).filter((x): x is number => x !== undefined)),
        tws: avg(run.map((p) => p.tws).filter((x): x is number => x !== undefined)),
      });
    }
    run = [];
  };
  for (const p of pcts) {
    if (p.pct! < 0.9) run.push(p);
    else flush();
  }
  flush();
  lowSpots.sort((a, b) => b.durationSec * (1 - b.avgPct) - a.durationSec * (1 - a.avgPct));

  const rows = estimateRace(race, undefined, race.finish ?? t1);
  const own = rows.find((r) => r.own);
  return {
    durationSec: race.finish ? (race.finish - race.start) / 1000 : (t1 - t0) / 1000,
    sailedNm: sailed(track),
    courseNm,
    avgPct: avg(pcts.map((p) => p.pct!)),
    tacks: man.tacks,
    gybes: man.gybes,
    legs,
    timeline,
    lowSpots: lowSpots.slice(0, 5),
    rank: own?.rank,
    of: race.entries.length,
    gaps: rows.filter((r) => !r.own).map((r) => ({ name: r.name, gap: r.gap })),
  };
}

const hm = (sec: number) => {
  const m = Math.round(sec / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

/** Compact text-free summary sent to the AI for lessons (numbers only, no personal data). */
export function analysisSummary(race: Race, a: RaceAnalysis) {
  const sinceStart = (t: number) => hm((t - race.start) / 1000);
  return {
    race: { name: race.name.slice(0, 80), method: race.method, scoring: race.scoringOptionId, boats: a.of, rank: a.rank },
    totals: {
      duration: hm(a.durationSec),
      sailedNm: +a.sailedNm.toFixed(1),
      courseNm: +a.courseNm.toFixed(1),
      avgPctTarget: a.avgPct === undefined ? null : Math.round(a.avgPct * 100),
      tacks: a.tacks,
      gybes: a.gybes,
    },
    legs: a.legs.map((l) => ({
      leg: `${l.from} → ${l.to}`.slice(0, 80),
      mode: l.mode,
      start: sinceStart(l.start),
      duration: hm(l.durationSec),
      rhumbNm: +l.rhumbNm.toFixed(1),
      sailedNm: +l.sailedNm.toFixed(1),
      avgPctTarget: l.avgPct === undefined ? null : Math.round(l.avgPct * 100),
      avgTws: l.avgTws === undefined ? null : +l.avgTws.toFixed(1),
      tacks: l.tacks,
      gybes: l.gybes,
    })),
    lowSpots: a.lowSpots.map((s) => ({
      at: sinceStart(s.t),
      minutes: Math.round(s.durationSec / 60),
      avgPctTarget: Math.round(s.avgPct * 100),
      twa: s.twa === undefined ? null : Math.round(s.twa),
      tws: s.tws === undefined ? null : +s.tws.toFixed(1),
    })),
    sails: sailChanges(race.track).map((c) => ({ at: sinceStart(c.t), sail: c.sail.slice(0, 40) })),
    opponents: a.gaps.slice(0, 20).map((g) => ({ name: g.name.slice(0, 40), correctedGap: g.gap === undefined ? null : fmtGap(g.gap) })),
  };
}

export function sailChanges(track: TrackPoint[]): { t: number; sail: string }[] {
  const out: { t: number; sail: string }[] = [];
  for (const p of track) if (p.sail && p.sail !== out[out.length - 1]?.sail) out.push({ t: p.t, sail: p.sail });
  return out.slice(0, 30);
}

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);

export function toGpx(race: Race): string {
  const pts = race.track
    .map((p) => `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><time>${new Date(p.t).toISOString()}</time></trkpt>`)
    .join('\n');
  const wpts = race.marks.map((m) => `<wpt lat="${m.lat.toFixed(6)}" lon="${m.lon.toFixed(6)}"><name>${esc(m.name ?? '')}</name></wpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Sailing Navigator" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>${esc(race.name)}</name><time>${new Date(race.start).toISOString()}</time></metadata>
${wpts}
<trk><name>${esc(race.name)}</name><trkseg>
${pts}
</trkseg></trk>
</gpx>
`;
}

export function toCsv(race: Race): string {
  const cols: (keyof TrackPoint)[] = ['t', 'lat', 'lon', 'sog', 'cog', 'tws', 'twa', 'twd', 'bsp', 'targetBsp', 'targetTwa', 'pct', 'sail', 'src'];
  const cell = (v: unknown) => (v === undefined ? '' : typeof v === 'number' ? String(+v.toFixed(5)) : `"${String(v).replace(/"/g, '""')}"`);
  const head = ['time', ...cols.slice(1)].join(',');
  const rows = race.track.map((p) => [new Date(p.t).toISOString(), ...cols.slice(1).map((c) => cell(p[c]))].join(','));
  return [head, ...rows].join('\n') + '\n';
}
