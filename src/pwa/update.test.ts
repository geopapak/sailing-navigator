import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MIN_CHECK_GAP_MS,
  applyUpdate,
  getUpdateState,
  markUpdateReady,
  resetUpdateState,
  setHold,
  shouldCheck,
  subscribeUpdate,
  updatePhase,
} from './update';

beforeEach(() => resetUpdateState());

describe('updatePhase (P-043)', () => {
  it('does nothing without a new version', () => {
    expect(updatePhase(false, false)).toBe('none');
    expect(updatePhase(false, true)).toBe('none');
  });

  it('never applies while a session runs: it waits', () => {
    expect(updatePhase(true, true)).toBe('deferred');
  });

  it('applies when no session runs (also right after one ends)', () => {
    expect(updatePhase(true, false)).toBe('applying');
  });
});

describe('shouldCheck', () => {
  it('checks on focus at most once a minute and only online', () => {
    expect(shouldCheck(0, MIN_CHECK_GAP_MS, true)).toBe(true);
    expect(shouldCheck(1000, 1000 + MIN_CHECK_GAP_MS - 1, true)).toBe(false);
    expect(shouldCheck(0, 10 * MIN_CHECK_GAP_MS, false)).toBe(false);
  });
});

describe('update store', () => {
  it('marks a waiting version, notifies, and applies only on request', () => {
    const fn = vi.fn();
    const seen = vi.fn();
    subscribeUpdate(seen);
    expect(getUpdateState().ready).toBe(false);
    markUpdateReady(fn);
    expect(getUpdateState().ready).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(fn).not.toHaveBeenCalled();
    applyUpdate();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('a hold (10″ undo) defers like a running session', () => {
    markUpdateReady(() => undefined);
    setHold('undo', true);
    const s = getUpdateState();
    expect(updatePhase(s.ready, s.hold)).toBe('deferred');
    setHold('undo', false);
    expect(updatePhase(getUpdateState().ready, getUpdateState().hold)).toBe('applying');
  });

  it('waits until every holder lets go (setup + chat draft)', () => {
    const seen = vi.fn();
    subscribeUpdate(seen);
    setHold('race-setup', true);
    setHold('chat-draft', true);
    expect(getUpdateState().hold).toBe(true);
    setHold('race-setup', false);
    expect(getUpdateState().hold).toBe(true);
    setHold('chat-draft', false);
    expect(getUpdateState().hold).toBe(false);
    // Only changes notify: on, then off.
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('the same holder twice counts once, and releasing an unknown one is harmless', () => {
    setHold('a', true);
    setHold('a', true);
    setHold('a', false);
    expect(getUpdateState().hold).toBe(false);
    setHold('nobody', false);
    expect(getUpdateState().hold).toBe(false);
  });

  it('applying without a waiting version is harmless', () => {
    expect(() => applyUpdate()).not.toThrow();
  });
});
