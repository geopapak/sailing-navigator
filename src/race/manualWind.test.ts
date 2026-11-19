import { describe, expect, it } from 'vitest';
import {
  ADVISOR_NOTE,
  COG_HOLD_MS,
  LOG_MAX,
  advisorWind,
  ageMin,
  ageWords,
  fmtAge,
  fmtBoth,
  fmtDir,
  fmtTwsField,
  fmtWind,
  fmtWindFrom,
  fromDisplay,
  isStale,
  laylineWind,
  liveNumbersOf,
  logEntry,
  manualMinutes,
  manualNote,
  manualSpans,
  markTyped,
  newCourseState,
  parseTwd,
  parseTws,
  prefill,
  pushLog,
  quickTwd,
  quickWind,
  stepCourse,
  stepTwd,
  stepTws,
  toDisplay,
  windFromOf,
  type CourseInput,
  type CourseState,
  type LiveInputs,
  type QuickWindState,
} from './manualWind';
import { computeLive } from '../performance/targets';
import { magToTrue, twaFromTwd } from '../performance/angles';
import { TRE_IRENE } from '../boat/treIrene';
import { DEFAULT_ALERTS, DEFAULT_TRAINING_ALERTS, newEngine, profileFor, step, type Situation } from './alerts';
import { trainingShare, trainingSummary } from './training';
import { analyseRace, analysisSummary, toCsv } from './analysis';
import type { ManualWind, Race, TrackPoint } from './types';
import { getSessionSnapshot, setLiveSnapshot } from '../ai/snapshot';
import { sheetMode } from '../ui/hooks';
import { liveWindTags } from '../ui/sessionText';

const M = 60_000;
const T0 = Date.UTC(2026, 10, 14, 8, 0, 0);
const MAG5 = { manualMagnetic: true, declination: 5 };
const TRUE = { manualMagnetic: false, declination: 5 };

describe('age and «παλιός» (AC 4, 19)', () => {
  it('minutes since the last change, never negative', () => {
    expect(ageMin(T0, T0 + 59_000)).toBe(0);
    expect(ageMin(T0, T0 + 12 * M + 30_000)).toBe(12);
    expect(ageMin(T0, T0 - 5 * M)).toBe(0); // clock set back: «τώρα»
  });
  it('W10–W12 and A01–A03', () => {
    expect(fmtAge(0)).toBe('τώρα');
    expect(fmtAge(12)).toBe('πριν από 12′');
    expect(fmtAge(65)).toBe('πριν από 1 ώ 05′');
    expect(fmtAge(180)).toBe('πριν από 3 ώ 00′');
    expect(ageWords(0)).toBe('τώρα');
    expect(ageWords(1)).toBe('πριν από 1 λεπτό');
    expect(ageWords(4)).toBe('πριν από 4 λεπτά');
    expect(ageWords(60)).toBe('πριν από 1 ώρα');
    expect(ageWords(61)).toBe('πριν από 1 ώρα και 1 λεπτό');
    expect(ageWords(125)).toBe('πριν από 2 ώρες και 5 λεπτά');
  });
  it('old at 15′', () => {
    expect(isStale(T0, T0 + 14 * M + 59_000)).toBe(false);
    expect(isStale(T0, T0 + 15 * M)).toBe(true);
  });
});

