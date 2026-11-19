import { describe, expect, it } from 'vitest';
import type { Mark } from '../routing/isochrones';
import type { Race } from './types';
import { crossing, distanceToLine, finishLine, finishPending, finishStep, isArmed, shouldArm, sideOf, type Pos } from './finishLine';

const T0 = Date.UTC(2026, 10, 14, 8, 0, 0);
const NM_LAT = 1 / 60;
const k = Math.cos((37.9 * Math.PI) / 180);
const NM_LON = 1 / (60 * k);

// F at 37.9 N; P 6 NM due north: the last leg runs south, the line runs east–west.
const F: Mark = { id: 'f', name: 'Τερματισμός', lat: 37.9, lon: 23.65 };
const P: Mark = { id: 'p', name: 'Πάνω', lat: 38.0, lon: 23.65 };
const S: Mark = { id: 's', name: 'Εκκίνηση', lat: 37.9, lon: 23.65 };

/** A position `n` NM north of F (negative: south) and `e` NM east, at `t`. */
const at = (n: number, e: number, t: number): Pos => ({ lat: F.lat + n * NM_LAT, lon: F.lon + e * NM_LON, t });

const race = (p: Partial<Race> = {}): Race => ({
  id: 'r1',
  name: 'Αίγινα–Πειραιάς',
  kind: 'race',
  marks: [S, P, F],
  start: T0,
  scoringOptionId: 'coastal',
  method: 'ToT',
  entries: [{ id: 'own', name: 'Εμείς', own: true, source: 'own' }],
  status: 'running',
  track: [],
  fixes: [],
  updatedAt: T0,
  ...p,
});

describe('finishLine', () => {
  it('goes through F, at right angles to P → F, ±0,15 NM', () => {
    const l = finishLine([S, P, F])!;
    expect(l.f).toEqual({ lat: F.lat, lon: F.lon });
    expect(l.ux).toBeCloseTo(0, 6);
    expect(l.uy).toBeCloseTo(-1, 6);
    // On P's side (north) negative, past the line (south) positive.
    expect(sideOf(at(0.5, 0, 0), l)).toBeCloseTo(-0.5, 3);
    expect(sideOf(at(-0.2, 0, 0), l)).toBeCloseTo(0.2, 3);
    expect(distanceToLine(at(0.3, 0.1, 0), l)).toBeCloseTo(0.3, 3);
    expect(distanceToLine(at(0, 0.25, 0), l)).toBeCloseTo(0.1, 3);
  });

  it('needs 2 marks more than 0,30 NM apart', () => {
    expect(finishLine([F])).toBeUndefined();
    expect(finishLine([P, F])).toBeDefined();
    const near = { ...P, lat: F.lat + 0.29 * NM_LAT };
    expect(finishLine([S, near, F])).toBeUndefined();
    expect(finishLine([{ ...F, id: 'a' }, F])).toBeUndefined();
  });
});

describe('crossing', () => {
  const l = finishLine([S, P, F])!;
  it('finds the crossing from P’s side and interpolates the time to the second', () => {
    // 0,01 NM before and 0,03 NM after, 4″ apart: a quarter of the way → +1″.
    expect(crossing(at(0.01, 0, T0), at(-0.03, 0, T0 + 4000), l)).toEqual({ t: T0 + 1000 });
    // 1″ apart: ±1″.
    const c = crossing(at(0.002, 0.05, T0 + 10_000), at(-0.001, 0.05, T0 + 11_000), l)!;
    expect(Math.abs(c.t - (T0 + 10_667))).toBeLessThanOrEqual(1000);
    expect(c.t % 1000).toBe(0);
  });
  it('counts a crossing in any direction of travel (COG does not matter), landing on the line too', () => {
    // A diagonal from north-west to south-east.
    expect(crossing(at(0.05, -0.1, T0), at(-0.05, 0.1, T0 + 10_000), l)).toEqual({ t: T0 + 5000 });
    expect(crossing(at(0.05, 0, T0), at(0, 0, T0 + 5000), l)).toEqual({ t: T0 + 5000 });
  });
  it('not from the other side, not outside ±0,15 NM, not without a crossing', () => {
    expect(crossing(at(-0.05, 0, T0), at(0.05, 0, T0 + 5000), l)).toBeUndefined();
    expect(crossing(at(0.05, 0.16, T0), at(-0.05, 0.16, T0 + 5000), l)).toBeUndefined();
    expect(crossing(at(0.05, -0.2, T0), at(-0.05, -0.2, T0 + 5000), l)).toBeUndefined();
    expect(crossing(at(0.2, 0, T0), at(0.05, 0, T0 + 5000), l)).toBeUndefined();
    expect(crossing(at(0, 0, T0), at(-0.05, 0, T0 + 5000), l)).toBeUndefined();
  });
});

