import type { Pause, Race, TrackPoint } from './types';

/**
 * «⏸ Παύση» (P-039): while a training or cruise is paused nothing is recorded and
 * no alert sounds; the paused time counts in neither duration, distance nor % of target.
 * Pure helpers on `Race.pauses`; a race never has pauses.
 */

export interface Span {
  from: number;
  to: number;
}

/** The session is paused now: its last pause has no end. */
export function isPaused(r: Pick<Race, 'pauses'>): boolean {
  const p = r.pauses?.[r.pauses.length - 1];
  return !!p && p.to === undefined;
}

/** Since when the open pause lasts, if any. */
export const pausedSince = (r: Pick<Race, 'pauses'>): number | undefined => (isPaused(r) ? r.pauses![r.pauses!.length - 1].from : undefined);

/** Pauses as closed spans, an open one ending at `end`, clipped to [start, end]. */
export function pauseSpans(r: Pick<Race, 'pauses' | 'start'>, end: number, start = r.start): Span[] {
  const out: Span[] = [];
  for (const p of r.pauses ?? []) {
    const from = Math.max(start, p.from);
    const to = Math.min(end, p.to ?? end);
    if (to > from) out.push({ from, to });
  }
  return out.sort((a, b) => a.from - b.from);
}

/** Milliseconds paused in [start, end]. */
export const pausedMs = (r: Pick<Race, 'pauses' | 'start'>, end: number) => pauseSpans(r, end).reduce((s, p) => s + p.to - p.from, 0);

/** End of the last finished pause (after it the track has a hole that is not a GPS loss). */
export function lastPauseEnd(r: Pick<Race, 'pauses'>): number | undefined {
  let t: number | undefined;
  for (const p of r.pauses ?? []) if (p.to !== undefined && (t === undefined || p.to > t)) t = p.to;
  return t;
}

/** A span minus some cuts (sorted or not). */
export function subtract(span: Span, cuts: Span[]): Span[] {
  let out: Span[] = [span];
  for (const c of cuts) {
    const next: Span[] = [];
    for (const s of out) {
      if (c.to <= s.from || c.from >= s.to) next.push(s);
      else {
        if (c.from > s.from) next.push({ from: s.from, to: c.from });
        if (c.to < s.to) next.push({ from: c.to, to: s.to });
      }
    }
    out = next;
  }
  return out.filter((s) => s.to > s.from);
}

/** Spans of [start, end] that were not paused. */
export const activeSpans = (r: Pick<Race, 'pauses' | 'start'>, end: number, start = r.start): Span[] =>
  end > start ? subtract({ from: start, to: end }, pauseSpans(r, end, start)) : [];

/** Two lists of spans, intersected. */
export function intersect(a: Span[], b: Span[]): Span[] {
  const out: Span[] = [];
  for (const x of a) for (const y of b) {
    const from = Math.max(x.from, y.from);
    const to = Math.min(x.to, y.to);
    if (to > from) out.push({ from, to });
  }
  return out.sort((p, q) => p.from - q.from);
}

/** Milliseconds of the spans inside [from, to]. */
export const overlapMs = (spans: Span[], from: number, to: number) =>
  spans.reduce((s, x) => s + Math.max(0, Math.min(to, x.to) - Math.max(from, x.from)), 0);

export const inSpans = (spans: Span[], t: number) => spans.some((s) => t >= s.from && t <= s.to);

/** Track points grouped per span (points outside every span are dropped). */
export function pointsPerSpan(track: TrackPoint[], spans: Span[]): TrackPoint[][] {
  const sorted = [...track].sort((a, b) => a.t - b.t);
  return spans.map((s) => sorted.filter((p) => p.t >= s.from && p.t <= s.to)).filter((g) => g.length > 0);
}

/**
 * The track cut at every pause (GPX `<trkseg>`, distance): a new segment begins
 * when a pause started between two points. A race (no pauses) is one segment.
 */
export function trackSegments(r: Pick<Race, 'track' | 'pauses'>): TrackPoint[][] {
  const pts = [...r.track].sort((a, b) => a.t - b.t);
  if (!pts.length) return [];
  const starts = (r.pauses ?? []).map((p) => p.from);
  const out: TrackPoint[][] = [[pts[0]]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1].t;
    const b = pts[i].t;
    if (starts.some((f) => f >= a && f < b)) out.push([pts[i]]);
    else out[out.length - 1].push(pts[i]);
  }
  return out;
}

/** Patch for «⏸ Παύση»; undefined in a race or when already paused. */
export function pauseAt(r: Race, now: number): Partial<Race> | undefined {
  if ((r.kind ?? 'race') === 'race' || r.status !== 'running' || isPaused(r)) return undefined;
  return { pauses: [...(r.pauses ?? []), { from: now }] };
}

/** Patch for «▶ Συνέχεια»; undefined when not paused. */
export function resumeAt(r: Race, now: number): Partial<Race> | undefined {
  if (!isPaused(r)) return undefined;
  const ps = [...r.pauses!];
  const last = ps[ps.length - 1];
  ps[ps.length - 1] = { from: last.from, to: Math.max(last.from, now) };
  return { pauses: ps };
}

/** Pauses when the session ends at `at` (AC 18): an open one closes then, later ones go. */
export function closePausesAt(pauses: Pause[] | undefined, at: number): Pause[] | undefined {
  if (!pauses) return pauses;
  return pauses.filter((p) => p.from < at).map((p) => ({ from: p.from, to: Math.min(p.to ?? at, at) }));
}
