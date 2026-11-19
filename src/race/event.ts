/**
 * Multi-race events («Διοργάνωση», P-040): numbering, the boats of the event, each race's result
 * (RRS Appendix A low point, A7 ties) and the overall standing («Γενική κατάταξη»: A4, A5.2,
 * discards from K completed races, A8 ties; or the sum of corrected times). Pure functions;
 * the corrected time itself stays in `src/scoring/corrected.ts`.
 */
import { corrected } from '../scoring/corrected';
import { courseLengthNm, type EstimateRow } from './estimate';
import { isCancelled, kindOf } from './session';
import type { Race, RaceEntry, RaceEvent, ResultCode, ResultSource } from './types';

export const RESULT_CODES: ResultCode[] = ['DNC', 'DNS', 'OCS', 'DNF', 'RET', 'DSQ', 'DNE'];

/** «GRE-1234» = «gre 1234»: letters and digits only, upper case. */
export const sailKeyOf = (s?: string) => (s ?? '').replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();

/** The races of an event, by start. */
export function eventRaces(eventId: string, races: Race[]): Race[] {
  return races.filter((r) => r.eventId === eventId && kindOf(r) === 'race').sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

/** Cancelled before its start, and not marked «Η ιστιοδρομία έγινε χωρίς εμάς». */
const dropped = (r: Race) => isCancelled(r) && !r.held;

/** A completed race: finished after its start, or cancelled but sailed without us (AC 33). */
export const isCompleted = (r: Race) => r.status === 'finished' && !dropped(r);

/** Number of each race in its event (computed, never stored, AC 7): the races that are not cancelled, by start. */
export function raceNumbers(races: Race[]): Record<string, number> {
  const out: Record<string, number> = {};
  let n = 0;
  for (const r of [...races].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))) if (!dropped(r)) out[r.id] = ++n;
  return out;
}

/** A boat of the event: our boat, or an opponent known by its entry id (and joined by sail number, Π11). */
export interface EventBoat {
  key: string;
  name: string;
  sailNo?: string;
  own: boolean;
  /** Every entry id this boat had in the event's races. */
  ids: string[];
  /** Its latest entry (for a copy into a race it was not in). */
  entry: RaceEntry;
}

/** «Γνωστά σκάφη της διοργάνωσης» (AC 9): the union of the entries of all its races, ours first. */
export function eventBoats(races: Race[]): EventBoat[] {
  const boats: EventBoat[] = [];
  for (const r of [...races].sort((a, b) => a.start - b.start)) {
    for (const e of r.entries) {
      let b = boats.find((x) => (e.own ? x.own : !x.own && x.ids.includes(e.id)));
      const k = sailKeyOf(e.sailNo);
      if (!b && !e.own && k) b = boats.find((x) => !x.own && sailKeyOf(x.sailNo) === k);
      if (b) {
        if (!b.ids.includes(e.id)) b.ids.push(e.id);
        b.name = e.name;
        b.sailNo = e.sailNo ?? b.sailNo;
        b.entry = e;
      } else
        boats.push({
          key: e.id,
          name: e.name,
          sailNo: e.sailNo,
          own: !!e.own,
          ids: [e.id],
          entry: e,
        });
    }
  }
  return [...boats.filter((b) => b.own), ...boats.filter((b) => !b.own)];
}

/** The entry of a boat in one race, if it sailed in it. */
export const entryOf = (race: Race, b: EventBoat): RaceEntry | undefined => race.entries.find((e) => (b.own ? e.own : !e.own && b.ids.includes(e.id)));

/**
 * New entries of an event race take the id of a known boat with the same sail number (Π11),
 * so the standing sees one boat. Entries already known keep their id.
 */
export function unifyEntries(entries: RaceEntry[], boats: EventBoat[]): RaceEntry[] {
  const used = new Set(entries.map((e) => e.id));
  return entries.map((e) => {
    if (e.own || boats.some((b) => b.ids.includes(e.id))) return e;
    const k = sailKeyOf(e.sailNo);
    const b = k ? boats.find((x) => !x.own && sailKeyOf(x.sailNo) === k) : undefined;
    if (!b || used.has(b.key)) return e;
    used.add(b.key);
    return { ...e, id: b.key };
  });
}

/** One boat's result in one race (AC 27–28). */
export interface BoatResult {
  key: string;
  /** Its entry in this race (none: DNC). */
  entryId?: string;
  code?: ResultCode;
  /** Elapsed (s): official or from the line, or the frozen estimate (`est`). */
  elapsed?: number;
  /** Corrected time, whole seconds (Π2). */
  corrected?: number;
  est?: boolean;
  /** «—»: no time, estimate or code. */
  missing?: boolean;
  place?: number;
  /** Shares its place (A7): «2=». */
  tied?: boolean;
  points: number;
}

