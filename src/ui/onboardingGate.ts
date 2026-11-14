/**
 * When the first-run steps («Καλώς ήρθες») may be shown.
 *
 * They are shown once per device and never to someone who already uses the app:
 * a user with a boat or a saved session has, by definition, been through it
 * (possibly on another phone, or in Safari before installing the PWA, whose
 * storage is separate on iOS). «Δείξε ξανά τα πρώτα βήματα» (replay) always wins.
 */
export interface OnboardingInput {
  /** Device settings were read from storage. */
  ready: boolean;
  onboarded: boolean;
  /** The user asked to see the steps again from Settings. */
  replay: boolean;
  /** Mirror of `onboarded` kept outside IndexedDB (survives a failed settings write). */
  doneMirror: boolean;
  boatCount: number;
  /** Sessions of this account on the device; undefined while not read yet. */
  sessionCount?: number;
  /** Signed in and the first sync since load has not finished yet (boats may still arrive). */
  syncPending: boolean;
}

export type OnboardingDecision = 'show' | 'hide' | 'mark-done';

/** 'mark-done' means: hide, and remember it so it does not come back. */
export function onboardingDecision(i: OnboardingInput): OnboardingDecision {
  if (!i.ready) return 'hide';
  if (i.replay) return 'show';
  if (i.onboarded) return 'hide';
  if (i.doneMirror || i.boatCount > 0 || (i.sessionCount ?? 0) > 0) return 'mark-done';
  // Not known yet: do not flash the steps to a user whose boats are still downloading.
  if (i.sessionCount === undefined || i.syncPending) return 'hide';
  return 'show';
}

const MIRROR_KEY = 'onboarded';

export function readOnboardedMirror(): boolean {
  try {
    return localStorage.getItem(MIRROR_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeOnboardedMirror(): void {
  try {
    localStorage.setItem(MIRROR_KEY, '1');
  } catch {
    /* ignore */
  }
}
