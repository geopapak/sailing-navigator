import { describe, expect, it } from 'vitest';
import type { Race, TrackPoint } from './types';
import {
  activeIntervals,
  activeMs,
  addLap,
  analysisBody,
  bandOf,
  bestLap,
  cardOrder,
  fitShare,
  goalSub,
  kindSpans,
  lapStats,
  legOfTwa,
  liveLaps,
  manoeuvreStats,
  mss,
  newManoeuvres,
  noteLap,
  pctByLegAndBand,
  recoverySec,
  recoveryDone,
  trainingShare,
  trainingSummary,
  undoLap,
  isTrainingShare,
  MAX_SHARE_BYTES,
} from './training';
import { activeSpans, closePausesAt, isPaused, pauseAt, pausedMs, resumeAt, subtract, trackSegments } from './pauses';
import { finishAt, finishNow, sessionStats, switchKind } from './session';
import { analyseRace, toCsv, toGpx } from './analysis';
import { trackGap } from './gaps';
import { forgottenPrompt } from './idle';

const T0 = Date.UTC(2026, 10, 13, 9, 0, 0);
const S = 1000;
const M = 60_000;

const race = (p: Partial<Race> = {}): Race => ({
  id: 't1',
  name: 'Προπόνηση',
  kind: 'training',
  marks: [],
  start: T0,
  scoringOptionId: '',
  method: 'ToT',
  entries: [{ id: 'own', name: 'Εμείς', own: true, source: 'own' }],
  status: 'running',
  track: [],
  fixes: [],
  updatedAt: T0,
  ...p,
});

/** A point every 15″ moving north ~6 kn, with % of target and wind. */
const pt = (sec: number, o: Partial<TrackPoint> = {}): TrackPoint => ({
  t: T0 + sec * S,
  lat: 37.9 + (sec / 3600) * (6 / 60),
  lon: 23.6,
  sog: 6,
  twa: 42,
  tws: 10,
  pct: 0.95,
  src: 'instruments',
  ...o,
});
const every15 = (fromSec: number, toSec: number, o: Partial<TrackPoint> = {}) => {
  const out: TrackPoint[] = [];
  for (let s = fromSec; s <= toSec; s += 15) out.push(pt(s, o));
  return out;
};