export interface RaceResult {
  raceId: string;
  byKey: Record<string, BoatResult>;
  /** Every boat has a time or a code: «θέση», not «εκτίμηση θέσης». */
  official: boolean;
}

/**
 * Where an entry's result came from: typed in the editor («επίσημο»), our finish from the crossing
 * of the line («από τη γραμμή»), any other time or code («χειροκίνητα»), or the frozen estimate.
 */
export function resultSource(race: Race, e: RaceEntry): ResultSource | undefined {
  const has = race.results?.[e.id] !== undefined || !!race.resultCodes?.[e.id];
  if (!has) return race.estAtFinish?.[e.id] !== undefined ? 'est' : undefined;
  if (race.resultSrc?.[e.id]) return race.resultSrc[e.id];
  const fc = race.finishCross;
  if (e.own && fc?.answered === 'yes' && race.finish === fc.t) return 'line';
  return 'manual';
}

/** N for the points: max(«Σκάφη στην κλάση», known boats). */
export const classN = (event: Pick<RaceEvent, 'classSize'>, boats: EventBoat[]) => Math.max(event.classSize ?? 0, boats.length);

/**
 * A boat's result in a race, in this order (AC 27): code, time, frozen estimate «(εκτ.)», else «—».
 * Boats with a time or an estimate are ranked by corrected time in whole seconds; equal ones share
 * the mean of their places' points (A7). Every code and «—» score N + 1 (A5.2, Π6).
 */
export function raceResult(race: Race, boats: EventBoat[], N: number): RaceResult {
  const dist = courseLengthNm(race.marks);
  const res: BoatResult[] = boats.map((b) => {
    const e = entryOf(race, b);
    if (!e) return { key: b.key, code: 'DNC', points: N + 1 };
    const code = race.resultCodes?.[e.id];
    if (code) return { key: b.key, entryId: e.id, code, points: N + 1 };
    const t = race.results?.[e.id];
    const est = t === undefined ? race.estAtFinish?.[e.id] : undefined;
    const elapsed = t ?? est;
    // A cancelled race sailed without us: we start as DNC (AC 33).
    if (elapsed === undefined)
      return b.own && race.held ? { key: b.key, entryId: e.id, code: 'DNC', points: N + 1 } : { key: b.key, entryId: e.id, missing: true, points: N + 1 };
    const opt = e.boat?.scoring?.find((o) => o.id === race.scoringOptionId);
    if (!opt || !(elapsed > 0))
      return {
        key: b.key,
        entryId: e.id,
        elapsed,
        est: est !== undefined,
        missing: true,
        points: N + 1,
      };
    return {
      key: b.key,
      entryId: e.id,
      elapsed,
      est: est !== undefined,
      corrected: Math.round(corrected(race.method, elapsed, opt, dist)),
      points: 0,
    };
  });
  const timed = res.filter((x) => x.corrected !== undefined).sort((a, b) => a.corrected! - b.corrected!);
  for (let i = 0; i < timed.length;) {
    let j = i;
    while (j + 1 < timed.length && timed[j + 1].corrected === timed[i].corrected) j++;
    const pts = (i + 1 + j + 1) / 2;
    for (let x = i; x <= j; x++) Object.assign(timed[x], { place: i + 1, points: pts, tied: j > i });
    i = j + 1;
  }
  const byKey = Object.fromEntries(res.map((x) => [x.key, x]));
  return {
    raceId: race.id,
    byKey,
    official: res.every((x) => x.code !== undefined || (x.corrected !== undefined && !x.est)),
  };
}

export interface StandingCell {
  raceId: string;
  r: BoatResult;
  discarded?: boolean;
}

export interface StandingRow {
  key: string;
  name: string;
  sailNo?: string;
  own: boolean;
  /** Missing while no race is completed. */
  place?: number;
  tied: boolean;
  /** Points (without the discarded), or the sum of corrected seconds. */
  total: number;
  cells: StandingCell[];
  /** Races with a time or an estimate. */
  done: number;
  /** Sum of times: 1 = a time in every race, 2 = a code or «—» somewhere (AC 32). */
  group?: 1 | 2;
}

export interface Standing {
  scoring: RaceEvent['scoring'];
  /** The completed races (the columns), by start, with their number. */
  races: { id: string; n: number; name: string }[];
  rows: StandingRow[];
  N: number;
  /** Discards apply now (≥ K completed races). */
  discardsOn: boolean;
  hasEst: boolean;
  hasMissing: boolean;
  hasCode: boolean;
  /** Every race's result per race id. */
  results: Record<string, RaceResult>;
  /** Equal points split by A8 (one line under the table): `upper` is placed above `lower`. */
  tieBreaks: {
    upper: string;
    lower: string;
    total: number;
    rule: 'A8.1' | 'A8.2';
  }[];
}

