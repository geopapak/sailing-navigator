import { describe, expect, it } from 'vitest';
import {
  CRUISE_DEFAULT_KT,
  ESTIMATE_MAX_KT,
  aheadOf,
  arrivalTime,
  arriveStep,
  cruiseNext,
  cruiseTitle,
  depthCell,
  destKey,
  destName,
  destPatch,
  durText,
  estimateKt,
  etaFrom,
  maxSog30,
  meanSog,
  pausedEta,
  pushRecent,
  remainingNm,
  routeNm,
  sampleDue,
  shallowStretch,
  splitName,
  trackIntervalSec,
} from './cruise';
import { DEFAULT_ALERTS, DEFAULT_CRUISE_ALERTS, DEFAULT_TRAINING_ALERTS, newEngine, profileFor, step, type Situation } from './alerts';
import { distanceNm } from '../nav/geo';
import { newSession, sessionStats } from './session';
import type { Race, TrackPoint } from './types';

/** 1′ of latitude = 1 nm. */
const P = (latMin: number, lonMin = 0) => ({ lat: 37 + latMin / 60, lon: 23 + lonMin / 60 });
const T0 = Date.UTC(2026, 10, 16, 9, 0, 0);

describe('destination (P-036)', () => {
  it('a map point becomes a one-mark route and a dest', () => {
    const p = destPatch({ kind: 'point', point: { name: 'Σημείο 10:42', ...P(5) } });
    expect(p.marks).toHaveLength(1);
    expect(p.dest).toEqual({ name: 'Σημείο 10:42', ...P(5) });
    expect(p.courseId).toBeUndefined();
    expect(p.arrivedAt).toBeUndefined();
  });

  it('a saved route is copied with its id and name; none clears everything', () => {
    const marks = [{ id: 'a', name: 'Φάληρο', ...P(0) }, { id: 'b', name: 'Αίγινα', ...P(10) }];
    const p = destPatch({ kind: 'course', id: 'c1', name: 'Φάληρο – Αίγινα', marks });
    expect(p.marks).toEqual(marks);
    expect(p.marks[0]).not.toBe(marks[0]);
    expect(p).toMatchObject({ courseId: 'c1', courseName: 'Φάληρο – Αίγινα', dest: undefined });
    expect(destPatch({ kind: 'none' })).toMatchObject({ marks: [], courseId: undefined, dest: undefined });
  });

  it('names, titles and keys', () => {
    const r = { ...newSession('cruise', { id: 'x', now: T0, entries: [] }), ...destPatch({ kind: 'point', point: { name: 'Αίγινα · λιμάνι', ...P(16) } }) };
    expect(destName(r)).toBe('Αίγινα · λιμάνι');
    expect(cruiseTitle(r)).toBe('Βόλτα · Αίγινα');
    expect(splitName('Αίγινα · λιμάνι')).toEqual({ place: 'Αίγινα', detail: 'λιμάνι' });
    expect(splitName('Σημείο 10:42')).toEqual({ place: 'Σημείο 10:42' });
    const none = newSession('cruise', { id: 'y', now: T0, entries: [] });
    expect(destName(none)).toBeUndefined();
    expect(cruiseTitle(none)).toBe('Βόλτα');
    expect(destKey(none)).toBeUndefined();
    const other = { ...r, ...destPatch({ kind: 'point', point: { name: 'Αγκίστρι', ...P(19) } }) };
    expect(destKey(r)).not.toBe(destKey(other));
  });
});