describe('pauses', () => {
  it('pauses and resumes training and cruise, never a race', () => {
    const r = race();
    const p = pauseAt(r, T0 + 10 * M)!;
    expect(p.pauses).toEqual([{ from: T0 + 10 * M }]);
    const paused = { ...r, ...p };
    expect(isPaused(paused)).toBe(true);
    expect(pauseAt(paused, T0 + 11 * M)).toBeUndefined();
    const back = { ...paused, ...resumeAt(paused, T0 + 15 * M)! };
    expect(isPaused(back)).toBe(false);
    expect(back.pauses).toEqual([{ from: T0 + 10 * M, to: T0 + 15 * M }]);
    expect(pauseAt(race({ kind: 'race' }), T0)).toBeUndefined();
    expect(pauseAt(race({ kind: undefined }), T0)).toBeUndefined();
    expect(pauseAt(race({ kind: 'cruise' }), T0)).toBeDefined();
  });

  it('subtracts paused time', () => {
    const r = race({ pauses: [{ from: T0 + 10 * M, to: T0 + 15 * M }, { from: T0 + 50 * M }] });
    expect(pausedMs(r, T0 + 60 * M)).toBe(15 * M);
    expect(activeSpans(r, T0 + 60 * M)).toEqual([
      { from: T0, to: T0 + 10 * M },
      { from: T0 + 15 * M, to: T0 + 50 * M },
    ]);
    expect(subtract({ from: 0, to: 10 }, [{ from: 2, to: 4 }, { from: 8, to: 20 }])).toEqual([
      { from: 0, to: 2 },
      { from: 4, to: 8 },
    ]);
  });

  it('closes an open pause when the session ends in it (AC 18)', () => {
    const r = race({ pauses: [{ from: T0 + 10 * M }], track: every15(0, 600) });
    const done = finishNow(r, T0 + 30 * M);
    expect(done.pauses).toEqual([{ from: T0 + 10 * M, to: T0 + 30 * M }]);
    const atMove = finishAt(race({ pauses: [{ from: T0 + 10 * M, to: T0 + 12 * M }, { from: T0 + 40 * M }] }), T0 + 20 * M, T0 + 60 * M);
    expect(atMove.pauses).toEqual([{ from: T0 + 10 * M, to: T0 + 12 * M }]);
    expect(closePausesAt(undefined, T0)).toBeUndefined();
  });

  it('cuts the track at pauses: no distance over a pause, one <trkseg> each (AC 16)', () => {
    // 10 minutes sailing, a pause of 20 minutes while drifting far, 10 more minutes.
    const before = every15(0, 600);
    const after = every15(1800, 2400).map((p) => ({ ...p, lat: p.lat + 0.5 }));
    const r = race({ track: [...before, ...after], pauses: [{ from: T0 + 601 * S, to: T0 + 1799 * S }], finish: T0 + 2400 * S, status: 'finished' });
    expect(trackSegments(r)).toHaveLength(2);
    const s = sessionStats(r);
    expect(s.durationSec).toBeCloseTo(2400 - 1198, 0);
    expect(s.pausedSec).toBeCloseTo(1198, 0);
    // 2 × 10′ at 6 kn = 2 nm (the 0.5° jump over the pause is not counted).
    expect(s.distanceNm).toBeCloseTo(2, 1);
    expect(analyseRace(r).sailedNm).toBeCloseTo(2, 1);
    expect(analyseRace(r).durationSec).toBeCloseTo(1202, 0);
    const gpx = toGpx(r);
    expect(gpx.match(/<trkseg>/g)).toHaveLength(2);
    const csv = toCsv(r).trim().split('\n');
    expect(csv[0].endsWith(',segment')).toBe(true);
    expect(csv[csv.length - 1].endsWith(',2')).toBe(true);
    // Without pauses the CSV keeps its columns and the GPX one segment.
    const plain = race({ track: before });
    expect(toCsv(plain).split('\n')[0].includes('segment')).toBe(false);
    expect(toGpx(plain).match(/<trkseg>/g)).toHaveLength(1);
  });

  it('looks for no gap and asks nothing while paused; resuming is not a gap (AC 17)', () => {
    const track = every15(0, 600, { sog: 0 });
    const paused = race({ track, pauses: [{ from: T0 + 600 * S }] });
    expect(trackGap(paused, T0 + 3 * 3600 * S)).toBe(0);
    expect(forgottenPrompt(paused, T0 + 3 * 3600 * S)).toBeUndefined();
    const resumed = race({ track, pauses: [{ from: T0 + 600 * S, to: T0 + 3 * 3600 * S }] });
    expect(trackGap(resumed, T0 + 3 * 3600 * S + 30 * S)).toBe(0);
    expect(forgottenPrompt(resumed, T0 + 3 * 3600 * S + 60 * S)).toBeUndefined();
    // The 24-hour question still comes during a pause.
    expect(forgottenPrompt(paused, T0 + 25 * 3600 * S)?.kind).toBe('stale');
  });
});

describe('kind spans and active intervals', () => {
  it('reads the kind log: training, then cruise, then training', () => {
    const r = race({ kindLog: [{ kind: 'cruise', at: T0 + 30 * M }, { kind: 'training', at: T0 + 50 * M }], kind: 'training' });
    expect(kindSpans(r, T0 + 60 * M).map((k) => k.kind)).toEqual(['training', 'cruise', 'training']);
    expect(activeIntervals(r, { now: T0 + 60 * M, kindOnly: 'training' })).toEqual([
      { from: T0, to: T0 + 30 * M },
      { from: T0 + 50 * M, to: T0 + 60 * M },
    ]);
    // A cruise that became training.
    const c = race({ kind: 'training', kindLog: [{ kind: 'training', at: T0 + 10 * M }] });
    expect(kindSpans(c, T0 + 20 * M).map((k) => k.kind)).toEqual(['cruise', 'training']);
  });

  it('the bar clock leaves the pauses out', () => {
    const r = race({ pauses: [{ from: T0 + 5 * M, to: T0 + 8 * M }] });
    expect(activeMs(r, T0 + 10 * M)).toBe(7 * M);
  });
});