const EPS = 1e-9;

/**
 * «Γενική κατάταξη» (AC 31–32). Points: the sum of the completed races minus the D worst
 * scores when there are ≥ K completed races (DNE never discarded; among equal worst the oldest
 * race goes), ties by A8.1 (kept scores best to worst) then A8.2 (last race back, all scores).
 * Time: boats with a time in every race by the sum, then the others by races done and sum;
 * ties by the better place in the last race, then the one before.
 */
export function standing(event: RaceEvent, all: Race[]): Standing {
  const races = eventRaces(event.id, all);
  const boats = eventBoats(races);
  const N = classN(event, boats);
  const nums = raceNumbers(races);
  const done = races.filter(isCompleted);
  const results: Record<string, RaceResult> = {};
  for (const r of races) if (r.status === 'finished') results[r.id] = raceResult(r, boats, N);
  const D = event.scoring === 'points' ? event.discards : 0;
  const discardsOn = D > 0 && done.length >= event.discardFrom;
  const rows: StandingRow[] = boats.map((b) => {
    const cells: StandingCell[] = done.map((r) => ({
      raceId: r.id,
      r: results[r.id].byKey[b.key],
    }));
    if (discardsOn) {
      const cand = cells.map((c, i) => ({ c, i })).filter((x) => x.c.r.code !== 'DNE');
      cand.sort((x, y) => y.c.r.points - x.c.r.points || x.i - y.i);
      for (const x of cand.slice(0, D)) x.c.discarded = true;
    }
    const timedCells = cells.filter((c) => c.r.corrected !== undefined);
    const total =
      event.scoring === 'points' ? cells.reduce((s, c) => s + (c.discarded ? 0 : c.r.points), 0) : timedCells.reduce((s, c) => s + c.r.corrected!, 0);
    return {
      key: b.key,
      name: b.name,
      sailNo: b.sailNo,
      own: b.own,
      tied: false,
      total,
      cells,
      done: timedCells.length,
      group: event.scoring === 'time' ? (done.length > 0 && timedCells.length === done.length ? 1 : 2) : undefined,
    };
  });

  /** A8.2 / Π4: the last race first, then the one before. */
  const byLastRaces = (a: StandingRow, b: StandingRow, val: (c: StandingCell) => number) => {
    for (let i = a.cells.length - 1; i >= 0; i--) {
      const d = val(a.cells[i]) - val(b.cells[i]);
      if (Math.abs(d) > EPS) return d;
    }
    return 0;
  };
  /** A8.1: the kept scores, best to worst, compared at the first difference. */
  const a81 = (a: StandingRow, b: StandingRow) => {
    const ka = a.cells
      .filter((c) => !c.discarded)
      .map((c) => c.r.points)
      .sort((x, y) => x - y);
    const kb = b.cells
      .filter((c) => !c.discarded)
      .map((c) => c.r.points)
      .sort((x, y) => x - y);
    for (let i = 0; i < Math.min(ka.length, kb.length); i++) if (Math.abs(ka[i] - kb[i]) > EPS) return ka[i] - kb[i];
    return 0;
  };
  const cmpPoints = (a: StandingRow, b: StandingRow) => {
    if (Math.abs(a.total - b.total) > EPS) return a.total - b.total;
    // A8.2: every score, the discarded too.
    return a81(a, b) || byLastRaces(a, b, (c) => c.r.points);
  };
  const cmpTime = (a: StandingRow, b: StandingRow) => {
    if (a.group !== b.group) return (a.group ?? 2) - (b.group ?? 2);
    if (a.group === 2) {
      if (a.done !== b.done) return b.done - a.done;
      if (a.done === 0) return 0;
    }
    if (a.total !== b.total) return a.total - b.total;
    return byLastRaces(a, b, (c) => c.r.place ?? Infinity);
  };
  const cmp = event.scoring === 'points' ? cmpPoints : cmpTime;
  if (done.length) {
    rows.sort((a, b) => cmp(a, b) || Number(b.own) - Number(a.own));
    rows.forEach((row, i) => {
      const prev = rows[i - 1];
      if (prev && cmp(prev, row) === 0) {
        row.place = prev.place;
        row.tied = prev.tied = true;
      } else row.place = i + 1;
    });
  }
  const tieBreaks: Standing['tieBreaks'] = [];
  if (event.scoring === 'points' && done.length)
    rows.forEach((row, i) => {
      const prev = rows[i - 1];
      if (!prev || Math.abs(prev.total - row.total) > EPS || cmp(prev, row) === 0) return;
      tieBreaks.push({
        upper: prev.name,
        lower: row.name,
        total: row.total,
        rule: a81(prev, row) ? 'A8.1' : 'A8.2',
      });
    });
  const cellsAll = rows.flatMap((r) => r.cells);
  return {
    scoring: event.scoring,
    races: done.map((r) => ({ id: r.id, n: nums[r.id], name: r.name })),
    rows,
    N,
    discardsOn,
    hasEst: cellsAll.some((c) => c.r.est),
    hasMissing: cellsAll.some((c) => c.r.missing),
    hasCode: cellsAll.some((c) => c.r.code),
    results,
    tieBreaks,
  };
}

