import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db, deleteBoat, getKV, listBoats, parseBoatJson, saveBoat, type Tombstone } from './store';
import { TRE_IRENE } from './treIrene';
import { adoptAccount, getSyncState } from '../sync/sync';

describe('store', () => {
  it('starts with no boats, saves the user\'s own and round-trips JSON', async () => {
    await db.boats.clear();
    expect(await listBoats()).toEqual([]);

    const parsed = parseBoatJson(JSON.stringify(TRE_IRENE));
    expect(parsed.polar).toEqual(TRE_IRENE.polar);
    expect(parsed.scoring).toHaveLength(21);

    await saveBoat({ ...parsed, id: 'mine', name: 'Δικό μου', isOwn: true });
    await saveBoat({ ...parsed, id: 'opp', name: 'Αντίπαλος', isOwn: false, polar: undefined });
    const after = await listBoats();
    expect(after.map((b) => b.id)).toEqual(['mine', 'opp']);

    await deleteBoat('opp');
    const tombs = await getKV<Tombstone[]>('tombstones', []);
    expect(tombs.map((t) => t.id)).toContain('opp');
  });

  it('rejects bad JSON', () => {
    expect(() => parseBoatJson('{')).toThrow();
    expect(() => parseBoatJson('{}')).toThrow();
  });
});

describe('adopting an account on a device', () => {
  it('drops the old example boat but keeps the user\'s own boats', async () => {
    await db.boats.clear();
    await db.kv.clear();
    await saveBoat({ ...TRE_IRENE });
    await saveBoat({ ...TRE_IRENE, id: 'my-boat', name: 'Το σκάφος μου' });
    await adoptAccount('user-a');
    expect((await listBoats()).map((b) => b.id)).toEqual(['my-boat']);
    expect((await getSyncState()).owner).toBe('user-a');
  });

  it("clears another account's data when a different user signs in", async () => {
    await adoptAccount('user-b');
    expect(await listBoats()).toEqual([]);
    expect((await getSyncState()).owner).toBe('user-b');
  });
});