describe('arming (AC 15)', () => {
  it('arms only when the next mark is the finish (not at a start that is also the finish)', () => {
    const r = race();
    // Before the start: never.
    expect(shouldArm(r, T0 - 1000, at(0, 0, 0))).toBe(false);
    // At the start (S = F), the next mark is P: no.
    expect(shouldArm(r, T0 + 60_000, at(0.02, 0, 0))).toBe(false);
    // Rounding P (within 0,15 NM of it).
    expect(shouldArm(r, T0 + 3_600_000, { lat: P.lat - 0.05 * NM_LAT, lon: P.lon })).toBe(true);
    // From the track too.
    const tr = race({ track: [{ t: T0 + 3_000_000, lat: P.lat, lon: P.lon }] });
    expect(shouldArm(tr, T0 + 3_100_000)).toBe(true);
    // Already armed: nothing more.
    expect(shouldArm({ ...tr, finishArmedAt: T0 }, T0 + 3_100_000)).toBe(false);
  });
  it('a straight 2-point course arms at the start signal', () => {
    const r = race({ marks: [P, F] });
    expect(shouldArm(r, T0 - 1)).toBe(false);
    expect(shouldArm(r, T0)).toBe(true);
    // Too short: no detection at all.
    expect(shouldArm(race({ marks: [{ ...F, lat: F.lat + 0.2 * NM_LAT }, F] }), T0 + 1)).toBe(false);
  });
  it('only races with our boat that are running', () => {
    expect(shouldArm(race({ marks: [P, F], kind: 'training' }), T0 + 1)).toBe(false);
    expect(shouldArm(race({ marks: [P, F], status: 'finished' }), T0 + 1)).toBe(false);
    expect(shouldArm(race({ marks: [P, F], entries: [] }), T0 + 1)).toBe(false);
  });
});

describe('finishStep', () => {
  const armed = race({ finishArmedAt: T0 + 1000 });
  it('stores the arming and finds the crossing on the same position', () => {
    const r = race({ marks: [P, F] });
    const s = finishStep(r, at(0.01, 0, T0 + 9000), at(-0.01, 0, T0 + 10_000), T0 + 10_000);
    expect(s.patch?.finishArmedAt).toBe(T0 + 10_000);
    expect(s.crossed).toEqual({ t: T0 + 10_000 - 500 + 500 });
  });
  it('a crossing: finishCross = { t } (exact), nothing else changes', () => {
    const s = finishStep(armed, at(0.01, 0, T0 + 60_000), at(-0.03, 0, T0 + 64_000), T0 + 64_000);
    expect(s.crossed).toEqual({ t: T0 + 61_000 });
    expect(s.patch).toEqual({ finishCross: { t: T0 + 61_000 } });
  });
  it('across a gap > 30″: approx with the gap length (AC 23)', () => {
    const s = finishStep(armed, at(0.1, 0, T0 + 60_000), at(-0.1, 0, T0 + 180_000), T0 + 180_000);
    expect(s.crossed).toEqual({ t: T0 + 120_000, approx: true, gapSec: 120 });
  });
  it('no new crossing while one is unanswered, nor before the way back after «Όχι» (AC 21, Π9)', () => {
    const pending = { ...armed, finishCross: { t: T0 + 61_000 } };
    expect(finishPending(pending)).toBe(true);
    expect(isArmed(pending, T0 + 70_000)).toBe(false);
    expect(finishStep(pending, at(0.01, 0, T0 + 70_000), at(-0.01, 0, T0 + 71_000), T0 + 71_000)).toEqual({});

    const no = { ...armed, finishCross: { t: T0 + 61_000, answered: 'no' as const, at: T0 + 65_000 } };
    expect(finishPending(no)).toBe(false);
    // Noise around the line: still disarmed.
    expect(finishStep(no, at(-0.01, 0, T0 + 70_000), at(0.05, 0, T0 + 71_000), T0 + 71_000)).toEqual({});
    expect(finishStep(no, at(0.05, 0, T0 + 71_000), at(-0.01, 0, T0 + 72_000), T0 + 72_000)).toEqual({});
    // Back on P's side, more than 0,1 NM away: re-armed.
    const back = finishStep(no, at(0.09, 0, T0 + 100_000), at(0.11, 0, T0 + 101_000), T0 + 101_000);
    expect(back.patch?.finishCross?.rearmed).toBe(true);
    const re = { ...no, ...back.patch };
    expect(isArmed(re, T0 + 102_000)).toBe(true);
    // A new crossing writes a new finishCross over the old one.
    const s = finishStep(re, at(0.01, 0, T0 + 200_000), at(-0.01, 0, T0 + 201_000), T0 + 201_000);
    expect(s.crossed).toEqual({ t: T0 + 201_000 - 500 + 500 });
    expect(s.patch?.finishCross?.answered).toBeUndefined();
  });
  it('without a previous position, nothing is found; a stale position (same time) neither', () => {
    expect(finishStep(armed, undefined, at(-0.01, 0, T0 + 1), T0 + 1)).toEqual({});
    expect(finishStep(armed, at(0.01, 0, T0 + 5000), at(-0.01, 0, T0 + 5000), T0 + 5000)).toEqual({});
  });
});
