import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coverage, forecastRange, widenRange, forecastStatus, horizonDays, marksKey, planState, shouldAutoRefresh, type StoredPlan } from './planTarget';

// Real 2026 dates: today Τετ 25/11/2026 14:05, race Σάβ 28/11/2026 11:00 (Athens, UTC+2).
let tz0: string | undefined;
beforeAll(() => {
  tz0 = process.env.TZ;
  process.env.TZ = 'Europe/Athens';
});
afterAll(() => {
  if (tz0 === undefined) delete process.env.TZ;
  else process.env.TZ = tz0;
});
const NOW = Date.UTC(2026, 10, 25, 12, 5);
const RACE = Date.UTC(2026, 10, 28, 9, 0);
const H = 3_600_000;
const D = 24 * H;
const marks = [
  { id: 'a', name: 'Εκκίνηση', lat: 37.9, lon: 23.6 },
  { id: 'b', name: 'Τερματισμός', lat: 37.8, lon: 23.5 },
];
const fc = (from: number, to: number, fetchedAt = NOW) => {
  const times: number[] = [];
  for (let t = Math.floor(from / H) * H; t <= to; t += H) times.push(t);
  return { times, fetchedAt, model: 'best_match' };
};

describe('forecast range (KA-Λ1, Λ5, Λ13)', () => {
  it('asks from now − 1 h to the start + 2 days', () => {
    const r = forecastRange(NOW, RACE, 'best_match');
    if ('beyond' in r) throw new Error('beyond');
    expect(r.startDate <= '2026-11-25').toBe(true);
    expect(r.endDate >= '2026-11-30').toBe(true);
  });
  it('is cut at the model horizon, and asks nothing past it', () => {
    expect(horizonDays('best_match')).toBe(16);
    const far = NOW + 20 * D;
    const r = forecastRange(NOW, far, 'best_match');
    expect('beyond' in r).toBe(true);
    const near = forecastRange(NOW, NOW + 15 * D, 'best_match');
    if ('beyond' in near) throw new Error('beyond');
    expect(near.endDate).toBe('2026-12-10');
  });
  it('a start at 00:30 Athens is 22:30 UTC of the day before: the UTC day is asked', () => {
    const start = Date.UTC(2026, 10, 24, 22, 30); // Τετ 25/11 00:30 Athens, already past
    const r = forecastRange(NOW, start, 'best_match');
    if ('beyond' in r) throw new Error('beyond');
    expect(r.startDate).toBe('2026-11-24');
    const s = forecastStatus({ target: { start }, forecast: fc(start - 2 * H, NOW + 2 * D), modelLabel: 'Αυτόματο', now: NOW, online: true, model: 'best_match' });
    expect(s.lines[0]).toBe('Πρόγνωση για Τετ 25/11 00:30 · Αυτόματο · λήψη Τετ 25/11 14:05');
  });
});

