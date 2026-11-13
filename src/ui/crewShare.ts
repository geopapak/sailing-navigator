import { useEffect, useRef, useState } from 'react';
import { crewApi } from '../crew/api';
import { ApiError } from '../sync/api';
import { trainingShare } from '../race/training';
import type { Race } from '../race/types';
import { useApp } from './AppContext';
import { useRace } from './RaceContext';
import { DEFAULT_SERVER } from './settings';

/**
 * Training summary for the crew (P-035 AC 25–27): sent with `PUT /crews/:crewId/races/:raceId`,
 * removed with `DELETE`. Offline it stays pending in `Race.crewSharePending` and goes
 * with the next connection.
 */

export const SHARE_TEXT = {
  sent: 'Το πλήρωμα θα τη δει στο «Οι έξοδοί μου»',
  removed: 'Δεν μοιράζεται πια',
  offline: 'Θα σταλεί όταν επιστρέψει το ίντερνετ.',
  tooBig: 'Η σύνοψη είναι πολύ μεγάλη για το πλήρωμα.',
  noCrew: 'Δεν έχεις πλήρωμα για αυτό το σκάφος. Πρόσθεσέ το από «Σκάφη» → «Πρόσκληση στο πλήρωμα».',
  signIn: 'Χρειάζεται σύνδεση στον λογαριασμό.',
  afterUndo: 'Θα σταλεί στο πλήρωμα μόλις περάσει η αναίρεση.',
} as const;

export type ShareOutcome = { ok: true; text: string } | { ok: false; text: string; pending: boolean };

/** Sends (or removes) the share as `r.crewShared` says; returns what to show and the patch to store. */
export async function syncShare(r: Race, o: { server: string; token: string; now?: number }): Promise<{ out: ShareOutcome; patch: Partial<Race> }> {
  if (!r.crewId) return { out: { ok: false, text: SHARE_TEXT.noCrew, pending: false }, patch: { crewSharePending: false } };
  if (!o.token) return { out: { ok: false, text: SHARE_TEXT.signIn, pending: true }, patch: { crewSharePending: true } };
  const now = o.now ?? Date.now();
  try {
    if (r.crewShared) {
      await crewApi.shareRace(o.server, o.token, r.crewId, r.id, trainingShare(r, { now }));
      return { out: { ok: true, text: SHARE_TEXT.sent }, patch: { crewSharePending: false, crewSharedAt: now } };
    }
    await crewApi.unshareRace(o.server, o.token, r.crewId, r.id);
    return { out: { ok: true, text: SHARE_TEXT.removed }, patch: { crewSharePending: false, crewSharedAt: undefined } };
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    // Removing what is not there any more is done.
    if (!r.crewShared && status === 404) return { out: { ok: true, text: SHARE_TEXT.removed }, patch: { crewSharePending: false, crewSharedAt: undefined } };
    if (status === 0) return { out: { ok: false, text: SHARE_TEXT.offline, pending: true }, patch: { crewSharePending: true } };
    // Signed out / expired token: keep it pending, it goes after the next sign-in.
    if (status === 401) return { out: { ok: false, text: SHARE_TEXT.signIn, pending: true }, patch: { crewSharePending: true } };
    // The server refused the share for good (too big, bad data, not our crew): it is not shared,
    // so it must not look shared nor be retried on every start.
    if (r.crewShared && status >= 400 && status < 500 && status !== 408 && status !== 429) {
      const text = status === 413 ? SHARE_TEXT.tooBig : (e as Error).message;
      return { out: { ok: false, text, pending: false }, patch: { crewShared: false, crewSharePending: false, crewSharedAt: undefined } };
    }
    if (status === 413) return { out: { ok: false, text: SHARE_TEXT.tooBig, pending: false }, patch: { crewSharePending: false } };
    return { out: { ok: false, text: (e as Error).message, pending: true }, patch: { crewSharePending: true } };
  }
}

/** The message on the share card: what the last try said, and if «Ξανά» is offered. */
export type ShareMsg = { text: string; retry: boolean };

/**
 * When a pending share is done in the background (the retry when the internet is back), the card
 * must stop saying «Θα σταλεί …» / offering «Ξανά»: it shows what is true now.
 */