describe('distance left and ETA (P-036 AC 3)', () => {
  const marks = [P(0), P(10), P(10, 10 / Math.cos((37.1 * Math.PI) / 180))];

  it('routes along the marks from the next one', () => {
    expect(routeNm([P(0), P(10)])).toBeCloseTo(10, 1);
    // From 2 nm south of the first mark: 2 + 10 + ~10.
    expect(remainingNm(P(-2), marks, 0)).toBeCloseTo(22, 0);
    // Past the first mark: to the second, then the last leg.
    expect(remainingNm(P(4), marks, 1)).toBeCloseTo(16, 0);
    // Everything passed: straight to the last mark.
    expect(remainingNm(P(10), marks, 3)).toBeCloseTo(distanceNm(P(10), marks[2]), 6);
    expect(remainingNm(P(0), [], 0)).toBe(0);
  });

  it('the next mark moves on inside 0,15 nm, in order', () => {
    const track = [P(-1), P(-0.1), P(5), P(9.9)];
    expect(cruiseNext(track, marks)).toBe(2);
    // The second mark first does not count: marks are passed in order.
    expect(cruiseNext([P(9.95), P(5)], marks)).toBe(0);
    expect(cruiseNext([], marks)).toBe(0);
  });

  it('ETA from the 10′ mean SOG; none when still', () => {
    const track: Pick<TrackPoint, 't' | 'sog'>[] = [
      { t: T0 - 20 * 60_000, sog: 1 }, // older than 10′: ignored
      { t: T0 - 5 * 60_000, sog: 5 },
      { t: T0 - 60_000, sog: 7 },
    ];
    expect(meanSog(track, T0)).toBe(6);
    expect(meanSog([], T0, undefined, 4.5)).toBe(4.5);
    expect(meanSog([], T0)).toBeUndefined();
    const e = etaFrom(6, 6, T0)!;
    expect(e.sec).toBe(3600);
    expect(e.at).toBe(T0 + 3600_000);
    expect(etaFrom(6, 0.1, T0)).toBeUndefined();
    expect(etaFrom(6, undefined, T0)).toBeUndefined();
  });

  it('formats durations', () => {
    expect(durText(45 * 60)).toBe('45′');
    expect(durText(125 * 60)).toBe('2 ώ 05′');
  });
});

describe('summary numbers (P-036 AC 9–10)', () => {
  it('top speed is the best 30″ mean, not one noisy point', () => {
    const pts = [
      { t: 0, sog: 5 },
      { t: 15_000, sog: 14 }, // a GPS spike
      { t: 30_000, sog: 5 },
      { t: 45_000, sog: 6 },
      { t: 60_000, sog: 6.4 },
    ];
    const m = maxSog30(pts)!;
    expect(m).toBeLessThan(14);
    expect(m).toBeCloseTo(25 / 3, 2); // (14 + 5 + 6) / 3, the spike diluted
    expect(maxSog30([{ t: 0, sog: 9 }])).toBeUndefined();
    // Points 30″ apart: pairs.
    expect(maxSog30([{ t: 0, sog: 5 }, { t: 30_000, sog: 7 }, { t: 60_000, sog: 7 }])).toBe(7);
    // A pause (no points for minutes) is not bridged.
    expect(maxSog30([{ t: 0, sog: 9 }, { t: 600_000, sog: 9 }])).toBeUndefined();
  });

  it('arrival: first point inside 0,1 nm of the last mark, after the earlier marks', () => {
    const track = [P(0), P(5), P(9.95), P(10)].map((p, i) => ({ ...p, t: T0 + i * 60_000 }));
    expect(arrivalTime(track, [P(10)])).toBe(T0 + 2 * 60_000);
    expect(arrivalTime(track.slice(0, 2), [P(10)])).toBeUndefined();
    expect(arrivalTime(track, [])).toBeUndefined();
    // A round route that ends where it starts: leaving the start is not the arrival.
    const round = [P(0), P(10), P(0)];
    const sail = [P(0), P(5), P(10), P(5), P(0.05)].map((p, i) => ({ ...p, t: T0 + i * 60_000 }));
    expect(arrivalTime(sail, round)).toBe(T0 + 4 * 60_000);
  });

  it('track interval from the gaps between points', () => {
    expect(trackIntervalSec([0, 30, 60, 90].map((s) => ({ t: s * 1000 })), 15)).toBe(30);
    expect(trackIntervalSec([0, 15, 30, 45, 200].map((s) => ({ t: s * 1000 })), 30)).toBe(15);
    expect(trackIntervalSec([], 30)).toBe(30);
  });

  it('estimate speed: mean of the last 3 cruises, else 5,5 kt', () => {
    expect(estimateKt([])).toBe(CRUISE_DEFAULT_KT);
    const cruise = (i: number, kt: number): Race => {
      const r = newSession('cruise', { id: `c${i}`, now: T0 + i * 86_400_000, entries: [] });
      // One hour north at `kt`, a point every 6′.
      const track = Array.from({ length: 11 }, (_, i) => ({ ...P((i / 10) * kt), t: r.start + i * 360_000, sog: kt }));
      return { ...r, track, status: 'finished', finish: r.start + 3600_000 };
    };
    const races = [cruise(1, 3), cruise(2, 4), cruise(3, 5), cruise(4, 6)];
    expect(estimateKt(races)).toBeCloseTo(5, 1);
  });
});