describe('°M ↔ °T and the steps (AC 15–16)', () => {
  it('220°M with +5° is stored 225°T and shown 220°M, «220°M = 225°T»', () => {
    const t = fromDisplay(220, MAG5);
    expect(t).toBe(225);
    expect(fmtDir(t, MAG5)).toBe('220°M');
    expect(fmtBoth(t, MAG5)).toBe('220°M = 225°T');
    // The setting changes to °T inside the session: only the display changes.
    expect(fmtDir(t, TRUE)).toBe('225°T');
    expect(fmtBoth(t, TRUE)).toBe('225°T = 220°M');
    expect(toDisplay(t, TRUE)).toBe(225);
  });
  it('TWD ± around the compass in the units on screen', () => {
    expect(stepTwd(358, 5, TRUE)).toBe(3);
    expect(stepTwd(2, -5, TRUE)).toBe(357);
    expect(stepTwd(225, 5, MAG5)).toBe(230); // 220°M + 5 = 225°M = 230°T
    expect(stepTwd(undefined, 1, TRUE)).toBe(1); // empty starts from 000
    expect(fmtDir(stepTwd(359.6, 0, TRUE), TRUE)).toBe('000°T');
  });
  it('TWS ± within 0–60, empty starts from 10; typed in half knots', () => {
    expect(stepTws(undefined, 1)).toBe(11);
    expect(stepTws(1, -2)).toBe(0);
    expect(stepTws(59, 2)).toBe(60);
    expect(parseTws('12,5')).toBe(12.5);
    expect(parseTws('12.3')).toBe(12.5);
    expect(parseTws('99')).toBe(60);
    expect(parseTws('x')).toBeUndefined();
    expect(parseTwd('220', MAG5)).toBe(225);
    expect(parseTwd('365', TRUE)).toBe(5);
    expect(fmtTwsField(12)).toBe('12');
    expect(fmtTwsField(12.5)).toBe('12,5');
  });
});

describe('course for the TWA: instrument heading, else GPS course with hysteresis (AC 17–18, 43)', () => {
  const run = (steps: [number, Partial<CourseInput>][]) => {
    let st: CourseState = newCourseState();
    return steps.map(([t, x]) => {
      const r = stepCourse(st, { instLive: false, declination: 5, ...x }, T0 + t);
      st = r.state;
      return r.course;
    });
  };
  it('the instruments heading counts at any speed, magnetic turned true first', () => {
    expect(run([[0, { instLive: true, hdgTrue: 180, sog: 0 }]])[0]).toEqual({ deg: 180, src: 'hdg' });
    expect(run([[0, { instLive: true, hdgMag: 175, variation: 4 }]])[0]).toEqual({ deg: 179, src: 'hdg' });
    expect(run([[0, { instLive: true, hdgMag: 175 }]])[0]).toEqual({ deg: 180, src: 'hdg' }); // settings declination
    // Not live: never the heading (and never the phone's compass).
    expect(run([[0, { instLive: false, hdgTrue: 180, cog: 90, sog: 0.5 }]])[0]).toEqual({});
  });
  it('COG from 2,5 kt, kept to 2 kt, then held 30″, back only at 2,5 kt', () => {
    const c = run([
      [0, { cog: 180, sog: 2.2 }], // not yet
      [2000, { cog: 180, sog: 2.6 }], // on
      [4000, { cog: 182, sog: 2.1 }], // still on (hysteresis)
      [6000, { cog: 182, sog: 1.8 }], // below 2: hold
      [3000 + COG_HOLD_MS, { cog: 100, sog: 1.8 }], // still within 30″ of the last good course
      [7000 + COG_HOLD_MS, { cog: 100, sog: 2.1 }], // past 30″, 2,1 kt is not enough
      [9000 + COG_HOLD_MS, { cog: 170, sog: 2.5 }], // back
    ]);
    expect(c[0]).toEqual({});
    expect(c[1]).toEqual({ deg: 180, src: 'cog' });
    expect(c[2]).toEqual({ deg: 182, src: 'cog' });
    expect(c[3]).toEqual({ deg: 182, src: 'hold' });
    expect(c[4]).toEqual({ deg: 182, src: 'hold' });
    expect(c[5]).toEqual({});
    expect(c[6]).toEqual({ deg: 170, src: 'cog' });
  });
  it('a lost COG is held the same 30″', () => {
    const c = run([
      [0, { cog: 180, sog: 5 }],
      [10_000, { sog: 5 }],
      [41_000, {}],
    ]);
    expect(c.map((x) => x.src)).toEqual(['cog', 'hold', undefined]);
  });
});

