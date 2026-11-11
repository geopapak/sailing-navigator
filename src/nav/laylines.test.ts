import { describe, expect, it } from 'vitest';
import { boardOf, laylineText, laylines, nextManoeuvre } from './laylines';

// Mark 1 NM north of the start point (lat 37.9, Saronic); wind from the north.
const mark = { lat: 37.9 + 1 / 60, lon: 23.6 };
const base = { mark, twd: 0, beatAngle: 45, gybeAngle: 150 };

describe('laylines (P-019)', () => {
  it('upwind leg with both boards at ±beat angle', () => {
    const l = laylines({ ...base, pos: { lat: 37.9, lon: 23.6 } });
    expect(l.leg).toBe('up');
    expect(l.heading.stbd).toBeCloseTo(315);
    expect(l.heading.port).toBeCloseTo(45);
  });

  it('distance and time to the layline of the other board', () => {
    // From dead downwind of the mark on starboard (315°): the port layline (45°) is met
    // after 1/√2 NM (right-angled isosceles triangle).
    const l = laylines({ ...base, pos: { lat: 37.9, lon: 23.6 }, course: 315, speed: 6 });
    expect(l.board).toBe('stbd');
    expect(l.toLayNm!).toBeCloseTo(Math.SQRT1_2, 2);
    expect(l.toLayMin!).toBeCloseTo((Math.SQRT1_2 / 6) * 60, 1);
    expect(laylineText(l)).toBe('Αναστροφή στη layline σε 0,71 NM (~7′)');
  });

  it('overstood when we are beyond the layline', () => {
    // Far to the left (west) of the mark on starboard tack: we are past the port layline.
    const pos = { lat: 37.9 + 0.5 / 60, lon: 23.6 - (1.0 / 60) / Math.cos(37.9 * Math.PI / 180) };
    const l = laylines({ ...base, pos, course: 315, speed: 6 });
    expect(l.leg).toBe('up');
    expect(l.overstood).toBe(true);
    expect(laylineText(l)).toMatch(/Πέρασες τη layline/);
  });

  it('reach and downwind legs', () => {
    const east = { lat: mark.lat, lon: mark.lon - 0.02 };
    expect(laylines({ ...base, pos: east }).leg).toBe('reach');
    const below = { lat: mark.lat + 1 / 60, lon: mark.lon }; // mark is downwind (south)
    const d = laylines({ ...base, pos: below, course: 210, speed: 7 });
    expect(d.leg).toBe('down');
    expect(d.board).toBe('stbd');
    expect(laylineText(d)).toMatch(/^Υποσταύρωση στη layline/);
  });

  it('board from course and wind', () => {
    expect(boardOf(315, 0)).toBe('stbd');
    expect(boardOf(45, 0)).toBe('port');
  });

  it('next manoeuvre from a computed route', () => {
    const tr = [
      { t: 0, twa: 42 },
      { t: 60_000, twa: 43 },
      { t: 120_000, twa: -44 },
      { t: 180_000, twa: -150 },
      { t: 240_000, twa: 150 },
    ];
    expect(nextManoeuvre(tr, 0)).toEqual({ at: 120_000, kind: 'tack' });
    expect(nextManoeuvre(tr, 130_000)).toEqual({ at: 240_000, kind: 'gybe' });
  });
});
