import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db, ensureSeed, listBoats, parseBoatJson, saveBoat } from './store';
import { TRE_IRENE } from './treIrene';

describe('store', () => {
  it('seeds TRE IRENE once and round-trips JSON', async () => {
    await db.boats.clear();
    await ensureSeed();
    await ensureSeed();
    const boats = await listBoats();
    expect(boats).toHaveLength(1);
    expect(boats[0].name).toBe('TRE IRENE');

    const parsed = parseBoatJson(JSON.stringify(TRE_IRENE));
    expect(parsed.polar).toEqual(TRE_IRENE.polar);
    expect(parsed.scoring).toHaveLength(21);

    await saveBoat({ ...parsed, id: 'opp', name: 'Αντίπαλος', isOwn: false, polar: undefined });
    const after = await listBoats();
    expect(after.map((b) => b.id)).toEqual(['tre-irene', 'opp']);
  });

  it('rejects bad JSON', () => {
    expect(() => parseBoatJson('{')).toThrow();
    expect(() => parseBoatJson('{}')).toThrow();
  });
});
