import { magToTrue, norm360, trueToMag, twaFromTwd } from '../performance/angles';
import { computeLive, type LiveResult } from '../performance/targets';
import type { BoatProfile } from '../boat/types';
import type { InstrumentValues } from '../instruments/types';
import { intersect, type Span } from './pauses';
import type { ManualWind, Race, WindLogEntry } from './types';

/**
 * Manual wind inside a session (P-053), without UI: where the Live's wind comes from,
 * its age and «παλιός», °M ↔ °T, the course for the TWA (instrument heading, else the
 * GPS course with hysteresis), the steps of the sheet, the first values of the sheet,
 * the change log and the «σε 45′ από 1 ώ 30′» note of the summary.
 * Greek words here are shown as they are (HANDOFF §7 of design/manual-wind-2026-11).
 */

/** «Παλιός» after this many minutes without a change or «Ισχύει ακόμα». */
export const STALE_MIN = 15;
/** The GPS course counts from this speed over ground … */
export const COG_ON_KT = 2.5;
/** … and stops below this one (hysteresis, so the TWA does not blink in light air). */
export const COG_OFF_KT = 2;
/** The last course is kept this long once the GPS course stops. */
export const COG_HOLD_MS = 30_000;
/** A value change is logged once the presses settle for this long. */
export const LOG_SETTLE_MS = 5_000;
/** Entries kept in `Race.windLog`. */
export const LOG_MAX = 500;
export const TWS_MAX = 60;
/** Where the sheet's ± start when a field is empty (AC 8). */
export const EMPTY_TWD = 0;
export const EMPTY_TWS = 10;

export interface DirOpts {
  /** Directions are typed and shown magnetic («°M»). */
  manualMagnetic: boolean;
  /** East positive: °T = °M + declination. */
  declination: number;
}

// ---------------------------------------------------------------------------
// Age

/** Whole minutes since `at` (never negative: a clock set back shows «τώρα»). */
export const ageMin = (at: number, now: number): number => Math.max(0, Math.floor((now - at) / 60_000));
export const isStale = (at: number, now: number): boolean => ageMin(at, now) >= STALE_MIN;

/** W10–W12: «τώρα», «πριν από 12′», «πριν από 1 ώ 05′». */
export function fmtAge(min: number): string {
  if (min < 1) return 'τώρα';
  if (min < 60) return `πριν από ${min}′`;
  return `πριν από ${Math.floor(min / 60)} ώ ${String(min % 60).padStart(2, '0')}′`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A01–A03 (screen reader): «τώρα», «πριν από 4 λεπτά», «πριν από 1 ώρα και 5 λεπτά». */
export function ageWords(min: number): string {
  if (min < 1) return 'τώρα';
  if (min < 60) return `πριν από ${plural(min, 'λεπτό', 'λεπτά')}`;
  const h = plural(Math.floor(min / 60), 'ώρα', 'ώρες');
  return min % 60 ? `πριν από ${h} και ${plural(min % 60, 'λεπτό', 'λεπτά')}` : `πριν από ${h}`;
}

// ---------------------------------------------------------------------------
// Directions and speeds

/** True → what the crew types and reads (°M with «°M», else °T). */
export const toDisplay = (twdTrue: number, o: DirOpts): number => (o.manualMagnetic ? trueToMag(twdTrue, o.declination) : norm360(twdTrue));
/** What the crew typed → true. */
export const fromDisplay = (v: number, o: DirOpts): number => (o.manualMagnetic ? magToTrue(v, o.declination) : norm360(v));
export const dirUnit = (o: Pick<DirOpts, 'manualMagnetic'>): '°M' | '°T' => (o.manualMagnetic ? '°M' : '°T');
/** «040» */
export const pad3 = (d: number): string => String(norm360(Math.round(d)) % 360).padStart(3, '0');
/** «220°M» / «225°T» */
export const fmtDir = (twdTrue: number, o: DirOpts): string => `${pad3(toDisplay(twdTrue, o))}${dirUnit(o)}`;
/** «12 kt / 230°M»: a wind (TWD in °T) in the units of the setting, for any source. */
export const fmtWind = (tws: number, twdTrue: number, o: DirOpts): string => `${Math.round(tws)} kt / ${fmtDir(twdTrue, o)}`;
/** «12 kt από 230°M»: the forecast wind of the «Καιρός» cards, in the units of the setting. */
export const fmtWindFrom = (tws: number, twdTrue: number, o: DirOpts): string => `${Math.round(tws)} kt από ${fmtDir(twdTrue, o)}`;
/** S11: «220°M = 225°T» (with °T: «225°T = 220°M»). */
export function fmtBoth(twdTrue: number, o: DirOpts): string {
  const t = pad3(twdTrue);
  const m = pad3(trueToMag(twdTrue, o.declination));
  return o.manualMagnetic ? `${m}°M = ${t}°T` : `${t}°T = ${m}°M`;
}
/** «12,0» */
export const fmtKt = (v: number): string => v.toFixed(1).replace('.', ',');
/** The TWS field: «12», «12,5». */
export const fmtTwsField = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));

