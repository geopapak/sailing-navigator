import { describe, expect, it } from 'vitest';
import type { Race, RaceEntry, RaceEvent, ResultCode } from './types';
import {
  RESULT_CODES,
  eventBoats,
  isCompleted,
  liveStanding,
  nextRaceSetup,
  openEvents,
  raceNumbers,
  raceResult,
  sailKeyOf,
  standing,
  unifyEntries,
  parseHms,
  elapsedFromClock,
  resultSource,
  type Standing,
} from './event';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 14, 9, 0, 0);

const ev = (p: Partial<RaceEvent> = {}): RaceEvent => ({
  id: 'ev',
  name: 'Διήμερος Σαρωνικού',
  scoring: 'points',
  discards: 0,
  discardFrom: 4,
  status: 'open',
  createdAt: T0,
  updatedAt: T0,
  ...p,
});

/** ToT 1,000 for everyone (corrected = elapsed), except where a boat gets its own. */
const entry = (id: string, p: Partial<RaceEntry> = {}, tot = 1): RaceEntry => ({
  id,
  name: id === 'own' ? 'Αύρα' : `Σκάφος ${id.toUpperCase()}`,
  sailNo: `GRE-${id}`,
  own: id === 'own',
  source: id === 'own' ? 'own' : 'boats',
  boat: { scoring: [{ id: 'coastal', label: 'Coastal', tod: 0, tot }] },
  ...p,
});

type Res = number | ResultCode | { est: number } | undefined;

/** A finished race on day `day` with elapsed seconds (or a code, or an estimate) per boat. */
function race(id: string, day: number, res: Record<string, Res>, p: Partial<Race> = {}): Race {
  const results: Record<string, number> = {};
  const resultCodes: Record<string, ResultCode> = {};
  const estAtFinish: Record<string, number> = {};
  for (const [k, v] of Object.entries(res)) {
    if (typeof v === 'number') results[k] = v;
    else if (typeof v === 'string') resultCodes[k] = v;
    else if (v) estAtFinish[k] = v.est;
  }
  const start = T0 + day * DAY;
  return {
    id,
    name: `Ιστιοδρομία ${id}`,
    kind: 'race',
    eventId: 'ev',
    marks: [],
    start,
    finish: start + 4 * 3600_000,
    scoringOptionId: 'coastal',
    method: 'ToT',
    entries: Object.keys(res).map((k) => entry(k)),
    status: 'finished',
    track: [],
    fixes: [],
    results,
    resultCodes,
    estAtFinish,
    updatedAt: start,
    ...p,
  };
}

const order = (s: Standing) => s.rows.map((r) => `${r.key}:${r.place}${r.tied ? '=' : ''}`);
const cell = (s: Standing, key: string, i: number) => s.rows.find((r) => r.key === key)!.cells[i];

describe('numbering and completed races (AC 7, 8, 33)', () => {
  it('counts the races that are not cancelled, by start; a held one gets a number', () => {
    const a = race('a', 0, { own: 100 });
    const b = race('b', 1, { own: 100 }, { finish: T0 + DAY - 1000 }); // cancelled before its start
    const c = race('c', 2, { own: 100 });
    const d = race('d', 3, {}, { status: 'planned', finish: undefined });
    expect(isCompleted(a)).toBe(true);
    expect(isCompleted(b)).toBe(false);
    expect(isCompleted(d)).toBe(false);
    expect(raceNumbers([d, c, b, a])).toEqual({ a: 1, c: 2, d: 3 });
    expect(raceNumbers([a, { ...b, held: true }, c])).toEqual({
      a: 1,
      b: 2,
      c: 3,
    });
    expect(isCompleted({ ...b, held: true })).toBe(true);
    // A new race with an earlier start goes before.
    const early = race('e', -1, {}, { status: 'planned', finish: undefined });
    expect(raceNumbers([a, c, early])).toEqual({ e: 1, a: 2, c: 3 });
  });
});