describe('first values of the sheet (AC 6–8)', () => {
  it('instruments, else the forecast (5° on screen, 1 kt), else none — never the last session', () => {
    expect(prefill({ live: true, twd: 201.6, tws: 13.8 }, { twd: 223, tws: 12.4, at: T0 }, MAG5)).toEqual({ twdTrue: 202, tws: 14, from: 'instruments' });
    // 223°T = 218°M → 220°M → 225°T
    expect(prefill({ live: false }, { twd: 223, tws: 12.4, at: T0 }, MAG5)).toEqual({ twdTrue: 225, tws: 12, from: 'forecast', at: T0 });
    expect(prefill({ live: true, tws: 10 }, undefined, MAG5)).toBeUndefined();
  });
});

describe('windLog (AC 9–13)', () => {
  it('keeps the first and the latest entries above 500', () => {
    let log = pushLog(undefined, logEntry('on', 0));
    for (let i = 1; i < LOG_MAX + 50; i++) log = pushLog(log, logEntry('set', i, { twdTrue: i % 360, tws: 10 }));
    expect(log).toHaveLength(LOG_MAX);
    expect(log[0].ev).toBe('on');
    expect(log[log.length - 1].at).toBe(LOG_MAX + 49);
  });
  it('spans from on to off, minutes of the session and the note (AC 34)', () => {
    const log = [logEntry('on', T0 + 10 * M), logEntry('set', T0 + 20 * M), logEntry('off', T0 + 40 * M), logEntry('on', T0 + 75 * M)];
    expect(manualSpans(log, T0 + 90 * M)).toEqual([
      { from: T0 + 10 * M, to: T0 + 40 * M },
      { from: T0 + 75 * M, to: T0 + 90 * M },
    ]);
    const m = manualMinutes({ windLog: log }, [{ from: T0, to: T0 + 90 * M }], T0 + 90 * M);
    expect(m).toEqual({ minutes: 45, ofMinutes: 90 });
    expect(manualNote(m)).toBe('Άνεμος χειροκίνητα σε 45′ από 1 ώ 30′: οι στόχοι και το % εκεί είναι ενδεικτικά.');
    expect(manualNote({ minutes: 30, ofMinutes: 30 })).toBe('Άνεμος χειροκίνητα σε όλη την έξοδο: οι στόχοι και το % είναι ενδεικτικά.');
    expect(manualMinutes({ windLog: [] }, [{ from: T0, to: T0 + M }], T0 + M)).toBeUndefined();
    // A pause in the middle does not count.
    expect(manualMinutes({ windLog: log }, [{ from: T0, to: T0 + 20 * M }], T0 + 90 * M)).toEqual({ minutes: 10, ofMinutes: 20 });
  });
});

/** 0.16.1's `getManualWind` + `useLiveNumbers`, to check that nothing moves with the manual wind off (AC 2). */
function legacy(i: LiveInputs, raw: QuickWindState) {
  const s = { windInput: 'twa', tws: 10, twa: 42, side: 'stbd', twd: null, ...raw } as Required<Omit<QuickWindState, 'windTypedAt'>>;
  const cog = i.fix?.cog;
  const manual =
    s.windInput === 'twa'
      ? { tws: s.tws ?? undefined, twa: s.twa === null ? undefined : s.side === 'port' ? -s.twa : s.twa }
      : s.twd === null || cog === undefined
        ? { tws: s.tws ?? undefined }
        : { tws: s.tws ?? undefined, twa: twaFromTwd(i.dir.manualMagnetic ? magToTrue(s.twd, i.dir.declination) : s.twd, cog) };
  const iv = i.inst.live ? i.inst.values : {};
  const tws = iv.tws ?? manual.tws;
  const twa = iv.twa ?? manual.twa;
  const bsp = iv.bsp ?? i.fix?.sog;
  const result = i.boat?.polar && tws !== undefined && twa !== undefined ? computeLive(i.boat, { tws, twa, bsp }) : null;
  return { result, withInst: i.inst.live && iv.tws !== undefined, bsp, bspFrom: iv.bsp !== undefined ? 'BSP' : 'SOG', windManual: iv.tws === undefined };
}

