import { describe, expect, it } from 'vitest';
import { TRE_IRENE } from '../boat/treIrene';
import { project, type Mark } from '../routing/isochrones';
import { courseLengthNm, estimateRace, fmtGap, nextMarkOf, relativeFix, timeToFinish, vmcAlong } from './estimate';
import type { Race, RaceEntry } from './types';
import { distanceNm, bearingDeg } from '../nav/geo';

const A: Mark = { id: 'a', name: 'Εκκίνηση', lat: 37.9, lon: 23.6 };
const B: Mark = { id: 'b', name: 'Πάνω', ...project(A, 0, 4) };
const marks = [A, B, A];
const wind = { tws: 12, twd: 0 };
const own: RaceEntry = { id: 'us', name: 'TRE IRENE', own: true, source: 'own', boat: { ...TRE_IRENE } };
const T0 = Date.UTC(2026, 10, 14, 9);

function race(extra: Partial<Race> = {}): Race {
  return { id: 'r', name: 'Test', marks, start: T0, scoringOptionId: 'coastal', method: 'ToT', entries: [own], status: 'running', track: [], fixes: [], updatedAt: 0, ...extra };
}

describe('race estimate', () => {
  it('uses beat VMG upwind, run VMG downwind and polar speed on a reach', () => {
    const up = vmcAlong(TRE_IRENE, wind, 0)!;
    const down = vmcAlong(TRE_IRENE, wind, 180)!;
    const reach = vmcAlong(TRE_IRENE, wind, 90)!;
    expect(up).toBeCloseTo(5.56, 1); // beat VMG at 12 kt
    expect(down).toBeCloseTo(6.73, 1); // run VMG at 12 kt
    expect(reach).toBeCloseTo(8.34, 1); // polar at 90°
    expect(timeToFinish(TRE_IRENE, wind, A, 1, marks)! / 3600).toBeCloseTo(4 / up + 4 / down, 2);
  });

  it('ranks boats by projected corrected time and gives gaps relative to us', () => {
    const slower: RaceEntry = { id: 'x', name: 'Αργό', source: 'orc', boat: { ...TRE_IRENE, scoring: TRE_IRENE.scoring.map((o) => ({ ...o, tot: o.tot * 0.95 })) } };
    const mid = { ...B, lat: (A.lat + B.lat) / 2 };
    const r = race({
      entries: [own, slower],
      fixes: [
        { entryId: 'us', t: T0 + 3600_000, lat: mid.lat, lon: mid.lon, source: 'own' },
        { entryId: 'x', t: T0 + 3600_000, lat: mid.lat, lon: mid.lon, source: 'ais' },
      ],
    });
    const rows = estimateRace(r, wind, T0 + 3600_000);
    // Same place, same polar, lower ToT → the other boat wins on corrected time.
    expect(rows[0].entryId).toBe('x');
    expect(rows[0].rank).toBe(1);
    const us = rows.find((x) => x.own)!;
    expect(us.gap).toBe(0);
    expect(rows[0].gap!).toBeLessThan(0);
    expect(us.elapsed!).toBeGreaterThan(3600);
  });

  it('falls back to our polar scaled by GPH, and says why when it cannot estimate', () => {
    const noPolar: RaceEntry = { id: 'g', name: 'Χωρίς polar', source: 'pdf', boat: { gph: TRE_IRENE.gph! * 1.1, scoring: TRE_IRENE.scoring } };
    const noRating: RaceEntry = { id: 'n', name: 'Χωρίς βαθμ.', source: 'none' };
    const r = race({
      entries: [own, noPolar, noRating],
      fixes: [
        { entryId: 'us', t: T0, lat: A.lat, lon: A.lon, source: 'own' },
        { entryId: 'g', t: T0, lat: A.lat, lon: A.lon, source: 'manual' },
      ],
    });
    const rows = estimateRace(r, wind, T0);
    const g = rows.find((x) => x.entryId === 'g')!;
    const us = rows.find((x) => x.own)!;
    expect(g.elapsed! / us.elapsed!).toBeCloseTo(1.1, 3);
    expect(rows.find((x) => x.entryId === 'n')!.missing).toBe('χωρίς βαθμολογία');
    expect(estimateRace(r, undefined, T0).find((x) => x.own)!.missing).toBe('χωρίς άνεμο');
  });

  it('tracks mark roundings from mark fixes and from positions near the mark', () => {
    expect(nextMarkOf([], marks)).toBe(1);
    expect(nextMarkOf([{ entryId: 'x', t: 1, lat: B.lat, lon: B.lon, source: 'ais' }], marks)).toBe(2);
    expect(nextMarkOf([{ entryId: 'x', t: 1, lat: 0, lon: 0, source: 'mark', markIndex: 1 }], marks)).toBe(2);
  });

  it('turns "ahead right, 0.5 NM" into a position', () => {
    const p = relativeFix(A, 0, 'ahead-r', 0.5);
    expect(distanceNm(A, p)).toBeCloseTo(0.5, 2);
    expect(bearingDeg(A, p)).toBeCloseTo(30, 0);
    expect(courseLengthNm(marks)).toBeCloseTo(8, 2);
    expect(fmtGap(-48)).toBe('−0:48');
    expect(fmtGap(3725)).toBe('+1:02:05');
  });
});

