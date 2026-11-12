import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { NavDB } from './store';
import type { Race } from '../race/types';

const v3Race = (id: string, status: Race['status']): Race => ({
  id,
  name: `Αγώνας ${id}`,
  courseId: 'c1',
  courseName: 'Τρίγωνο',
  marks: [{ id: 'm1', name: 'Εκκίνηση', lat: 37.9, lon: 23.6 }],
  start: Date.UTC(2026, 9, 1, 10),
  finish: status === 'finished' ? Date.UTC(2026, 9, 1, 12) : undefined,
  scoringOptionId: 'coastal',
  method: 'ToT',
  entries: [{ id: 'own', name: 'Εμείς', own: true, source: 'own' }],
  status,
  track: [{ t: Date.UTC(2026, 9, 1, 10, 1), lat: 37.9, lon: 23.6, sog: 5.2, pct: 0.97 }],
  fixes: [{ entryId: 'own', t: Date.UTC(2026, 9, 1, 10, 1), lat: 37.9, lon: 23.6, source: 'own' }],
  results: status === 'finished' ? { own: 7200 } : undefined,
  owner: 'acc-1',
  updatedAt: 1,
});

describe('Dexie v3 → v4 (P-033)', () => {
  it('opens old races with every field and kind = race', async () => {
    const name = `mig-${Math.random().toString(36).slice(2)}`;
    const old = new Dexie(name);
    old.version(3).stores({ boats: 'id, name', kv: 'key', courses: 'id, name', races: 'id, start', notes: 'id, updatedAt' });
    const races = [v3Race('a', 'planned'), v3Race('b', 'running'), v3Race('c', 'finished')];
    await old.table('races').bulkPut(races);
    await old.table('kv').put({ key: 'tombstones', value: [] });
    old.close();

    const db = new NavDB(name);
    const after = await db.races.orderBy('id').toArray();
    expect(after).toEqual(races.map((r) => ({ ...r, kind: 'race' })));
    expect(await db.kv.get('tombstones')).toEqual({ key: 'tombstones', value: [] });
    // The new index works.
    expect(await db.races.where('kind').equals('race').count()).toBe(3);
    db.close();
  });

  it('keeps a kind that is already set', async () => {
    const name = `mig-${Math.random().toString(36).slice(2)}`;
    const db = new NavDB(name);
    await db.races.put({ ...v3Race('t', 'finished'), kind: 'training' });
    expect((await db.races.get('t'))?.kind).toBe('training');
    db.close();
  });
});