describe('Live numbers (D2)', () => {
  const base: LiveInputs = { boat: TRE_IRENE, inst: { live: false, values: {} }, fix: { sog: 5.8, cog: 180 }, course: {}, dir: MAG5, now: T0 };
  const inst = { live: true, values: { tws: 14, twd: 200, twa: 20, bsp: 6.2, hdgTrue: 180 } };
  const typed: QuickWindState[] = [
    { windTypedAt: T0, tws: 12, twa: 40, side: 'port' },
    { windTypedAt: T0, windInput: 'twd', twd: 220, tws: 9 },
    { windTypedAt: T0, windInput: 'twd', twd: null, tws: 9 },
    { windTypedAt: T0 },
  ];

  it('manual off: the same as 0.16.1 (instruments, or a «Γρήγορη ματιά» wind that was typed)', () => {
    for (const q of typed)
      for (const i of [base, { ...base, inst }, { ...base, inst: { live: true, values: { bsp: 6 } } }, { ...base, fix: undefined }]) {
        const n = liveNumbersOf({ ...i, quick: q, manual: { on: false, twdTrue: 90, tws: 30, at: T0 } });
        const o = legacy(i, q);
        expect({ result: n.result, withInst: n.withInst, bsp: n.bsp, bspFrom: n.bspFrom, windManual: n.windManual }).toEqual(o);
      }
  });

  it('no instruments and never typed: no wind, no 10 kt / 42° (AC 47)', () => {
    const n = liveNumbersOf({ ...base, quick: { tws: 10, twa: 42, side: 'stbd', windInput: 'twa' } });
    expect(n.windFrom).toBe('none');
    expect(n.result).toBeNull();
    expect(n.tws).toBeUndefined();
    expect(n.twa).toBeUndefined();
    expect(n.bsp).toBe(5.8);
    expect(n.bspFrom).toBe('SOG');
    expect(liveNumbersOf({ ...base }).windFrom).toBe('none');
  });

  it('manual on wins over the instruments; BSP stays the instruments; TWA from their heading (AC 22, 43)', () => {
    const m: ManualWind = { on: true, twdTrue: 230, tws: 10, at: T0 - 4 * M };
    const n = liveNumbersOf({ ...base, inst, manual: m, course: { deg: 180, src: 'hdg' } });
    expect(n.windFrom).toBe('manual');
    expect(n.withInst).toBe(false);
    expect(n.tws).toBe(10);
    expect(n.twdTrue).toBe(230);
    expect(n.twa).toBe(50);
    expect(n.bsp).toBe(6.2);
    expect(n.bspFrom).toBe('BSP');
    expect(n.result?.tws).toBe(10);
    expect(n.result).toEqual(computeLive(TRE_IRENE, { tws: 10, twa: 50, bsp: 6.2 }));
    expect(n.manualAgeMin).toBe(4);
    expect(n.stale).toBe(false);
    expect(liveNumbersOf({ ...base, manual: { ...m, at: T0 - 15 * M }, course: { deg: 180 } }).stale).toBe(true);
  });

  it('manual on without a course: TWD/TWS and age, no TWA, no targets (AC 18)', () => {
    const n = liveNumbersOf({ ...base, manual: { on: true, twdTrue: 225, tws: 12, at: T0 }, course: {} });
    expect(n.twa).toBeUndefined();
    expect(n.result).toBeNull();
    expect(n.tws).toBe(12);
    expect(n.manualAgeMin).toBe(0);
  });

  it('225°T on COG 180°T: TWA +45 (starboard); port negative (AC 17)', () => {
    expect(liveNumbersOf({ ...base, manual: { on: true, twdTrue: 225, tws: 12, at: T0 }, course: { deg: 180, src: 'cog' } }).twa).toBe(45);
    expect(liveNumbersOf({ ...base, manual: { on: true, twdTrue: 135, tws: 12, at: T0 }, course: { deg: 180, src: 'cog' } }).twa).toBe(-45);
  });

  it('where the wind comes from', () => {
    expect(windFromOf({ manualOn: true, instLive: true, instTws: 10, quickTyped: true })).toBe('manual');
    expect(windFromOf({ manualOn: false, instLive: true, instTws: 10, quickTyped: false })).toBe('instruments');
    expect(windFromOf({ manualOn: false, instLive: true, quickTyped: true })).toBe('quick');
    expect(windFromOf({ manualOn: false, instLive: false, quickTyped: false })).toBe('none');
  });
});

