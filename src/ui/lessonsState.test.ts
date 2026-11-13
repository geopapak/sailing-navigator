import { describe, expect, it } from 'vitest';
import { lessonsFailure } from './lessonsState';

describe('«Ανάλυση και μαθήματα» after a failure (QA Φ3 bug 3)', () => {
  it('offline: waits for the internet, no error', () => {
    expect(lessonsFailure(0, 'Δεν υπάρχει σύνδεση.', true)).toEqual({ waiting: true });
  });

  it('back online and the retry fails: only the error, no longer waiting', () => {
    expect(lessonsFailure(502, 'Ο σύμβουλος δεν απάντησε.', false)).toEqual({ waiting: false, err: 'Ο σύμβουλος δεν απάντησε.' });
    // A network error while the phone says it is online is an error too.
    expect(lessonsFailure(0, 'Δεν υπάρχει σύνδεση.', false)).toEqual({ waiting: false, err: 'Δεν υπάρχει σύνδεση.' });
    expect(lessonsFailure(undefined, 'x', false)).toEqual({ waiting: false, err: 'x' });
  });
});
