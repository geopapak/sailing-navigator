import { useEffect, useRef } from 'react';
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

/** Sends the pending shares of finished sessions when the app starts and whenever the internet comes back. */
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
        for (const r of ref.current.races.filter((x) => x.crewSharePending && x.status === 'finished')) {
          const { out, patch } = await syncShare(r, { server, token });
          await ref.current.patchRace(r.id, patch).catch(() => undefined);
          if (!out.ok && out.pending) break; // still offline: try again later
        }
      } finally {
        busy.current = false;
      }
    };
    if (pendingKey) void run();
    window.addEventListener('online', run);
    return () => window.removeEventListener('online', run);
  }, [account, token, server, race.loaded, pendingKey]);
}
