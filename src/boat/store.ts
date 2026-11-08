import Dexie, { type Table } from 'dexie';
import type { BoatProfile } from './types';
import { TRE_IRENE } from './treIrene';

export interface KV {
  key: string;
  value: unknown;
}

class NavDB extends Dexie {
  boats!: Table<BoatProfile, string>;
  kv!: Table<KV, string>;
  constructor() {
    super('sailing-navigator');
    this.version(1).stores({ boats: 'id, name', kv: 'key' });
  }
}

export const db = new NavDB();

/** Seeds the default boat on first run. */
export async function ensureSeed(): Promise<void> {
  const count = await db.boats.count();
  if (count === 0) await db.boats.put({ ...TRE_IRENE, updatedAt: Date.now() });
}

export async function listBoats(): Promise<BoatProfile[]> {
  const all = await db.boats.toArray();
  return all.sort((a, b) => Number(!!b.isOwn) - Number(!!a.isOwn) || a.name.localeCompare(b.name, 'el'));
}

export async function saveBoat(b: BoatProfile): Promise<void> {
  await db.boats.put({ ...b, updatedAt: Date.now() });
}

export async function deleteBoat(id: string): Promise<void> {
  await db.boats.delete(id);
}

export async function getKV<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setKV<T>(key: string, value: T): Promise<void> {
  await db.kv.put({ key, value });
}

export function newBoatId(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9α-ω]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'boat'}-${Math.random().toString(36).slice(2, 7)}`;
}

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
