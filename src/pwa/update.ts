/**
 * Controlled app updates (P-043, P-044b). A new version waits in the service
 * worker and is applied at the next 02:00 device-local time (or on the first
 * open/check after it), only when nothing holds it: no running session, no
 * unsaved input, no 10″ undo. A `critical` version skips the 02:00 wait, and
 * «Ενημέρωση τώρα» applies at once. Never a reload mid-race.
 * React-free, so the rules are unit-tested.
 */

/** How long «Ενημερώνουμε την εφαρμογή…» shows before the reload. */
export const APPLY_DELAY_MS = 2_500;
/** Long-open phones still look for a new version this often. */
export const CHECK_EVERY_MS = 30 * 60_000;
/** Focus/visibility checks no more often than this. */
export const MIN_CHECK_GAP_MS = 60_000;
/** Local hour at which a waiting (non-critical) version is applied. */
export const APPLY_HOUR = 2;
/** Where the waiting state survives reloads and restarts. */
export const PENDING_KEY = 'app-update-pending';

/**
 * `waiting`: a new version waits for 02:00. `deferred`: it is due (02:00 passed,
 * critical, or «Ενημέρωση τώρα») but a session or a holder blocks it.
 * `applying`: the banner shows and the page reloads.
 */
export type UpdatePhase = 'none' | 'waiting' | 'deferred' | 'applying';

export interface PhaseInput {
  /** A new version is installed and waiting. */
  ready: boolean;
  /** A session runs. */
  session: boolean;
  /** Something holds it: unsaved input or the 10″ undo. */
  hold: boolean;
  /** The 02:00 apply time has come. */
  due: boolean;
  critical: boolean;
  /** «Ενημέρωση τώρα» was tapped. */
  requested: boolean;
  /** «Ενημέρωση τώρα» confirmed although unsaved input will be lost. */
  force: boolean;
}

/** What to do with a waiting version. */
export function updatePhase(i: PhaseInput): UpdatePhase {
  if (!i.ready) return 'none';
  if (!(i.critical || i.due || i.requested || i.force)) return 'waiting';
  // Never a reload mid-session, not even when forced.
  if (i.session) return 'deferred';
  if (i.hold && !i.force) return 'deferred';
  return 'applying';
}

/**
 * The next `hour`:00 device-local time strictly after `now` (ms). Local Date
 * arithmetic, so DST days work: where 02:00 does not exist (spring forward at
 * 02:00) the Date lands on the first valid time after it.
 */
export function nextLocalTime(now: number, hour = APPLY_HOUR): number {
  const d = new Date(now);
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0, 0).getTime();
  if (today > now) return today;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, hour, 0, 0, 0).getTime();
}

/** What «Ενημέρωση τώρα» does. */
export type NowAction = 'apply' | 'after-session' | 'after-hold' | 'confirm';

export function nowAction(i: { session: boolean; inputHold: boolean; hold: boolean }): NowAction {
  if (i.session) return 'after-session';
  if (i.inputHold) return 'confirm';
  if (i.hold) return 'after-hold'; // only the 10″ undo: a few seconds
  return 'apply';
}

/** Whether a focus/visibility check may run now (the 30′ timer always checks). */
export function shouldCheck(lastCheck: number, now: number, online: boolean): boolean {
  return online && now - lastCheck >= MIN_CHECK_GAP_MS;
}

// ---- critical versions (`"critical": true` in releases.json → version.json) ----

