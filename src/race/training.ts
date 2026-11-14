import type { Helm, Lap, Manoeuvre, Race, SessionKind, TrackPoint, TrainingGoal } from './types';
import { countManoeuvres, sailed } from './analysis';
import { kindOf } from './session';
import { activeSpans, intersect, inSpans, overlapMs, pausedMs, pointsPerSpan, type Span } from './pauses';

/**
 * Training v1 (P-035): laps, % of target per point of sail and wind band, manoeuvres
 * with the time back to 90% of target, and the one summary used by the screen, the
 * crew share and `/analysis`. Pure functions; times in ms, the summary in seconds.
 */

export const GOALS: { id: TrainingGoal; name: string }[] = [
  { id: 'free', name: 'Ελεύθερη' },
  { id: 'upwind', name: 'Ταχύτητα όρτσα' },
  { id: 'downwind', name: 'Πρίμα/γωνίες VMG' },
  { id: 'tacks', name: 'Αναστροφές' },
  { id: 'gybes', name: 'Υποσταυρώσεις' },
  { id: 'starts', name: 'Εκκινήσεις' },
];

export const goalOf = (r: Pick<Race, 'goal'>): TrainingGoal => r.goal ?? 'free';
export const goalName = (g: TrainingGoal) => GOALS.find((x) => x.id === g)?.name ?? 'Ελεύθερη';
/** Subtitle of the session bar: «Ταχύτητα όρτσα», or «Ελεύθερη προπόνηση». */
export const goalSub = (g: TrainingGoal) => (g === 'free' ? 'Ελεύθερη προπόνηση' : goalName(g));

/** The % of target is not counted for this long after each manoeuvre. */
export const AFTER_MANOEUVRE_MS = 25_000;
/** Recovery: back to this % of target … */
export const RECOVER_PCT = 90;
/** … within this many seconds, else «>1:30». */
export const RECOVER_MAX_SEC = 90;
/** «Γύρος» pressed again within this is a double tap (gloves) and is ignored. */
export const LAP_GUARD_MS = 3_000;
/** «↶ Αναίρεση» of a lap stays this long. */
export const LAP_UNDO_MS = 5_000;
/** Lap notes («Τριμάρισμα») are at most this long. */
export const TRIM_MAX = 60;
/** Wind bands of the % table, in knots. */
export const BAND_KT = 4;
/** Crew share limit, as on the server. */
export const MAX_SHARE_BYTES = 32 * 1024;

export type Leg = 'upwind' | 'reach' | 'downwind';
/** Leg from the true wind angle: < 70° upwind, 70–120° reaching, > 120° downwind. */
export function legOfTwa(twa: number): Leg {
  const a = Math.abs(twa);
  return a < 70 ? 'upwind' : a <= 120 ? 'reach' : 'downwind';
}
export const LEG_NAME: Record<Leg, string> = { upwind: 'Όρτσα', reach: 'Πλαγιοδρομία', downwind: 'Πρίμα' };

/** «8–12»: the 4-knot band of a wind speed. */
export function bandOf(tws: number): string {
  const lo = Math.max(0, Math.floor(tws / BAND_KT) * BAND_KT);
  return `${lo}–${lo + BAND_KT}`;
}
const bandLo = (b: string) => Number(b.split('–')[0]);

// ---------------------------------------------------------------------------
// Time: kind spans, active (unpaused) intervals

export interface Opts {
  /** Only the stretches of this kind (the crew share: only the training part). */
  kindOnly?: SessionKind;
  /** End of a running session. */
  now?: number;
}

const lastT = (r: Pick<Race, 'track'>) => r.track.reduce<number | undefined>((m, p) => (m === undefined || p.t > m ? p.t : m), undefined);

/** End used for a session: its finish, else `now`, else the last point. */
export const endOf = (r: Race, now?: number) => r.finish ?? now ?? lastT(r) ?? r.start;

