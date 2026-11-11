import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db, deleteBoat, getKV, listBoats, listRaces, parseBoatJson, restoreBoat, saveBoat, saveRace, type Tombstone } from './store';
import type { Race } from '../race/types';
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

describe('undo of a delete', () => {
  it('puts the boat back and drops its tombstone so the server copy is kept', async () => {
    await db.boats.clear();
    await db.kv.clear();
    const boat = { ...TRE_IRENE, id: 'undo-me', name: 'Αναίρεση' };
    await saveBoat(boat);
    await deleteBoat(boat.id);
    expect((await listBoats()).map((b) => b.id)).not.toContain(boat.id);
    expect((await getKV<Tombstone[]>('tombstones', [])).map((t) => t.id)).toContain(boat.id);

    await restoreBoat(boat);
    expect((await listBoats()).map((b) => b.id)).toContain(boat.id);
    expect((await getKV<Tombstone[]>('tombstones', [])).map((t) => t.id)).not.toContain(boat.id);
  });
});

describe('races when another account signs in on the same phone (P-014)', () => {
  it('keeps the races, hidden under the account that sailed them', async () => {
    await db.races.clear();
    await db.kv.clear();
    await adoptAccount('user-a');
    const race = { id: 'r1', name: 'Χειμερινό 1', marks: [], start: 1, scoringOptionId: 'x', method: 'ToD', entries: [], status: 'finished', track: [], fixes: [] } as unknown as Race;
    await saveRace(race); // saved before races were tagged, like older versions did
    expect((await listRaces('user-a')).map((r) => r.id)).toEqual(['r1']);

    await adoptAccount('user-b');
    expect(await db.races.count()).toBe(1);
    expect(await listRaces('user-b')).toEqual([]);
    expect((await listRaces('user-a')).map((r) => r.id)).toEqual(['r1']);
  });
});
