import { describe, expect, it } from 'vitest';
import { project, type Mark } from '../routing/isochrones';
import { analyseRace, analysisSummary, countManoeuvres, markPassings, toCsv, toGpx } from './analysis';
import type { Race, TrackPoint } from './types';

const A: Mark = { id: 'a', name: 'Φάληρο', lat: 37.9, lon: 23.6 };
const B: Mark = { id: 'b', name: 'Αίγινα <κίτρινη>', ...project(A, 0, 2) };
const T0 = Date.UTC(2026, 10, 14, 9);

/** Up to B zig-zagging (tacks every 10 min), back down straight. */
function track(): TrackPoint[] {
  const pts: TrackPoint[] = [];
  const up = 30; // minutes
  for (let m = 0; m <= up; m++) {
    const frac = m / up;
    const side = Math.min(2, Math.floor(m / 10)) % 2 === 0 ? 1 : -1;
    const p = project(A, 0, 2 * frac);
    pts.push({ t: T0 + m * 60_000, lat: p.lat, lon: p.lon, twa: 42 * side, tws: 12, pct: m >= 12 && m <= 18 ? 0.8 : 0.97, sail: 'J1' });
  }
  for (let m = 1; m <= 15; m++) {
    const p = project(B, 180, (2 * m) / 15);
    pts.push({ t: T0 + (up + m) * 60_000, lat: p.lat, lon: p.lon, twa: 170, tws: 12, pct: 1, sail: m > 2 ? 'A2' : 'J1' });
  }
  return pts;
}

const race: Race = {
  id: 'r',
  name: 'Δοκιμή & "test"',
  marks: [A, B, A],
  start: T0,
  finish: T0 + 45 * 60_000,
  scoringOptionId: 'coastal',
  method: 'ToT',
  entries: [{ id: 'us', name: 'Εμείς', own: true, source: 'own' }],
  status: 'finished',
  track: track(),
  fixes: [],
  updatedAt: 0,
};

describe('post-race analysis', () => {
  it('finds the mark roundings and splits the race into legs', () => {
    const p = markPassings(race.track, race.marks);
    expect(p).toHaveLength(3);
    expect(race.track[p[1]].t).toBe(T0 + 30 * 60_000);
    const a = analyseRace(race);
    expect(a.legs.map((l) => l.mode)).toEqual(['upwind', 'downwind']);
    expect(a.legs[0].tacks).toBe(2);
    expect(a.legs[1].gybes).toBe(0);
    expect(a.durationSec).toBe(45 * 60);
    expect(a.sailedNm).toBeCloseTo(4, 1);
  });

  it('counts tacks but not short wobbles', () => {
    const t = [42, 42, -40, 42, 42, 42, -42, -42].map((twa, i) => ({ t: T0 + i * 60_000, lat: 0, lon: 0, twa }));
    // The −40 lasts one minute only: with a 90 s hold it is a wobble, the −42 that stays is the tack.
    const m = countManoeuvres(t, 60);
    expect(m.tacks).toBe(1);
    expect(m.at[0].t).toBe(T0 + 6 * 60_000);
  });

  it('flags long stretches under target and builds an AI summary without free text from the track', () => {
    const a = analyseRace(race);
    expect(a.lowSpots[0].durationSec).toBe(6 * 60);
    expect(Math.round(a.lowSpots[0].avgPct * 100)).toBe(80);
    const s = analysisSummary(race, a);
    expect(s.totals.tacks).toBe(2);
    expect(s.sails.map((x) => x.sail)).toEqual(['J1', 'A2']);
    expect(s.lowSpots[0].at).toBe('0:12');
  });

  it('exports GPX and CSV', () => {
    const g = toGpx(race);
    expect(g).toContain('<trkpt lat="37.900000" lon="23.600000">');
    expect(g).toContain('Αίγινα &lt;κίτρινη&gt;');
    expect(g).toContain('Δοκιμή &amp; &quot;test&quot;');
    const c = toCsv(race).trim().split('\n');
    expect(c[0]).toBe('time,lat,lon,sog,cog,tws,twa,twd,bsp,targetBsp,targetTwa,pct,sail,src,wind');
    expect(c).toHaveLength(race.track.length + 1);
    expect(c[1]).toContain('"J1"');
  });
});

