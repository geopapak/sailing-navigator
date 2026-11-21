/**
 * One place for every number, time, date and direction shown on screen (P-064).
 * Pure functions, no React. Machine formats (CSV, GPX, JSON for the AI and the
 * server, file names) do NOT use this module: they stay with a dot and ISO.
 *
 * Greek today; `LOCALE` and `FMT` are the only places a second language (P-042)
 * would touch, the callers stay as they are.
 */
import { norm360, trueToMag } from '../performance/angles';

export const LOCALE = 'el-GR';

/** Symbols of the locale. */
export const FMT = {
  decimal: ',',
  group: '.',
  /** U+2212, not the hyphen. */
  minus: '−',
  /** No-break space before a unit (U+00A0). */
  unitSpace: ' ',
  /** No value. */
  none: '—',
  prime: '′',
  dprime: '″',
  hour: 'ώ',
  now: 'τώρα',
  in: 'σε',
  ago: 'πριν από',
  /** Short week days, Sunday first (as `Date.getDay`). */
  days: ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'],
} as const;

const ok = (x: number | undefined | null): x is number => typeof x === 'number' && Number.isFinite(x);
const p2 = (n: number) => String(n).padStart(2, '0');

/** «7,0» · «−0,5» · «1.234,5» (group separator from 10.000 up) · NaN → «—». */
export function num(x: number | undefined | null, d = 1): string {
  if (!ok(x)) return FMT.none;
  const fixed = Math.abs(x).toFixed(d);
  // «−0,0» is not a number anyone wants to read.
  const neg = x < 0 && Number(fixed) !== 0;
  let [int, frac] = fixed.split('.');
  if (int.length >= 5) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, FMT.group);
  return `${neg ? FMT.minus : ''}${int}${frac !== undefined ? FMT.decimal + frac : ''}`;
}

/** «7,0 kt» · «1,9 NM» · «12 m» · «612,0 s/NM», with a no-break space before the unit. */
export function qty(x: number | undefined | null, unit: string, d = 1): string {
  return ok(x) ? `${num(x, d)}${FMT.unitSpace}${unit}` : FMT.none;
}

/** «98%» (no space, P-056 Π1). `x` is already in percent. */
export function pct(x: number | undefined | null, d = 0): string {
  return ok(x) ? `${num(x, d)}%` : FMT.none;
}

export type DirRef = 'T' | 'M';
/** Settings for directions: shown magnetic or true, and the declination (east positive). */
export interface DirSettings {
  manualMagnetic: boolean;
  declination: number;
}

/** «045» */
export const pad3 = (deg: number): string => String(Math.round(norm360(Math.round(deg))) % 360).padStart(3, '0');

/**
 * A direction, always with its reference: «045°T» / «040°M».
 * With a reference letter the value is already in it; with the settings the value
 * is true and is shown as the settings say (as `fmtDir` of the manual wind).
 */
export function dir(deg: number | undefined | null, ref: DirRef | DirSettings = 'T'): string {
  if (!ok(deg)) return FMT.none;
  if (typeof ref === 'string') return `${pad3(deg)}°${ref}`;
  return ref.manualMagnetic ? `${pad3(trueToMag(deg, ref.declination))}°M` : `${pad3(deg)}°T`;
}

/** An angle to the wind or the bow (TWA, heel): «42°», no reference. */
export function angle(deg: number | undefined | null): string {
  return ok(deg) ? `${num(deg, 0)}°` : FMT.none;
}

const asDate = (ms: number | undefined | null): Date | undefined => (ok(ms) ? new Date(ms) : undefined);

/** «05/11/2026» */
export function date(ms: number | undefined | null): string {
  const t = asDate(ms);
  return t ? `${p2(t.getDate())}/${p2(t.getMonth() + 1)}/${t.getFullYear()}` : FMT.none;
}

/** «Σάβ 23/11» */
export function day(ms: number | undefined | null): string {
  const t = asDate(ms);
  return t ? `${FMT.days[t.getDay()]} ${p2(t.getDate())}/${p2(t.getMonth() + 1)}` : FMT.none;
}

