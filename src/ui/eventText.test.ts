import { describe, expect, it } from 'vitest';
import { EVENT_TEXT as ET, pointsText } from './eventText';

describe('event texts', () => {
  it('«1 βαθμός», otherwise «βαθμοί» (also 1,5)', () => {
    expect(pointsText(1)).toBe('1 βαθμός');
    expect(pointsText('1')).toBe('1 βαθμός');
    expect(pointsText(1.5)).toBe('1,5 βαθμοί');
    expect(pointsText(3)).toBe('3 βαθμοί');
    expect(ET.codeIs('DNE', 1)).toBe('DNE = 1 βαθμός · δεν απορρίπτεται');
  });

  it('the home card says «ίδιο σκάφος και αντίπαλοι» only from the 2nd race', () => {
    expect(ET.when('Σάβ 14/11 · 10:00', false)).toBe('Σάβ 14/11 · 10:00');
    expect(ET.when('δεν έχει στηθεί', true)).toBe('δεν έχει στηθεί · ίδιο σκάφος και αντίπαλοι');
  });
});
