import { describe, expect, it } from 'vitest';
import { knowledgeHints, relevantNotes, setKnowledgeCache } from './match';
import { sectorOf, type KnowledgeNote } from './types';

const note = (x: Partial<KnowledgeNote>): KnowledgeNote => ({
  id: x.id ?? 'n',
  lat: 37.75,
  lon: 23.43,
  radiusNm: 1,
  dirs: [],
  speeds: [],
  place: 'Αίγινα',
  text: 'Στο ΒΑ η ριπή μπαίνει πρώτα από τα αριστερά.',
  scope: 'me',
  createdAt: 0,
  updatedAt: 0,
  ...x,
});

describe('local knowledge', () => {
  it('maps wind directions to 8 sectors', () => {
    expect(sectorOf(0)).toBe('N');
    expect(sectorOf(22)).toBe('N');
    expect(sectorOf(23)).toBe('NE');
    expect(sectorOf(350)).toBe('N');
    expect(sectorOf(225)).toBe('SW');
  });

  it('keeps notes near the position that fit the wind', () => {
    const ne = note({ id: 'ne', dirs: ['NE'], speeds: ['medium'] });
    const any = note({ id: 'any' });
    const far = note({ id: 'far', lat: 37.3 });
    const notes = [ne, any, far];
    const here = { lat: 37.76, lon: 23.44 };
    expect(relevantNotes(notes, here, { tws: 12, twd: 40 }).map((n) => n.id).sort()).toEqual(['any', 'ne']);
    expect(relevantNotes(notes, here, { tws: 22, twd: 40 }).map((n) => n.id)).toEqual(['any']);
    expect(relevantNotes(notes, here, { tws: 12, twd: 200 }).map((n) => n.id)).toEqual(['any']);
    expect(relevantNotes(notes, undefined, undefined)).toHaveLength(3);
  });

  it('gives the advisor short hints that say whose experience it is', () => {
    setKnowledgeCache([note({ id: 'a', dirs: ['NE'] })], [note({ id: 'b', text: 'x'.repeat(900) })]);
    const h = knowledgeHints({ lat: 37.75, lon: 23.43 }, { twd: 45 })!;
    expect(h.map((x) => x.by).sort()).toEqual(['εμείς', 'πλήρωμα']);
    expect(h.find((x) => x.by === 'πλήρωμα')!.text).toHaveLength(400);
    expect(h.find((x) => x.by === 'εμείς')!.wind).toBe('ΒΑ');
    setKnowledgeCache([], []);
    expect(knowledgeHints()).toBeUndefined();
  });
});
