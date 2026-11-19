/** Helpers for sessions (race, training): what is stored, and the exported files. */
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';

export interface StoredSession {
  id: string;
  status: string;
  kind?: string;
  track: { t: number; lat: number; lon: number; tws?: number; twd?: number; twa?: number; bsp?: number; wind?: 'manual' }[];
  laps?: { t: number }[];
  pauses?: { from: number; to?: number }[];
  /** P-053: the manual wind of this session (TWD in °T). */
  manualWind?: { on: boolean; twdTrue: number; tws: number; at: number };
  windLog?: { at: number; ev: 'on' | 'off' | 'set' | 'confirm'; twdTrue?: number; tws?: number }[];
}

/** The sessions as the app stored them in IndexedDB (written every 15″ while one runs). */
export function storedSessions(page: Page): Promise<StoredSession[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('sailing-navigator');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const all = await new Promise<StoredSession[]>((res) => {
      const g = db.transaction('races').objectStore('races').getAll();
      g.onsuccess = () => res(g.result as StoredSession[]);
    });
    db.close();
    return all;
  });
}

/** The running session as stored (or undefined). */
export async function runningSession(page: Page): Promise<StoredSession | undefined> {
  return (await storedSessions(page)).find((x) => x.status === 'running');
}

export async function runningTrackLength(page: Page): Promise<number> {
  const s = (await storedSessions(page)).find((x) => x.status === 'running');
  return s?.track.length ?? -1;
}

/** Clicks a button that downloads a file and returns its name and text. */
export async function download(page: Page, click: () => Promise<void>): Promise<{ name: string; text: string }> {
  const [d] = await Promise.all([page.waitForEvent('download'), click()]);
  const path = await d.path();
  return { name: d.suggestedFilename(), text: await readFile(path, 'utf8') };
}

/** Times (ms) of the GPX track points. */
export function gpxTimes(gpx: string): number[] {
  return [...gpx.matchAll(/<trkpt[^>]*>[\s\S]*?<time>([^<]+)<\/time>/g)].map((m) => new Date(m[1]).getTime());
}

export const now = (page: Page) => page.evaluate(() => Date.now());