/**
 * The standing with the running race counted as if it ended now, from the Live's estimates
 * (AC 12): our projected time and the opponents' estimates. Undefined before the start or
 * without an estimate for us.
 */
export function liveStanding(event: RaceEvent, all: Race[], current: Race, rows: EstimateRow[], now: number): Standing | undefined {
  const own = rows.find((x) => x.own);
  const ownEntry = current.entries.find((e) => e.own);
  if (!ownEntry || now <= current.start || own?.elapsed === undefined) return undefined;
  const est: Record<string, number> = {};
  for (const x of rows) if (!x.own && x.elapsed !== undefined && current.results?.[x.entryId] === undefined) est[x.entryId] = x.elapsed;
  const virtual: Race = {
    ...current,
    status: 'finished',
    finish: now,
    results: {
      ...(current.results ?? {}),
      [ownEntry.id]: current.results?.[ownEntry.id] ?? own.elapsed,
    },
    estAtFinish: est,
  };
  return standing(event, [...all.filter((r) => r.id !== current.id), virtual]);
}

/**
 * What the next race of an event copies (AC 3, Π12, AC 25): entries (same ids), method,
 * scoring option and crew places. Never the course, start, wind, results, track or crew share.
 */
export function nextRaceSetup(
  event: RaceEvent,
  all: Race[],
): Pick<Race, 'eventId' | 'entries' | 'method' | 'scoringOptionId' | 'crew' | 'crewNote'> | undefined {
  const races = eventRaces(event.id, all);
  const prev = [...races].reverse().find((r) => !dropped(r)) ?? races[races.length - 1];
  if (!prev) return undefined;
  return {
    eventId: event.id,
    entries: prev.entries.map((e) => ({ ...e })),
    method: prev.method,
    scoringOptionId: prev.scoringOptionId,
    ...(prev.crew ? { crew: prev.crew.map((c) => ({ ...c })) } : {}),
    ...(prev.crewNote ? { crewNote: prev.crewNote } : {}),
  };
}

/** The open events first by their latest change (theirs or a race's), for the home cards (Π16). */
export function openEvents(events: RaceEvent[], races: Race[]): RaceEvent[] {
  const last = (e: RaceEvent) => Math.max(e.updatedAt, ...eventRaces(e.id, races).map((r) => r.updatedAt));
  return events.filter((e) => e.status === 'open').sort((a, b) => last(b) - last(a));
}

/** «2=» / «3» */
export const placeText = (place: number | undefined, tied?: boolean) => (place === undefined ? '—' : `${place}${tied ? '=' : ''}`);

/**
 * «2:41:10», «41:10», «14:32:05» or digits only, filled from the right like a microwave
 * («24110» = 2:41:10), in seconds. Minutes and seconds up to 59. NaN when it is not a time.
 */
export function parseHms(s: string): number {
  const t = s.trim().replace(/[.,]/g, ':');
  if (!t) return NaN;
  let parts: number[];
  if (/^\d+$/.test(t)) {
    if (t.length > 6) return NaN;
    const d = t.padStart(6, '0');
    parts = [Number(d.slice(0, 2)), Number(d.slice(2, 4)), Number(d.slice(4))];
  } else {
    const p = t.split(':');
    if (p.length < 2 || p.length > 3 || p.some((x) => !/^\d{1,2}$/.test(x) && !(x === p[0] && /^\d+$/.test(x)))) return NaN;
    parts = p.map(Number);
    if (parts.length === 2) parts.unshift(0);
  }
  const [h, m, sec] = parts;
  if (m > 59 || sec > 59) return NaN;
  return h * 3600 + m * 60 + sec;
}

/**
 * A finish time of day (seconds after midnight) as elapsed seconds from the start (AC 29). A time
 * before the start counts on the next day (owner's answer 3: long night races). Undefined past 23:59:59.
 */
export function elapsedFromClock(start: number, secOfDay: number): { elapsed: number; nextDay: boolean } | undefined {
  if (!(secOfDay >= 0) || secOfDay >= 86_400) return undefined;
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  let at = d.getTime() + secOfDay * 1000;
  const nextDay = at <= start;
  if (nextDay) {
    const n = new Date(start);
    n.setDate(n.getDate() + 1);
    n.setHours(0, 0, 0, 0);
    at = n.getTime() + secOfDay * 1000;
  }
  return { elapsed: (at - start) / 1000, nextDay };
}
