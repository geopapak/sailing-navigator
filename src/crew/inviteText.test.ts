import { describe, expect, it } from 'vitest';
import { INVITE_TEXT, inviteError } from './inviteText';

describe('invite errors (KA-Δ4)', () => {
  it('404, 410, network', () => {
    expect(inviteError({ status: 404, message: 'x' })).toEqual({ text: INVITE_TEXT.notFound, retry: false });
    expect(inviteError({ status: 410, message: 'Η πρόσκληση έληξε. Ζήτα καινούργια.' })).toEqual({ text: 'Η πρόσκληση έληξε. Ζήτα καινούργια.', retry: false });
    expect(inviteError({ status: 0, message: 'Δεν απαντά' })).toEqual({ text: 'Δεν φορτώθηκε η πρόσκληση. Έλεγξε το ίντερνετ.', retry: true });
    expect(inviteError({ status: 500, message: 'Κάτι πήγε στραβά' }).retry).toBe(true);
  });
});
