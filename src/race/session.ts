import type { Race, SessionKind, TrainingGoal } from './types';
import { RECORD_BEFORE_MS } from './gaps';
import { sailed } from './analysis';
import { activeSpans, closePausesAt, pausedMs, trackSegments } from './pauses';

/**
 * Sessions ("έξοδοι", P-033): a race, a training sail or a cruise. They share the
 * `Race` model; these helpers hold the rules that differ per kind.
 */

/** A race saved before sessions existed has no kind: it is a race. */
export const kindOf = (r: Pick<Race, 'kind'>): SessionKind => r.kind ?? 'race';

export const KIND_INFO: Record<
  SessionKind,
  { name: string; upper: string; plural: string; desc: string; /** «Τελείωσε ο αγώνας;» */ the: string; /** «Ο αγώνας τρέχει…» */ The: string }
> = {
  race: { name: 'Αγώνας', upper: 'ΑΓΩΝΑΣ', plural: 'Αγώνες', desc: 'Διαδρομή, εκκίνηση, αντίπαλοι, διορθωμένος χρόνος', the: 'ο αγώνας', The: 'Ο αγώνας' },
  training: { name: 'Προπόνηση', upper: 'ΠΡΟΠΟΝΗΣΗ', plural: 'Προπονήσεις', desc: 'Στόχοι polar, γύροι, ανάλυση μετά', the: 'η προπόνηση', The: 'Η προπόνηση' },
  cruise: { name: 'Βόλτα', upper: 'ΒΟΛΤΑ', plural: 'Βόλτες', desc: 'Προορισμός, ETA, βάθη, καιρός', the: 'η βόλτα', The: 'Η βόλτα' },
};

export const SESSION_KINDS: SessionKind[] = ['race', 'training', 'cruise'];

/** Track interval per kind: race 5″, training 15″, cruise 15″ or 30″ (setting). */
export function trackEveryMs(kind: SessionKind, cruiseTrackSec: number = 30): number {
  if (kind === 'race') return 5_000;
  if (kind === 'training') return 15_000;
  return (cruiseTrackSec === 15 ? 15 : 30) * 1000;
}

/** The recording timer ticks every 5″; allow for timer jitter so 3 ticks still make 15″. */
const TICK_SLACK_MS = 500;

/** Whether the 5″ timer should write a new track point now. */
export function shouldWritePoint(lastT: number | undefined, now: number, everyMs: number): boolean {
  return lastT === undefined || now - lastT >= everyMs - TICK_SLACK_MS;
}

/** Minutes without a point before «η καταγραφή σταμάτησε»: max(0.5, 3 × interval). */
export const stallMinutes = (everyMs: number) => Math.max(0.5, (3 * everyMs) / 60_000);

/** When recording begins: a race 10′ before its start, the others at their start. */
export const recordFrom = (r: Pick<Race, 'kind' | 'start'>) => (kindOf(r) === 'race' ? r.start - RECORD_BEFORE_MS : r.start);

/** Our boat sails in this session (a cruise can start without one). */
export const hasOwnBoat = (r: Pick<Race, 'entries'>) => r.entries.some((e) => e.own);

/**
 * Only training and cruise switch between each other; a race stays a race.
 * Training needs our boat (AC 4), so a cruise without a boat stays a cruise.
 */
export function canSwitchKind(from: SessionKind, to: SessionKind, withBoat = true): boolean {
  return from !== to && from !== 'race' && to !== 'race' && (to !== 'training' || withBoat);
}

/** Patch that switches a running session's kind; undefined when not allowed. The track goes on. */
export function switchKind(r: Race, to: SessionKind, now: number): Partial<Race> | undefined {
  if (!canSwitchKind(kindOf(r), to, hasOwnBoat(r))) return undefined;
  const p: Partial<Race> = { kind: to, kindLog: [...(r.kindLog ?? []), { kind: to, at: now }] };
  // Training finds its manoeuvres live from here on.
  if (to === 'training' && !r.manoeuvres) p.manoeuvres = [];
  return p;
}