describe('«Γρήγορη ματιά» wind and windTypedAt (AC 46, 52)', () => {
  it('nothing without windTypedAt (0.16.1 live-state, defaults, instruments fill-ins)', () => {
    expect(quickWind(undefined, 180, MAG5)).toEqual({});
    expect(quickWind({ tws: 14, twa: 38, side: 'port' }, 180, MAG5)).toEqual({});
    expect(quickTwd({ windInput: 'twd', twd: 220 }, 180, MAG5)).toBeUndefined();
  });
  it('with windTypedAt: as in 0.16.1', () => {
    expect(quickWind({ windTypedAt: T0, tws: 14, twa: 38, side: 'port' }, 180, MAG5)).toEqual({ tws: 14, twa: -38 });
    expect(quickWind({ windTypedAt: T0, windInput: 'twd', twd: 220, tws: 9 }, 180, MAG5)).toEqual({ tws: 9, twa: 45 });
    expect(quickTwd({ windTypedAt: T0, windInput: 'twd', twd: 220 }, 180, MAG5)).toBe(225);
    expect(quickTwd({ windTypedAt: T0, twa: 40, side: 'stbd' }, 180, MAG5)).toBe(220);
  });
  it('only a change of TWS, TWA, side or TWD stamps it', () => {
    expect(markTyped({ tws: 12 }, T0)).toEqual({ tws: 12, windTypedAt: T0 });
    expect(markTyped({ side: 'port' }, T0).windTypedAt).toBe(T0);
    expect(markTyped({ twd: 220 }, T0).windTypedAt).toBe(T0);
    expect(markTyped({ windInput: 'twd' }, T0)).toEqual({ windInput: 'twd' });
    expect(markTyped({ bsp: 6 }, T0)).toEqual({ bsp: 6 });
    expect(markTyped({ sailId: 'J1' }, T0)).toEqual({ sailId: 'J1' });
  });
});

describe('laylines: the manual wind directly (AC 26, 47)', () => {
  const mean = { tws: 12, twd: 225 };
  it('+10° on the manual wind shows at once, not through the 4′ mean', () => {
    const m: ManualWind = { on: true, twdTrue: 225, tws: 12, at: T0 };
    expect(laylineWind({ manual: m, mean, inst: { tws: 14, twd: 200 } })).toEqual({ wind: 'manual', tws: 12, twd: 225 });
    expect(laylineWind({ manual: { ...m, twdTrue: 235 }, mean })).toEqual({ wind: 'manual', tws: 12, twd: 235 });
  });
  it('manual off: mean, then instruments, then forecast (as before)', () => {
    expect(laylineWind({ manual: { on: false, twdTrue: 90, tws: 5, at: 0 }, mean, inst: { tws: 14, twd: 200 } })?.wind).toBe('measured');
    expect(laylineWind({ inst: { tws: 14, twd: 200 }, forecast: mean })).toEqual({ wind: 'measured', tws: 14, twd: 200 });
    expect(laylineWind({ forecast: { tws: 8, twd: 300 } })).toEqual({ wind: 'forecast', tws: 8, twd: 300 });
    expect(laylineWind({})).toBeUndefined();
  });
  it('a session without wind: only the forecast', () => {
    expect(laylineWind({ noWind: true, mean, forecast: { tws: 8, twd: 300 } })).toEqual({ wind: 'forecast', tws: 8, twd: 300 });
    expect(laylineWind({ noWind: true, mean })).toBeUndefined();
  });
});

