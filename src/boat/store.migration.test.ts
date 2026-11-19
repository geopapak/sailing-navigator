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

describe('Dexie v4 → v5 (P-040)', () => {
  it('keeps every table, the races and their kinds; old races stay single (no eventId)', async () => {
    const name = `mig-${Math.random().toString(36).slice(2)}`;
    const old = new Dexie(name);
    old.version(4).stores({ boats: 'id, name', kv: 'key', courses: 'id, name', races: 'id, start, kind', notes: 'id, updatedAt' });
    const races: Race[] = [
      { ...v3Race('a', 'planned'), kind: 'race' },
      { ...v3Race('b', 'finished'), kind: 'training' },
      { ...v3Race('c', 'finished'), kind: 'cruise' },
      { ...v3Race('d', 'running'), kind: 'race' },
      { ...v3Race('e', 'finished'), kind: 'race' },
      { ...v3Race('f', 'finished'), kind: 'race', finish: Date.UTC(2026, 9, 1, 9) },
      { ...v3Race('g', 'finished'), kind: 'race' },
    ];
    await old.table('races').bulkPut(races);
    await old.table('boats').put({ id: 'b1', name: 'Αύρα' });
    await old.table('courses').put({ id: 'c1', name: 'Τρίγωνο', marks: [], updatedAt: 1 });
    await old.table('notes').put({ id: 'n1', updatedAt: 2 });
    await old.table('kv').put({ key: 'tombstones', value: [] });
    old.close();

    const db = new NavDB(name);
    expect(db.verno).toBe(5);
    expect(await db.races.orderBy('id').toArray()).toEqual(races);
    expect((await db.races.toArray()).every((r) => r.eventId === undefined)).toBe(true);
    expect(await db.boats.get('b1')).toEqual({ id: 'b1', name: 'Αύρα' });
    expect((await db.courses.get('c1'))?.name).toBe('Τρίγωνο');
    expect((await db.notes.get('n1'))?.updatedAt).toBe(2);
    expect(await db.kv.get('tombstones')).toEqual({ key: 'tombstones', value: [] });
    expect(await db.races.where('kind').equals('race').count()).toBe(5);
    // The new table and the new index work.
    expect(await db.events.count()).toBe(0);
    await db.events.put({ id: 'ev1', name: 'Διήμερος', scoring: 'points', discards: 0, discardFrom: 4, status: 'open', createdAt: 1, updatedAt: 1 });
    await db.races.put({ ...races[0], id: 'h', eventId: 'ev1' });
    expect(await db.races.where('eventId').equals('ev1').count()).toBe(1);
    db.close();
  });
});
