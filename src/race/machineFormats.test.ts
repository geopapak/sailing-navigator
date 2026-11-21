/**
 * P-064 KA-K7: the files and the AI summary keep the dot and ISO. Hashes taken from 0.19.0
 * (`git archive` of main) for the same data: byte-for-byte the same.
 */
import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { project, type Mark } from '../routing/isochrones';
import { analyseRace, analysisSummary, toCsv, toGpx } from './analysis';
import type { Race, TrackPoint } from './types';
const A: Mark = { id: 'a', name: 'Φάληρο', lat: 37.9, lon: 23.6 };
const B: Mark = { id: 'b', name: 'Αίγινα <κίτρινη>', ...project(A, 0, 2) };
const T0 = Date.UTC(2026, 10, 14, 9);
function track(): TrackPoint[] {
  const pts: TrackPoint[] = [];
  for (let m = 0; m <= 30; m++) { const p = project(A, 0, (2 * m) / 30); pts.push({ t: T0 + m * 60_000, lat: p.lat, lon: p.lon, sog: 5.123456, twa: m < 15 ? 42 : -42, tws: 12.34, pct: m >= 12 && m <= 18 ? 0.8 : 0.97, sail: 'J1' }); }
  for (let m = 1; m <= 15; m++) { const p = project(B, 180, (2 * m) / 15); pts.push({ t: T0 + (30 + m) * 60_000, lat: p.lat, lon: p.lon, twa: 170, tws: 12, pct: 1, sail: m > 2 ? 'A2' : 'J1' }); }
  return pts;
}
const race: Race = { id: 'r', name: 'Δοκιμή & "test"', marks: [A, B, A], start: T0, finish: T0 + 45 * 60_000, scoringOptionId: 'coastal', method: 'ToT', entries: [{ id: 'us', name: 'Εμείς', own: true, source: 'own' }], status: 'finished', track: track(), fixes: [], updatedAt: 0 };
const h = (s: string) => createHash('sha256').update(s).digest('hex');
it('CSV, GPX and the AI JSON are the same as in 0.19.0 (KA-K7)', () => {
  expect(h(toCsv(race))).toBe('32e62e71b065ceaf2b65d5d13a0c9533a28547bfaaceadd9f669c93be7a3fa0b');
  expect(h(toGpx(race))).toBe('f182275a09818e70ce7c5bdeb61474443333177f421020a4829b8dc42d46a5d5');
  expect(h(JSON.stringify(analysisSummary(race, analyseRace(race))))).toBe('0575007e4f5f39e1e9fe24f639fe5a41799e46c82b3e9ca807362552d1aa42aa');
});