/** Which kind the session was when, from the start to `end` (training ↔ cruise switches, `kindLog`). */
export function kindSpans(r: Race, end: number): (Span & { kind: SessionKind })[] {
  const log = (r.kindLog ?? []).filter((x) => x.at >= r.start && x.at < end).sort((a, b) => a.at - b.at);
  // The log holds the switches; the first kind is the other one of the first switch.
  let kind: SessionKind = log.length ? (log[0].kind === 'training' ? 'cruise' : 'training') : kindOf(r);
  if (log.length && kindOf(r) === 'race') kind = 'race';
  const out: (Span & { kind: SessionKind })[] = [];
  let from = r.start;
  for (const x of log) {
    if (x.at > from) out.push({ from, to: x.at, kind });
    kind = x.kind;
    from = x.at;
  }
  if (end > from) out.push({ from, to: end, kind });
  return out;
}

/** Stretches of the session without pauses, optionally only those of one kind. */
export function activeIntervals(r: Race, o: Opts = {}): Span[] {
  const end = endOf(r, o.now);
  const act = activeSpans(r, end);
  if (!o.kindOnly) return act;
  return intersect(
    act,
    kindSpans(r, end).filter((k) => k.kind === o.kindOnly),
  );
}

const sum = (spans: Span[]) => spans.reduce((s, x) => s + x.to - x.from, 0);

/** Running time of the session without the pauses (the bar's clock). */
export const activeMs = (r: Race, now: number) => sum(activeSpans(r, endOf(r, now)));

// ---------------------------------------------------------------------------
// Laps

export interface LapBound {
  n: number;
  from: number;
  to: number;
  note: Omit<Lap, 't'>;
}

const noteOf = (l?: Lap): Omit<Lap, 't'> => (l ? { sail: l.sail, helm: l.helm, trim: l.trim } : {});

/** Lap limits: from each lap start to the next (the last one to the end). Without laps: one lap, all of it. */
export function lapBounds(r: Race, end: number): LapBound[] {
  const laps = r.laps ?? [];
  if (laps.length < 2) return [{ n: 1, from: r.start, to: end, note: noteOf(laps[0]) }];
  return laps.map((l, i) => ({ n: i + 1, from: i === 0 ? r.start : l.t, to: i + 1 < laps.length ? laps[i + 1].t : end, note: noteOf(l) }));
}

export interface LapRow {
  n: number;
  sec: number;
  pct: number | null;
  sail?: string;
  helm?: Helm;
  trim?: string;
}

/** Each lap: time without pauses and without cruise stretches, and its mean % of target. */
export function lapStats(r: Race, o: Opts = {}): LapRow[] {
  const end = endOf(r, o.now);
  const spans = activeIntervals(r, { now: o.now, kindOnly: 'training' });
  const pts = pctPoints(r, spans);
  return lapBounds(r, end).map((b) => {
    const inLap = pts.filter((p) => p.t >= b.from && p.t < b.to + (b.to === end ? 1 : 0));
    return {
      n: b.n,
      sec: Math.round(overlapMs(spans, b.from, b.to) / 1000),
      pct: pctOf(inLap),
      ...cleanNote(b.note),
    };
  });
}

function cleanNote(n: Omit<Lap, 't'>): Omit<Lap, 't'> {
  const out: Omit<Lap, 't'> = {};
  if (n.sail) out.sail = n.sail.slice(0, TRIM_MAX);
  if (n.helm === 'Α' || n.helm === 'Β' || n.helm === 'Γ') out.helm = n.helm;
  if (n.trim?.trim()) out.trim = n.trim.trim().slice(0, TRIM_MAX);
  return out;
}

/** The best lap (shortest), only when there are at least 2 laps; laps under 30″ do not count. */
export function bestLap(laps: Pick<LapRow, 'n' | 'sec'>[]): number | undefined {
  if (laps.length < 2) return undefined;
  const ok = laps.filter((l) => l.sec >= 30);
  if (!ok.length) return undefined;
  return ok.reduce((b, l) => (l.sec < b.sec ? l : b)).n;
}

/** Live: the laps done so far (newest last) and the running one. */
export function liveLaps(r: Race, now: number): { done: { n: number; sec: number }[]; current: { n: number; sec: number; from: number } } {
  const spans = activeIntervals(r, { now, kindOnly: 'training' });
  const laps = r.laps ?? [];
  const starts = laps.length ? laps.map((l, i) => (i === 0 ? r.start : l.t)) : [r.start];
  const done = starts.slice(0, -1).map((from, i) => ({ n: i + 1, sec: Math.round(overlapMs(spans, from, starts[i + 1]) / 1000) }));
  const from = starts[starts.length - 1];
  return { done, current: { n: starts.length, sec: Math.round(overlapMs(spans, from, now) / 1000), from } };
}