describe('recent destinations, depth samples', () => {
  it('keeps 5, newest first, without near duplicates', () => {
    let l = [] as { name: string; lat: number; lon: number }[];
    for (let i = 0; i < 7; i++) l = pushRecent(l, { name: `Σ${i}`, ...P(i) });
    expect(l.map((x) => x.name)).toEqual(['Σ6', 'Σ5', 'Σ4', 'Σ3', 'Σ2']);
    l = pushRecent(l, { name: 'Ίδιο', ...P(4.01) });
    expect(l.map((x) => x.name)).toEqual(['Ίδιο', 'Σ6', 'Σ5', 'Σ3', 'Σ2']);
  });

  it('samples 0,3 nm ahead on the course', () => {
    const a = aheadOf(P(0), 0, 0.3);
    expect(distanceNm(P(0), a)).toBeCloseTo(0.3, 3);
    expect(a.lat).toBeGreaterThan(P(0).lat);
    const e = aheadOf(P(0), 90, 0.3);
    expect(e.lon).toBeGreaterThan(P(0).lon);
    expect(distanceNm(P(0), e)).toBeCloseTo(0.3, 3);
  });

  it('cells of ~200 m share one answer', () => {
    const a = P(0);
    expect(depthCell(a)).toBe(depthCell({ lat: a.lat + 0.0001, lon: a.lon }));
    expect(depthCell(a)).not.toBe(depthCell({ lat: a.lat + 0.01, lon: a.lon }));
  });

  it('asks EMODnet at most once a minute, online and moving only', () => {
    expect(sampleDue(undefined, T0, { online: true, sog: 5 })).toBe(true);
    expect(sampleDue(T0, T0 + 59_000, { online: true, sog: 5 })).toBe(false);
    expect(sampleDue(T0, T0 + 60_000, { online: true, sog: 5 })).toBe(true);
    expect(sampleDue(undefined, T0, { online: false, sog: 5 })).toBe(false);
    expect(sampleDue(undefined, T0, { online: true, sog: 0.8 })).toBe(false);
    expect(sampleDue(undefined, T0, { online: true })).toBe(false);
  });

  it('a shallow stretch starts below 5 m and ends when deep again', () => {
    expect(shallowStretch(undefined, { depth: 4, from: 'chart' }, 1)).toBe(1);
    expect(shallowStretch(1, { depth: 3, from: 'chart' }, 2)).toBe(1);
    expect(shallowStretch(1, undefined, 3)).toBe(1);
    expect(shallowStretch(1, { depth: 5, from: 'chart' }, 4)).toBeUndefined();
    // The sounder needs 6 m to clear, so a depth around 5 m does not flap.
    expect(shallowStretch(1, { depth: 5.4, from: 'sounder' }, 4)).toBe(1);
    expect(shallowStretch(1, { depth: 6, from: 'sounder' }, 4)).toBeUndefined();
  });
});