export function settledShareMsg(msg: ShareMsg | undefined, wasPending: boolean, r: Pick<Race, 'crewShared' | 'crewSharePending'>): ShareMsg | undefined {
  if (r.crewSharePending || !(wasPending || msg?.retry)) return msg;
  if (msg && !msg.retry) return msg;
  return { text: r.crewShared ? SHARE_TEXT.sent : SHARE_TEXT.removed, retry: false };
}

/**
 * The share of a just-ended session waits for the 10″ «Αναίρεση» to pass (QA Φ3): the race is stored
 * with `crewSharePending` and is held here until then, so an undone «Τέλος» never reaches the crew.
 * In memory only: after a restart the undo is gone too, and the pending share goes.
 */
const holds = new Map<string, number>();
const HOLD_EVENT = 'share-hold';
export function holdShare(id: string, until: number) {
  holds.set(id, until);
  window.dispatchEvent(new Event(HOLD_EVENT));
}
export function releaseShare(id: string) {
  holds.delete(id);
  window.dispatchEvent(new Event(HOLD_EVENT));
}
export const heldUntil = (id: string) => holds.get(id);

/** A pending share that may go now: finished and not held by the undo of «Τέλος». */
export function shareDue(r: Pick<Race, 'crewSharePending' | 'status'>, now: number, holdUntil?: number): boolean {
  return !!r.crewSharePending && r.status === 'finished' && !(holdUntil !== undefined && holdUntil > now);
}

/** Whether the share of `id` waits for the undo; re-renders when that ends. */
export function useShareHeld(id: string): boolean {
  const [, setTick] = useState(0);
  const until = holds.get(id);
  const held = until !== undefined && until > Date.now();
  useEffect(() => {
    const on = () => setTick((x) => x + 1);
    window.addEventListener(HOLD_EVENT, on);
    const t = held && until !== undefined && Number.isFinite(until) ? window.setTimeout(on, until - Date.now() + 50) : undefined;
    return () => {
      window.removeEventListener(HOLD_EVENT, on);
      if (t !== undefined) window.clearTimeout(t);
    };
  }, [held, until]);
  return held;
}

/** Sends the pending shares of finished sessions when the app starts, whenever the internet comes back, and when the undo of «Τέλος» is over. */
export function useShareRetry() {
  const { settings, account } = useApp();
  const race = useRace();
  const server = settings.aiUrl || DEFAULT_SERVER;
  const token = settings.authToken;
  const ref = useRef({ races: race.races, patchRace: race.patchRace });
  ref.current = { races: race.races, patchRace: race.patchRace };
  const busy = useRef(false);
  const pendingKey = race.races
    .filter((r) => r.crewSharePending && r.status === 'finished')
    .map((r) => r.id)
    .join(',');
  useEffect(() => {
    if (!account || !token || !race.loaded) return;
    const run = async () => {
      if (busy.current || navigator.onLine === false) return;
      busy.current = true;
      try {
        const now = Date.now();
        for (const r of ref.current.races.filter((x) => shareDue(x, now, holds.get(x.id)))) {
          const { out, patch } = await syncShare(r, { server, token });
          await ref.current.patchRace(r.id, patch).catch(() => undefined);
          if (!out.ok && out.pending) break; // still offline: try again later
        }
      } finally {
        busy.current = false;
      }
    };
    // Held shares go when their undo is over (or is cancelled: `releaseShare`).
    let timer: number | undefined;
    const schedule = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      const now = Date.now();
      const next = Math.min(
        ...ref.current.races
          .filter((x) => x.crewSharePending && x.status === 'finished')
          .map((x) => holds.get(x.id) ?? 0)
          .filter((u) => u > now && Number.isFinite(u)),
      );
      if (Number.isFinite(next)) timer = window.setTimeout(() => void run().then(schedule), next - now + 50);
    };
    const onHold = () => {
      schedule();
      void run();
    };
    if (pendingKey) void run();
    schedule();
    window.addEventListener('online', run);
    window.addEventListener(HOLD_EVENT, onHold);
    return () => {
      window.removeEventListener('online', run);
      window.removeEventListener(HOLD_EVENT, onHold);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [account, token, server, race.loaded, pendingKey]);
}
