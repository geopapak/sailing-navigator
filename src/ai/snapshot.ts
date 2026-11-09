import type { AdvisorContext } from './types';

/**
 * The latest live numbers, published by the Live tab so the advisor chat can
 * use them while another tab is open. Kept in memory and localStorage.
 */
const KEY = 'live-snapshot';
let mem: { ctx: AdvisorContext; at: number } | undefined;

export function setLiveSnapshot(ctx: AdvisorContext) {
  mem = { ctx, at: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(mem));
  } catch {
    /* storage unavailable */
  }
}

/** The live snapshot if it is newer than maxAgeMin. */
export function getLiveSnapshot(maxAgeMin = 30): { ctx: AdvisorContext; at: number } | undefined {
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