describe('P-056 §Β: the analysis inside [start, finish]', () => {
  const S = 1000;
  const M1: Mark = { id: 'm1', name: 'Σημαδούρα 1', ...project(A, 0, 1) };
  const M2: Mark = { id: 'm2', name: 'Σημαδούρα 2', ...project(A, 90, 3) };
  const FIN: Mark = { id: 'f', name: 'Τερματισμός', ...project(A, 0, 2) };
  const START = Date.UTC(2026, 10, 14, 9, 0, 0); // 11:00:00 in Athens
  const FINISH = START + (39 * 60 + 19) * S; // 11:39:19
  /** 10′ of pre-start circling at A, then up to M1 and on to the finish line, with a minute after it. */
  function trk(): TrackPoint[] {
    const pts: TrackPoint[] = [];
    for (let s = -600; s < 0; s += 30) pts.push({ t: START + s * S, lat: A.lat + 0.001 * Math.sin(s), lon: A.lon, twa: s % 120 ? 45 : -45, pct: 0.5, tws: 10 });
    for (let s = 0; s <= 2359 + 60; s += 30) {
      const f = Math.min(1, s / 2359);
      const p = f < 0.5 ? project(A, 0, 2 * f) : project(M1, 0, 2 * (f - 0.5));
      pts.push({ t: START + s * S, lat: p.lat, lon: p.lon, twa: 45, pct: 0.95, tws: 12 });
    }
    return pts;
  }
  const base: Race = { ...race, marks: [A, M1, FIN], start: START, finish: FINISH, track: trk() };

  it('KA-Β1: the legs add up to the race time, which is the header duration', () => {
    const a = analyseRace(base);
    expect(a.durationSec).toBe(2359);
    expect(a.legs.length).toBe(2);
    expect(a.legs[0].start).toBe(START);
    expect(a.legs[a.legs.length - 1].end).toBe(FINISH);
    const sum = a.legs.reduce((s, l) => s + l.durationSec, 0);
    expect(Math.abs(sum - 2359)).toBeLessThanOrEqual(1);
    expect(a.noFinish).toBe(false);
  });

  it('KA-Β2: a mark not found joins two legs, with its name; the sum still holds', () => {
    const a = analyseRace({ ...base, marks: [A, M1, M2, FIN] });
    expect(a.legs.map((l) => `${l.from} → ${l.to}`)).toEqual(['Φάληρο → Σημαδούρα 1', 'Σημαδούρα 1 → Τερματισμός']);
    expect(a.legs[1].missed).toEqual(['Σημαδούρα 2']);
    expect(a.legs.every((l) => l.durationSec > 0)).toBe(true);
    expect(a.legs.reduce((s, l) => s + l.durationSec, 0)).toBeCloseTo(2359, 0);
    // The rhumb line follows the course through the missed mark.
    expect(a.legs[1].rhumbNm).toBeGreaterThan(3);
  });

  it('KA-Β3: tacks, % target, the chart and the low spots ignore the pre-start and after the finish', () => {
    const a = analyseRace(base);
    expect(a.tacks).toBe(0);
    expect(Math.round(a.avgPct! * 100)).toBe(95);
    expect(a.lowSpots).toEqual([]);
    expect(a.timeline.every((x) => x.t >= START && x.t <= FINISH)).toBe(true);
    // The pre-start alone has tacks and low % target.
    const pre = analyseRace({ ...base, start: START - 600 * S });
    expect(pre.tacks).toBeGreaterThan(0);
  });

  it('KA-Β5: without a finish the window closes at the last point, flagged', () => {
    const a = analyseRace({ ...base, finish: undefined, status: 'running' });
    expect(a.noFinish).toBe(true);
    expect(a.durationSec).toBe(2359 + 60 - ((2359 + 60) % 30));
    expect(a.legs[a.legs.length - 1].end).toBe(base.track[base.track.length - 1].t);
  });

  it('KA-Γ4: a place only with two or more timed boats, «/ N» counts only them', () => {
    const entries = [
      { id: 'us', name: 'Εμείς', own: true, source: 'own' as const, boat: { scoring: [{ id: 'coastal', label: 'C', tod: 0, tot: 1 }] } },
      { id: 'b', name: 'Β', source: 'boats' as const, boat: { scoring: [{ id: 'coastal', label: 'C', tod: 0, tot: 1 }] } },
      { id: 'c', name: 'Γ', source: 'boats' as const, boat: { scoring: [{ id: 'coastal', label: 'C', tod: 0, tot: 1 }] } },
    ];
    const one = analyseRace({ ...base, entries, results: { us: 2359 } });
    expect(one.rank).toBeUndefined();
    expect(one.compared).toBe(1);
    const two = analyseRace({ ...base, entries, results: { us: 2359, b: 2000 } });
    expect(two.rank).toBe(2);
    expect(two.compared).toBe(2);
    expect(two.of).toBe(3);
  });
});