/** -1 / 0 / 1 for dotted versions. */
function cmp(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/** The shape of `version.json`, written at build time from releases.json. */
export interface VersionInfo {
  version: string;
  critical: boolean;
  /** Every version marked critical, so skipping over one still counts. */
  criticalVersions: string[];
}

/**
 * Whether moving from `current` to the deployed version in `json` crosses a
 * critical release. Anything malformed counts as non-critical.
 */
export function parseCritical(json: unknown, current: string): boolean {
  if (!json || typeof json !== 'object') return false;
  const j = json as Partial<Record<keyof VersionInfo, unknown>>;
  if (typeof j.version !== 'string') return false;
  const list = Array.isArray(j.criticalVersions) ? j.criticalVersions.filter((v): v is string => typeof v === 'string') : [];
  if (j.critical === true) list.push(j.version);
  return list.some((v) => cmp(v, current) > 0 && cmp(v, j.version as string) <= 0);
}

/** Fetches `version.json` past every cache; a failure means non-critical. */
export async function fetchCritical(fetchFn: typeof fetch, url: string, current: string): Promise<boolean> {
  try {
    const res = await fetchFn(url, { cache: 'no-store' });
    if (!res.ok) return false;
    return parseCritical(await res.json(), current);
  } catch {
    return false;
  }
}

// ---- waiting state across reloads (a new worker stays "waiting" until applied) ----

interface Pending {
  /** The version that saw the update; another version means it was applied. */
  from: string;
  dueAt: number;
  critical: boolean;
}

/** The stored waiting state, if it belongs to this version. */
export function readPending(raw: string | null, current: string): Pending | undefined {
  if (!raw) return undefined;
  try {
    const p = JSON.parse(raw) as Partial<Pending>;
    if (p.from !== current || typeof p.dueAt !== 'number' || !Number.isFinite(p.dueAt)) return undefined;
    return { from: current, dueAt: p.dueAt, critical: p.critical === true };
  } catch {
    return undefined;
  }
}

const storage = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

// ---- a tiny store: the service worker side sets it, the UI reads it ----

export type HoldKind = 'input' | 'undo';

export interface UpdateState {
  ready: boolean;
  /** Something asks to wait: unsaved input (setup, course, chat draft, edit form) or the 10″ undo. */
  hold: boolean;
  /** Unsaved input among the holders («Ενημέρωση τώρα» asks first). */
  inputHold: boolean;
  /** When the waiting version applies by itself (ms, device clock). */
  dueAt?: number;
  critical: boolean;
  requested: boolean;
  force: boolean;
  /** The Home card was closed (until the next app open). */
  dismissed: boolean;
}

const EMPTY: UpdateState = { ready: false, hold: false, inputHold: false, critical: false, requested: false, force: false, dismissed: false };
let state: UpdateState = EMPTY;
let apply: (() => void) | undefined;
let current = 'dev';
/** Who holds the update now (one id per screen or form). */
const holds = new Map<string, HoldKind>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (p: Partial<UpdateState>) => {
  state = { ...state, ...p };
  emit();
};

function persist() {
  if (!state.ready || state.dueAt === undefined) return;
  const p: Pending = { from: current, dueAt: state.dueAt, critical: state.critical };
  try {
    storage()?.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    /* private mode: the state lives until the next reload */
  }
}

export const getUpdateState = () => state;

export function subscribeUpdate(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Called when a new version is installed and waiting, also on startup for a
 * worker that was already waiting: the stored 02:00 time (and critical) survive.
 */
export function markUpdateReady(applyFn: () => void, version: string, now = Date.now()) {
  apply = applyFn;
  current = version;
  if (state.ready) return emit();
  let saved: Pending | undefined;
  try {
    saved = readPending(storage()?.getItem(PENDING_KEY) ?? null, version);
  } catch {
    saved = undefined;
  }
  set({ ready: true, dueAt: saved?.dueAt ?? nextLocalTime(now), critical: state.critical || !!saved?.critical });
  persist();
}

/** The waiting version turned out critical: apply as soon as the device is free. */
export function setCritical(critical: boolean) {
  if (!critical || state.critical) return;
  set({ critical: true });
  persist();
}

/** «Ενημέρωση τώρα»: at once, or right after the session / undo. */
export function requestUpdateNow() {
  if (!state.requested) set({ requested: true });
}

/** «Ενημέρωση τώρα» confirmed although unsaved input will be lost. */
export function forceUpdateNow() {
  set({ requested: true, force: true });
}

/** Hides the Home card until the next app open; the 02:00 apply still happens. */
export function dismissUpdateCard() {
  if (!state.dismissed) set({ dismissed: true });
}

/** Registers (`on`) or releases one holder. The update applies once nobody holds it. */
export function setHold(id: string, on: boolean, kind: HoldKind = 'input') {
  if (on) holds.set(id, kind);
  else holds.delete(id);
  const hold = holds.size > 0;
  const inputHold = [...holds.values()].includes('input');
  if (state.hold === hold && state.inputHold === inputHold) return;
  set({ hold, inputHold });
}

/** Activates the waiting version (the page reloads). */
export function applyUpdate() {
  if (!apply) return;
  try {
    storage()?.removeItem(PENDING_KEY);
  } catch {
    /* nothing stored */
  }
  apply();
}

/**
 * On startup with no waiting worker: a stored record is stale (the browser already
 * activated that version on a full reopen), so drop it before it can shorten the next wait.
 */
export function clearStalePending() {
  if (state.ready) return;
  try {
    storage()?.removeItem(PENDING_KEY);
  } catch {
    /* nothing stored */
  }
}

/** Test helper. */
export function resetUpdateState() {
  state = EMPTY;
  holds.clear();
  apply = undefined;
  current = 'dev';
  listeners.clear();
}
