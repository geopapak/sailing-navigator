import { describe, expect, it } from 'vitest';
import { marksSource, nextMarkInfo } from './sessionMarks';
import type { Race } from './types';

const m = (id: string, lat: number) => ({ id, name: id, lat, lon: 23.6 });
const courseMarks = [m('Χ-Εκκίνηση', 37.0), m('Χ-1', 37.1), m('Χ-Τέλος', 37.2)];
const raceMarks = [m('Εκκίνηση', 37.9), m('Σημ. 1', 37.95), m('Τερματισμός', 37.9)];
const session = (o: Partial<Race> = {}): Pick<Race, 'marks' | 'fixes' | 'entries' | 'track'> => ({
  marks: raceMarks,
  fixes: [],
  track: [],
  entries: [{ id: 'own', name: 'Εμείς', own: true } as Race['entries'][number]],
  ...o,
});

describe('one source of marks (P-034)', () => {
  it('outside a session: the Χάρτης course and its next mark', () => {
    const s = marksSource(undefined, { course: { marks: courseMarks }, nextMark: 2 });
    expect(s.from).toBe('nav');
    expect(nextMarkInfo(s).mark?.name).toBe('Χ-Τέλος');
    expect(nextMarkInfo(s).isFinish).toBe(true);
  });

  it('in a session: the session marks, never the saved course', () => {
    const s = marksSource(session(), { course: { marks: courseMarks }, nextMark: 2 });
    expect(s.from).toBe('session');
    expect(s.marks).toBe(raceMarks);
    expect(nextMarkInfo(s)).toMatchObject({ index: 1, isFinish: false });
    expect(nextMarkInfo(s).mark?.name).toBe('Σημ. 1');
  });

  it('a session without marks has no mark (no layline), even with a course on the map', () => {
    const s = marksSource(session({ marks: [] }), { course: { marks: courseMarks }, nextMark: 1 });
    expect(s.marks).toEqual([]);
    expect(nextMarkInfo(s).mark).toBeUndefined();
  });

  it('the next mark follows our track past each mark', () => {
    const track = [{ t: 1, lat: 37.9, lon: 23.6 }, { t: 2, lat: 37.95, lon: 23.6 }];
    const s = marksSource(session({ track }), { nextMark: 1 });
    expect(nextMarkInfo(s)).toMatchObject({ index: 2, isFinish: true });
    expect(nextMarkInfo(s).mark?.name).toBe('Τερματισμός');
  });
});