/** «09:05», always 24-hour. */
export function time(ms: number | undefined | null): string {
  const t = asDate(ms);
  return t ? `${p2(t.getHours())}:${p2(t.getMinutes())}` : FMT.none;
}

/** «09:05:07» */
export function timeSec(ms: number | undefined | null): string {
  const t = asDate(ms);
  return t ? `${p2(t.getHours())}:${p2(t.getMinutes())}:${p2(t.getSeconds())}` : FMT.none;
}

/** «Σάβ 23/11 11:00» */
export function dayTime(ms: number | undefined | null): string {
  return ok(ms) ? `${day(ms)} ${time(ms)}` : FMT.none;
}

/** «05/11/2026 14:32» */
export function dateTime(ms: number | undefined | null): string {
  return ok(ms) ? `${date(ms)} ${time(ms)}` : FMT.none;
}

/** A duration «0:39:19» (h:mm:ss, «−» for negatives). */
export function duration(sec: number | undefined | null): string {
  if (!ok(sec)) return FMT.none;
  const neg = sec < 0;
  let s = Math.round(Math.abs(sec));
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  return `${neg && (h || m || s) ? FMT.minus : ''}${h}:${p2(m)}:${p2(s)}`;
}

/** A span in minutes: «45′» · «2 ώ 05′». */
export function span(sec: number | undefined | null): string {
  if (!ok(sec)) return FMT.none;
  const m = Math.max(0, Math.round(sec / 60));
  return m >= 60 ? `${Math.floor(m / 60)} ${FMT.hour} ${p2(m % 60)}${FMT.prime}` : `${m}${FMT.prime}`;
}

