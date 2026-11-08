import { describe, expect, it } from 'vitest';
import { TRE_IRENE } from '../boat/treIrene';
import { uniformField } from '../weather/field';
import { NO_LAND } from './land';
import { project, routeCourse, type Mark } from './isochrones';
import { positionAt, routeSegments } from './geojson';

const A: Mark = { id: 'a', name: 'A', lat: 37.7, lon: 23.5 };
const B: Mark = { id: 'b', name: 'B', ...project(A, 0, 3) };
const T0 = Date.UTC(2026, 10, 8, 10);

describe('route geojson', () => {
  const r = routeCourse(TRE_IRENE, [A, B, A], T0, uniformField(10, 0), NO_LAND);

  it('splits segments by sail (J1.5 upwind, S1.5 downwind)', () => {
    const sails = routeSegments(r).features.map((f) => f.properties.sailId);
    expect(sails[0]).toBe('J1.5');
    expect(sails[sails.length - 1]).toBe('S1.5');
  });

  it('positionAt interpolates and clamps', () => {
    expect(positionAt(r, T0 - 1000)).toMatchObject({ lat: A.lat, lon: A.lon });
    const end = positionAt(r, r.end + 1e6)!;
    expect(end.lat).toBeCloseTo(A.lat, 9);
    const mid = positionAt(r, r.legs[0].end)!;
    expect(mid.lat).toBeCloseTo(B.lat, 9);
  });
});
