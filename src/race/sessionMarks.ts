import type { Mark } from '../routing/isochrones';
import { nextMarkOf } from './estimate';
import type { Race, RaceFix } from './types';

/**
 * One source of marks (P-034): while a session runs, its own marks drive the
 * layline, the mark alerts, the race screen and the map. The Χάρτης course
 * (`nav.course`) is used only outside a session.
 */
export interface MarksSource {
  marks: Mark[];
  /** Index of the mark we sail to (may be `marks.length` when every mark is passed). */
  next: number;
  from: 'session' | 'nav';
}

export function marksSource(
  session: Pick<Race, 'marks' | 'fixes' | 'entries' | 'track'> | undefined,
  nav: { course?: { marks: Mark[] }; nextMark: number },
): MarksSource {
  if (!session) return { marks: nav.course?.marks ?? [], next: nav.nextMark, from: 'nav' };
  const marks = session.marks ?? [];
  const own = session.entries.find((e) => e.own);
  if (!own || marks.length < 2) return { marks, next: 1, from: 'session' };
  // Our recorded fixes and track points tell which marks we have rounded.
  const fixes: RaceFix[] = [
    ...session.fixes.filter((f) => f.entryId === own.id),
    ...session.track.map((p) => ({ entryId: own.id, t: p.t, lat: p.lat, lon: p.lon, source: 'own' as const })),
  ];
  return { marks, next: nextMarkOf(fixes, marks), from: 'session' };
}

/** The mark we sail to and whether it is the finish. */
export function nextMarkInfo(m: MarksSource): { mark?: Mark; index: number; isFinish: boolean } {
  const mark = m.marks[m.next];
  return { mark, index: m.next, isFinish: !!mark && m.marks.length > 1 && m.next === m.marks.length - 1 };
}