describe('boats of the event (AC 9, Π11)', () => {
  it('joins by id first, then by sail number regardless of spaces and case', () => {
    expect(sailKeyOf('GRE-1234')).toBe(sailKeyOf('gre 1234'));
    const r1 = race('a', 0, { own: 1, x: 1 });
    r1.entries[1].sailNo = 'GRE-1234';
    const r2 = race('b', 1, { own: 1, y: 1, z: 1 });
    r2.entries[1].sailNo = 'gre 1234';
    r2.entries[2].sailNo = undefined;
    const boats = eventBoats([r2, r1]);
    expect(boats.map((b) => b.key)).toEqual(['own', 'x', 'z']);
    expect(boats[1].ids).toEqual(['x', 'y']);
    // A new entry with a known sail number takes that boat's id.
    const fresh = unifyEntries([entry('own'), { ...entry('q'), sailNo: 'GRE 1234' }, entry('w')], eventBoats([r1]));
    expect(fresh.map((e) => e.id)).toEqual(['own', 'x', 'w']);
  });
});

describe('result of one race (AC 27–28, A7, A5.2)', () => {
  it('code, then time, then estimate «(εκτ.)», else «—»; missing from the race = DNC', () => {
    const r1 = race('a', 0, { own: 100, b: 200, c: 300, d: 400 });
    const r2 = race('b', 1, {
      own: 'DNF',
      b: 210,
      c: { est: 190 },
      e: undefined,
    });
    const boats = eventBoats([r1, r2]);
    const res = raceResult(r2, boats, 5).byKey;
    expect(res.own).toMatchObject({ code: 'DNF', points: 6 });
    expect(res.c).toMatchObject({
      corrected: 190,
      est: true,
      place: 1,
      points: 1,
    });
    expect(res.b).toMatchObject({ corrected: 210, place: 2, points: 2 });
    expect(res.d).toMatchObject({ code: 'DNC', points: 6 });
    expect(res.d.entryId).toBeUndefined();
    expect(res.e).toMatchObject({ missing: true, points: 6 });
    expect(raceResult(r2, boats, 5).official).toBe(false);
    expect(raceResult(r1, eventBoats([r1]), 4).official).toBe(true);
  });

  it('equal corrected time in whole seconds: «2=» and 2,5 points each, the next is 4th (A7, Π2)', () => {
    const r = race('a', 0, { own: 100, b: 200.4, c: 199.6, d: 300 });
    const res = raceResult(r, eventBoats([r]), 4).byKey;
    expect(res.b).toMatchObject({ place: 2, tied: true, points: 2.5 });
    expect(res.c).toMatchObject({ place: 2, tied: true, points: 2.5 });
    expect(res.d).toMatchObject({ place: 4, points: 4 });
  });

  it('ranks by corrected time (ToT), not elapsed', () => {
    const r = race('a', 0, { own: 1000, b: 1000 });
    r.entries[1] = entry('b', {}, 0.9);
    const res = raceResult(r, eventBoats([r]), 2).byKey;
    expect(res.b).toMatchObject({ corrected: 900, place: 1 });
    expect(res.own.place).toBe(2);
  });

  it('every code is N + 1; N = max(class size, known boats) (QA 9)', () => {
    const codes = RESULT_CODES;
    expect(codes).toEqual(['DNC', 'DNS', 'OCS', 'DNF', 'RET', 'DSQ', 'DNE']);
    const res: Record<string, Res> = { own: 100 };
    codes.slice(1).forEach((c, i) => (res[`b${i}`] = c));
    const r = race('a', 0, res);
    const sBig = standing(ev({ classSize: 12 }), [r]);
    expect(sBig.N).toBe(12);
    const sSmall = standing(ev({ classSize: 3 }), [r]);
    expect(sSmall.N).toBe(7);
    for (const row of sBig.rows.filter((x) => !x.own)) expect(row.cells[0].r.points).toBe(13);
    // 5 known boats, «Σκάφη στην κλάση» 12 → 13; 3 → 6.
    const five = race('f', 0, { own: 1, b: 'DNF', c: 2, d: 3, e: 4 });
    expect(standing(ev({ classSize: 12 }), [five]).rows.find((x) => x.key === 'b')!.total).toBe(13);
    expect(standing(ev({ classSize: 3 }), [five]).rows.find((x) => x.key === 'b')!.total).toBe(6);
  });
});