/**
 * A race ended before (or at) its start: cancelled or postponed. It has no
 * time, corrected time or position.
 */
export const isCancelled = (r: Pick<Race, 'kind' | 'status' | 'start' | 'finish'>) =>
  kindOf(r) === 'race' && r.status === 'finished' && r.finish !== undefined && r.finish <= r.start;

/**
 * «■ Τέλος» now. A race also gets our elapsed time, as the old «Τερματισμός» did,
 * but only after its start: before it, the race is cancelled/postponed without a result.
 */
export function finishNow(r: Race, now: number): Race {
  const own = r.entries.find((e) => e.own);
  const results = kindOf(r) === 'race' && own && now > r.start ? { ...(r.results ?? {}), [own.id]: (now - r.start) / 1000 } : r.results;
  // Ending inside a pause closes it at the end (P-039 AC 18).
  return { ...r, status: 'finished', finish: now, results, pauses: closePausesAt(r.pauses, now), updatedAt: now };
}

/**
 * «Τέλος στην τελευταία κίνηση»: the session ends when the boat last moved and
 * later points are dropped. A race does not get a result: we do not know it finished.
 */
export function finishAt(r: Race, at: number, now: number): Race {
  const finish = Math.min(now, Math.max(at, r.start));
  return {
    ...r,
    status: 'finished',
    finish,
    track: r.track.filter((p) => p.t <= finish),
    fixes: r.fixes.filter((f) => f.t <= finish),
    pauses: closePausesAt(r.pauses, finish),
    laps: r.laps?.filter((l, i) => i === 0 || l.t <= finish),
    manoeuvres: r.manoeuvres?.filter((m) => m.t <= finish),
    updatedAt: now,
  };
}

/** Undo of an end within 10″: back to running, without the finish. */
export function reopen(before: Race, now: number): Race {
  return { ...before, status: 'running', finish: undefined, updatedAt: now };
}

export interface SessionStats {
  /** Without the pauses. */
  durationSec: number;
  /** Without any distance over a pause. */
  distanceNm: number;
  /** Mean speed over ground, kt. */
  avgKt?: number;
  /** Time paused (P-039). */
  pausedSec: number;
}

/** Duration, distance and mean speed of a session (Φ1 summary for training and cruise), without the pauses. */
export function sessionStats(r: Race): SessionStats {
  const track = [...r.track].sort((a, b) => a.t - b.t);
  const end = r.finish ?? track[track.length - 1]?.t ?? r.start;
  const activeMs = activeSpans(r, end).reduce((s, x) => s + x.to - x.from, 0);
  const durationSec = Math.max(0, activeMs / 1000);
  const distanceNm = trackSegments(r).reduce((d, seg) => d + sailed(seg), 0);
  const avgKt = durationSec > 60 ? distanceNm / (durationSec / 3600) : undefined;
  return { durationSec, distanceNm, avgKt, pausedSec: pausedMs(r, end) / 1000 };
}

/** A new training or cruise session that starts recording now. */
export function newSession(
  kind: Exclude<SessionKind, 'race'>,
  o: {
    id: string;
    now: number;
    entries: Race['entries'];
    scoringOptionId?: string;
    course?: { id?: string; name?: string; marks: Race['marks'] };
    /** Training: «Τι δουλεύουμε» and the crew share switch of the setup. */
    goal?: TrainingGoal;
    crewShared?: boolean;
    crewId?: string;
  },
): Race {
  const training = kind === 'training';
  return {
    ...(training ? { goal: o.goal ?? 'free', manoeuvres: [], ...(o.crewShared ? { crewShared: true, crewId: o.crewId } : {}) } : {}),
    id: o.id,
    name: KIND_INFO[kind].name,
    kind,
    courseId: o.course?.id,
    courseName: o.course?.name,
    marks: o.course?.marks ?? [],
    start: o.now,
    scoringOptionId: o.scoringOptionId ?? '',
    method: 'ToT',
    entries: o.entries,
    status: 'running',
    track: [],
    fixes: [],
    updatedAt: o.now,
  };
}