describe('cruise alerts: shallow water and arrival (P-036 AC 7)', () => {
  const S = { alerts: DEFAULT_ALERTS, raceShiftDeg: 7 as const, training: DEFAULT_TRAINING_ALERTS, cruiseAlerts: DEFAULT_CRUISE_ALERTS };
  const p = profileFor('cruise', S);
  const base: Situation = { now: 0, markIndex: 0, markName: 'Αίγινα', isFinish: false };

  it('profile: both on by default, 60″ strict gap, switchable', () => {
    expect(p.types).toEqual(['shallow', 'arrive']);
    expect(p.minGapSec).toBe(60);
    expect(p.strictGap).toBe(true);
    expect(profileFor('cruise', { ...S, cruiseAlerts: { shallow: false, arrive: true } }).types).toEqual(['arrive']);
    expect(profileFor('cruise', { ...S, cruiseAlerts: { shallow: false, arrive: false } }).types).toEqual([]);
  });

  it('sounder below 5 m: «ΡΗΧΑ ΜΠΡΟΣΤΑ» once per stretch', () => {
    const st = newEngine();
    expect(step(st, DEFAULT_ALERTS, { ...base, depth: { depth: 7, from: 'sounder' } }, p)).toBeUndefined();
    const a = step(st, DEFAULT_ALERTS, { ...base, now: 2_000, depth: { depth: 4.2, from: 'sounder' } }, p)!;
    expect(a).toMatchObject({ type: 'shallow', kind: 'now', big: 'ΡΗΧΑ ΜΠΡΟΣΤΑ', sub: 'Βάθος 4,2 μ · ενδεικτικό, όχι για ναυσιπλοΐα' });
    // Still shallow: no second alert.
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 90_000, depth: { depth: 3.8, from: 'sounder' } }, p)).toBeUndefined();
    // Deep again, then shallow: a new stretch, after the 60″ gap.
    step(st, DEFAULT_ALERTS, { ...base, now: 100_000, depth: { depth: 8, from: 'sounder' } }, p);
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 110_000, depth: { depth: 4, from: 'sounder' } }, p)?.type).toBe('shallow');
  });

  it('chart ahead: depth and distance, always «ενδεικτικό, όχι για ναυσιπλοΐα»', () => {
    const st = newEngine();
    const a = step(st, DEFAULT_ALERTS, { ...base, depth: { depth: 4, from: 'chart', aheadNm: 0.3 } }, p)!;
    expect(a.sub).toBe('4,0 μ σε 0,3 νμ · ενδεικτικό, όχι για ναυσιπλοΐα');
  });

  it('«ΦΤΑΝΕΙΣ» at 0,5 nm, once per destination', () => {
    const st = newEngine();
    expect(step(st, DEFAULT_ALERTS, { ...base, destNm: 0.8, destKey: 'a' }, p)).toBeUndefined();
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 2_000, destNm: 0.5, destKey: 'a' }, p)).toMatchObject({ type: 'arrive', big: 'ΦΤΑΝΕΙΣ', sub: 'Προορισμός σε 0,5 νμ' });
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 200_000, destNm: 0.2, destKey: 'a' }, p)).toBeUndefined();
    // A new destination arms it again.
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 400_000, destNm: 0.4, destKey: 'b' }, p)?.type).toBe('arrive');
  });

  it('60″ between two alerts: a held arrival comes after the gap', () => {
    const st = newEngine();
    expect(step(st, DEFAULT_ALERTS, { ...base, depth: { depth: 3, from: 'sounder' }, destNm: 0.4, destKey: 'a' }, p)?.type).toBe('shallow');
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 30_000, depth: { depth: 3, from: 'sounder' }, destNm: 0.4, destKey: 'a' }, p)).toBeUndefined();
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 60_000, depth: { depth: 3, from: 'sounder' }, destNm: 0.3, destKey: 'a' }, p)?.type).toBe('arrive');
  });

  it('«ΡΗΧΑ ΜΠΡΟΣΤΑ» does not wait for the 60″ gap (safety first)', () => {
    const st = newEngine();
    expect(step(st, DEFAULT_ALERTS, { ...base, destNm: 0.4, destKey: 'a' }, p)?.type).toBe('arrive');
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 6_000, depth: { depth: 3, from: 'sounder' } }, p)?.type).toBe('shallow');
    // Its own re-arm still holds: shallow again only after 6 m.
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 8_000, depth: { depth: 5.5, from: 'sounder' } }, p)).toBeUndefined();
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 10_000, depth: { depth: 4, from: 'sounder' } }, p)).toBeUndefined();
  });

  it('switched off: nothing; and never a manoeuvre alert', () => {
    const off = profileFor('cruise', { ...S, cruiseAlerts: { shallow: false, arrive: false } });
    const st = newEngine();
    expect(step(st, DEFAULT_ALERTS, { ...base, depth: { depth: 2, from: 'sounder' }, destNm: 0.1, destKey: 'a' }, off)).toBeUndefined();
    const st2 = newEngine();
    step(st2, DEFAULT_ALERTS, { ...base, instTwd: 100 }, p);
    const x = step(st2, DEFAULT_ALERTS, { ...base, now: 120_000, instTwd: 160, layInSec: 3, markInSec: 20, gpsLost: true, pct15: 40, leg: 'up', board: 'stbd' }, p);
    expect(x).toBeUndefined();
  });
});

