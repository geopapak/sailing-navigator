import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiError } from '../sync/api';

vi.mock('../crew/api', () => ({ crewApi: { shareRace: vi.fn(), unshareRace: vi.fn() } }));
vi.mock('../race/training', () => ({ trainingShare: () => ({ kind: 'training' }) }));
vi.mock('./AppContext', () => ({ useApp: () => ({}) }));
vi.mock('./RaceContext', () => ({ useRace: () => ({}) }));

import { crewApi } from '../crew/api';
import { SHARE_TEXT, settledShareMsg, shareDue, syncShare } from './crewShare';
import type { Race } from '../race/types';

const race = { id: 'r1', crewId: 'c1', crewShared: true } as unknown as Race;
const o = { server: 'http://x', token: 't', now: 1000 };
const fail = (status: number, msg = 'Λάθος.') => vi.mocked(crewApi.shareRace).mockRejectedValueOnce(new ApiError(status, msg));

describe('syncShare (QA Φ3 bug 1)', () => {
  beforeEach(() => vi.mocked(crewApi.shareRace).mockReset());

  it('a share the server refuses (413, 400) is no longer shared nor pending', async () => {
    fail(413);
    let res = await syncShare(race, o);
    expect(res.out).toEqual({ ok: false, text: SHARE_TEXT.tooBig, pending: false });
    expect(res.patch).toMatchObject({ crewShared: false, crewSharePending: false });
    fail(400, 'Άκυρα δεδομένα.');
    res = await syncShare(race, o);
    expect(res.patch).toMatchObject({ crewShared: false, crewSharePending: false });
    expect(res.out.text).toBe('Άκυρα δεδομένα.');
  });

  it('offline, expired sign-in and server errors stay pending and shared', async () => {
    for (const s of [0, 401, 429, 503]) {
      fail(s);
      const res = await syncShare(race, o);
      expect(res.patch.crewSharePending).toBe(true);
      expect(res.patch.crewShared).toBeUndefined();
    }
  });

  it('sent: shared, not pending', async () => {
    vi.mocked(crewApi.shareRace).mockResolvedValueOnce(undefined as never);
    const res = await syncShare(race, o);
    expect(res.out).toEqual({ ok: true, text: SHARE_TEXT.sent });
    expect(res.patch).toEqual({ crewSharePending: false, crewSharedAt: 1000 });
  });
});

describe('share card message after a background retry (QA Φ3 bug 2)', () => {
  const offline = { text: SHARE_TEXT.offline, retry: true };

  it('«Θα σταλεί …» turns into what is true once the pending share is done', () => {
    expect(settledShareMsg(offline, true, { crewShared: false, crewSharePending: false })).toEqual({ text: SHARE_TEXT.removed, retry: false });
    expect(settledShareMsg(offline, true, { crewShared: true, crewSharePending: false })).toEqual({ text: SHARE_TEXT.sent, retry: false });
    // Shown from the stored flag only (no message of this screen).
    expect(settledShareMsg(undefined, true, { crewShared: true, crewSharePending: false })).toEqual({ text: SHARE_TEXT.sent, retry: false });
  });

  it('still pending, or nothing was pending: the message stays', () => {
    expect(settledShareMsg(offline, true, { crewShared: false, crewSharePending: true })).toBe(offline);
    const sent = { text: SHARE_TEXT.sent, retry: false };
    expect(settledShareMsg(sent, false, { crewShared: true, crewSharePending: false })).toBe(sent);
    expect(settledShareMsg(undefined, false, { crewShared: true })).toBeUndefined();
    const big = { text: SHARE_TEXT.tooBig, retry: false };
    expect(settledShareMsg(big, true, { crewShared: false, crewSharePending: false })).toBe(big);
  });
});

describe('the share of a just-ended session waits for the undo (QA Φ3 bug 5)', () => {
  const r = { crewSharePending: true, status: 'finished' } as const;

  it('goes only when finished, pending and not held', () => {
    expect(shareDue(r, 1000)).toBe(true);
    expect(shareDue(r, 1000, 5000)).toBe(false);
    expect(shareDue(r, 5001, 5000)).toBe(true);
    // «Αναίρεση» holds it while the session reopens; reopened, it is running and does not go.
    expect(shareDue(r, 1000, Infinity)).toBe(false);
    expect(shareDue({ ...r, status: 'running' }, 1000)).toBe(false);
    expect(shareDue({ ...r, crewSharePending: false }, 1000)).toBe(false);
  });
});
