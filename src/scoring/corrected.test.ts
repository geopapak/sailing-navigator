import { describe, expect, it } from 'vitest';
import {
  corrected,
  correctedToD,
  correctedToT,
  elapsedToTie,
  formatDuration,
  parseDuration,
  rank,
  requiredSpeed,
} from './corrected';
import { TRE_IRENE } from '../boat/treIrene';

const coastal = TRE_IRENE.scoring.find((s) => s.id === 'coastal')!;

describe('ToT / ToD', () => {
  it('ToT multiplies elapsed by the coefficient', () => {
    // 3 h elapsed, coastal ToT 1.0889
    expect(correctedToT(10800, coastal.tot)).toBeCloseTo(11760.12, 2);
  });

  it('ToD subtracts allowance × distance', () => {
    // 3 h elapsed, 20 NM, coastal ToD 551.0 s/NM → 10800 − 11020 = −220
    expect(correctedToD(10800, coastal.tod, 20)).toBeCloseTo(-220, 6);
  });

  it('corrected() dispatches on method', () => {
    expect(corrected('ToT', 3600, { tod: 600, tot: 1.1 }, 10)).toBeCloseTo(3960);
    expect(corrected('ToD', 3600, { tod: 600, tot: 1.1 }, 10)).toBeCloseTo(-2400);
  });
});

describe('elapsedToTie', () => {
  const me = { tod: 551.0, tot: 1.0889 };
  const opp = { tod: 600.0, tot: 1.0 };

  it('ToT: equal corrected times at the tie elapsed', () => {
    const e = elapsedToTie('ToT', 12000, me, opp, 20);
    expect(correctedToT(e, me.tot)).toBeCloseTo(correctedToT(12000, opp.tot), 6);
  });

  it('ToD: equal corrected times at the tie elapsed', () => {
    const e = elapsedToTie('ToD', 12000, me, opp, 20);
    // faster rated boat (lower ToD) must finish (600−551)·20 = 980 s earlier
    expect(e).toBeCloseTo(12000 - 980, 6);
    expect(correctedToD(e, me.tod, 20)).toBeCloseTo(correctedToD(12000, opp.tod, 20), 6);
  });
});

describe('rank', () => {
  it('sorts by corrected time with gaps and shared ranks', () => {
    const r = rank(
      'ToT',
      [
        { id: 'a', name: 'A', elapsedSec: 10000, option: { tod: 0, tot: 1.1 } }, // 11000
        { id: 'b', name: 'B', elapsedSec: 11000, option: { tod: 0, tot: 1.0 } }, // 11000
        { id: 'c', name: 'C', elapsedSec: 10000, option: { tod: 0, tot: 1.0 } }, // 10000
        { id: 'd', name: 'D', elapsedSec: NaN, option: { tod: 0, tot: 1.0 } }, // DNF, excluded
      ],
      10,
    );
    expect(r.map((e) => e.id)).toEqual(['c', 'a', 'b']);
    expect(r.map((e) => e.rank)).toEqual([1, 2, 2]);
    expect(r[1].gapSec).toBeCloseTo(1000);
  });
});

describe('durations', () => {
  it('parses h:mm:ss, mm:ss and seconds', () => {
    expect(parseDuration('3:05:10')).toBe(11110);
    expect(parseDuration('45:30')).toBe(2730);
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('1:xx')).toBeNaN();
    expect(parseDuration('')).toBeNaN();
  });

  it('formats seconds', () => {
    expect(formatDuration(11110)).toBe('3:05:10');
    expect(formatDuration(-220)).toBe('−0:03:40');
    expect(formatDuration(NaN)).toBe('—');
  });

  it('required speed', () => {
    expect(requiredSpeed(20, 3 * 3600)).toBeCloseTo(6.6667, 4);
  });
});