describe('laps', () => {
  it('adds a lap, ignores a double tap within 3″, undoes the last one', () => {
    let r = race();
    r = { ...r, ...addLap(r, T0 + 6 * M, { sail: 'Τζένοα', helm: 'Α' })! };
    expect(r.laps).toEqual([{ t: T0, sail: 'Τζένοα' }, { t: T0 + 6 * M, sail: 'Τζένοα', helm: 'Α' }]);
    expect(addLap(r, T0 + 6 * M + 2 * S)).toBeUndefined();
    r = { ...r, ...addLap(r, T0 + 13 * M)! };
    expect(r.laps).toHaveLength(3);
    r = { ...r, ...undoLap(r)! };
    expect(r.laps).toHaveLength(2);
    r = { ...r, ...undoLap(r)! };
    // Lap 1 keeps its note (the sail); there is no lap limit left to undo.
    expect(r.laps).toEqual([{ t: T0, sail: 'Τζένοα' }]);
    expect(undoLap(r)).toBeUndefined();
    expect(undoLap({ ...r, laps: [{ t: T0 }, { t: T0 + M }] })).toEqual({ laps: undefined });
  });

  it('a new lap starts with the helm of the lap before (AC 11, QA Φ3)', () => {
    let r = race({ laps: [{ t: T0, helm: 'Α' }] });
    r = { ...r, ...addLap(r, T0 + 6 * M)! };
    expect(r.laps![1].helm).toBe('Α');
    // A helm given with the press wins.
    expect(addLap(r, T0 + 12 * M, { helm: 'Γ' })!.laps![2].helm).toBe('Γ');
    // No helm yet: none is made up.
    expect(addLap(race(), T0 + 6 * M)!.laps![1].helm).toBeUndefined();
  });

  it('the note of the lap that just closed also gives its helm to the running lap', () => {
    // «Γύρος» first, then the note on lap 1, with lap 2 already running.
    let r = race();
    r = { ...r, ...addLap(r, T0 + 6 * M)! };
    r = { ...r, ...noteLap(r, 1, { helm: 'Β' }) };
    expect(r.laps!.map((l) => l.helm)).toEqual(['Β', 'Β']);
    // A correction follows too, as lap 2 only carried it over …
    r = { ...r, ...noteLap(r, 1, { helm: 'Γ' }) };
    expect(r.laps!.map((l) => l.helm)).toEqual(['Γ', 'Γ']);
    // … and the next lap carries it on.
    r = { ...r, ...addLap(r, T0 + 12 * M)! };
    expect(r.laps![2].helm).toBe('Γ');
    // The running lap with a helm of its own keeps it.
    r = { ...r, ...noteLap(r, 3, { helm: 'Α' }) };
    r = { ...r, ...noteLap(r, 2, { helm: 'Β' }) };
    expect(r.laps!.map((l) => l.helm)).toEqual(['Γ', 'Β', 'Α']);
    // An older lap does not touch the running one.
    r = { ...r, ...noteLap(r, 1, { helm: 'Β' }) };
    expect(r.laps![2].helm).toBe('Α');
    // Notes without a helm leave the running lap alone.
    expect(noteLap(r, 2, { trim: 'x' }).laps![2]).toEqual(r.laps![2]);
  });

  it('notes a lap, trim at most 60 characters', () => {
    const r = race({ laps: [{ t: T0 }, { t: T0 + 6 * M }] });
    const n = noteLap(r, 1, { helm: 'Β', trim: 'x'.repeat(80) });
    expect(n.laps![0].helm).toBe('Β');
    expect(n.laps![0].trim).toHaveLength(60);
    expect(noteLap(r, 5, { helm: 'Α' })).toEqual({});
  });

  it('lap times leave out pauses and cruise stretches, with the mean % per lap', () => {
    const track = [...every15(0, 420, { pct: 0.92 }), ...every15(435, 780, { pct: 0.97 })];
    const r = race({
      track,
      laps: [{ t: T0, helm: 'Α' }, { t: T0 + 420 * S, helm: 'Β', trim: 'μπάρμπας +2 εκ.' }],
      pauses: [{ from: T0 + 500 * S, to: T0 + 560 * S }],
      finish: T0 + 780 * S,
      status: 'finished',
      manoeuvres: [],
    });
    const laps = lapStats(r);
    expect(laps.map((l) => l.sec)).toEqual([420, 300]);
    expect(laps[0]).toMatchObject({ n: 1, pct: 92, helm: 'Α' });
    expect(laps[1]).toMatchObject({ n: 2, pct: 97, helm: 'Β', trim: 'μπάρμπας +2 εκ.' });
    expect(bestLap(laps)).toBe(2);
    expect(bestLap([laps[0]])).toBeUndefined();
  });

  it('without laps: one lap, the whole training (AC 24)', () => {
    const r = race({ track: every15(0, 600), finish: T0 + 600 * S, status: 'finished' });
    expect(lapStats(r)).toHaveLength(1);
    expect(lapStats(r)[0].sec).toBe(600);
  });

  it('live laps: the running one stops in a pause', () => {
    const r = race({ laps: [{ t: T0 }, { t: T0 + 5 * M }], pauses: [{ from: T0 + 7 * M }] });
    const l = liveLaps(r, T0 + 20 * M);
    expect(l.done).toEqual([{ n: 1, sec: 300 }]);
    expect(l.current).toMatchObject({ n: 2, sec: 120 });
    expect(liveLaps(race(), T0 + 90 * S).current).toMatchObject({ n: 1, sec: 90 });
  });
});

