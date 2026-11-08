import { describe, expect, it } from 'vitest';
import { TRE_IRENE } from '../boat/treIrene';
import { uniformField } from '../weather/field';
import { distanceNm } from '../nav/geo';
import { LandIndex, NO_LAND, segIntersect } from './land';
import { project, routeCourse, routeLeg, smoothSails, type Mark } from './isochrones';
import { COASTLINE_LINES, saronikosLand } from './coastline';

const boat = TRE_IRENE;
const T0 = Date.UTC(2026, 10, 8, 10, 0);
const A: Mark = { id: 'a', name: 'A', lat: 37.7, lon: 23.5 };
const north = (nm: number): Mark => ({ id: 'n', name: 'N', ...project(A, 0, nm) });
const south = (nm: number): Mark => ({ id: 's', name: 'S', ...project(A, 180, nm) });
const east = (nm: number): Mark => ({ id: 'e', name: 'E', ...project(A, 90, nm) });
const hours = (sec: number) => sec / 3600;

describe('segIntersect', () => {
  it('detects crossing and non-crossing segments', () => {
    expect(segIntersect(0, 0, 2, 2, 0, 2, 2, 0)).toBe(true);
    expect(segIntersect(0, 0, 1, 0, 0, 1, 1, 1)).toBe(false);
    expect(segIntersect(0, 0, 2, 0, 1, 0, 1, 5)).toBe(true); // touching
  });
});

describe('routeLeg in uniform wind, open water', () => {
  const wind = uniformField(12, 0);

  it('beat: time ≈ distance / beat VMG', () => {
    const to = north(5);
    const leg = routeLeg(boat, A, to, T0, wind, NO_LAND);
    const ideal = 5 / 5.56; // h
    expect(hours(leg.durationSec)).toBeGreaterThan(ideal * 0.98);
    expect(hours(leg.durationSec)).toBeLessThan(ideal * 1.1);
    expect(leg.modeShare.upwind).toBeGreaterThan(0.9);
    expect(leg.tacks).toBeGreaterThanOrEqual(1);
    expect(leg.sails[0].sailId).toBe('J1.5');
    const end = leg.track[leg.track.length - 1];
    expect(distanceNm(end, to)).toBeLessThan(1e-9);
  });

  it('run: time ≈ distance / run VMG, spinnaker', () => {
    const leg = routeLeg(boat, A, south(5), T0, wind, NO_LAND);
    const ideal = 5 / 6.73;
    expect(hours(leg.durationSec)).toBeGreaterThan(ideal * 0.98);
    expect(hours(leg.durationSec)).toBeLessThan(ideal * 1.1);
    expect(leg.modeShare.downwind).toBeGreaterThan(0.9);
    expect(leg.sails[0].sailId).toBe('S1.5');
  });

  it('beam reach: straight line at polar speed', () => {
    const leg = routeLeg(boat, A, east(5), T0, wind, NO_LAND);
    expect(hours(leg.durationSec)).toBeCloseTo(5 / 8.34, 2);
    expect(leg.tacks + leg.gybes).toBe(0);
    expect(leg.sailedNm).toBeCloseTo(5, 1);
  });

  it('track times are monotonic and the summary is consistent', () => {
    const leg = routeLeg(boat, A, north(3), T0, wind, NO_LAND);
    for (let i = 1; i < leg.track.length; i++) expect(leg.track[i].t).toBeGreaterThan(leg.track[i - 1].t);
    expect(leg.track[0].t).toBe(T0);
    expect(leg.track[leg.track.length - 1].t).toBe(leg.end);
    expect(leg.avgTws).toBeCloseTo(12);
    const s = leg.modeShare;
    expect(s.upwind + s.reach + s.downwind).toBeCloseTo(1);
  });
});

describe('land avoidance', () => {
  // A 4 NM wall across the direct path, 2 NM north of A.
  const mid = project(A, 0, 2);
  const w0 = project(mid, 270, 2);
  const w1 = project(mid, 90, 2);
  const land = new LandIndex([[[w0.lon, w0.lat], [w1.lon, w1.lat]]]);

  it('detours around an obstacle', () => {
    const wind = uniformField(12, 90); // easterly → north/south legs are reaches
    const to = north(4);
    const open = routeLeg(boat, A, to, T0, wind, NO_LAND);
    const blocked = routeLeg(boat, A, to, T0, wind, land);
    expect(blocked.durationSec).toBeGreaterThan(open.durationSec);
    for (let i = 0; i + 1 < blocked.track.length; i++) {
      expect(land.crosses(blocked.track[i], blocked.track[i + 1])).toBe(false);
    }
  });
});

describe('smoothSails', () => {
  it('absorbs short flip-flops and relabels the track', () => {
    const m = 60_000;
    const sails = [
      { sailId: 'S1', from: 0, to: 60 * m },
      { sailId: 'J1.5', from: 60 * m, to: 70 * m },
      { sailId: 'S1', from: 70 * m, to: 80 * m },
      { sailId: 'J1.5', from: 80 * m, to: 200 * m },
    ];
    const track = [0, 65, 75, 100].map((x) => ({ t: x * m, sailId: 'x' }) as unknown as import('./isochrones').TrackPoint);
    smoothSails(sails, track);
    expect(sails.map((s) => s.sailId)).toEqual(['S1', 'J1.5']);
    expect(sails[0].to).toBe(sails[1].from);
    expect(sails[0].to).toBe(80 * m);
    expect(track.map((p) => p.sailId)).toEqual(['S1', 'S1', 'S1', 'J1.5']);
  });
});

describe('routeCourse', () => {
  it('chains legs in time', () => {
    const wind = uniformField(10, 0);
    const r = routeCourse(boat, [A, north(2), A], T0, wind, NO_LAND);
    expect(r.legs).toHaveLength(2);
    expect(r.legs[1].start).toBe(r.legs[0].end);
    expect(r.end).toBe(r.legs[1].end);
    expect(r.rhumbNm).toBeCloseTo(4, 3);
    expect(r.elapsedSec).toBeCloseTo((r.end - T0) / 1000);
  });

  it('rejects courses with fewer than 2 marks and boats without polars', () => {
    expect(() => routeCourse(boat, [A], T0, uniformField(10, 0), NO_LAND)).toThrow();
    expect(() => routeLeg({ ...boat, polar: undefined }, A, north(1), T0, uniformField(10, 0), NO_LAND)).toThrow();
  });
});

describe('Saronikos coastline', () => {
  it('is loaded and blocks crossing Aegina', () => {
    expect(COASTLINE_LINES.length).toBeGreaterThan(100);
    const land = saronikosLand();
    // West of Aegina → east of Aegina, straight through the island.
    expect(land.crosses({ lat: 37.74, lon: 23.38 }, { lat: 37.74, lon: 23.57 })).toBe(true);
    // Open water between Piraeus approach and Aegina north coast.
    expect(land.crosses({ lat: 37.88, lon: 23.55 }, { lat: 37.8, lon: 23.5 })).toBe(false);
  });

  it('routes from off Piraeus to off Aegina town without crossing land', () => {
    const land = saronikosLand();
    const from: Mark = { id: 'p', name: 'Πειραιάς', lat: 37.9, lon: 23.6 };
    const to: Mark = { id: 'g', name: 'Αίγινα', lat: 37.75, lon: 23.41 };
    const leg = routeLeg(boat, from, to, T0, uniformField(12, 20), land);
    for (let i = 0; i + 1 < leg.track.length; i++) expect(land.crosses(leg.track[i], leg.track[i + 1])).toBe(false);
    expect(hours(leg.durationSec)).toBeLessThan(3);
  });
});
