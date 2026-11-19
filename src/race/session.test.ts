import { describe, expect, it } from 'vitest';
import type { Race, TrackPoint } from './types';
import {
  canSwitchKind,
  isCancelled,
  finishAt,
  finishNow,
  finishCrossAt,
  withEstimates,
  kindOf,
  newSession,
  recordFrom,
  reopen,
  sessionStats,
  shouldWritePoint,
  stallMinutes,
  switchKind,
  trackEveryMs,
} from './session';

const T0 = Date.UTC(2026, 10, 12, 9, 0, 0);

const race = (p: Partial<Race> = {}): Race => ({
  id: 'r1',
  name: 'Χειμερινό',
  marks: [],
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

const pt = (min: number, lat = 37.9, lon = 23.6, sog = 5): TrackPoint => ({ t: T0 + min * 60_000, lat, lon, sog });

describe('kind defaults', () => {
  it('treats a race without kind as a race', () => {
    expect(kindOf(race())).toBe('race');
    expect(kindOf(race({ kind: 'training' }))).toBe('training');
  });

  it('records every 5″ / 15″ / 30″ (cruise 15″ by setting)', () => {
    expect(trackEveryMs('race')).toBe(5_000);
    expect(trackEveryMs('training')).toBe(15_000);
    expect(trackEveryMs('cruise')).toBe(30_000);
    expect(trackEveryMs('cruise', 15)).toBe(15_000);
    expect(trackEveryMs('cruise', 99)).toBe(30_000);
  });

  it('writes a point once the interval has passed, allowing for timer jitter', () => {
    expect(shouldWritePoint(undefined, T0, 15_000)).toBe(true);
    expect(shouldWritePoint(T0, T0 + 10_000, 15_000)).toBe(false);
    expect(shouldWritePoint(T0, T0 + 14_990, 15_000)).toBe(true);
    // A race keeps a point on every 5″ tick, as before.
    expect(shouldWritePoint(T0, T0 + 4_990, 5_000)).toBe(true);
  });

  it('warns about a stalled track after 3 intervals, at least 30″', () => {
    expect(stallMinutes(5_000)).toBe(0.5);
    expect(stallMinutes(15_000)).toBe(0.75);
    expect(stallMinutes(30_000)).toBe(1.5);
  });

  it('starts recording 10′ before a race, at once for training and cruise', () => {
    expect(recordFrom(race())).toBe(T0 - 10 * 60_000);
    expect(recordFrom(race({ kind: 'cruise' }))).toBe(T0);
  });

  it('creates a running training with only our boat, and a cruise without a boat', () => {
    const t = newSession('training', { id: 'x', now: T0, entries: race().entries, course: { id: 'c', name: 'Τρίγωνο', marks: [{ id: 'm', name: 'Α', lat: 1, lon: 2 }] } });
    expect(t).toMatchObject({ kind: 'training', status: 'running', start: T0, name: 'Προπόνηση', courseId: 'c' });
    expect(t.entries).toHaveLength(1);
    expect(t.marks).toHaveLength(1);
    const c = newSession('cruise', { id: 'y', now: T0, entries: [] });
    expect(c).toMatchObject({ kind: 'cruise', name: 'Αναψυχή', entries: [], marks: [], track: [], fixes: [] });
  });
});

describe('kind switching', () => {
  it('allows only training ↔ cruise', () => {
    expect(canSwitchKind('training', 'cruise')).toBe(true);
    expect(canSwitchKind('cruise', 'training')).toBe(true);
    expect(canSwitchKind('race', 'training')).toBe(false);
    expect(canSwitchKind('training', 'race')).toBe(false);
    expect(canSwitchKind('cruise', 'cruise')).toBe(false);
  });

  it('a cruise without our boat cannot become training (AC 4)', () => {
    expect(canSwitchKind('cruise', 'training', false)).toBe(false);
    expect(canSwitchKind('training', 'cruise', false)).toBe(true);
    expect(switchKind(race({ kind: 'cruise', entries: [] }), 'training', T0)).toBeUndefined();
    expect(switchKind(race({ kind: 'cruise' }), 'training', T0)).toBeDefined();
  });

  it('logs each switch and keeps the track', () => {
    const r = race({ kind: 'training', track: [pt(1)] });
    const p = switchKind(r, 'cruise', T0 + 60_000)!;
    expect(p).toEqual({ kind: 'cruise', kindLog: [{ kind: 'cruise', at: T0 + 60_000 }] });
    expect('track' in p).toBe(false);
    const back = switchKind({ ...r, ...p }, 'training', T0 + 120_000)!;
    expect(back.kindLog).toHaveLength(2);
  });

  it('never turns a race (or an old race without kind) into something else', () => {
    expect(switchKind(race(), 'training', T0)).toBeUndefined();
    expect(switchKind(race({ kind: 'race' }), 'cruise', T0)).toBeUndefined();
  });
});

describe('ending a session', () => {
  it('writes our elapsed time for a race, as the old «Τερματισμός»', () => {
    const f = finishNow(race(), T0 + 3600_000);
    expect(f.status).toBe('finished');
    expect(f.finish).toBe(T0 + 3600_000);
    expect(f.results).toEqual({ own: 3600 });
  });

  it('writes no result for a race ended before its start (cancelled / postponed)', () => {
    const f = finishNow(race(), T0 - 5 * 60_000);
    expect(f.status).toBe('finished');
    expect(f.results).toBeUndefined();
    expect(isCancelled(f)).toBe(true);
    // At the start signal exactly: still no time.
    expect(finishNow(race(), T0).results).toBeUndefined();
    expect(isCancelled(finishNow(race(), T0 + 1000))).toBe(false);
    // Training is never "cancelled".
    expect(isCancelled(finishNow(race({ kind: 'training' }), T0 - 1000))).toBe(false);
  });

  it('does not write results for training', () => {
    const f = finishNow(race({ kind: 'training' }), T0 + 60_000);
    expect(f.results).toBeUndefined();
  });

  it('ends at the last movement: drops later points and writes no race result', () => {
    const r = race({ track: [pt(1), pt(2), pt(30), pt(200)], fixes: [{ entryId: 'own', t: T0 + 200 * 60_000, lat: 1, lon: 1, source: 'own' }] });
    const f = finishAt(r, T0 + 30 * 60_000, T0 + 300 * 60_000);
    expect(f.finish).toBe(T0 + 30 * 60_000);
    expect(f.track.map((p) => p.t)).toEqual([pt(1).t, pt(2).t, pt(30).t]);
    expect(f.fixes).toHaveLength(0);
    expect(f.results).toBeUndefined();
  });

  it('undo puts the session back to running without a finish', () => {
    const r = race({ kind: 'cruise' });
    const back = reopen(r, T0 + 5_000);
    expect(back.status).toBe('running');
    expect(back.finish).toBeUndefined();
  });
});

describe('session stats', () => {
  it('gives duration, distance and mean speed', () => {
    // 0.1° of latitude ≈ 6 nm in an hour, a point every 3′.
    const track = Array.from({ length: 21 }, (_, i) => pt(i * 3, 37.8 + i * 0.005));
    const r = race({ kind: 'cruise', status: 'finished', finish: T0 + 3600_000, track });
    const s = sessionStats(r);
    expect(s.durationSec).toBe(3600);
    expect(s.distanceNm).toBeCloseTo(6, 1);
    expect(s.avgKt).toBeCloseTo(6, 1);
  });

  it('has no mean speed for an empty or very short session', () => {
    expect(sessionStats(race({ finish: T0 + 30_000 })).avgKt).toBeUndefined();
  });
});

describe('finish line end and estimate snapshot (P-040)', () => {
  const r = race({
    entries: [
      { id: 'own', name: 'Εμείς', own: true, source: 'own' },
      { id: 'b', name: 'Αύρα', source: 'boats' },
      { id: 'c', name: 'Γαλήνη', source: 'boats' },
    ],
    track: [pt(60), pt(100), pt(102)],
    fixes: [{ entryId: 'own', t: T0 + 101 * 60_000, lat: 37.9, lon: 23.6, source: 'own' }],
    finishCross: { t: T0 + 100 * 60_000 },
  });

  it('«Ναι» 2′ later: the finish is the crossing, our time from it, later points dropped (AC 20)', () => {
    const now = T0 + 102 * 60_000;
    const out = finishCrossAt(r, T0 + 100 * 60_000, now);
    expect(out.status).toBe('finished');
    expect(out.finish).toBe(T0 + 100 * 60_000);
    expect(out.results).toEqual({ own: 6000 });
    expect(out.finishCross).toEqual({ t: T0 + 100 * 60_000, answered: 'yes', at: now });
    expect(out.track.map((p) => p.t)).toEqual([T0 + 60 * 60_000, T0 + 100 * 60_000]);
    expect(out.fixes).toEqual([]);
  });

  it('the snapshot keeps the opponents without a result, never us', () => {
    const ended = { ...finishCrossAt(r, T0 + 100 * 60_000, T0 + 102 * 60_000), results: { own: 6000, c: 6100 } };
    const out = withEstimates(ended, [
      { entryId: 'own', own: true, elapsed: 6000 },
      { entryId: 'b', own: false, elapsed: 6200.4 },
      { entryId: 'c', own: false, elapsed: 6150 },
      { entryId: 'x', own: false, elapsed: 5000 },
    ]);
    expect(out.estAtFinish).toEqual({ b: 6200 });
    // Before the start (cancelled), or without estimates: unchanged.
    const cancelled = { ...r, status: 'finished' as const, finish: T0 - 1000 };
    expect(withEstimates(cancelled, [{ entryId: 'b', own: false, elapsed: 1 }])).toBe(cancelled);
    expect(withEstimates(ended, [{ entryId: 'b', own: false }])).toBe(ended);
  });

  it('undo of an end on the line: running again, the crossing answered «Όχι», not re-armed (AC 37)', () => {
    const back = reopen(r, T0 + 103 * 60_000);
    expect(back.status).toBe('running');
    expect(back.finish).toBeUndefined();
    expect(back.finishCross).toEqual({ t: T0 + 100 * 60_000, answered: 'no', at: T0 + 103 * 60_000, rearmed: false });
    const plain = race();
    expect(reopen(plain, T0).finishCross).toBeUndefined();
  });
});