describe('forecast status (KA-Λ1, Λ5–Λ8, Λ10)', () => {
  const base = { modelLabel: 'Αυτόματο (best match)', now: NOW, online: true, model: 'best_match' };
  it('the label of a covered start', () => {
    const s = forecastStatus({ ...base, target: { start: RACE }, forecast: fc(NOW - H, NOW + 5 * D) });
    expect(s.lines).toEqual(['Πρόγνωση για Σάβ 28/11 11:00 · Αυτόματο (best match) · λήψη Τετ 25/11 14:05']);
    expect(s.canCompute).toBe(true);
  });
  it('past the horizon: no compute with the forecast, and when to try again', () => {
    const start = NOW + 20 * D;
    const s = forecastStatus({ ...base, target: { start }, forecast: fc(NOW - H, NOW + 5 * D) });
    expect(s.canCompute).toBe(false);
    expect(s.lines[0]).toMatch(/^Η πρόγνωση φτάνει ως \S+ \d\d\/12\. Ο αγώνας είναι \S+ 15\/12 \d\d:\d\d: δοκίμασε ξανά από \S+ \d\d\/\d\d, ή διάλεξε «Σταθερός» άνεμο\.$/);
  });
  it('partly covered: computes, with the warning', () => {
    const last = Date.UTC(2026, 10, 29, 0, 0); // Κυρ 29/11 02:00 Athens
    const s = forecastStatus({ ...base, target: { start: RACE }, forecast: fc(NOW - H, last), estEnd: last + 3 * H });
    expect(s.canCompute).toBe(true);
    expect(s.lines[1]).toBe('Η πρόγνωση τελειώνει στις Κυρ 29/11 02:00· μετά κρατάμε τον άνεμο της τελευταίας ώρας.');
  });
  it('a start that passed', () => {
    const start = NOW - 2 * H;
    const s = forecastStatus({ ...base, target: { start }, forecast: fc(NOW - 5 * H, NOW + 2 * D) });
    expect(s.lines).toContain('Η ώρα εκκίνησης πέρασε (Τετ 25/11 12:05). Άλλαξέ την αν μετατέθηκε.');
    expect(s.canCompute).toBe(true);
  });
  it('a date without a time: never «now»', () => {
    const day = new Date(2026, 10, 28).getTime();
    const s = forecastStatus({ ...base, target: { day }, forecast: fc(NOW - H, NOW + 5 * D) });
    expect(s.lines).toEqual(['Πρόγνωση για Σάβ 28/11 (χωρίς ώρα)', 'Βάλε ώρα εκκίνησης για τη βέλτιστη διαδρομή.']);
    expect(s.canCompute).toBe(false);
  });
  it('offline: computes with a covering forecast, says so when it does not cover', () => {
    const ok = forecastStatus({ ...base, online: false, target: { start: RACE }, forecast: fc(NOW - H, NOW + 5 * D) });
    expect(ok.lines[0].endsWith('(χωρίς ίντερνετ)')).toBe(true);
    expect(ok.canCompute).toBe(true);
    const short = forecastStatus({ ...base, online: false, target: { start: RACE }, forecast: fc(NOW - H, NOW + D) });
    expect(short.lines).toEqual(['Χωρίς ίντερνετ, και η αποθηκευμένη πρόγνωση (λήψη Τετ 25/11 14:05) δεν φτάνει ως τον αγώνα.']);
    expect(short.canCompute).toBe(false);
  });
  it('no forecast yet', () => {
    expect(forecastStatus({ ...base, target: { start: RACE } }).lines).toEqual(['Δεν υπάρχει πρόγνωση για τον αγώνα ακόμα.']);
    expect(coverage(undefined, RACE)).toBe('none');
  });
});

describe('stored route per race (KA-Λ9, Λ11, Μ5)', () => {
  const route = { legs: [], start: RACE, end: RACE + 2 * H, elapsedSec: 7500, rhumbNm: 9.8, sailedNm: 11 };
  const p: StoredPlan = { route, start: RACE, marksKey: marksKey(marks), forecastAt: NOW, at: NOW };
  it('is current for the same start, marks and forecast', () => {
    expect(planState(p, { start: RACE, marks }, NOW)).toBe('current');
    expect(planState(undefined, { start: RACE, marks }, NOW)).toBe('none');
  });
  it('is stale when the start or the course changed', () => {
    expect(planState(p, { start: RACE + 30 * 60_000, marks }, NOW)).toBe('stale');
    expect(planState(p, { start: RACE, marks: [...marks].reverse() }, NOW)).toBe('stale');
  });
  it('says when the forecast is newer than the route', () => {
    expect(planState(p, { start: RACE, marks }, NOW + 6 * H)).toBe('oldForecast');
  });
});

describe('automatic refresh (KA-Λ9)', () => {
  it('once per 6 h, only with a start within 72 h, an old forecast and internet', () => {
    const o = { now: NOW, start: RACE, fetchedAt: NOW - 7 * H, online: true };
    expect(shouldAutoRefresh(o)).toBe(true);
    expect(shouldAutoRefresh({ ...o, lastAutoAt: NOW - H })).toBe(false);
    expect(shouldAutoRefresh({ ...o, fetchedAt: NOW - 5 * H })).toBe(false);
    expect(shouldAutoRefresh({ ...o, start: NOW + 4 * D })).toBe(false);
    expect(shouldAutoRefresh({ ...o, online: false })).toBe(false);
    expect(shouldAutoRefresh({ ...o, fetchedAt: undefined })).toBe(true);
  });
});

describe('a new download never covers less (QA Μ2)', () => {
  it('the Home card (now + 2 days) keeps a forecast that reaches Saturday', () => {
    const home = forecastRange(NOW, undefined, 'best_match');
    if ('beyond' in home) throw new Error('beyond');
    const prev = fc(NOW - H, RACE + 2 * D);
    const r = widenRange(home, prev, NOW, 'best_match');
    expect(r.endDate).toBe('2026-11-30');
    expect(coverage({ times: [r.from, r.to] }, RACE)).toBe('covers');
  });
  it('another model, or a shorter one, does not widen', () => {
    const home = forecastRange(NOW, undefined, 'best_match');
    if ('beyond' in home) throw new Error('beyond');
    expect(widenRange(home, { ...fc(NOW - H, RACE + 2 * D), model: 'icon_d2' }, NOW, 'best_match')).toBe(home);
    expect(widenRange(home, fc(NOW - H, NOW + D), NOW, 'best_match')).toBe(home);
  });
});