/**
 * Patch for «Γύρος» at `now`: closes the running lap and starts the next; undefined on a double tap.
 * The new lap keeps the helm of the lap before (AC 11) unless `note` gives one.
 */
export function addLap(r: Race, now: number, note: Omit<Lap, 't'> = {}): Partial<Race> | undefined {
  // The first press also writes lap 1, with the sail of the Live.
  const laps: Lap[] = r.laps?.length ? r.laps : [{ t: r.start, ...(note.sail ? { sail: note.sail } : {}) }];
  const last = laps[laps.length - 1];
  if (now - last.t < LAP_GUARD_MS || now <= r.start) return undefined;
  const helm = note.helm ?? last.helm;
  return { laps: [...laps, { t: now, ...note, ...(helm ? { helm } : {}) }] };
}

/** Patch for «↶ Αναίρεση»: the last lap limit goes. */
export function undoLap(r: Race): Partial<Race> | undefined {
  if (!r.laps || r.laps.length < 2) return undefined;
  const laps = r.laps.slice(0, -1);
  return { laps: laps.length < 2 ? (laps[0] && Object.keys(laps[0]).length > 1 ? laps : undefined) : laps };
}

/**
 * Patch for the note of lap `n` (1-based). The note is written on the lap that just closed,
 * after the next one started: a helm set on the lap right before the running one goes on to the
 * running lap too, unless that lap already has a helm of its own (not the one it carried over).
 */
export function noteLap(r: Race, n: number, note: Omit<Lap, 't'>): Partial<Race> {
  const laps = r.laps?.length ? [...r.laps] : [{ t: r.start }];
  if (n < 1 || n > laps.length) return {};
  const before = laps[n - 1].helm;
  laps[n - 1] = { ...laps[n - 1], ...note, ...(note.trim !== undefined ? { trim: note.trim.slice(0, TRIM_MAX) } : {}) };
  const running = laps[n];
  if (note.helm && n === laps.length - 1 && (!running.helm || running.helm === before)) laps[n] = { ...running, helm: note.helm };
  return { laps };
}

// ---------------------------------------------------------------------------
// % of target

/** Manoeuvres of the session: found live, else (older or unrecorded ones) from the track. */
export function manoeuvresOf(r: Race): Manoeuvre[] {
  if (r.manoeuvres) return r.manoeuvres;
  return countManoeuvres([...r.track].sort((a, b) => a.t - b.t)).at.map((m) => ({ t: m.t, kind: m.kind }));
}

const validPct = (p: TrackPoint) => p.pct !== undefined && Number.isFinite(p.pct) && p.pct > 0.3 && p.pct < 1.5;

/** Points with a usable % of target inside the spans, without the 25″ after each manoeuvre. */
export function pctPoints(r: Race, spans: Span[]): TrackPoint[] {
  const man = manoeuvresOf(r).map((m) => m.t);
  return r.track.filter((p) => validPct(p) && inSpans(spans, p.t) && !man.some((t) => p.t >= t && p.t < t + AFTER_MANOEUVRE_MS));
}

const pctOf = (pts: TrackPoint[]): number | null => (pts.length ? Math.round((pts.reduce((s, p) => s + p.pct!, 0) / pts.length) * 100) : null);

export interface PctCell {
  leg: Leg;
  band: string;
  pct: number | null;
}

/** % of target per point of sail and 4-knot wind band (every band that has data, «—» = null elsewhere). */
export function pctByLegAndBand(r: Race, o: Opts = {}): PctCell[] {
  const pts = pctPoints(r, activeIntervals(r, o)).filter((p) => p.twa !== undefined && p.tws !== undefined);
  const bands = [...new Set(pts.map((p) => bandOf(p.tws!)))].sort((a, b) => bandLo(a) - bandLo(b)).slice(0, 10);
  const out: PctCell[] = [];
  for (const leg of ['upwind', 'reach', 'downwind'] as Leg[])
    for (const band of bands) out.push({ leg, band, pct: pctOf(pts.filter((p) => legOfTwa(p.twa!) === leg && bandOf(p.tws!) === band)) });
  return out;
}

