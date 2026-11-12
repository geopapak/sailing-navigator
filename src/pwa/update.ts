/**
 * Controlled app updates (P-043). A new version waits in the service worker and
 * is applied only when no session is running: never a reload mid-race.
 * React-free, so the rules are unit-tested.
 */

/** How long «Ενημερώνουμε την εφαρμογή…» shows before the reload. */
export const APPLY_DELAY_MS = 2_500;
/** Long-open phones still look for a new version this often. */
export const CHECK_EVERY_MS = 30 * 60_000;
/** Focus/visibility checks no more often than this. */
export const MIN_CHECK_GAP_MS = 60_000;

export type UpdatePhase = 'none' | 'deferred' | 'applying';

/**
 * What to do with a waiting version: nothing, wait for the session to end
 * (`busy` = a session runs, or its 10″ undo is still open), or apply it now.
 */
export function updatePhase(ready: boolean, busy: boolean): UpdatePhase {
  if (!ready) return 'none';
  return busy ? 'deferred' : 'applying';
}

/** Whether a focus/visibility check may run now (the 30′ timer always checks). */
export function shouldCheck(lastCheck: number, now: number, online: boolean): boolean {
  return online && now - lastCheck >= MIN_CHECK_GAP_MS;
}

// ---- a tiny store: the service worker side sets it, the UI reads it ----

interface UpdateState {
  ready: boolean;
  /** Something asks to wait: unsaved input (setup, course, chat draft, edit form) or the 10″ undo. */
  hold: boolean;
}

let state: UpdateState = { ready: false, hold: false };
let apply: (() => void) | undefined;
/** Who holds the update now (one id per screen or form). */
const holds = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getUpdateState = () => state;

export function subscribeUpdate(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Called when a new version is installed and waiting. */
export function markUpdateReady(applyFn: () => void) {
  apply = applyFn;
  state = { ...state, ready: true };
  emit();
}

/** Registers (`on`) or releases one holder. The update applies once nobody holds it. */
export function setHold(id: string, on: boolean) {
  if (on) holds.add(id);
  else holds.delete(id);
  const hold = holds.size > 0;
  if (state.hold === hold) return;
  state = { ...state, hold };
  emit();
}

/** Activates the waiting version (the page reloads). */
export function applyUpdate() {
  apply?.();
}

/** Test helper. */
export function resetUpdateState() {
  state = { ready: false, hold: false };
  holds.clear();
  apply = undefined;
  listeners.clear();
}