describe('% of target', () => {
  it('per leg and 4-knot band, without the 25″ after each manoeuvre', () => {
    const up = every15(0, 300, { twa: 42, tws: 9, pct: 0.95 });
    // A tack at 300″: the point at 315″ (low %) is not counted, 330″ is.
    const after = [pt(315, { twa: -42, tws: 9, pct: 0.5 }), ...every15(330, 600, { twa: -42, tws: 9, pct: 0.95 })];
    const down = every15(615, 900, { twa: 150, tws: 13, pct: 0.91 });
    const r = race({ track: [...up, ...after, ...down], manoeuvres: [{ t: T0 + 300 * S, kind: 'tack' }], finish: T0 + 900 * S, status: 'finished' });
    const tab = pctByLegAndBand(r);
    expect(tab).toHaveLength(6);
    expect(tab.find((c) => c.leg === 'upwind' && c.band === '8–12')?.pct).toBe(95);
    expect(tab.find((c) => c.leg === 'downwind' && c.band === '12–16')?.pct).toBe(91);
    expect(tab.find((c) => c.leg === 'reach' && c.band === '8–12')?.pct).toBeNull();
    expect(bandOf(8)).toBe('8–12');
    expect(bandOf(11.9)).toBe('8–12');
    expect(legOfTwa(-70)).toBe('reach');
    expect(legOfTwa(121)).toBe('downwind');
  });
});

describe('manoeuvres and recovery to 90%', () => {
  const samples = (t: number, pcts: number[], every = 2) => pcts.map((pct, i) => ({ t: t + (i + 1) * every * S, pct }));

  it('measures until the 15″ mean after the manoeuvre is back at ≥ 90%', () => {
    // Drops to 70%, climbs 5% every 2″.
    const s = samples(T0, [70, 75, 80, 85, 90, 95, 100, 100, 100, 100, 100]);
    const r = recoverySec(s, T0)!;
    expect(r).toBeGreaterThan(10);
    expect(r).toBeLessThan(24);
    expect(recoveryDone(s, T0, T0 + 30 * S)).toBe(true);
  });

  it('no recovery within 90″ is «>1:30»', () => {
    const s = samples(T0, Array.from({ length: 60 }, () => 80));
    expect(recoverySec(s, T0)).toBeUndefined();
    expect(recoveryDone(s, T0, T0 + 60 * S)).toBe(false);
    expect(recoveryDone(s, T0, T0 + 91 * S)).toBe(true);
  });

  it('finds new manoeuvres in the dense samples once', () => {
    const tw = [...Array.from({ length: 20 }, (_, i) => ({ t: T0 + i * 2 * S, twa: 40 })), ...Array.from({ length: 20 }, (_, i) => ({ t: T0 + 40 * S + i * 2 * S, twa: -40 }))];
    const found = newManoeuvres(tw, []);
    expect(found).toEqual([{ t: T0 + 40 * S, kind: 'tack' }]);
    expect(newManoeuvres(tw, [{ t: T0 + 42 * S }])).toEqual([]);
  });

  it('stats per kind: count, mean and best recovery', () => {
    const r = race({
      manoeuvres: [
        { t: T0 + M, kind: 'tack', recoverSec: 20 },
        { t: T0 + 3 * M, kind: 'tack', recoverSec: 14 },
        { t: T0 + 5 * M, kind: 'tack' },
        { t: T0 + 7 * M, kind: 'gybe', recoverSec: 17 },
      ],
      finish: T0 + 10 * M,
      status: 'finished',
    });
    expect(manoeuvreStats(r)).toEqual([
      { kind: 'tack', count: 3, avgRecoverSec: 17, bestRecoverSec: 14 },
      { kind: 'gybe', count: 1, avgRecoverSec: 17, bestRecoverSec: 17 },
    ]);
  });
});

