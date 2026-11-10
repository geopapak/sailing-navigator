import Dexie, { type Table } from 'dexie';
import type { BoatProfile } from './types';
import { newBoatId } from './ids';
import type { Mark } from '../routing/isochrones';
import type { Race } from '../race/types';
import type { KnowledgeNote } from '../knowledge/types';

export interface KV {
  key: string;
  value: unknown;
}

export interface Course {
  id: string;
  name: string;
  marks: Mark[];
  updatedAt: number;
}

class NavDB extends Dexie {
  boats!: Table<BoatProfile, string>;
  kv!: Table<KV, string>;
  courses!: Table<Course, string>;
  /** Races with their recorded tracks (on this device only). */
  races!: Table<Race, string>;
  /** Local-knowledge notes (synced with the account). */
  notes!: Table<KnowledgeNote, string>;
  constructor() {
    super('sailing-navigator');
    this.version(1).stores({ boats: 'id, name', kv: 'key' });
    this.version(2).stores({ boats: 'id, name', kv: 'key', courses: 'id, name' });
    this.version(3).stores({ boats: 'id, name', kv: 'key', courses: 'id, name', races: 'id, start', notes: 'id, updatedAt' });
  }
}

export const db = new NavDB();

/**
 * Id of the boat that older versions added to every new install. It is not
 * seeded any more: each user adds their own boat.
 */
export const LEGACY_SEED_BOAT_ID = 'tre-irene';

export async function listBoats(): Promise<BoatProfile[]> {
  const all = await db.boats.toArray();
  return all.sort((a, b) => Number(!!b.isOwn) - Number(!!a.isOwn) || a.name.localeCompare(b.name, 'el'));
}

/** Fired after any local change to boats/courses, so the sync can push it. */
export const LOCAL_CHANGE = 'local-data-change';
const changed = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LOCAL_CHANGE));
};

export interface Tombstone {
  kind: 'boat' | 'course' | 'note';
  id: string;
  at: number;
}

async function addTombstone(kind: Tombstone['kind'], id: string) {
  const list = await getKV<Tombstone[]>('tombstones', []);
  await setKV('tombstones', [...list.filter((t) => !(t.kind === kind && t.id === id)), { kind, id, at: Date.now() }]);
}

export async function saveBoat(b: BoatProfile): Promise<void> {
  await db.boats.put({ ...b, updatedAt: Date.now() });
  changed();
}

export async function deleteBoat(id: string): Promise<void> {
  await db.boats.delete(id);
  await addTombstone('boat', id);
  changed();
}

export async function listCourses(): Promise<Course[]> {
  return (await db.courses.toArray()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveCourse(c: Course): Promise<void> {
  await db.courses.put({ ...c, updatedAt: Date.now() });
  changed();
}

export async function deleteCourse(id: string): Promise<void> {
  await db.courses.delete(id);
  await addTombstone('course', id);
  changed();
}

export async function listRaces(): Promise<Race[]> {
  return (await db.races.toArray()).sort((a, b) => b.start - a.start);
}

export const getRace = (id: string) => db.races.get(id);

/** Races stay on this device (tracks are large); only the notes sync. */
export async function saveRace(r: Race): Promise<void> {
  await db.races.put({ ...r, updatedAt: Date.now() });
}

export const deleteRace = (id: string) => db.races.delete(id);

export async function listNotes(): Promise<KnowledgeNote[]> {
  return (await db.notes.toArray()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveNote(n: KnowledgeNote): Promise<void> {
  await db.notes.put({ ...n, updatedAt: Date.now() });
  changed();
}

export async function deleteNote(id: string): Promise<void> {
  await db.notes.delete(id);
  await addTombstone('note', id);
  changed();
}

export async function getKV<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setKV<T>(key: string, value: T): Promise<void> {
  await db.kv.put({ key, value });
}

export { newBoatId } from './ids';

/** Parses an exported profile JSON; throws with a Greek message on bad input. */
export function parseBoatJson(text: string): BoatProfile {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('Το αρχείο δεν είναι έγκυρο JSON.');
  }
  const b = obj as Partial<BoatProfile>;
  if (!b || typeof b !== 'object' || typeof b.name !== 'string') throw new Error('Λείπει το όνομα σκάφους.');
  return {
    id: typeof b.id === 'string' ? b.id : newBoatId(b.name),
    name: b.name,
    sailNumber: b.sailNumber,
    design: b.design,
    orcRef: b.orcRef,
    certificateValidUntil: b.certificateValidUntil,
    loa: b.loa,
    beam: b.beam,
    draft: b.draft,
    displacement: b.displacement,
    crewWeight: b.crewWeight,
    gph: b.gph,
    cdl: b.cdl,
    notes: b.notes,
    polar: b.polar,
    performanceFactor: typeof b.performanceFactor === 'number' ? b.performanceFactor : 1,
    sails: Array.isArray(b.sails) ? b.sails : [],
    sailRules: Array.isArray(b.sailRules) ? b.sailRules : [],
    scoring: Array.isArray(b.scoring) ? b.scoring : [],
    performanceCurve: b.performanceCurve,
    isOwn: !!b.isOwn,
    updatedAt: Date.now(),
  };
}