// ---------------------------------------------------------------------------
// Manoeuvres

export interface ManoeuvreRow {
  kind: 'tack' | 'gybe';
  count: number;
  avgRecoverSec: number | null;
  bestRecoverSec: number | null;
}

export function manoeuvreStats(r: Race, o: Opts = {}): ManoeuvreRow[] {
  const spans = activeIntervals(r, o);
  const ms = manoeuvresOf(r).filter((m) => inSpans(spans, m.t));
  return (['tack', 'gybe'] as const).map((kind) => {
    const k = ms.filter((m) => m.kind === kind);
    const rec = k.map((m) => m.recoverSec).filter((x): x is number => x !== undefined && Number.isFinite(x));
    return {
      kind,
      count: k.length,
      avgRecoverSec: rec.length ? Math.round(rec.reduce((a, b) => a + b, 0) / rec.length) : null,
      bestRecoverSec: rec.length ? Math.min(...rec) : null,
    };
  });
}

export interface PctSampleAt {
  t: number;
  /** % of target (0–150) at that moment. */
  pct?: number;
}

/**
 * Seconds from a manoeuvre at `t` until the mean % of target of the samples after it
 * (a window of up to 15″, at least 2 samples) is back at ≥ 90%. Undefined: not yet
 * (or not within 90″, see `recoveryDone`).
 */
export function recoverySec(samples: PctSampleAt[], t: number, windowMs = 15_000): number | undefined {
  const after = samples.filter((s) => s.t > t && s.pct !== undefined && Number.isFinite(s.pct)).sort((a, b) => a.t - b.t);
  for (let i = 1; i < after.length; i++) {
    const at = after[i].t;
    if (at - t > RECOVER_MAX_SEC * 1000) return undefined;
    const win = after.slice(0, i + 1).filter((s) => s.t > Math.max(t, at - windowMs));
    if (win.length < 2) continue;
    const mean = win.reduce((a, s) => a + s.pct!, 0) / win.length;
    if (mean >= RECOVER_PCT) return Math.round((at - t) / 1000);
  }
  return undefined;
}

/** The recovery of a manoeuvre at `t` is settled by `now`: measured, or over 90″. */
export const recoveryDone = (samples: PctSampleAt[], t: number, now: number) =>
  recoverySec(samples, t) !== undefined || now - t > RECOVER_MAX_SEC * 1000;

/**
 * New manoeuvres in the dense in-memory samples (signed TWA every few seconds),
 * not yet in `known` (within 30″ of one counts as the same).
 */
export function newManoeuvres(samples: { t: number; twa?: number }[], known: { t: number }[], minHoldSec = 20): { t: number; kind: 'tack' | 'gybe' }[] {
  const pts = samples.map((s) => ({ t: s.t, twa: s.twa, lat: 0, lon: 0 }));
  return countManoeuvres(pts, minHoldSec).at.filter((m) => !known.some((k) => Math.abs(k.t - m.t) < 30_000));
}

// ---------------------------------------------------------------------------
// The summary (screen, crew, /analysis)

export interface TrainingSummary {
  durationSec: number;
  distanceNm: number | null;
  twsMin: number | null;
  twsMax: number | null;
  avgPct: number | null;
  pausedSec: number;
  indicative: boolean;
  /** Set when the session later became a cruise: the training part ends here (ms). */
  trainingUntil?: number;
  laps: LapRow[];
  pctTable: PctCell[];
  manoeuvres: ManoeuvreRow[];
}

/** What the crew gets (PUT /crews/:crewId/races/:raceId): numbers and notes, never a position. */
export interface TrainingShare {
  kind: 'training';
  name: string;
  start: number;
  goal: TrainingGoal;
  note?: string;
  summary: TrainingSummary;
}