const r1 = (x: number) => Math.round(x * 10) / 10;
const clampTws = (v: number) => Math.max(0, Math.min(TWS_MAX, v));

/** TWD ± in the units on screen, around the compass (358 +5 → 003). Returns true. */
export function stepTwd(twdTrue: number | undefined, d: number, o: DirOpts): number {
  const base = twdTrue === undefined ? EMPTY_TWD : Math.round(toDisplay(twdTrue, o));
  return r1(fromDisplay(base + d, o));
}

/** TWS ± (0–60 kt). */
export function stepTws(tws: number | undefined, d: number): number {
  return clampTws((tws ?? EMPTY_TWS) + d);
}

const num = (text: string): number | undefined => {
  const t = text.replace(',', '.').trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

/** A typed TWD (units on screen) → true; undefined: not a number. */
export function parseTwd(text: string, o: DirOpts): number | undefined {
  const n = num(text);
  return n === undefined ? undefined : r1(fromDisplay(Math.round(n), o));
}

/** A typed TWS → kt in half knots (0–60); undefined: not a number. */
export function parseTws(text: string): number | undefined {
  const n = num(text);
  return n === undefined ? undefined : clampTws(Math.round(n * 2) / 2);
}

// ---------------------------------------------------------------------------
// Course for the TWA: the instruments' compass, else the GPS course with hysteresis

export type CourseSrc = 'hdg' | 'cog' | 'hold';

export interface CourseInput {
  /** The instruments are live (their heading counts only then). */
  instLive: boolean;
  hdgTrue?: number;
  hdgMag?: number;
  /** The instruments' variation, East positive. */
  variation?: number;
  /** Settings declination, used for a magnetic heading without variation. */
  declination: number;
  /** GPS course (true) and speed over ground. */
  cog?: number;
  sog?: number;
}

export interface CourseState {
  /** The GPS course counts now (from 2,5 kt until below 2 kt). */
  cogOn: boolean;
  /** Last GPS course that counted, and when. */
  last?: { deg: number; at: number };
}

export interface Course {
  /** True course for the TWA; undefined: none («—»). */
  deg?: number;
  src?: CourseSrc;
}

export const newCourseState = (): CourseState => ({ cogOn: false });

/**
 * One step of the course for the TWA (spec «TWA»): the instruments' heading (true, or
 * magnetic turned true) at any speed; else the GPS course from 2,5 kt, kept down to 2 kt,
 * then the last one for 30″, then none. Never the phone's compass.
 */
export function stepCourse(st: CourseState, x: CourseInput, now: number): { state: CourseState; course: Course } {
  const valid = x.cog !== undefined && Number.isFinite(x.cog) && x.sog !== undefined && Number.isFinite(x.sog);
  let state: CourseState;
  if (st.cogOn && valid && x.sog! >= COG_OFF_KT) state = { cogOn: true, last: { deg: norm360(x.cog!), at: now } };
  else if (!st.cogOn && valid && x.sog! >= COG_ON_KT) state = { cogOn: true, last: { deg: norm360(x.cog!), at: now } };
  else state = { cogOn: false, last: st.last };
  if (x.instLive) {
    if (x.hdgTrue !== undefined && Number.isFinite(x.hdgTrue)) return { state, course: { deg: norm360(x.hdgTrue), src: 'hdg' } };
    if (x.hdgMag !== undefined && Number.isFinite(x.hdgMag)) return { state, course: { deg: magToTrue(x.hdgMag, x.variation ?? x.declination), src: 'hdg' } };
  }
  if (state.cogOn && state.last) return { state, course: { deg: state.last.deg, src: 'cog' } };
  if (state.last && now - state.last.at <= COG_HOLD_MS) return { state, course: { deg: state.last.deg, src: 'hold' } };
  return { state, course: {} };
}

/** Signed TWA (port negative) from the manual TWD and the course; undefined without a course. */
export const manualTwa = (twdTrue: number, c: Course): number | undefined => (c.deg === undefined ? undefined : twaFromTwd(twdTrue, c.deg));

// ---------------------------------------------------------------------------
// First values of the sheet (instruments → forecast → empty), never the last session

export interface Prefill {
  twdTrue: number;
  tws: number;
  from: 'instruments' | 'forecast';
  /** Forecast: when it was fetched (S08 «πρόγνωση των hh:mm»). */
  at?: number;
}

export function prefill(
  inst: { live: boolean; twd?: number; tws?: number },
  forecast: { twd: number; tws: number; at: number } | undefined,
  o: DirOpts,
): Prefill | undefined {
  if (inst.live && inst.twd !== undefined && inst.tws !== undefined && Number.isFinite(inst.twd) && Number.isFinite(inst.tws))
    return { twdTrue: norm360(Math.round(inst.twd)), tws: clampTws(Math.round(inst.tws * 2) / 2), from: 'instruments' };
  if (forecast && Number.isFinite(forecast.twd) && Number.isFinite(forecast.tws)) {
    // TWD to 5° in the units on screen, TWS to 1 kt.
    const shown = Math.round(toDisplay(forecast.twd, o) / 5) * 5;
    return { twdTrue: r1(fromDisplay(shown, o)), tws: clampTws(Math.round(forecast.tws)), from: 'forecast', at: forecast.at };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Change log

/** Adds an entry; above `max`, entries from the middle go (the first and the latest stay). */
export function pushLog(log: WindLogEntry[] | undefined, e: WindLogEntry, max = LOG_MAX): WindLogEntry[] {
  const out = [...(log ?? []), e];
  while (out.length > max) out.splice(Math.floor(max / 2), 1);
  return out;
}

export const logEntry = (ev: WindLogEntry['ev'], at: number, m?: Pick<ManualWind, 'twdTrue' | 'tws'>): WindLogEntry =>
  m ? { at, ev, twdTrue: m.twdTrue, tws: m.tws } : { at, ev };

/** When the manual wind was on (from each `on` to the next `off`, an open one to `end`). */
export function manualSpans(log: WindLogEntry[] | undefined, end: number): Span[] {
  const out: Span[] = [];
  let from: number | undefined;
  for (const e of [...(log ?? [])].sort((a, b) => a.at - b.at)) {
    if (e.ev === 'on' && from === undefined) from = e.at;
    else if (e.ev === 'off' && from !== undefined) {
      if (e.at > from) out.push({ from, to: e.at });
      from = undefined;
    }
  }
  if (from !== undefined && end > from) out.push({ from, to: end });
  return out;
}

const sumMs = (s: Span[]) => s.reduce((a, x) => a + x.to - x.from, 0);

/** Minutes with manual wind out of the minutes of `spans` (the session without pauses); undefined: never manual. */
export function manualMinutes(r: Pick<Race, 'windLog'>, spans: Span[], end: number): { minutes: number; ofMinutes: number } | undefined {
  const ms = sumMs(intersect(manualSpans(r.windLog, end), spans));
  if (ms <= 0) return undefined;
  const ofMinutes = Math.max(1, Math.round(sumMs(spans) / 60_000));
  return { minutes: Math.min(ofMinutes, Math.max(1, Math.round(ms / 60_000))), ofMinutes };
}

/** «45′», «1 ώ 30′» */
const dur = (min: number) => (min < 60 ? `${min}′` : `${Math.floor(min / 60)} ώ ${String(min % 60).padStart(2, '0')}′`);

/** L11 / L12 of the race analysis and the training summary (AC 34). */
export function manualNote(m: { minutes: number; ofMinutes: number } | undefined): string | undefined {
  if (!m) return undefined;
  if (m.minutes >= m.ofMinutes) return 'Άνεμος χειροκίνητα σε όλη την έξοδο: οι στόχοι και το % είναι ενδεικτικά.';
  return `Άνεμος χειροκίνητα σε ${dur(m.minutes)} από ${dur(m.ofMinutes)}: οι στόχοι και το % εκεί είναι ενδεικτικά.`;
}

// ---------------------------------------------------------------------------
// «Γρήγορη ματιά» wind (live-state) and whether the crew ever typed one

/** The fields of `live-state` (LiveView) that are about the wind. */
export interface QuickWindState {
  windInput?: 'twa' | 'twd';
  tws?: number | null;
  twa?: number | null;
  side?: 'stbd' | 'port';
  twd?: number | null;
  /** Set only when the crew itself changed the wind there (AC 46). */
  windTypedAt?: number;
}

const QUICK_DEFAULTS = { windInput: 'twa', tws: 10, twa: 42, side: 'stbd', twd: null } as const;

/**
 * The wind typed in «Γρήγορη ματιά», for a session without instruments: TWS and a signed TWA
 * (port negative), as in 0.16.1, but nothing at all when the crew never typed a wind there
 * (no `windTypedAt`: the 10 kt / 42° defaults and the instruments' fill-ins do not count).
 */
export function quickWind(raw: QuickWindState | undefined, cogTrue: number | undefined, o: DirOpts): { tws?: number; twa?: number } {
  if (!raw || typeof raw.windTypedAt !== 'number') return {};
  const s = { ...QUICK_DEFAULTS, ...raw };
  const tws = s.tws ?? undefined;
  if (s.windInput === 'twa') return { tws, twa: s.twa === null ? undefined : s.side === 'port' ? -s.twa : s.twa };
  if (s.twd === null || cogTrue === undefined) return { tws };
  return { tws, twa: twaFromTwd(o.manualMagnetic ? magToTrue(s.twd, o.declination) : s.twd, cogTrue) };
}

/** The «Γρήγορη ματιά» TWD (true): typed as TWD, else TWA + course; undefined when unknown. */
export function quickTwd(raw: QuickWindState | undefined, cogTrue: number | undefined, o: DirOpts): number | undefined {
  if (!raw || typeof raw.windTypedAt !== 'number') return undefined;
  const s = { ...QUICK_DEFAULTS, ...raw };
  if (s.windInput === 'twd') return s.twd === null ? undefined : o.manualMagnetic ? magToTrue(s.twd, o.declination) : norm360(s.twd);
  if (s.twa === null || cogTrue === undefined) return undefined;
  return norm360(cogTrue + (s.side === 'port' ? -s.twa : s.twa));
}

const WIND_KEYS = ['tws', 'twa', 'side', 'twd'] as const;

/** A change of «Γρήγορη ματιά» made by the crew: stamps `windTypedAt` when it touches the wind. */
export function markTyped<T extends object>(patch: T, now: number): T & { windTypedAt?: number } {
  return WIND_KEYS.some((k) => k in patch) ? { ...patch, windTypedAt: now } : patch;
}

// ---------------------------------------------------------------------------
// Wind of the in-session Live

export type WindFrom = 'manual' | 'instruments' | 'quick' | 'none';

/** The table «Πηγή ανέμου στο Live της εξόδου»: manual wins, then instruments, then «Γρήγορη ματιά», else none. */
export function windFromOf(o: { manualOn: boolean; instLive: boolean; instTws?: number; quickTyped: boolean }): WindFrom {
  if (o.manualOn) return 'manual';
  if (o.instLive && o.instTws !== undefined) return 'instruments';
  return o.quickTyped ? 'quick' : 'none';
}

export interface LiveNumbers {
  /** Polar targets for the wind now; null without wind or polar. */
  result: LiveResult | null;
  /** Wind and speed come from the boat's instruments (false while the manual wind is on). */
  withInst: boolean;
  /** Speed: boat speed from the instruments, else speed over ground. */
  bsp?: number;
  bspFrom: 'BSP' | 'SOG';
  /** The wind is the one typed in by hand («Γρήγορη ματιά» or the session's manual wind). */
  windManual: boolean;
  /** P-053: where the wind comes from. */
  windFrom: WindFrom;
  /** TWD (true) and TWS of the wind used, when known. */
  twdTrue?: number;
  tws?: number;
  /** Signed TWA (port negative) of the wind used. */
  twa?: number;
  /** Manual wind: the course its TWA comes from. */
  course?: Course;
  /** Manual wind: minutes since the last change or «Ισχύει ακόμα», and whether that is ≥ 15′. */
  manualAgeMin?: number;
  stale?: boolean;
}

export interface LiveInputs {
  boat?: BoatProfile;
  inst: { live: boolean; values: InstrumentValues };
  fix?: { sog?: number; cog?: number };
  /** The session's manual wind (on or off). */
  manual?: ManualWind;
  /** «Γρήγορη ματιά» `live-state`. */
  quick?: QuickWindState;
  course: Course;
  dir: DirOpts;
  now: number;
}

/**
 * Numbers of the in-session Live (P-034, P-053). Manual off: exactly 0.16.1 (instruments
 * first, else GPS speed and the «Γρήγορη ματιά» wind), except that a «Γρήγορη ματιά» wind
 * nobody typed is no wind. Manual on: its TWS/TWD, TWA from the course, BSP still from the
 * instruments, no «with instruments».
 */
export function liveNumbersOf(i: LiveInputs): LiveNumbers {
  const iv = i.inst.live ? i.inst.values : {};
  const bsp = iv.bsp ?? i.fix?.sog;
  const bspFrom = iv.bsp !== undefined ? 'BSP' : 'SOG';
  const m = i.manual;
  const target = (tws?: number, twa?: number) =>
    i.boat?.polar && tws !== undefined && twa !== undefined ? computeLive(i.boat, { tws, twa, bsp }) : null;
  if (m?.on) {
    const twa = manualTwa(m.twdTrue, i.course);
    const age = ageMin(m.at, i.now);
    return {
      result: target(m.tws, twa),
      withInst: false,
      bsp,
      bspFrom,
      windManual: true,
      windFrom: 'manual',
      twdTrue: m.twdTrue,
      tws: m.tws,
      twa,
      course: i.course,
      manualAgeMin: age,
      stale: age >= STALE_MIN,
    };
  }
  const q = quickWind(i.quick, i.fix?.cog, i.dir);
  const tws = iv.tws ?? q.tws;
  const twa = iv.twa ?? q.twa;
  const windFrom = windFromOf({ manualOn: false, instLive: i.inst.live, instTws: iv.tws, quickTyped: typeof i.quick?.windTypedAt === 'number' });
  return {
    result: target(tws, twa),
    withInst: i.inst.live && iv.tws !== undefined,
    bsp,
    bspFrom,
    windManual: windFrom === 'quick',
    windFrom,
    twdTrue: windFrom === 'instruments' ? iv.twd : windFrom === 'quick' ? quickTwd(i.quick, i.fix?.cog, i.dir) : undefined,
    tws: windFrom === 'none' ? undefined : tws,
    twa: windFrom === 'none' ? undefined : twa,
  };
}

// ---------------------------------------------------------------------------
// Laylines: the manual wind directly (not the 4′ mean), else as today

export interface LaylineWind {
  wind: 'measured' | 'forecast' | 'manual';
  tws: number;
  twd: number;
}

/**
 * Wind for the laylines (P-019, P-053 AC 26): the manual wind as it is now when on (a +10°
 * the crew just typed must show at once, not after the mean catches up); else the measured
 * mean, the instruments now, the forecast here. `noWind`: a session without any wind
 * (AC 47): only the forecast.
 */
export function laylineWind(o: {
  manual?: ManualWind;
  mean?: { tws: number; twd: number };
  inst?: { tws?: number; twd?: number };
  forecast?: { tws: number; twd: number };
  noWind?: boolean;
}): LaylineWind | undefined {
  if (o.manual?.on) return { wind: 'manual', tws: o.manual.tws, twd: o.manual.twdTrue };
  if (!o.noWind && o.mean) return { wind: 'measured', tws: o.mean.tws, twd: o.mean.twd };
  if (!o.noWind && o.inst?.tws !== undefined && o.inst.twd !== undefined) return { wind: 'measured', tws: o.inst.tws, twd: o.inst.twd };
  if (o.forecast) return { wind: 'forecast', tws: o.forecast.tws, twd: o.forecast.twd };
  return undefined;
}

// ---------------------------------------------------------------------------
// Advisor

export const ADVISOR_NOTE = 'Άνεμος που έβαλε το πλήρωμα με το χέρι, όχι μέτρηση.';

/** `nav.windManual` of the advisor's context (AC 37); undefined with the manual wind off. */
export function advisorWind(m: ManualWind | undefined, now: number): { twdTrue: number; tws: number; ageMin: number; stale: boolean; note: string } | undefined {
  if (!m?.on) return undefined;
  const a = ageMin(m.at, now);
  return { twdTrue: Math.round(m.twdTrue), tws: m.tws, ageMin: a, stale: a >= STALE_MIN, note: ADVISOR_NOTE };
}