/** The body of a countdown: «45″» · «6′48″» · «1 ώ 05′». */
export function clock(sec: number | undefined | null): string {
  if (!ok(sec)) return FMT.none;
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}${FMT.dprime}`;
  if (s < 3600) return `${Math.floor(s / 60)}${FMT.prime}${p2(s % 60)}${FMT.dprime}`;
  const m = Math.floor(s / 60);
  return `${Math.floor(m / 60)} ${FMT.hour} ${p2(m % 60)}${FMT.prime}`;
}

/** «Πότε»: «σε 45″» · «σε 6′48″» · «σε 1 ώ 05′» · ≤ 0 → «τώρα». Never «6:48», which reads as a time of day. */
export function inTime(sec: number | undefined | null): string {
  if (!ok(sec)) return FMT.none;
  return Math.round(sec) <= 0 ? FMT.now : `${FMT.in} ${clock(sec)}`;
}

/** «πριν από 4′» · «πριν από 1 ώ 05′» · under a minute → «τώρα». */
export function ago(sec: number | undefined | null): string {
  if (!ok(sec)) return FMT.none;
  return sec < 60 ? FMT.now : `${FMT.ago} ${span(Math.floor(sec / 60) * 60)}`;
}

const words = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** For screen readers: «6 λεπτά και 48 δευτερόλεπτα» · «1 ώρα και 5 λεπτά». */
export function clockWords(sec: number | undefined | null): string {
  if (!ok(sec)) return '';
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return words(s, 'δευτερόλεπτο', 'δευτερόλεπτα');
  if (s < 3600) {
    const m = words(Math.floor(s / 60), 'λεπτό', 'λεπτά');
    return s % 60 ? `${m} και ${words(s % 60, 'δευτερόλεπτο', 'δευτερόλεπτα')}` : m;
  }
  const m = Math.floor(s / 60);
  const h = words(Math.floor(m / 60), 'ώρα', 'ώρες');
  return m % 60 ? `${h} και ${words(m % 60, 'λεπτό', 'λεπτά')}` : h;
}

/** «σε 6 λεπτά και 48 δευτερόλεπτα» (the `aria-label` of `inTime`). */
export function inTimeWords(sec: number | undefined | null): string {
  if (!ok(sec)) return '';
  return Math.round(sec) <= 0 ? FMT.now : `${FMT.in} ${clockWords(sec)}`;
}

/** A corrected-time gap: «+1:05» · «−0:48» · «+1:02:03». */
export function gap(sec: number | undefined | null): string {
  if (!ok(sec)) return FMT.none;
  const s = Math.round(Math.abs(sec));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const body = h ? `${h}:${p2(m % 60)}:${p2(s % 60)}` : `${m}:${p2(s % 60)}`;
  return `${sec < 0 ? FMT.minus : '+'}${body}`;
}

/** «1 μανούβρα» · «2 μανούβρες» · with `zero`: «χωρίς μανούβρες». */
export function count(n: number, one: string, many: string, zero?: string): string {
  if (n === 0 && zero !== undefined) return zero;
  return `${n} ${n === 1 ? one : many}`;
}

// ---------------------------------------------------------------------------
// Parsing what people type (DateTimeField, P-064)

/** «23/11/2026» (also «23.11.2026», «23-11-26», «1/2/2026», «23112026») → { y, m (1–12), d }; undefined if not a real date. */
export function parseDate(text: string): { y: number; m: number; d: number } | undefined {
  const raw = text.trim();
  const t = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2}|\d{4})$/.exec(raw) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(raw);
  if (!t) return undefined;
  const d = Number(t[1]);
  const m = Number(t[2]);
  const y = t[3].length === 2 ? 2000 + Number(t[3]) : Number(t[3]);
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) return undefined;
  return { y, m, d };
}

/** «11:00» (also «11.00», «9:05», «1100», «9», «9.30») → { h, min }; undefined if not a time. */
export function parseTime(text: string): { h: number; min: number } | undefined {
  const raw = text.trim();
  const t = /^(\d{1,2})\s*[:.]\s*(\d{2})$/.exec(raw) ?? /^(\d{1,2})(\d{2})$/.exec(raw) ?? /^(\d{1,2})()$/.exec(raw);
  if (!t) return undefined;
  const h = Number(t[1]);
  const min = t[2] ? Number(t[2]) : 0;
  return h <= 23 && min <= 59 ? { h, min } : undefined;
}

/** While typing digits only: «2311» → «23/11», «23112026» → «23/11/2026» (the «/» come by themselves). */
export function autoDate(text: string): string {
  if (!/^[\d/]+$/.test(text)) return text;
  // Typed digit by digit the text already has the «/» it put in («28/112» → «28/11/2»); a date
  // written another way («1/2/2026») or a «/» typed by hand at the end is left as it is.
  const parts = text.split('/');
  if (text.endsWith('/') || parts.slice(0, -1).some((p) => p.length !== 2)) return text;
  const x = parts.join('').slice(0, 8);
  return x.length <= 2 ? x : x.length <= 4 ? `${x.slice(0, 2)}/${x.slice(2)}` : `${x.slice(0, 2)}/${x.slice(2, 4)}/${x.slice(4)}`;
}

/** While typing digits only: «110» → «11:0», «1100» → «11:00». */
export function autoTime(text: string): string {
  if (!/^\d+$/.test(text)) return text;
  const x = text.slice(0, 4);
  return x.length <= 2 ? x : `${x.slice(0, 2)}:${x.slice(2)}`;
}

/** Local date + optional time → ms. Undefined when the date is missing or wrong: never «now» by itself. */
export function dateTimeToMs(dateText: string, timeText?: string): number | undefined {
  const d = parseDate(dateText);
  if (!d) return undefined;
  const t = timeText === undefined || timeText.trim() === '' ? { h: 0, min: 0 } : parseTime(timeText);
  if (!t) return undefined;
  return new Date(d.y, d.m - 1, d.d, t.h, t.min).getTime();
}

/**
 * A text made for a machine as well (the rule advice also goes to the AI as it is):
 * its decimal dots become commas for the screen, «7.0 kt» → «7,0 kt».
 */
export function displayText(text: string): string {
  return text.replace(/(\d)\.(\d)/g, `$1${FMT.decimal}$2`);
}