describe('alerts with the manual wind (AC 21, 25, 51)', () => {
  const sit: Situation = { now: 0, markIndex: 1, markName: 'Πάνω', isFinish: false, leg: 'up', board: 'stbd' };
  it('no wind shift and no «κάτω από 90%» without instruments (instTwd undefined, instruments false)', () => {
    const p = profileFor('training', { alerts: DEFAULT_ALERTS, raceShiftDeg: 7, training: { ...DEFAULT_TRAINING_ALERTS, below90: true }, cruiseAlerts: { shallow: true, arrive: true } });
    const st = newEngine();
    for (let t = 0; t <= 120_000; t += 2000) expect(step(st, DEFAULT_ALERTS, { ...sit, now: t, pct15: 70, instruments: false, instTwd: undefined }, p)).toBeUndefined();
  });
  it('the layline alert says the age of an old manual wind', () => {
    const a = step(newEngine(), DEFAULT_ALERTS, { ...sit, layInSec: 110, windAge: fmtAge(18) });
    expect(a?.sub).toBe('Layline αριστερών για Πάνω · πρόταση · άνεμος πριν από 18′');
    expect(step(newEngine(), DEFAULT_ALERTS, { ...sit, layInSec: 110 })?.sub).toBe('Layline αριστερών για Πάνω · πρόταση');
  });
});

describe('advisor (AC 37–38, 50)', () => {
  it('nav.windManual with age; nothing with the manual wind off', () => {
    expect(advisorWind({ on: true, twdTrue: 225.4, tws: 12, at: T0 }, T0 + 16 * M)).toEqual({ twdTrue: 225, tws: 12, ageMin: 16, stale: true, note: ADVISOR_NOTE });
    expect(advisorWind({ on: false, twdTrue: 225, tws: 12, at: T0 }, T0)).toBeUndefined();
    expect(ADVISOR_NOTE).toBe('Άνεμος που έβαλε το πλήρωμα με το χέρι, όχι μέτρηση.');
  });
  it('a session never takes a snapshot of the defaults nobody typed', () => {
    const ctx = { kind: 'live' as const, now: '', boat: { name: 'x', performanceFactor: 1, sails: [] } };
    setLiveSnapshot(ctx, 'default');
    expect(getSessionSnapshot(5)).toBeUndefined();
    setLiveSnapshot(ctx);
    expect(getSessionSnapshot(5)).toBeUndefined();
    setLiveSnapshot(ctx, 'manual');
    expect(getSessionSnapshot(5)?.wind).toBe('manual');
  });
});

