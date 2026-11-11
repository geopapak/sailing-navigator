import { describe, expect, it } from 'vitest';
import { DEFAULT_ALERTS, newEngine, step, type Situation } from './alerts';

const base: Situation = { now: 0, markIndex: 1, markName: 'Πάνω', isFinish: false, leg: 'up', board: 'stbd' };

describe('manoeuvre alerts (P-023)', () => {
  it('layline at 2′, 1′ and now, each once', () => {
    const st = newEngine();
    const at = (now: number, layInSec: number) => step(st, DEFAULT_ALERTS, { ...base, now, layInSec });
    expect(at(0, 200)).toBeUndefined();
    expect(at(80_000, 118)?.big).toBe('ΑΝΑΣΤΡΟΦΗ σε 2′');
    expect(at(82_000, 116)).toBeUndefined();
    const one = at(140_000, 59)!;
    expect(one.big).toBe('ΑΝΑΣΤΡΟΦΗ σε 1′');
    expect(one.sub).toBe('Layline αριστερών για Πάνω · πρόταση');
    const now = at(195_000, 5)!;
    expect(now.kind).toBe('now');
    expect(now.say).toBe('Αναστροφή τώρα');
  });

  it('starting inside 1′ does not fire the 2′ alert later', () => {
    const st = newEngine();
    expect(step(st, DEFAULT_ALERTS, { ...base, layInSec: 50 })?.big).toBe('ΑΝΑΣΤΡΟΦΗ σε 1′');
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 40_000, layInSec: 100 })).toBeUndefined();
  });

  it('respects the switches, the leads and the words', () => {
    const st = newEngine();
    const s = { ...DEFAULT_ALERTS, leads: { 120: false, 60: true, 6: true } as const, words: 'slang' as const };
    expect(step(st, s, { ...base, layInSec: 100 })).toBeUndefined();
    expect(step(st, s, { ...base, now: 50_000, layInSec: 55, leg: 'down' })?.big).toBe('ΤΖΑΪΜΠ σε 1′');
    const off = { ...DEFAULT_ALERTS, on: { lay: false, shift: true, mark: true } };
    expect(step(newEngine(), off, { ...base, layInSec: 5 })).toBeUndefined();
  });

  it('wind shift over 7° with instruments: header on starboard suggests a tack', () => {
    const st = newEngine();
    expect(step(st, DEFAULT_ALERTS, { ...base, instTwd: 10 })).toBeUndefined();
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 10_000, instTwd: 5 })).toBeUndefined();
    const a = step(st, DEFAULT_ALERTS, { ...base, now: 40_000, instTwd: 2 })!;
    expect(a.big).toBe('ΣΤΡΟΦΗ ΑΝΕΜΟΥ 8°');
    expect(a.kind).toBe('warn');
    // Across north: 358 → 6 is an 8° veer, a lift on starboard.
    const st2 = newEngine();
    step(st2, DEFAULT_ALERTS, { ...base, instTwd: 358 });
    expect(step(st2, DEFAULT_ALERTS, { ...base, now: 40_000, instTwd: 6 })?.kind).toBe('info');
  });

  it('no shift alerts without instruments', () => {
    const st = newEngine();
    step(st, DEFAULT_ALERTS, { ...base });
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 60_000 })).toBeUndefined();
  });

  it('mark in 1′ always passes the gap; other alerts wait for it', () => {
    const st = newEngine();
    expect(step(st, DEFAULT_ALERTS, { ...base, layInSec: 110 })?.type).toBe('lay');
    const m = step(st, DEFAULT_ALERTS, { ...base, now: 5_000, markInSec: 50 })!;
    expect(m.big).toBe('ΣΗΜΑΔΟΥΡΑ σε 1′');
    const f = step(st, DEFAULT_ALERTS, { ...base, now: 9_000, markIndex: 2, isFinish: true, markInSec: 40 })!;
    expect(f.big).toBe('ΤΕΡΜΑΤΙΣΜΟΣ σε 1′');
  });
});
