import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MIN_CHECK_GAP_MS,
  PENDING_KEY,
  applyUpdate,
  clearStalePending,
  dismissUpdateCard,
  fetchCritical,
  forceUpdateNow,
  getUpdateState,
  markUpdateReady,
  nextLocalTime,
  nowAction,
  parseCritical,
  readPending,
  requestUpdateNow,
  resetUpdateState,
  setCritical,
  setHold,
  shouldCheck,
  subscribeUpdate,
  updatePhase,
  type PhaseInput,
} from './update';

beforeEach(() => resetUpdateState());

const base: PhaseInput = { ready: true, session: false, hold: false, due: false, critical: false, requested: false, force: false };
const phase = (p: Partial<PhaseInput>) => updatePhase({ ...base, ...p });

describe('updatePhase (P-043, P-044b)', () => {
  it('does nothing without a new version', () => {
    expect(phase({ ready: false })).toBe('none');
    expect(phase({ ready: false, due: true, critical: true, requested: true })).toBe('none');
  });

  it('a new version waits for 02:00, also when the device is free', () => {
    expect(phase({})).toBe('waiting');
    expect(phase({ session: true })).toBe('waiting');
    expect(phase({ hold: true })).toBe('waiting');
  });

  it('applies at 02:00 when nothing holds it', () => {
    expect(phase({ due: true })).toBe('applying');
  });

  it('at 02:00 a session or a holder defers it until free', () => {
    expect(phase({ due: true, session: true })).toBe('deferred');
    expect(phase({ due: true, hold: true })).toBe('deferred');
  });

  it('critical skips the 02:00 wait but still waits for a free device', () => {
    expect(phase({ critical: true })).toBe('applying');
    expect(phase({ critical: true, session: true })).toBe('deferred');
    expect(phase({ critical: true, hold: true })).toBe('deferred');
  });

  it('«Ενημέρωση τώρα» applies at once without a session, and after it with one', () => {
    expect(phase({ requested: true })).toBe('applying');
    expect(phase({ requested: true, session: true })).toBe('deferred');
    expect(phase({ requested: true, hold: true })).toBe('deferred');
  });

  it('a confirmed «τώρα» overrides unsaved input but never a session', () => {
    expect(phase({ requested: true, force: true, hold: true })).toBe('applying');
    expect(phase({ requested: true, force: true, session: true })).toBe('deferred');
  });
});

describe('nowAction («Ενημέρωση τώρα»)', () => {
  it('applies when free', () => {
    expect(nowAction({ session: false, inputHold: false, hold: false })).toBe('apply');
  });
  it('during a session: after it ends (no question)', () => {
    expect(nowAction({ session: true, inputHold: true, hold: true })).toBe('after-session');
  });
  it('asks first when unsaved input would be lost', () => {
    expect(nowAction({ session: false, inputHold: true, hold: true })).toBe('confirm');
  });
  it('only the 10″ undo: right after it', () => {
    expect(nowAction({ session: false, inputHold: false, hold: true })).toBe('after-hold');
  });
});

