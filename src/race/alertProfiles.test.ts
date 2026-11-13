import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ALERTS,
  DEFAULT_CRUISE_ALERTS,
  DEFAULT_TRAINING_ALERTS,
  newEngine,
  profileFor,
  soundFor,
  step,
  type KindAlertSettings,
  type Situation,
} from './alerts';

const base: Situation = { now: 0, markIndex: 1, markName: 'Πάνω', isFinish: false, leg: 'up', board: 'stbd' };
const S: KindAlertSettings = { alerts: DEFAULT_ALERTS, raceShiftDeg: 7, training: DEFAULT_TRAINING_ALERTS, cruiseAlerts: DEFAULT_CRUISE_ALERTS };

/** Feeds a steady wind, then a shift of `by` degrees; returns the alert of the shift step. */
function shift(p: ReturnType<typeof profileFor>, by: number) {
  const st = newEngine();
  step(st, DEFAULT_ALERTS, { ...base, instTwd: 100 }, p);
  return step(st, DEFAULT_ALERTS, { ...base, now: 120_000, instTwd: 100 + by }, p);
}

describe('alert profiles per kind (P-034)', () => {
  it('race: today’s alerts, threshold from the setting', () => {
    const p = profileFor('race', S);
    expect(p.types).toEqual(['lay', 'shift', 'mark']);
    expect(p.shiftDeg).toBe(7);
    expect(p.minGapSec).toBe(30);
    expect(p.strictGap).toBe(false);
    expect(p.layLeads).toEqual([120, 60, 6]);
    expect(profileFor('race', { ...S, alerts: { ...DEFAULT_ALERTS, on: { lay: false, shift: true, mark: false } } }).types).toEqual(['shift']);
  });

  it('race: 7° fires, 6° does not; 5° and 10° follow the setting', () => {
    expect(shift(profileFor('race', S), 7)?.type).toBe('shift');
    expect(shift(profileFor('race', S), 6)).toBeUndefined();
    expect(shift(profileFor('race', { ...S, raceShiftDeg: 5 }), 5)?.big).toBe('ΣΤΡΟΦΗ ΑΝΕΜΟΥ 5°');
    expect(shift(profileFor('race', { ...S, raceShiftDeg: 10 }), 9)).toBeUndefined();
    expect(shift(profileFor('race', { ...S, raceShiftDeg: 10 }), 10)?.type).toBe('shift');
  });

  it('training: shift, GPS and layline "now" by default; below 90% off; 60″ strict gap; beep only', () => {
    const p = profileFor('training', S);
    expect(p.types).toEqual(['shift', 'gps', 'lay']);
    expect(p.shiftDeg).toBe(10);
    expect(p.minGapSec).toBe(60);
    expect(p.strictGap).toBe(true);
    expect(p.layLeads).toEqual([6]);
    expect(soundFor(p, 'voice')).toBe('beep');
    expect(soundFor(profileFor('race', S), 'voice')).toBe('voice');
    expect(profileFor('training', { ...S, training: { ...DEFAULT_TRAINING_ALERTS, below90: true, shift: false } }).types).toEqual(['gps', 'lay', 'below']);
  });

  it('training: 10° fires, 9° does not; 7° and 15° follow the setting', () => {
    expect(shift(profileFor('training', S), 10)?.big).toBe('ΣΤΡΟΦΗ ΑΝΕΜΟΥ 10°');
    expect(shift(profileFor('training', S), 9)).toBeUndefined();
    expect(shift(profileFor('training', { ...S, training: { ...DEFAULT_TRAINING_ALERTS, shiftDeg: 7 } }), 7)?.type).toBe('shift');
    expect(shift(profileFor('training', { ...S, training: { ...DEFAULT_TRAINING_ALERTS, shiftDeg: 15 } }), 14)).toBeUndefined();
  });

  it('training: never a mark alert, layline only "now"', () => {
    const p = profileFor('training', S);
    const st = newEngine();
    expect(step(st, DEFAULT_ALERTS, { ...base, layInSec: 110, markInSec: 50 }, p)).toBeUndefined();
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 60_000, layInSec: 55 }, p)).toBeUndefined();
    const now = step(st, DEFAULT_ALERTS, { ...base, now: 115_000, layInSec: 5 }, p)!;
    expect(now.big).toBe('LAYLINE ΤΩΡΑ');
    expect(now.kind).toBe('now');
  });

  it('training: at least 60″ between two alerts (GPS loss waits for the gap)', () => {
    const p = profileFor('training', S);
    const st = newEngine();
    step(st, DEFAULT_ALERTS, { ...base, instTwd: 100 }, p);
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 10_000, instTwd: 112 }, p)?.type).toBe('shift');
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 30_000, instTwd: 112, gpsLost: true }, p)).toBeUndefined();
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 72_000, instTwd: 112, gpsLost: true }, p)?.type).toBe('gps');
  });

  it('training: layline "now" passes the 60″ gap after 10″', () => {
    const p = profileFor('training', S);
    const st = newEngine();
    step(st, DEFAULT_ALERTS, { ...base, instTwd: 100 }, p);
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 10_000, instTwd: 112 }, p)?.type).toBe('shift');
    // 4″ after the shift: too soon, held.
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 14_000, instTwd: 112, layInSec: 5 }, p)).toBeUndefined();
    // 10″ after the shift: shows, long before the 60″ gap.
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 20_000, instTwd: 112, layInSec: 3 }, p)?.big).toBe('LAYLINE ΤΩΡΑ');
  });

  it('training: a held layline "now" older than 15″ is dropped', () => {
    const p = profileFor('training', S);
    const st = newEngine();
    step(st, DEFAULT_ALERTS, { ...base, gpsLost: true }, p); // an alert at 0
    // Due at 1″, but the 10″ gap holds it.
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 1_000, layInSec: 5 }, p)).toBeUndefined();
    st.last = 9_000; // another alert was shown meanwhile, so the gap is not passed at 17″ either
    // At 17″ it has waited 16″ > 15″: dropped, and never shown late.
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 17_000, layInSec: 4 }, p)).toBeUndefined();
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 20_000, layInSec: 3 }, p)).toBeUndefined();
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 40_000, layInSec: 2 }, p)).toBeUndefined();
  });

  it('race: "now" still passes the gap (unchanged)', () => {
    const p = profileFor('race', S);
    const st = newEngine();
    step(st, DEFAULT_ALERTS, { ...base, instTwd: 100 }, p);
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 10_000, instTwd: 110 }, p)?.type).toBe('shift');
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 12_000, instTwd: 110, layInSec: 5 }, p)?.kind).toBe('now');
  });

  it('training: GPS lost fires once per loss', () => {
    const p = profileFor('training', S);
    const st = newEngine();
    const a = step(st, DEFAULT_ALERTS, { ...base, gpsLost: true }, p)!;
    expect(a.big).toBe('ΧΑΘΗΚΕ ΤΟ GPS');
    expect(a.sub).toBe('Η καταγραφή περιμένει θέση · κράτα την οθόνη ανοιχτή');
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 90_000, gpsLost: true }, p)).toBeUndefined();
    step(st, DEFAULT_ALERTS, { ...base, now: 100_000 }, p);
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 200_000, gpsLost: true }, p)?.type).toBe('gps');
    // Switched off: nothing.
    const off = profileFor('training', { ...S, training: { ...DEFAULT_TRAINING_ALERTS, gps: false } });
    expect(step(newEngine(), DEFAULT_ALERTS, { ...base, gpsLost: true }, off)).toBeUndefined();
  });

  it('training: below 90% only when switched on, after more than 30″', () => {
    const at = (p: ReturnType<typeof profileFor>, instruments = true) => {
      const st = newEngine();
      return [0, 10_000, 20_000, 30_000, 32_000].map((now) => step(st, DEFAULT_ALERTS, { ...base, now, pct15: 87, instruments }, p));
    };
    expect(at(profileFor('training', S)).every((a) => a === undefined)).toBe(true);
    const on = at(profileFor('training', { ...S, training: { ...DEFAULT_TRAINING_ALERTS, below90: true } }));
    expect(on.slice(0, 4).every((a) => a === undefined)).toBe(true);
    expect(on[4]?.big).toBe('ΚΑΤΩ ΑΠΟ 90%');
    expect(on[4]?.sub).toBe('87% του στόχου για 32″');
  });

  it('training: never below 90% without instruments (manual or forecast wind)', () => {
    const p = profileFor('training', { ...S, training: { ...DEFAULT_TRAINING_ALERTS, below90: true } });
    const st = newEngine();
    const out = [0, 20_000, 40_000, 60_000].map((now) => step(st, DEFAULT_ALERTS, { ...base, now, pct15: 70, instruments: false }, p));
    expect(out.every((a) => a === undefined)).toBe(true);
  });

  it('cruise: no manoeuvre alerts ever', () => {
    const p = profileFor('cruise', S);
    expect(p.types).toEqual([]);
    const st = newEngine();
    step(st, DEFAULT_ALERTS, { ...base, instTwd: 100 }, p);
    const all = [
      step(st, DEFAULT_ALERTS, { ...base, now: 60_000, instTwd: 140, layInSec: 5, markInSec: 30, gpsLost: true, pct15: 50 }, p),
      step(st, DEFAULT_ALERTS, { ...base, now: 200_000, instTwd: 200, layInSec: 3, markInSec: 20, gpsLost: true, pct15: 50 }, p),
    ];
    expect(all).toEqual([undefined, undefined]);
  });

  it('without a profile, step() behaves as the race default (7°)', () => {
    const st = newEngine();
    step(st, DEFAULT_ALERTS, { ...base, instTwd: 100 });
    expect(step(st, DEFAULT_ALERTS, { ...base, now: 60_000, instTwd: 107 })?.type).toBe('shift');
  });
});
