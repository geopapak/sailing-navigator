import { describe, expect, it } from 'vitest';
import { onboardingDecision, type OnboardingInput } from './onboardingGate';

const NEW: OnboardingInput = {
  ready: true,
  onboarded: false,
  replay: false,
  doneMirror: false,
  boatCount: 0,
  sessionCount: 0,
  syncPending: false,
};

describe('onboardingDecision', () => {
  it('shows the steps to a new user once everything is known', () => {
    expect(onboardingDecision(NEW)).toBe('show');
  });

  it('waits for the settings, the sessions and the first sync', () => {
    expect(onboardingDecision({ ...NEW, ready: false })).toBe('hide');
    expect(onboardingDecision({ ...NEW, sessionCount: undefined })).toBe('hide');
    expect(onboardingDecision({ ...NEW, syncPending: true })).toBe('hide');
  });

  it('never shows again once finished or skipped', () => {
    expect(onboardingDecision({ ...NEW, onboarded: true })).toBe('hide');
    expect(onboardingDecision({ ...NEW, onboarded: true, boatCount: 2 })).toBe('hide');
  });

  it('remembers it when the settings write was lost but the mirror was kept', () => {
    expect(onboardingDecision({ ...NEW, doneMirror: true })).toBe('mark-done');
  });

  it('a user with boats or sessions has done it already (other phone, reinstall, iOS PWA)', () => {
    expect(onboardingDecision({ ...NEW, boatCount: 1 })).toBe('mark-done');
    expect(onboardingDecision({ ...NEW, sessionCount: 3 })).toBe('mark-done');
    // Boats known even while the sync still runs.
    expect(onboardingDecision({ ...NEW, boatCount: 1, syncPending: true, sessionCount: undefined })).toBe('mark-done');
  });

  it('«Δείξε ξανά τα πρώτα βήματα» always shows them', () => {
    expect(onboardingDecision({ ...NEW, replay: true, onboarded: true, boatCount: 3, sessionCount: 5 })).toBe('show');
    expect(onboardingDecision({ ...NEW, replay: true, ready: false })).toBe('hide');
  });
});
