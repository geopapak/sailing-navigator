import { describe, expect, it } from 'vitest';
import { bufOf, bufText, checkEntry, pressKey } from './resultEntry';

/** 10:00:00 local time. */
const START = new Date(2026, 10, 14, 10, 0, 0).getTime();

const type = (keys: string, fresh = false) => [...keys].reduce((b, k, i) => pressKey(b, k, fresh && i === 0), '');

describe('result keypad', () => {
  it('fills from the right, no leading zeros, at most 6 digits', () => {
    expect(type('24110')).toBe('24110');
    expect(bufText(type('24110'))).toBe('02:41:10');
    expect(type('0005')).toBe('5');
    expect(type('1234567')).toBe('234567');
    expect(bufText('')).toBeUndefined();
  });

  it('⌫ removes the last digit, «Καθάρισε» everything; the first key replaces a shown value', () => {
    expect(pressKey('24110', 'B')).toBe('2411');
    expect(pressKey('24110', 'C')).toBe('');
    expect(pressKey('24110', '3', true)).toBe('3');
    expect(pressKey('24110', 'B', true)).toBe('');
    expect(pressKey('24110', 'x')).toBe('24110');
  });

  it('elapsed: minutes and seconds up to 59', () => {
    expect(checkEntry('elapsed', '24110', START)).toEqual({
      ok: true,
      elapsed: 2 * 3600 + 41 * 60 + 10,
      nextDay: false,
    });
    expect(checkEntry('elapsed', '26010', START)).toEqual({
      ok: false,
      why: 'minsec',
    });
    expect(checkEntry('elapsed', '', START)).toEqual({
      ok: false,
      why: 'empty',
    });
  });

  it('finish time of day: from the start; before it, the next day; hours up to 23', () => {
    expect(checkEntry('clock', '143205', START)).toEqual({
      ok: true,
      elapsed: 4 * 3600 + 32 * 60 + 5,
      nextDay: false,
    });
    const next = checkEntry('clock', '10500', START);
    expect(next).toEqual({
      ok: true,
      elapsed: 15 * 3600 + 5 * 60,
      nextDay: true,
    });
    expect(checkEntry('clock', '250000', START)).toEqual({
      ok: false,
      why: 'hour',
    });
  });

  it('shows an existing result in either mode', () => {
    expect(bufOf('elapsed', 2 * 3600 + 41 * 60 + 10, START)).toBe('24110');
    expect(bufOf('clock', 2 * 3600 + 41 * 60 + 10, START)).toBe('124110');
    expect(checkEntry('clock', bufOf('clock', 5000, START), START)).toMatchObject({ ok: true, elapsed: 5000 });
  });
});