describe('summary and crew share', () => {
  const shared = () =>
    race({
      name: 'Πρωινή',
      goal: 'tacks',
      crewNote: 'Καλή δουλειά',
      track: [...every15(0, 1800, { tws: 9 }), ...every15(1815, 3600, { tws: 15, twa: 150, src: 'phone' })],
      kindLog: [{ kind: 'cruise', at: T0 + 1800 * S }],
      kind: 'cruise',
      laps: [{ t: T0, helm: 'Α' }, { t: T0 + 900 * S, helm: 'Β' }],
      manoeuvres: [{ t: T0 + 600 * S, kind: 'tack', recoverSec: 18 }, { t: T0 + 2400 * S, kind: 'gybe', recoverSec: 12 }],
      pauses: [{ from: T0 + 1200 * S, to: T0 + 1260 * S }],
      finish: T0 + 3600 * S,
      status: 'finished',
    });

  it('summary of the whole session, without the pauses', () => {
    const s = trainingSummary(shared());
    expect(s.durationSec).toBe(3540);
    expect(s.pausedSec).toBe(60);
    expect(s.twsMin).toBe(9);
    expect(s.twsMax).toBe(15);
    expect(s.manoeuvres.find((m) => m.kind === 'gybe')?.count).toBe(1);
    expect(s.trainingUntil).toBeUndefined();
  });

  it('the crew share holds only the training part, and no position (AC 26, 27)', () => {
    const sh = trainingShare(shared());
    expect(sh.kind).toBe('training');
    expect(sh.goal).toBe('tacks');
    expect(sh.note).toBe('Καλή δουλειά');
    expect(sh.summary.durationSec).toBe(1740);
    expect(sh.summary.twsMax).toBe(9);
    expect(sh.summary.trainingUntil).toBe(T0 + 1800 * S);
    expect(sh.summary.manoeuvres.find((m) => m.kind === 'gybe')?.count).toBe(0);
    expect(sh.summary.laps.map((l) => l.sec)).toEqual([900, 840]);
    const json = JSON.stringify(sh);
    for (const k of ['lat', 'lon', 'track', 'marks', 'fixes']) expect(json.includes(`"${k}"`)).toBe(false);
    expect(isTrainingShare(sh)).toBe(true);
    expect(isTrainingShare({ name: 'Αγώνας', marks: [] })).toBe(false);
  });

  it('over 32 KB the oldest laps lose their trim notes first', () => {
    const laps = Array.from({ length: 100 }, (_, i) => ({ n: i + 1, sec: 300, pct: 90, helm: 'Α' as const, trim: 'τ'.repeat(60) }));
    const sh = fitShare({ kind: 'training', name: 'x', start: T0, goal: 'free', summary: { ...trainingSummary(race()), laps } }, 10_000);
    expect(sh.summary.laps[0].trim).toBeUndefined();
    expect(sh.summary.laps[99].trim).toBeDefined();
    expect(new TextEncoder().encode(JSON.stringify(sh)).length).toBeLessThanOrEqual(10_000);
    expect(MAX_SHARE_BYTES).toBe(32 * 1024);
  });

  it('/analysis gets the summary with goal and name, kind training', () => {
    const b = analysisBody(shared());
    expect(b.kind).toBe('training');
    expect(b.summary.goal).toBe('tacks');
    expect(b.summary.name).toBe('Πρωινή');
    expect(JSON.stringify(b).includes('"lat"')).toBe(false);
  });

  it('marks numbers as indicative without instruments', () => {
    const r = race({ track: every15(0, 600, { src: 'phone' }), finish: T0 + 600 * S, status: 'finished' });
    expect(trainingSummary(r).indicative).toBe(true);
    expect(trainingSummary(shared()).indicative).toBe(false);
  });
});

describe('texts and order', () => {
  it('orders the summary cards by «Τι δουλεύουμε» (AC 21)', () => {
    expect(cardOrder('tacks')).toEqual(['manoeuvres', 'laps', 'pct', 'track']);
    expect(cardOrder('downwind')).toEqual(['pct', 'laps', 'manoeuvres', 'track']);
    expect(cardOrder('starts')).toEqual(['laps', 'pct', 'manoeuvres', 'track']);
  });
  it('bar subtitle and times', () => {
    expect(goalSub('free')).toBe('Ελεύθερη προπόνηση');
    expect(goalSub('upwind')).toBe('Ταχύτητα όρτσα');
    expect(mss(402)).toBe('6:42');
    expect(mss(3725)).toBe('1:02:05');
  });
  it('switching to training starts the live manoeuvre list', () => {
    const c = race({ kind: 'cruise' });
    expect(switchKind(c, 'training', T0 + M)?.manoeuvres).toEqual([]);
  });
});