describe('summary, analysis and CSV (AC 33–36)', () => {
  const pts = (n: number, o: Partial<TrackPoint> = {}): TrackPoint[] =>
    Array.from({ length: n }, (_, i) => ({ t: T0 + i * 15_000, lat: 37.9 + i * 0.0003, lon: 23.6, sog: 6, twa: 42, tws: 10, pct: 0.95, src: 'instruments', ...o }));
  const r = (p: Partial<Race>): Race => ({
    id: 'w1',
    name: 'Προπόνηση',
    kind: 'training',
    marks: [],
    start: T0,
    scoringOptionId: '',
    method: 'ToT',
    entries: [],
    status: 'finished',
    finish: T0 + 60 * M,
    track: pts(240),
    fixes: [],
    updatedAt: T0,
    ...p,
  });
  const log = [logEntry('on', T0 + 15 * M), logEntry('off', T0 + 45 * M)];

  it('training: windManual and indicative even with the instruments speed; the crew share has no manual wind', () => {
    const s = trainingSummary(r({ windLog: log }));
    expect(s.windManual).toEqual({ minutes: 30, ofMinutes: 60 });
    expect(s.indicative).toBe(true);
    expect(trainingSummary(r({})).windManual).toBeUndefined();
    expect(trainingSummary(r({})).indicative).toBe(false);
    const share = trainingShare(r({ windLog: log }));
    expect('windManual' in share.summary).toBe(false);
    expect(share.summary.indicative).toBe(true);
    expect(JSON.stringify(share)).not.toContain('windLog');
  });

  it('race analysis summary: windManual without positions or log', () => {
    const race = r({ kind: 'race', windLog: log });
    const sum = analysisSummary(race, analyseRace(race));
    expect(sum.windManual).toEqual({ minutes: 30, ofMinutes: 60 });
    expect(JSON.stringify(sum)).not.toMatch(/"(lat|lon|windLog)"/);
    expect('windManual' in analysisSummary(r({ kind: 'race' }), analyseRace(r({ kind: 'race' })))).toBe(false);
  });

  it('CSV column `wind`: manual or empty; GPX unchanged', () => {
    const race = r({ track: [...pts(2), ...pts(2, { wind: 'manual' }).map((p) => ({ ...p, t: p.t + 60_000 }))] });
    const rows = toCsv(race).trim().split('\n');
    expect(rows[0].endsWith(',src,wind')).toBe(true);
    expect(rows[1].endsWith(',')).toBe(true);
    expect(rows[3].endsWith(',manual')).toBe(true);
  });
});

describe('where the sheet opens (HANDOFF §5)', () => {
  it('bottom on phones, centred from 34em, side from 60em or on a low landscape screen', () => {
    expect(sheetMode(320, 640, 23)).toBe('bottom');
    expect(sheetMode(430, 932, 17)).toBe('bottom');
    expect(sheetMode(768, 1024, 17)).toBe('center');
    expect(sheetMode(768, 1024, 23)).toBe('bottom'); // «Πολύ μεγάλα»: still the phone layout
    expect(sheetMode(1024, 768, 17)).toBe('side');
    expect(sheetMode(1280, 800, 23)).toBe('center');
    expect(sheetMode(844, 390, 17)).toBe('side');
    expect(sheetMode(320, 640, 17)).toBe('bottom'); // portrait never takes the low-landscape rule
  });
});

describe('TWD with its unit everywhere and the small Live labels (QA P-053)', () => {
  it('«12 kt / 230°M» for the estimate and the layline line, any source', () => {
    expect(fmtWind(12.4, 235, MAG5)).toBe('12 kt / 230°M');
    expect(fmtWind(9.6, 235, TRUE)).toBe('10 kt / 235°T');
    expect(fmtWind(10, 3, MAG5)).toBe('10 kt / 358°M');
  });
  it('«Καιρός» cards: «12 kt από 230°M» (forecast TWD is °T)', () => {
    expect(fmtWindFrom(12.4, 235, MAG5)).toBe('12 kt από 230°M');
    expect(fmtWindFrom(12.4, 235, TRUE)).toBe('12 kt από 235°T');
    expect(fmtWindFrom(7.5, 2, MAG5)).toBe('8 kt από 357°M');
  });
  it('labels in the card wording; none for instruments or no wind', () => {
    expect(liveWindTags('manual')).toEqual({ twa: ' · άνεμος χειροκίνητα', tws: ' · χειροκίνητα' });
    expect(liveWindTags('quick')).toEqual({ twa: ' · άνεμος Γρήγορης ματιάς', tws: ' · Γρήγορη ματιά' });
    expect(liveWindTags('instruments')).toEqual({ twa: '', tws: '' });
    expect(liveWindTags('none')).toEqual({ twa: '', tws: '' });
  });
  it('manual on without a course: the TWS is still known for the small tile', () => {
    const n = liveNumbersOf({
      boat: TRE_IRENE,
      inst: { live: false, values: {} },
      course: {},
      dir: MAG5,
      now: T0,
      manual: { on: true, twdTrue: 225, tws: 12, at: T0 },
    });
    expect(n.result).toBeNull();
    expect(n.tws).toBe(12);
  });
});
