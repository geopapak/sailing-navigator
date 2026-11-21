/**
 * The plan target (P-067 §Λ): what the forecast and the optimal route are for. In the race
 * setup and inside a race session it is the race (its start and marks); in «Σκάφη → Διαδρομές μου»
 * the chosen course and the map's «Ώρα εκκίνησης». Pure rules: the forecast's date range and the
 * model horizon, whether a forecast covers the start, whether a stored route is still current,
 * the one automatic refresh, and the Greek labels.
 */
import { day as fmtDay, dayTime, span, qty } from '../format';
import { MODELS, CONSENSUS_ID, CONSENSUS_MODELS } from '../weather/models';
import type { GridForecast } from '../weather/types';
import type { Mark, RouteResult } from './isochrones';

const HOUR = 3_600_000;
const DAY = 86_400_000;

export interface PlanTarget {
  /** Set for a race: the route is stored as `planned:<raceId>`. */
  raceId?: string;
  /** Start (local time, ms); undefined while there is no time. */
  start?: number;
  /** Midnight of the start day when only the date is known (no time yet). */
  day?: number;
  marks: Mark[];
  /** The course or race name, for titles. */
  label: string;
}

/** A route stored for a race, with what it was computed for. */
export interface StoredPlan {
  route: RouteResult;
  start: number;
  marksKey: string;
  /** The forecast it used (its `fetchedAt`); undefined with the «Σταθερός» wind. */
  forecastAt?: number;
  /** When it was computed. */
  at: number;
}

export const plannedKey = (raceId: string) => `planned:${raceId}`;

/** Identity of a course's geometry (marks in order). */
export const marksKey = (marks: Pick<Mark, 'lat' | 'lon'>[]): string => marks.map((m) => `${m.lat.toFixed(5)},${m.lon.toFixed(5)}`).join(';');

/** Days the model forecasts ahead (best match: 16, Open-Meteo's horizon). */
export function horizonDays(model: string): number {
  if (model === 'best_match') return 16;
  if (model === CONSENSUS_ID) return Math.min(...CONSENSUS_MODELS.map((id) => MODELS.find((m) => m.id === id)?.days ?? 16));
  return MODELS.find((m) => m.id === model)?.days ?? 16;
}

const isoUtcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const utcMidnight = (ms: number) => Math.floor(ms / DAY) * DAY;

/** The last hour the model gives, from `now`: the end of the (days)th UTC day. */
export const horizonEnd = (now: number, model: string): number => utcMidnight(now) + horizonDays(model) * DAY - HOUR;

export type ForecastRange = { startDate: string; endDate: string; from: number; to: number } | { beyond: { horizonEnd: number; retryFrom: number } };

/**
 * The dates asked from Open-Meteo (UTC days, `timezone=GMT`): [min(now, start) − 1 h, max(now, start) + 2 days],
 * cut at the model horizon, so one forecast also serves the home «Καιρός» card. A start past the
 * horizon asks for nothing and says from when to try again.
 */
export function forecastRange(now: number, start: number | undefined, model: string): ForecastRange {
  const s = start ?? now;
  const end = horizonEnd(now, model);
  if (s > end) return { beyond: { horizonEnd: end, retryFrom: utcMidnight(s) - (horizonDays(model) - 1) * DAY } };
  const from = Math.min(now, s) - HOUR;
  const to = Math.min(end, Math.max(now, s) + 2 * DAY);
  return { startDate: isoUtcDay(from), endDate: isoUtcDay(to), from, to };
}

/**
 * QA Μ2: a new download never covers less than the forecast already on the device (same model):
 * the Home «Καιρός» card asks for now + 2 days, and must not cut off a race on Saturday.
 * The end stays cut at the model horizon.
 */
export function widenRange(
  range: { startDate: string; endDate: string; from: number; to: number },
  prev: Pick<GridForecast, 'times' | 'model'> | undefined,
  now: number,
  model: string,
): { startDate: string; endDate: string; from: number; to: number } {
  const last = prev && prev.model === model && prev.times.length ? prev.times[prev.times.length - 1] : undefined;
  if (last === undefined || last <= range.to) return range;
  const to = Math.min(horizonEnd(now, model), last);
  return to > range.to ? { ...range, to, endDate: isoUtcDay(to) } : range;
}

export type Coverage = 'none' | 'covers' | 'partial' | 'not';

/** Does the forecast cover the start (and the estimated finish)? */
export function coverage(f: Pick<GridForecast, 'times'> | undefined, start: number | undefined, estEnd?: number): Coverage {
  if (!f || !f.times.length) return 'none';
  const first = f.times[0];
  const last = f.times[f.times.length - 1];
  if (start === undefined) return 'covers';
  if (start < first - HOUR || start > last) return 'not';
  return estEnd !== undefined && estEnd > last ? 'partial' : 'covers';
}

/** Whether the stored route belongs to this target, and to the forecast now on the device. */
export function planState(p: StoredPlan | undefined, target: Pick<PlanTarget, 'start' | 'marks'>, forecastAt?: number): 'none' | 'current' | 'stale' | 'oldForecast' {
  if (!p) return 'none';
  if (target.start === undefined || p.start !== target.start || p.marksKey !== marksKey(target.marks)) return 'stale';
  if (p.forecastAt !== undefined && forecastAt !== undefined && p.forecastAt !== forecastAt) return 'oldForecast';
  return 'current';
}