/** The training summary; `kindOnly: 'training'` for the crew (only the training stretches). */
export function trainingSummary(r: Race, o: Opts = {}): TrainingSummary {
  const end = endOf(r, o.now);
  const spans = activeIntervals(r, o);
  const pts = r.track.filter((p) => inSpans(spans, p.t));
  const segs = pointsPerSpan(r.track, spans);
  const moved = segs.some((s) => s.length > 1);
  const tws = pts.map((p) => p.tws).filter((x): x is number => x !== undefined && Number.isFinite(x));
  const kinds = kindSpans(r, end);
  const trainings = kinds.filter((k) => k.kind === 'training');
  const lastTraining = trainings[trainings.length - 1];
  const afterTraining = !!lastTraining && kinds.some((k) => k.kind !== 'training' && k.from >= lastTraining.to);
  const man = manoeuvresOf(r).filter((m) => inSpans(spans, m.t));
  const s: TrainingSummary = {
    durationSec: Math.round(sum(spans) / 1000),
    distanceNm: moved ? Math.round(segs.reduce((d, g) => d + sailed(g), 0) * 10) / 10 : null,
    twsMin: tws.length ? Math.round(Math.min(...tws)) : null,
    twsMax: tws.length ? Math.round(Math.max(...tws)) : null,
    avgPct: pctOf(pctPoints(r, spans)),
    pausedSec: Math.round(pausedMs(r, end) / 1000),
    indicative: !pts.some((p) => p.src === 'instruments') || man.some((m) => m.indicative),
    laps: lapStats(r, { now: o.now }),
    pctTable: pctByLegAndBand(r, o),
    manoeuvres: manoeuvreStats(r, o),
  };
  if (o.kindOnly === 'training' && afterTraining) s.trainingUntil = lastTraining.to;
  return s;
}

const bytes = (x: unknown) => new TextEncoder().encode(JSON.stringify(x)).length;

/**
 * The crew share of a training: only its training stretches. Over 32 KB, the trim notes
 * of the oldest laps go first; still too big, the lap rows are cut from the oldest.
 */
export function trainingShare(r: Race, o: Pick<Opts, 'now'> = {}): TrainingShare {
  const summary = trainingSummary(r, { ...o, kindOnly: 'training' });
  const note = r.crewNote?.trim().slice(0, 500);
  const share: TrainingShare = {
    kind: 'training',
    name: (r.name || 'Προπόνηση').slice(0, 80),
    start: r.start,
    goal: goalOf(r),
    ...(note ? { note } : {}),
    summary: { ...summary, laps: summary.laps.slice(0, 100), pctTable: summary.pctTable.slice(0, 30), manoeuvres: summary.manoeuvres.slice(0, 2) },
  };
  return fitShare(share);
}

/** Cuts the share to `max` bytes: first the trim notes of the oldest laps. */
export function fitShare(share: TrainingShare, max = MAX_SHARE_BYTES): TrainingShare {
  const s: TrainingShare = { ...share, summary: { ...share.summary, laps: share.summary.laps.map((l) => ({ ...l })) } };
  for (const l of s.summary.laps) {
    if (bytes(s) <= max) break;
    delete l.trim;
  }
  return s;
}

/** Body of `/analysis` for a training: the same summary, with «Τι δουλεύουμε» and the name. */
export function analysisBody(r: Race, o: Pick<Opts, 'now'> = {}) {
  return { summary: { ...trainingSummary(r, o), goal: goalOf(r), name: (r.name || 'Προπόνηση').slice(0, 80) }, kind: 'training' as const };
}

/** Order of the summary cards per «Τι δουλεύουμε» (AC 21). */
export type SummaryCard = 'laps' | 'pct' | 'manoeuvres' | 'track';
export function cardOrder(g: TrainingGoal): SummaryCard[] {
  if (g === 'tacks' || g === 'gybes') return ['manoeuvres', 'laps', 'pct', 'track'];
  if (g === 'upwind' || g === 'downwind') return ['pct', 'laps', 'manoeuvres', 'track'];
  return ['laps', 'pct', 'manoeuvres', 'track'];
}

/** «6:42», «1:02:05». */
export function mss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Whether a received share looks like a training share (the crew list mixes race plans and trainings). */
export const isTrainingShare = (d: unknown): d is TrainingShare =>
  !!d && typeof d === 'object' && (d as { kind?: unknown }).kind === 'training' && typeof (d as { summary?: unknown }).summary === 'object';
