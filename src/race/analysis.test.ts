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
    expect(c[0]).toBe('time,lat,lon,sog,cog,tws,twa,twd,bsp,targetBsp,targetTwa,pct,sail,src');
    expect(c).toHaveLength(race.track.length + 1);
    expect(c[1]).toContain('"J1"');
  });
});