describe('arrival near the start (P-036 QA fix)', () => {
  const S = { alerts: DEFAULT_ALERTS, raceShiftDeg: 7 as const, training: DEFAULT_TRAINING_ALERTS, cruiseAlerts: DEFAULT_CRUISE_ALERTS };
  const p = profileFor('cruise', S);
  const base: Situation = { now: 0, markIndex: 0, markName: 'Μαρίνα', isFinish: false };
  type Arr = Pick<Race, 'arriveArmed' | 'arriveFired' | 'arrivedAt'>;

  /** Runs the live arrival logic over distances (nm), one a minute, as RaceAlerts does every step. */
  const run = (r: Arr, dists: number[], st = newEngine(), t0 = 0) => {
    if (r.arriveFired) st.fired.add(`arrive-${r.arriveFired}`);
    const shown: number[] = [];
    dists.forEach((d, i) => {
      const now = t0 + i * 60_000;
      const a = arriveStep(r, { key: 'k', leftNm: d, toLastNm: d, hasFix: true, now });
      if (a.patch) Object.assign(r, a.patch);
      const x = step(st, DEFAULT_ALERTS, { ...base, now, destNm: a.alertNm, destKey: a.alertNm === undefined ? undefined : 'k' }, p);
      if (x?.type === 'arrive') {
        r.arriveFired = 'k';
        shown.push(now);
      }
    });
    return shown;
  };

  it('a destination next to the start does not «arrive» at the start', () => {
    const r: Arr = {};
    // Start 0,05 nm from the marina, out to 3 nm and back.
    const shown = run(r, [0.05, 0.3, 0.55, 1.5, 3, 1.5, 0.45, 0.08]);
    expect(shown).toEqual([6 * 60_000]);
    expect(r.arriveArmed).toBe('k');
    expect(r.arrivedAt).toBe(7 * 60_000);
  });

  it('never armed (staying in the bay): no alert and no arrival', () => {
    const r: Arr = {};
    expect(run(r, [0.05, 0.4, 0.58, 0.2, 0.05])).toEqual([]);
    expect(r.arrivedAt).toBeUndefined();
    expect(arriveStep({}, { key: 'k', leftNm: 0.3, toLastNm: 0.3, hasFix: true, now: 0 })).toEqual({});
    // No fix or no destination: nothing.
    expect(arriveStep({}, { key: 'k', leftNm: 3, hasFix: false, now: 0 })).toEqual({});
    expect(arriveStep({}, { leftNm: 3, hasFix: true, now: 0 })).toEqual({});
  });

  it('«ΦΤΑΝΕΙΣ» once, also after a reload (a new engine, the session kept)', () => {
    const r: Arr = {};
    expect(run(r, [2, 1, 0.4])).toHaveLength(1);
    expect(r.arriveFired).toBe('k');
    // Reload: fresh engine, same session fields.
    expect(run(r, [0.4, 0.3, 0.2], newEngine(), 600_000)).toEqual([]);
    expect(arriveStep(r, { key: 'k', leftNm: 0.2, hasFix: true, now: 0 }).alertNm).toBeUndefined();
    // A new destination (destPatch) clears both, so it arms again.
    const cleared = { ...r, ...destPatch({ kind: 'point', point: { name: 'Αίγινα', ...P(10) } }) };
    expect(cleared).toMatchObject({ arriveArmed: undefined, arriveFired: undefined, arrivedAt: undefined });
  });

  it('summary arrival: not at a start next to the destination', () => {
    const marina = P(0);
    const sail = [P(0.02), P(0.3), P(2), P(3), P(1), P(0.05)].map((q, i) => ({ ...q, t: T0 + i * 60_000 }));
    expect(arrivalTime(sail, [marina])).toBe(T0 + 5 * 60_000);
    // Never left the bay: no arrival.
    expect(arrivalTime(sail.slice(0, 2), [marina])).toBeUndefined();
  });
});