describe('nextLocalTime (02:00 device-local)', () => {
  const tz0 = process.env.TZ;
  const inTz = (tz: string) => {
    process.env.TZ = tz;
  };
  afterAll(() => {
    if (tz0 === undefined) delete process.env.TZ;
    else process.env.TZ = tz0;
  });
  const local = (y: number, mo: number, d: number, h: number, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();
  const iso = (t: number) => new Date(t).toISOString();

  it('around midnight and at 02:00 itself', () => {
    inTz('Europe/Athens');
    expect(nextLocalTime(local(2026, 11, 12, 23, 59))).toBe(local(2026, 11, 13, 2));
    expect(nextLocalTime(local(2026, 11, 13, 0, 0))).toBe(local(2026, 11, 13, 2));
    expect(nextLocalTime(local(2026, 11, 13, 1, 59, 59))).toBe(local(2026, 11, 13, 2));
    // Exactly 02:00 or later: tomorrow.
    expect(nextLocalTime(local(2026, 11, 13, 2, 0))).toBe(local(2026, 11, 14, 2));
    expect(nextLocalTime(local(2026, 11, 13, 14, 30))).toBe(local(2026, 11, 14, 2));
  });

  it('crosses month and year ends', () => {
    inTz('Europe/Athens');
    expect(nextLocalTime(local(2026, 12, 31, 22))).toBe(local(2027, 1, 1, 2));
    expect(nextLocalTime(local(2027, 2, 28, 12))).toBe(local(2027, 3, 1, 2));
  });

  it('Athens DST days (changes at 03:00/04:00, 02:00 always exists)', () => {
    inTz('Europe/Athens');
    // Night before spring forward: 02:00 EET = 00:00Z.
    expect(iso(nextLocalTime(Date.parse('2026-03-28T21:30:00Z')))).toBe('2026-03-29T00:00:00.000Z');
    // After it: the next 02:00 is summer time (+3).
    expect(iso(nextLocalTime(Date.parse('2026-03-29T00:30:00Z')))).toBe('2026-03-29T23:00:00.000Z');
    // Night before fall back: 02:00 still summer time.
    expect(iso(nextLocalTime(Date.parse('2026-10-24T19:00:00Z')))).toBe('2026-10-24T23:00:00.000Z');
    // Day of fall back: the next 02:00 is winter time (+2), 25 h later.
    expect(iso(nextLocalTime(Date.parse('2026-10-25T10:00:00Z')))).toBe('2026-10-26T00:00:00.000Z');
  });

  it('Berlin DST days (02:00 missing in spring, twice in autumn)', () => {
    inTz('Europe/Berlin');
    // 02:00 does not exist on 29 March: the first valid time after the gap, 03:00 CEST.
    const spring = nextLocalTime(Date.parse('2026-03-28T21:00:00Z'));
    expect(iso(spring)).toBe('2026-03-29T01:00:00.000Z');
    expect(spring).toBeGreaterThan(Date.parse('2026-03-28T21:00:00Z'));
    // 02:00 happens twice on 25 October: the first one (CEST).
    expect(iso(nextLocalTime(Date.parse('2026-10-24T20:00:00Z')))).toBe('2026-10-25T00:00:00.000Z');
    // In the repeated hour (second 02:30, CET): tomorrow 02:00.
    expect(iso(nextLocalTime(Date.parse('2026-10-25T01:30:00Z')))).toBe('2026-10-26T01:00:00.000Z');
  });

  it('New York DST days', () => {
    inTz('America/New_York');
    // Spring forward at 02:00: no 02:00, so 03:00 EDT.
    expect(iso(nextLocalTime(Date.parse('2026-03-08T03:00:00Z')))).toBe('2026-03-08T07:00:00.000Z');
    // Fall back at 02:00 EDT → 01:00 EST: 02:00 happens once, in EST.
    expect(iso(nextLocalTime(Date.parse('2026-11-01T03:00:00Z')))).toBe('2026-11-01T07:00:00.000Z');
  });
});

describe('parseCritical / fetchCritical', () => {
  it('critical when the deployed version is marked critical and newer', () => {
    expect(parseCritical({ version: '0.13.0', critical: true, criticalVersions: ['0.13.0'] }, '0.12.1')).toBe(true);
    expect(parseCritical({ version: '0.13.0', critical: true }, '0.12.1')).toBe(true);
  });

  it('not critical for a normal version', () => {
    expect(parseCritical({ version: '0.13.0', critical: false, criticalVersions: [] }, '0.12.1')).toBe(false);
  });

  it('a skipped critical version still counts', () => {
    expect(parseCritical({ version: '0.13.1', critical: false, criticalVersions: ['0.13.0', '0.10.0'] }, '0.12.1')).toBe(true);
  });

  it('a critical version already installed does not count again', () => {
    expect(parseCritical({ version: '0.13.1', critical: false, criticalVersions: ['0.12.1', '0.10.0'] }, '0.12.1')).toBe(false);
    // A stale version.json (the running version itself, marked critical).
    expect(parseCritical({ version: '0.12.1', critical: true }, '0.12.1')).toBe(false);
  });

  it('malformed data counts as non-critical', () => {
    for (const j of [null, undefined, 'x', 42, [], {}, { critical: true }, { version: 13, critical: true }, { version: '0.13.0', critical: 'yes' }])
      expect(parseCritical(j, '0.12.1')).toBe(false);
    expect(parseCritical({ version: '0.13.0', criticalVersions: [7, null, '0.13.0'] }, '0.12.1')).toBe(true);
  });

  it('fetches with no-store and reads the flag', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ version: '0.13.0', critical: true, criticalVersions: ['0.13.0'] })));
    expect(await fetchCritical(f as unknown as typeof fetch, '/version.json', '0.12.1')).toBe(true);
    expect(f).toHaveBeenCalledWith('/version.json', { cache: 'no-store' });
  });

  it('a failed fetch, an error status or bad JSON mean non-critical', async () => {
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await fetchCritical(offline as unknown as typeof fetch, '/v', '0.12.1')).toBe(false);
    const notFound = vi.fn(async () => new Response('nope', { status: 404 }));
    expect(await fetchCritical(notFound as unknown as typeof fetch, '/v', '0.12.1')).toBe(false);
    const html = vi.fn(async () => new Response('<!doctype html>', { status: 200 }));
    expect(await fetchCritical(html as unknown as typeof fetch, '/v', '0.12.1')).toBe(false);
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
  it('clears a stale pending record on startup when no version is waiting', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    store.set(PENDING_KEY, JSON.stringify({ from: '0.12.1', dueAt: 1, critical: false }));
    clearStalePending();
    expect(store.has(PENDING_KEY)).toBe(false);
    markUpdateReady(() => undefined, '0.12.1', Date.now());
    clearStalePending();
    expect(store.has(PENDING_KEY)).toBe(true);
    vi.unstubAllGlobals();
  });


  it('marks a waiting version for the next 02:00, notifies, and applies only on request', () => {
    const fn = vi.fn();
    const seen = vi.fn();
    subscribeUpdate(seen);
    expect(getUpdateState().ready).toBe(false);
    const now = Date.now();
    markUpdateReady(fn, '0.12.1', now);
    expect(getUpdateState().ready).toBe(true);
    expect(getUpdateState().dueAt).toBe(nextLocalTime(now));
    expect(seen).toHaveBeenCalledTimes(1);
    expect(fn).not.toHaveBeenCalled();
    applyUpdate();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('a hold (10″ undo) defers a due version like a running session', () => {
    markUpdateReady(() => undefined, '0.12.1');
    setHold('undo', true, 'undo');
    const s = getUpdateState();
    expect(s.inputHold).toBe(false);
    expect(updatePhase({ ...s, session: false, due: true })).toBe('deferred');
    setHold('undo', false);
    expect(updatePhase({ ...getUpdateState(), session: false, due: true })).toBe('applying');
  });

  it('waits until every holder lets go (setup + chat draft)', () => {
    const seen = vi.fn();
    subscribeUpdate(seen);
    setHold('race-setup', true);
    setHold('chat-draft', true);
    expect(getUpdateState().hold).toBe(true);
    expect(getUpdateState().inputHold).toBe(true);
    setHold('race-setup', false);
    expect(getUpdateState().hold).toBe(true);
    setHold('chat-draft', false);
    expect(getUpdateState().hold).toBe(false);
    // Only changes notify: on, then off.
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('tells unsaved input from the undo', () => {
    setHold('undo', true, 'undo');
    expect(getUpdateState()).toMatchObject({ hold: true, inputHold: false });
    setHold('form', true);
    expect(getUpdateState()).toMatchObject({ hold: true, inputHold: true });
    setHold('form', false);
    expect(getUpdateState()).toMatchObject({ hold: true, inputHold: false });
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

  it('«τώρα», confirmed «τώρα», critical and dismiss', () => {
    markUpdateReady(() => undefined, '0.12.1');
    requestUpdateNow();
    expect(getUpdateState()).toMatchObject({ requested: true, force: false });
    forceUpdateNow();
    expect(getUpdateState().force).toBe(true);
    setCritical(false);
    expect(getUpdateState().critical).toBe(false);
    setCritical(true);
    expect(getUpdateState().critical).toBe(true);
    dismissUpdateCard();
    expect(getUpdateState().dismissed).toBe(true);
  });
});

describe('waiting state across reloads', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };

  it('reads only a valid record of the running version', () => {
    expect(readPending(null, '0.12.1')).toBeUndefined();
    expect(readPending('{bad', '0.12.1')).toBeUndefined();
    expect(readPending(JSON.stringify({ from: '0.12.0', dueAt: 1, critical: true }), '0.12.1')).toBeUndefined();
    expect(readPending(JSON.stringify({ from: '0.12.1', dueAt: 'x' }), '0.12.1')).toBeUndefined();
    expect(readPending(JSON.stringify({ from: '0.12.1', dueAt: 5, critical: true }), '0.12.1')).toEqual({ from: '0.12.1', dueAt: 5, critical: true });
  });

  it('keeps the 02:00 time and critical across a restart', () => {
    const ls = mem();
    vi.stubGlobal('localStorage', ls);
    try {
      const first = Date.parse('2026-11-12T15:00:00Z');
      markUpdateReady(() => undefined, '0.12.1', first);
      setCritical(true);
      const dueAt = getUpdateState().dueAt;
      expect(JSON.parse(ls.getItem(PENDING_KEY)!)).toEqual({ from: '0.12.1', dueAt, critical: true });

      // The app restarts a day later; the worker is still waiting.
      resetUpdateState();
      markUpdateReady(() => undefined, '0.12.1', first + 86_400_000);
      expect(getUpdateState()).toMatchObject({ ready: true, dueAt, critical: true });
      // So it is overdue: applies on this first open (when free).
      expect(updatePhase({ ...getUpdateState(), session: false, due: first + 86_400_000 >= dueAt! })).toBe('applying');
      // Applying clears the record, so the next version starts afresh.
      applyUpdate();
      expect(ls.getItem(PENDING_KEY)).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a record left by the previous version is ignored (the update was applied)', () => {
    const ls = mem();
    ls.setItem(PENDING_KEY, JSON.stringify({ from: '0.12.0', dueAt: 1, critical: true }));
    vi.stubGlobal('localStorage', ls);
    try {
      const now = Date.parse('2026-11-12T15:00:00Z');
      markUpdateReady(() => undefined, '0.12.1', now);
      expect(getUpdateState()).toMatchObject({ dueAt: nextLocalTime(now), critical: false });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('works without storage (private mode)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    try {
      expect(() => markUpdateReady(() => undefined, '0.12.1')).not.toThrow();
      expect(getUpdateState().ready).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