/** Automatic refresh (KA-Λ9, Π2): forecast older than 6 h, start within 72 h, at most once in 6 h per device. */
export const AUTO_STALE_MS = 6 * HOUR;
export const AUTO_AHEAD_MS = 72 * HOUR;
export function shouldAutoRefresh(o: { now: number; start?: number; fetchedAt?: number; lastAutoAt?: number; online: boolean }): boolean {
  if (!o.online || o.start === undefined) return false;
  if (o.start - o.now > AUTO_AHEAD_MS) return false;
  if (o.fetchedAt !== undefined && o.now - o.fetchedAt <= AUTO_STALE_MS) return false;
  if (o.lastAutoAt !== undefined && o.now - o.lastAutoAt < AUTO_STALE_MS) return false;
  return true;
}

export const PLAN_TEXT = {
  forFull: (start: number, model: string, fetchedAt: number) => `Πρόγνωση για ${dayTime(start)} · ${model} · λήψη ${dayTime(fetchedAt)}`,
  forDay: (d: number) => `Πρόγνωση για ${fmtDay(d)} (χωρίς ώρα)`,
  offline: ' (χωρίς ίντερνετ)',
  none: 'Δεν υπάρχει πρόγνωση για τον αγώνα ακόμα.',
  notCovering: 'Η πρόγνωση δεν φτάνει ως τον αγώνα.',
  offlineNotCovering: (fetchedAt: number) => `Χωρίς ίντερνετ, και η αποθηκευμένη πρόγνωση (λήψη ${dayTime(fetchedAt)}) δεν φτάνει ως τον αγώνα.`,
  beyond: (horizon: number, start: number, retry: number) =>
    `Η πρόγνωση φτάνει ως ${fmtDay(horizon)}. Ο αγώνας είναι ${dayTime(start)}: δοκίμασε ξανά από ${fmtDay(retry)}, ή διάλεξε «Σταθερός» άνεμο.`,
  partial: (last: number) => `Η πρόγνωση τελειώνει στις ${dayTime(last)}· μετά κρατάμε τον άνεμο της τελευταίας ώρας.`,
  past: (start: number) => `Η ώρα εκκίνησης πέρασε (${dayTime(start)}). Άλλαξέ την αν μετατέθηκε.`,
  noTime: 'Βάλε ώρα εκκίνησης για τη βέλτιστη διαδρομή.',
  refreshed: (fetchedAt: number) => `Ανανεώθηκε η πρόγνωση (λήψη ${dayTime(fetchedAt)})`,
  oldForecast: (fetchedAt: number) => `Υπολογίστηκε με πρόγνωση της ${dayTime(fetchedAt)}`,
  stale: 'Η διαδρομή υπολογίστηκε για άλλη ώρα ή διαδρομή',
  again: 'Ξανά υπολογισμός',
  computed: (at: number, r: Pick<RouteResult, 'elapsedSec' | 'rhumbNm'>) => `Υπολογίστηκε ${dayTime(at)} · ${span(r.elapsedSec)} · ${qty(r.rhumbNm, 'NM')}`,
  compareFor: (start: number) => `για ${dayTime(start)}`,
  failed: 'Ο υπολογισμός απέτυχε.',
} as const;

/**
 * The forecast line of a target and whether «Υπολογισμός» may run with the forecast.
 * `beyond`: the range said the start is past the horizon.
 */
export function forecastStatus(o: {
  target: Pick<PlanTarget, 'start' | 'day'>;
  forecast?: Pick<GridForecast, 'times' | 'fetchedAt' | 'model'>;
  modelLabel: string;
  now: number;
  online: boolean;
  /** Model chosen for the next fetch (for the horizon). */
  model: string;
  estEnd?: number;
}): { lines: string[]; canCompute: boolean; warn: boolean } {
  const { target: t, forecast: f, now } = o;
  const lines: string[] = [];
  if (t.start === undefined) {
    if (t.day !== undefined) lines.push(PLAN_TEXT.forDay(t.day));
    lines.push(PLAN_TEXT.noTime);
    return { lines, canCompute: false, warn: true };
  }
  if (t.start < now) lines.push(PLAN_TEXT.past(t.start));
  const range = forecastRange(now, t.start, o.model);
  const cov = coverage(f, t.start, o.estEnd);
  if (cov === 'none' || cov === 'not') {
    if ('beyond' in range) lines.push(PLAN_TEXT.beyond(range.beyond.horizonEnd, t.start, range.beyond.retryFrom));
    else if (!f) lines.push(PLAN_TEXT.none);
    else lines.push(o.online ? PLAN_TEXT.notCovering : PLAN_TEXT.offlineNotCovering(f.fetchedAt));
    return { lines, canCompute: false, warn: true };
  }
  lines.unshift(PLAN_TEXT.forFull(t.start, o.modelLabel, f!.fetchedAt) + (o.online ? '' : PLAN_TEXT.offline));
  if (cov === 'partial') lines.push(PLAN_TEXT.partial(f!.times[f!.times.length - 1]));
  return { lines, canCompute: true, warn: cov === 'partial' || t.start < now };
}
