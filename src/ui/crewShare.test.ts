import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiError } from '../sync/api';

vi.mock('../crew/api', () => ({ crewApi: { shareRace: vi.fn(), unshareRace: vi.fn() } }));
vi.mock('../race/training', () => ({ trainingShare: () => ({ kind: 'training' }) }));
vi.mock('./AppContext', () => ({ useApp: () => ({}) }));
vi.mock('./RaceContext', () => ({ useRace: () => ({}) }));

import { crewApi } from '../crew/api';
import { SHARE_TEXT, syncShare } from './crewShare';
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