describe('P-056: GPH / no correction and «1ος» only with a comparison', () => {
  const manualOwn: RaceEntry = { id: 'us', name: 'Εμείς', own: true, source: 'own', boat: { gph: TRE_IRENE.gph, polar: TRE_IRENE.polar, scoring: [] } };
  const fixAt = (entryId: string) => ({ entryId, t: T0 + 3600_000, lat: (A.lat + B.lat) / 2, lon: A.lon, source: 'manual' as const });

  it('KA-A5: with «gph» an opponent with only a GPH gets a corrected time; without GPH «χωρίς GPH»', () => {
    const gphOnly: RaceEntry = { id: 'g', name: 'Μόνο GPH', source: 'pdf', boat: { gph: TRE_IRENE.gph! * 1.05, scoring: [] } };
    const bare: RaceEntry = { id: 'n', name: 'Τίποτα', source: 'none' };
    const r = race({ scoringOptionId: 'gph', method: 'ToD', entries: [manualOwn, gphOnly, bare], fixes: [fixAt('us'), fixAt('g')] });
    const rows = estimateRace(r, wind, T0 + 3600_000);
    expect(rows.find((x) => x.entryId === 'g')!.corrected).toBeDefined();
    expect(rows.find((x) => x.entryId === 'us')!.corrected).toBeDefined();
    expect(rows.find((x) => x.entryId === 'n')!.missing).toBe('χωρίς GPH');
    // Finished times go through ToD = GPH × NM.
    const done = race({ scoringOptionId: 'gph', method: 'ToD', entries: [manualOwn], results: { us: 20_000 }, status: 'finished' });
    expect(estimateRace(done, undefined)[0].corrected).toBeCloseTo(20_000 - TRE_IRENE.gph! * courseLengthNm(marks), 6);
  });

  it('KA-A6: with «none» corrected = elapsed for every boat', () => {
    const bare: RaceEntry = { id: 'n', name: 'Τίποτα', source: 'none' };
    const r = race({ scoringOptionId: 'none', method: 'ToT', entries: [own, bare], results: { us: 5000, n: 5100 }, status: 'finished' });
    const rows = estimateRace(r, undefined);
    expect(rows.map((x) => [x.entryId, x.corrected])).toEqual([
      ['us', 5000],
      ['n', 5100],
    ]);
  });

  it('KA-Γ1: a rank only when at least two boats have a corrected time', () => {
    const alone = estimateRace(race({ fixes: [fixAt('us')] }), wind, T0 + 3600_000);
    expect(alone[0].corrected).toBeDefined();
    expect(alone[0].rank).toBeUndefined();
    const noPos: RaceEntry = { id: 'x', name: 'Χωρίς θέση', source: 'orc', boat: { ...TRE_IRENE } };
    const two = estimateRace(race({ entries: [own, noPos, { ...noPos, id: 'y' }], fixes: [fixAt('us')] }), wind, T0 + 3600_000);
    expect(two.every((x) => x.rank === undefined)).toBe(true);
    expect(two.filter((x) => !x.own).map((x) => x.missing)).toEqual(['χωρίς θέση', 'χωρίς θέση']);
    const both = estimateRace(race({ entries: [own, noPos], fixes: [fixAt('us'), fixAt('x')] }), wind, T0 + 3600_000);
    expect(both.map((x) => x.rank)).toEqual([1, 2]);
  });
});

describe('noComparison (KA-Γ2, Γ3)', () => {
  it('says why there is no place', async () => {
    const { noComparison } = await import('./estimate');
    expect(noComparison([{ entryId: 'us', name: 'Εμείς', own: true, corrected: 100 }])).toEqual({ none: true, text: 'Χωρίς αντιπάλους' });
    expect(
      noComparison([
        { entryId: 'us', name: 'Εμείς', own: true, corrected: 100 },
        { entryId: 'x', name: 'Χ', own: false, missing: 'χωρίς θέση' },
        { entryId: 'y', name: 'Υ', own: false, missing: 'χωρίς θέση' },
      ]),
    ).toEqual({ none: false, text: 'Χωρίς σύγκριση: λείπει θέση αντιπάλου' });
    expect(noComparison([{ entryId: 'us', name: 'Εμείς', own: true, corrected: 100, rank: 1 }, { entryId: 'x', name: 'Χ', own: false, corrected: 120, rank: 2 }])).toBeUndefined();
  });
});
