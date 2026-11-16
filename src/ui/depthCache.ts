import type { LatLon } from '../nav/geo';
import { SAMPLE_EVERY_MS, SAMPLE_TIMEOUT_MS, depthCell } from '../race/cruise';
import { fetchDepthInfo, type DepthSample } from './nauticalStyle';

/**
 * Chart depths (EMODnet `depth_sample`) shared by the cruise Live, its map and the
 * shallow-water alert (P-034 AC 8, P-036): at most one request a minute per device,
 * answers kept per ~200 m cell, 8″ timeout, no retry before the next minute.
 * The shallow alert («ahead») goes first, but while it samples the depth here gets
 * every 2nd slot, so «Βάθος εδώ» is not «—» for minutes; when the boat reaches a cell
 * sampled ahead, that answer is the depth here too. Only a position is sent, never who we are.
 */
export type DepthAsker = 'ahead' | 'here';

export interface ChartDepth {
  at: number;
  /** Undefined on land or without data. */
  d?: DepthSample;
  land: boolean;
}

const KEEP_MS = 6 * 3600_000;
const MAX_CELLS = 400;
const cells = new Map<string, ChartDepth>();
let lastAsk: number | undefined;
let lastWho: DepthAsker | undefined;
/** The shallow alert is sampling ahead (it has priority). */
let aheadUntil = 0;
/** The depth here is waiting for a slot. */
let hereUntil = 0;

/** Clears the cache and the budget (tests). */
export function resetDepthCache() {
  cells.clear();
  lastAsk = lastWho = undefined;
  aheadUntil = hereUntil = 0;
}

/** A cached answer for the cell of `p`, if any. */
export function cachedDepth(p: LatLon, now = Date.now()): ChartDepth | undefined {
  const c = cells.get(depthCell(p));
  return c && now - c.at < KEEP_MS ? c : undefined;
}

/** The ahead sampler claims the budget for a while (it has priority over the depth here). */
export function claimAhead(now = Date.now()) {
  aheadUntil = now + 2 * SAMPLE_EVERY_MS;
}
export const aheadActive = (now = Date.now()) => now < aheadUntil;

/** Whether the minute's budget is free: at most one request per 60″ in total. */
export const budgetFree = (now = Date.now()) => lastAsk === undefined || now - lastAsk >= SAMPLE_EVERY_MS;

/**
 * Whether `who` may use a free slot now: alternate while both want one (ahead first),
 * else whoever asks.
 */
export function slotFor(who: DepthAsker, now = Date.now()): boolean {
  if (!budgetFree(now)) return false;
  if (who === 'ahead') return !(now < hereUntil && lastWho === 'ahead');
  return !aheadActive(now) || lastWho === 'ahead';
}

/**
 * The chart depth at `p`: from the cache, else one request if the minute's budget is
 * free (and we are online). Undefined: nothing now (busy, offline, slow or failed).
 */
export async function chartDepthAt(p: LatLon, now = Date.now(), who: DepthAsker = 'here'): Promise<ChartDepth | undefined> {
  const hit = cachedDepth(p, now);
  if (hit) return hit;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return undefined;
  // The depth here keeps its turn for a little while after it asked.
  if (who === 'here') hereUntil = now + 15_000;
  if (!slotFor(who, now)) return undefined;
  lastAsk = now;
  lastWho = who;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), SAMPLE_TIMEOUT_MS);
  try {
    const r = await fetchDepthInfo(p.lat, p.lon, ctl.signal);
    const out: ChartDepth = { at: Date.now(), d: r.d, land: r.land };
    if (cells.size >= MAX_CELLS) cells.delete(cells.keys().next().value as string);
    cells.set(depthCell(p), out);
    return out;
  } catch {
    // No message at sea; the next try waits for the next minute.
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
