import { describe, expect, it } from 'vitest';
import { themeColor } from './themeColor';

describe('themeColor (P-049 §7)', () => {
  it('follows the light top bar outside a session', () => {
    expect(themeColor('day', false)).toBe('#f2f4f7');
    expect(themeColor('dark', false)).toBe('#0b1220');
    expect(themeColor('night', false)).toBe('#000000');
  });
  it('takes the session bar colour while recording (black at night)', () => {
    expect(themeColor('day', true)).toBe('#0b2a4a');
    expect(themeColor('dark', true)).toBe('#7cb4ff');
    expect(themeColor('night', true)).toBe('#000000');
  });
});
