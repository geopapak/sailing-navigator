import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SharedTrainingView, TrainingCards } from './TrainingSummary';
import type { TrainingSummary } from '../race/training';

const base: TrainingSummary = {
  durationSec: 4360,
  distanceNm: 7.3,
  twsMin: 9,
  twsMax: 15,
  avgPct: 94,
  pausedSec: 0,
  indicative: false,
  laps: [
    { n: 1, sec: 402, pct: 92, sail: 'Τζένοα', helm: 'Α' },
    { n: 2, sec: 388, pct: 96, sail: 'Τζένοα', helm: 'Β', trim: 'μπάρμπας +2 εκ.' },
  ],
  pctTable: [
    { leg: 'upwind', band: '8–12', pct: 95 },
    { leg: 'reach', band: '8–12', pct: null },
    { leg: 'downwind', band: '8–12', pct: 91 },
  ],
  manoeuvres: [
    { kind: 'tack', count: 14, avgRecoverSec: 21, bestRecoverSec: 14 },
    { kind: 'gybe', count: 0, avgRecoverSec: null, bestRecoverSec: null },
  ],
};

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('training summary cards', () => {
  it('orders the cards by «Τι δουλεύουμε» and marks the best lap', () => {
    const tacks = html(createElement(TrainingCards, { s: base, goal: 'tacks' }));
    expect(tacks.indexOf('Μανούβρες')).toBeLessThan(tacks.indexOf('Γύροι'));
    expect(tacks).toContain('2 ★');
    expect(tacks).toContain('μέση 0:21 · καλύτερη 0:14');
    expect(tacks).toContain('8–12 κν');
    expect(tacks).toContain('Δεν μετράνε τα 25″ μετά από κάθε μανούβρα.');
    const free = html(createElement(TrainingCards, { s: base, goal: 'free' }));
    expect(free.indexOf('Γύροι')).toBeLessThan(free.indexOf('% του στόχου ανά πλεύση'));
  });

  it('one lap: «Ένας γύρος: όλη η προπόνηση.» and no ★', () => {
    const one = html(createElement(TrainingCards, { s: { ...base, laps: [base.laps[0]] }, goal: 'free' }));
    expect(one).toContain('Ένας γύρος: όλη η προπόνηση.');
    expect(one).not.toContain('★');
  });

  it('the crew view has no track card and labels indicative numbers', () => {
    const m = html(createElement(SharedTrainingView, { s: { ...base, indicative: true }, goal: 'upwind', note: 'Καλή δουλειά', owner: 'Ο ιδιοκτήτης' }));
    expect(m).not.toContain('Ίχνος');
    expect(m).toContain('ενδεικτικό');
    expect(m).toContain('«Καλή δουλειά»');
    expect(m).toContain('Ταχύτητα όρτσα');
  });
});