describe('standing, points (AC 31)', () => {
  it('3 races, 4 boats, two equal in race 2 (QA 3)', () => {
    const races = [
      race('a', 0, { own: 100, b: 110, c: 120, d: 130 }),
      race('b', 1, { own: 100, b: 120, c: 120, d: 130 }),
      race('c', 2, { own: 130, b: 100, c: 110, d: 120 }),
    ];
    const s = standing(ev(), races);
    expect(cell(s, 'b', 1).r).toMatchObject({
      points: 2.5,
      tied: true,
      place: 2,
    });
    expect(cell(s, 'd', 1).r).toMatchObject({ points: 4, place: 4 });
    // own 1+1+4 = 6; b 2+2,5+1 = 5,5; c 3+2,5+2 = 7,5; d 4+4+3 = 11
    expect(s.rows.map((r) => [r.key, r.total])).toEqual([
      ['b', 5.5],
      ['own', 6],
      ['c', 7.5],
      ['d', 11],
    ]);
    expect(order(s)).toEqual(['b:1', 'own:2', 'c:3', 'd:4']);
  });

  it('A8.1 does not break 1,3,2 vs 2,1,3 → A8.2: the last race, A ahead (QA 4)', () => {
    // own = Α: 1, 3, 2; b = Β: 2, 1, 3; c fills the places.
    const races = [race('a', 0, { own: 100, b: 110, c: 120 }), race('b', 1, { own: 120, b: 100, c: 110 }), race('c', 2, { own: 110, b: 120, c: 100 })];
    const s = standing(ev(), races);
    expect(s.rows.find((r) => r.key === 'own')!.total).toBe(6);
    expect(s.rows.find((r) => r.key === 'b')!.total).toBe(6);
    expect(s.rows.find((r) => r.key === 'c')!.total).toBe(6);
    // c: 3,2,1 → last race 1: first; then own (2) before b (3).
    expect(order(s)).toEqual(['c:1', 'own:2', 'b:3']);
    expect(s.tieBreaks).toEqual([
      { upper: 'Σκάφος C', lower: 'Αύρα', total: 6, rule: 'A8.2' },
      { upper: 'Αύρα', lower: 'Σκάφος B', total: 6, rule: 'A8.2' },
    ]);
  });

  it('A8.1 breaks the tie with the better scores', () => {
    // own 1,1,4 = 6; b 2,2,2 = 6 → own has the better 1.
    const races = [
      race('a', 0, { own: 100, b: 110, c: 120, d: 130 }),
      race('b', 1, { own: 100, b: 110, c: 120, d: 130 }),
      race('c', 2, { own: 140, b: 110, c: 100, d: 130 }),
    ];
    const s = standing(ev(), races);
    expect(s.rows.slice(0, 2).map((r) => [r.key, r.total, r.place])).toEqual([
      ['own', 6, 1],
      ['b', 6, 2],
    ]);
    expect(s.tieBreaks).toEqual([{ upper: 'Αύρα', lower: 'Σκάφος B', total: 6, rule: 'A8.1' }]);
  });

  it('A8.1 without the discarded score, A8.2 with it (QA 5)', () => {
    // D = 1 from K = 4. own: 1,4,1,2 → discard 4 → 4. b: 2,1,2,1 → discard 2 (oldest) → 4.
    // A8.1 kept: own 1,1,2 vs b 1,1,2 → equal. A8.2 last race: b 1 < own 2 → b ahead.
    const races = [
      race('a', 0, { own: 100, b: 110, c: 120, d: 130 }),
      race('b', 1, { own: 130, b: 100, c: 110, d: 120 }),
      race('c', 2, { own: 100, b: 110, c: 120, d: 130 }),
      race('d', 3, { own: 110, b: 100, c: 120, d: 130 }),
    ];
    const s = standing(ev({ discards: 1, discardFrom: 4 }), races);
    expect(s.discardsOn).toBe(true);
    const own = s.rows.find((r) => r.key === 'own')!;
    const b = s.rows.find((r) => r.key === 'b')!;
    expect(own.total).toBe(4);
    expect(b.total).toBe(4);
    expect(own.cells.map((c) => !!c.discarded)).toEqual([false, true, false, false]);
    // Equal worst (2 and 2): the oldest race is discarded (QA 7).
    expect(b.cells.map((c) => !!c.discarded)).toEqual([true, false, false, false]);
    expect(order(s).slice(0, 2)).toEqual(['b:1', 'own:2']);
  });

  it('discards 1 from 4: none with 3 completed races, one per boat with 4 (QA 6)', () => {
    const races = [0, 1, 2, 3].map((d) => race(`r${d}`, d, { own: 100 + d, b: 110 - d * 5 }));
    const three = standing(ev({ discards: 1, discardFrom: 4 }), races.slice(0, 3));
    expect(three.discardsOn).toBe(false);
    expect(three.rows.every((r) => r.cells.every((c) => !c.discarded))).toBe(true);
    const four = standing(ev({ discards: 1, discardFrom: 4 }), races);
    for (const r of four.rows) expect(r.cells.filter((c) => c.discarded)).toHaveLength(1);
    // 1 race with discards 1 from 4: nothing discarded.
    expect(standing(ev({ discards: 1, discardFrom: 4 }), races.slice(0, 1)).discardsOn).toBe(false);
  });

  it('DNE as the worst is never discarded: the next worst goes (QA 8)', () => {
    const races = [race('a', 0, { own: 'DNE', b: 100, c: 110 }), race('b', 1, { own: 120, b: 100, c: 110 }), race('c', 2, { own: 100, b: 110, c: 120 })];
    const s = standing(ev({ discards: 1, discardFrom: 2 }), races);
    const own = s.rows.find((r) => r.key === 'own')!;
    expect(own.cells.map((c) => !!c.discarded)).toEqual([false, true, false]);
    expect(own.total).toBe(4 + 1);
  });

  it('two discards from K = 3', () => {
    const races = [race('a', 0, { own: 300, b: 100 }), race('b', 1, { own: 300, b: 100 }), race('c', 2, { own: 100, b: 300 })];
    const s = standing(ev({ discards: 2, discardFrom: 3 }), races);
    expect(s.rows.find((r) => r.key === 'own')!.total).toBe(1);
    expect(s.rows.find((r) => r.key === 'b')!.total).toBe(1);
    // A8.1 kept: 1 vs 1; A8.2 last race: own 1 < b 2.
    expect(order(s)).toEqual(['own:1', 'b:2']);
  });

  it('equal in everything: they share the place «3=»', () => {
    const races = [race('a', 0, { own: 100, b: 110, c: 120, d: 120 })];
    const s = standing(ev(), races);
    expect(order(s)).toEqual(['own:1', 'b:2', 'c:3=', 'd:3=']);
    // A shared place is not a tie broken by A8: no line.
    expect(s.tieBreaks).toEqual([]);
  });

  it('a new opponent in race 2 is DNC in race 1 until it gets a time (QA 10)', () => {
    const r1 = race('a', 0, { own: 100, b: 110 });
    const r2 = race('b', 1, { own: 100, b: 110, n: 105 });
    const s = standing(ev(), [r1, r2]);
    expect(cell(s, 'n', 0).r).toMatchObject({ code: 'DNC', points: 4 });
    // With a time in race 1 (added to its entries by the results editor).
    const r1b = {
      ...r1,
      entries: [...r1.entries, entry('n')],
      results: { ...r1.results, n: 90 },
    };
    expect(cell(standing(ev(), [r1b, r2]), 'n', 0).r).toMatchObject({
      place: 1,
      points: 1,
    });
  });

  it('a cancelled race between two: no column, «held» brings it back with us DNC (QA 12)', () => {
    const r1 = race('a', 0, { own: 100, b: 110 });
    const r2 = race('b', 1, { own: undefined, b: undefined }, { finish: T0 + DAY - 60_000, results: {} });
    const r3 = race('c', 2, { own: 110, b: 100 });
    const s = standing(ev(), [r1, r2, r3]);
    expect(s.races.map((r) => [r.id, r.n])).toEqual([
      ['a', 1],
      ['c', 2],
    ]);
    const held = standing(ev(), [r1, { ...r2, held: true, results: { b: 120 } }, r3]);
    expect(held.races.map((r) => [r.id, r.n])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    expect(cell(held, 'own', 1).r).toMatchObject({ code: 'DNC', points: 3 });
    expect(cell(held, 'b', 1).r).toMatchObject({ place: 1 });
  });

  it('estimates and «—» count, and are flagged (Π6, Π7)', () => {
    const s = standing(ev(), [race('a', 0, { own: 100, b: { est: 90 }, c: undefined })]);
    expect(s.hasEst).toBe(true);
    expect(s.hasMissing).toBe(true);
    expect(cell(s, 'b', 0).r).toMatchObject({ est: true, place: 1 });
    expect(cell(s, 'c', 0).r).toMatchObject({ missing: true, points: 4 });
  });

  it('no completed race: no places', () => {
    const s = standing(ev(), [race('a', 0, { own: 1 }, { status: 'planned', finish: undefined })]);
    expect(s.races).toEqual([]);
    expect(s.rows.map((r) => r.place)).toEqual([undefined]);
  });
});

describe('standing, sum of corrected times (AC 32, Π3, Π4)', () => {
  it('group 1 by sum; a DNF goes after everyone with all times; group 2 by races done, then sum (QA 11)', () => {
    const races = [race('a', 0, { own: 1000, b: 1100, c: 900, d: 800, e: 'DNS' }), race('b', 1, { own: 1000, b: 1000, c: 'DNF', d: undefined, e: 'DNC' })];
    const s = standing(ev({ scoring: 'time', discards: 1, discardFrom: 1 }), races);
    expect(s.discardsOn).toBe(false);
    expect(s.rows.map((r) => [r.key, r.group, r.done, r.total, r.place])).toEqual([
      ['own', 1, 2, 2000, 1],
      ['b', 1, 2, 2100, 2],
      ['d', 2, 1, 800, 3],
      ['c', 2, 1, 900, 4],
      ['e', 2, 0, 0, 5],
    ]);
  });

  it('equal sums: the better place in the last race; else they share', () => {
    const races = [race('a', 0, { own: 1000, b: 900, c: 950 }), race('b', 1, { own: 900, b: 1000, c: 950 })];
    const s = standing(ev({ scoring: 'time' }), races);
    // own 1900, b 1900, c 1900: last race own 1st, c 2nd, b 3rd.
    expect(order(s)).toEqual(['own:1', 'c:2', 'b:3']);
    const same = standing(ev({ scoring: 'time' }), [race('a', 0, { own: 1000, b: 1000 })]);
    expect(order(same)).toEqual(['own:1=', 'b:1=']);
  });

  it('boats without any completed race share the last place', () => {
    const s = standing(ev({ scoring: 'time' }), [race('a', 0, { own: 1000, b: 'DNF', c: 'DNS' })]);
    expect(order(s)).toEqual(['own:1', 'b:2=', 'c:2=']);
  });
});

describe('live standing and the next race', () => {
  it('counts the running race with the Live estimates', () => {
    const r1 = race('a', 0, { own: 1000, b: 900 });
    const cur = race('b', 1, { own: undefined, b: undefined }, { status: 'running', finish: undefined, results: {}, estAtFinish: {} });
    const rows = [
      { entryId: 'own', name: 'Αύρα', own: true, elapsed: 800 },
      { entryId: 'b', name: 'Β', own: false, elapsed: 1000 },
    ];
    const s = liveStanding(ev(), [r1, cur], cur, rows, cur.start + 1000)!;
    // own 2+1 = 3, b 1+2 = 3, A8.2 last race own 1st.
    expect(order(s)).toEqual(['own:1', 'b:2']);
    expect(liveStanding(ev(), [r1, cur], cur, rows, cur.start - 1)).toBeUndefined();
    expect(liveStanding(ev(), [r1, cur], cur, [{ entryId: 'own', name: 'Αύρα', own: true }], cur.start + 1000)).toBeUndefined();
  });

  it('copies entries (same ids), method, scoring option and crew; nothing else (AC 3, 25)', () => {
    const r1 = race(
      'a',
      0,
      { own: 1000, b: 900 },
      {
        method: 'ToD',
        crew: [{ position: 'helm', name: 'Α' } as never],
        crewNote: 'στις 9 στο μώλο',
        crewSharedAt: T0,
        manualWind: { on: true, twdTrue: 10, tws: 12, at: T0 },
        windLog: [{ at: T0, ev: 'on' }],
        finishCross: { t: T0 },
        finishArmedAt: T0,
        track: [{ t: T0, lat: 1, lon: 1 }],
        analysis: { lessons: [], at: T0 },
      },
    );
    const next = nextRaceSetup(ev(), [r1])!;
    expect(next.entries.map((e) => e.id)).toEqual(['own', 'b']);
    expect(next.entries[0]).not.toBe(r1.entries[0]);
    expect(next).toEqual({
      eventId: 'ev',
      entries: r1.entries,
      method: 'ToD',
      scoringOptionId: 'coastal',
      crew: r1.crew,
      crewNote: 'στις 9 στο μώλο',
    });
    expect(nextRaceSetup(ev(), [])).toBeUndefined();
  });

  it('open events, the latest first', () => {
    const a = ev({ id: 'a', updatedAt: 1 });
    const b = ev({ id: 'b', updatedAt: 2 });
    const c = ev({ id: 'c', updatedAt: 3, status: 'closed' });
    const raceA = { ...race('x', 0, { own: 1 }), eventId: 'a', updatedAt: 10 };
    expect(openEvents([a, b, c], [raceA]).map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('typing times in the results editor (AC 29)', () => {
  it('reads h:mm:ss, mm:ss and digits from the right', () => {
    expect(parseHms('2:41:10')).toBe(2 * 3600 + 41 * 60 + 10);
    expect(parseHms('41:10')).toBe(41 * 60 + 10);
    expect(parseHms('24110')).toBe(2 * 3600 + 41 * 60 + 10);
    expect(parseHms('143205')).toBe(14 * 3600 + 32 * 60 + 5);
    expect(parseHms(' 14.32.05 ')).toBe(14 * 3600 + 32 * 60 + 5);
    expect(parseHms('26:00:00')).toBe(26 * 3600);
    for (const bad of ['', 'abc', '2:61:00', '2:41:60', '1:2:3:4', '1234567', '2::10']) expect(parseHms(bad)).toBeNaN();
  });

  it('a finish time is elapsed from the start; before the start it is the next day', () => {
    const start = new Date(2026, 10, 14, 11, 0, 0).getTime();
    expect(elapsedFromClock(start, parseHms('14:32:05'))).toEqual({
      elapsed: 3 * 3600 + 32 * 60 + 5,
      nextDay: false,
    });
    expect(elapsedFromClock(start, parseHms('01:05:00'))).toEqual({
      elapsed: 14 * 3600 + 5 * 60,
      nextDay: true,
    });
    expect(elapsedFromClock(start, parseHms('11:00:00'))?.nextDay).toBe(true);
    expect(elapsedFromClock(start, 86_400)).toBeUndefined();
  });
});

describe('resultSource', () => {
  const crossed = (p: Partial<Race> = {}) =>
    race(
      'a',
      0,
      { own: 3600, b: 3700, c: 'DNF', d: { est: 3800 } },
      {
        finish: T0 + 3600_000,
        finishCross: { t: T0 + 3600_000, answered: 'yes' },
        ...p,
      },
    );
  const e = (r: Race, id: string) => r.entries.find((x) => x.id === id)!;

  it('our finish from the line; other times and codes by hand; the frozen estimate', () => {
    const r = crossed();
    expect(resultSource(r, e(r, 'own'))).toBe('line');
    expect(resultSource(r, e(r, 'b'))).toBe('manual');
    expect(resultSource(r, e(r, 'c'))).toBe('manual');
    expect(resultSource(r, e(r, 'd'))).toBe('est');
  });

  it('typed in the editor: «επίσημο», also for our boat; a finish not at the crossing is by hand', () => {
    const r = crossed({ resultSrc: { own: 'official', c: 'official' } });
    expect(resultSource(r, e(r, 'own'))).toBe('official');
    expect(resultSource(r, e(r, 'c'))).toBe('official');
    const ended = crossed({ finish: T0 + 3700_000 });
    expect(resultSource(ended, e(ended, 'own'))).toBe('manual');
  });

  it('nothing at all: undefined', () => {
    const r = race('a', 0, { own: undefined });
    expect(resultSource(r, e(r, 'own'))).toBeUndefined();
  });
});
