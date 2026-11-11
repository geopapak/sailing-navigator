/**
 * Offline-first sync of boats and courses with the user's account.
 * The phone's database stays the working copy; changes are pushed when there
 * is a connection and the server's newer versions are pulled (last write wins).
 */
import { LEGACY_SEED_BOAT_ID, db, getKV, setKV, tagRaces, type Course, type Tombstone } from '../boat/store';
import type { BoatProfile } from '../boat/types';
import { accountApi, type SyncItem } from './api';

/** Fired after the sync wrote remote changes into the local database. */
export const REMOTE_CHANGE = 'remote-data-change';

interface SyncState {
  /** Server clock of the last successful sync. */
  since: number;
  /** Local clock of the last successful push: items edited after it are sent. */
  pushedAt: number;
  /** Account whose data is on this device. */
  owner?: string;
}

const KEY = 'sync-state';

export async function getSyncState(): Promise<SyncState> {
  return getKV<SyncState>(KEY, { since: 0, pushedAt: 0 });
}

/**
 * Prepares the device for an account. If another account's data is here,
 * it is removed first (it lives on in that account); a device with no owner
 * yet uploads its data into the new account — except the example boat that
 * older versions added to every install (if it really is this account's
 * boat, the account's copy comes back with the first sync).
 */
export async function adoptAccount(userId: string): Promise<void> {
  const st = await getSyncState();
  if (st.owner && st.owner !== userId) {
    await db.transaction('rw', [db.boats, db.courses, db.kv, db.races, db.notes], async () => {
      await db.boats.clear();
      await db.courses.clear();
      // Races do not sync, so they are never deleted: they stay hidden under their account (P-014).
      await tagRaces(st.owner!);
      await db.notes.clear();
      await setKV('tombstones', []);
      await setKV<SyncState>(KEY, { since: 0, pushedAt: 0, owner: userId });
    });
  } else if (!st.owner) {
    await db.transaction('rw', db.boats, db.kv, async () => {
      await db.boats.delete(LEGACY_SEED_BOAT_ID);
      await setKV<SyncState>(KEY, { since: 0, pushedAt: 0, owner: userId });
    });
  }
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  at: number;
}

let running: Promise<SyncResult> | undefined;

/** Pushes local changes and pulls remote ones. Concurrent calls share one run. */
export function syncNow(server: string, token: string): Promise<SyncResult> {
  if (!running) running = doSync(server, token).finally(() => (running = undefined));
  return running;
}

async function doSync(server: string, token: string): Promise<SyncResult> {
  const st = await getSyncState();
  const startedAt = Date.now();
  const [boats, courses, notes, tombs] = await Promise.all([db.boats.toArray(), db.courses.toArray(), db.notes.toArray(), getKV<Tombstone[]>('tombstones', [])]);
  const changes: SyncItem[] = [
    ...boats.filter((b) => b.updatedAt > st.pushedAt).map((b) => ({ kind: 'boat' as const, id: b.id, data: b, updatedAt: b.updatedAt })),
    ...courses.filter((c) => c.updatedAt > st.pushedAt).map((c) => ({ kind: 'course' as const, id: c.id, data: c, updatedAt: c.updatedAt })),
    ...notes.filter((n) => n.updatedAt > st.pushedAt).map((n) => ({ kind: 'note' as const, id: n.id, data: n, updatedAt: n.updatedAt })),
    ...tombs.map((t) => ({ kind: t.kind, id: t.id, deleted: true, updatedAt: t.at })),
  ];
  const res = await accountApi.sync(server, token, st.since, changes);

  let pulled = 0;
  await db.transaction('rw', [db.boats, db.courses, db.notes, db.kv], async () => {
    for (const it of res.items) {
      const table = it.kind === 'boat' ? db.boats : it.kind === 'course' ? db.courses : it.kind === 'note' ? db.notes : undefined;
      if (!table) continue;
      const local = (await table.get(it.id)) as { updatedAt: number } | undefined;
      if (local && local.updatedAt > it.updatedAt) continue; // ours is newer: it goes up next time
      if (it.deleted) {
        if (local) {
          await table.delete(it.id);
          pulled++;
        }
      } else if (it.data && typeof it.data === 'object') {
        // Keep the remote version's timestamp so it is not pushed back.
        await (table as typeof db.boats).put({ ...(it.data as BoatProfile & Course), id: it.id, updatedAt: it.updatedAt } as BoatProfile);
        pulled++;
      }
    }
    // Tombstones that were sent are done; keep any created during the request.
    const now = await getKV<Tombstone[]>('tombstones', []);
    await setKV(
      'tombstones',
      now.filter((t) => !tombs.some((s) => s.kind === t.kind && s.id === t.id && s.at === t.at)),
    );
    await setKV<SyncState>(KEY, { ...st, since: res.now, pushedAt: startedAt });
  });
  if (pulled > 0 && typeof window !== 'undefined') window.dispatchEvent(new Event(REMOTE_CHANGE));
  return { pushed: changes.length, pulled, at: Date.now() };
}
