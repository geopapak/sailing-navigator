import type { AdvisorContext } from './types';

/**
 * The latest live numbers, published by the Live tab so the advisor chat can
 * use them while another tab is open. Kept in memory and localStorage.
 */
const KEY = 'live-snapshot';

/**
 * Where the snapshot's wind came from (P-053 AC 50): 'default' is the 10 kt / 42° of
 * «Γρήγορη ματιά» that nobody typed, which a session must never record or show.
 */
export type SnapshotWind = 'instruments' | 'manual' | 'quick' | 'none' | 'default';

let mem: { ctx: AdvisorContext; at: number; wind?: SnapshotWind } | undefined;

export function setLiveSnapshot(ctx: AdvisorContext, wind?: SnapshotWind) {
  mem = { ctx, at: Date.now(), wind };
  try {
    localStorage.setItem(KEY, JSON.stringify(mem));
  } catch {
    /* storage unavailable */
  }
}

/** The live snapshot if it is newer than maxAgeMin. */
export function getLiveSnapshot(maxAgeMin = 30): { ctx: AdvisorContext; at: number; wind?: SnapshotWind } | undefined {
  if (!mem) {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) mem = JSON.parse(raw);
    } catch {
      /* ignore */
    }
  }
  return mem && Date.now() - mem.at <= maxAgeMin * 60_000 ? mem : undefined;
}

/**
 * The snapshot a running session may use (recording, race screen, estimate): only one whose
 * wind is real (instruments, the session's manual wind, or a wind the crew typed in
 * «Γρήγορη ματιά»); never the defaults nobody typed, never one of unknown origin (P-053 AC 50).
 */
export function getSessionSnapshot(maxAgeMin = 30): { ctx: AdvisorContext; at: number; wind?: SnapshotWind } | undefined {
  const s = getLiveSnapshot(maxAgeMin);
  return s && (s.wind === 'instruments' || s.wind === 'manual' || s.wind === 'quick' || s.wind === 'none') ? s : undefined;
}