describe('estimate speed is robust to GPS jumps (P-036 QA fix)', () => {
  const cruise = (i: number, track: TrackPoint[], minutes = 60): Race => {
    const r = newSession('cruise', { id: `c${i}`, now: T0 + i * 86_400_000, entries: [] });
    return { ...r, track: track.map((q) => ({ ...q, t: r.start + q.t })), status: 'finished', finish: r.start + minutes * 60_000 };
  };
  const steady = (kt: number): TrackPoint[] => Array.from({ length: 11 }, (_, i) => ({ ...P((i / 10) * kt), t: i * 360_000, sog: kt }));

  // 10′ at 5 kn, a point every 30″, with the position jumping 1,5 nm back and forth (each
  // jump under the 2 nm filter of the distance): the mean alone would be ~180 kn.
  const jumpy = (withSog: boolean): TrackPoint[] =>
    Array.from({ length: 21 }, (_, i) => ({ ...P((i * 5) / 120 + (i % 2) * 1.5), t: i * 30_000, ...(withSog ? { sog: 5 } : {}) }));

  it('a jumpy track counts at its best 30″ mean', () => {
    const r = cruise(1, jumpy(true), 10);
    expect(sessionStats(r).avgKt!).toBeGreaterThan(100);
    expect(estimateKt([r])).toBeCloseTo(5, 5);
  });

  it('without speeds an absurd mean is ignored; the result stays within 2–15 kn', () => {
    expect(estimateKt([cruise(1, jumpy(false), 10)])).toBe(CRUISE_DEFAULT_KT);
    expect(estimateKt([cruise(1, steady(1))])).toBe(2);
    expect(estimateKt([cruise(1, steady(18))])).toBe(ESTIMATE_MAX_KT);
  });
});

describe('ETA frozen by a pause (P-036 QA fix)', () => {
  it('the same in every view: from the track before the pause', () => {
    const track: TrackPoint[] = Array.from({ length: 11 }, (_, i) => ({ ...P(i * 0.5), t: T0 + i * 300_000, sog: 6 }));
    const from = T0 + 10 * 300_000 + 20_000;
    const e = pausedEta(track, [P(11)], 0, from)!;
    // 6 nm left at 6 kn: one hour after the pause began.
    expect(Math.abs(e.sec - 3600)).toBeLessThan(10);
    expect(Math.abs(e.at - (from + 3600_000))).toBeLessThan(10_000);
    // Points after the pause began do not count.
    expect(pausedEta([...track, { ...P(10.9), t: from + 60_000, sog: 1 }], [P(11)], 0, from)).toEqual(e);
    expect(pausedEta([], [P(11)], 0, from)).toBeUndefined();
  });
});
