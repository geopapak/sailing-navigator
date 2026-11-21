import { describe, expect, it } from 'vitest';
import {
  ago,
  angle,
  clockWords,
  count,
  date,
  dateTimeToMs,
  day,
  dayTime,
  dir,
  duration,
  gap,
  inTime,
  inTimeWords,
  num,
  parseDate,
  parseTime,
  pct,
  qty,
  span,
  time,
  timeSec,
} from './index';

const NB = ' ';
const MINUS = '−';

describe('num / qty / pct (KA-K1)', () => {
  it('uses a comma, U+2212 and groups from 10.000', () => {
    expect(num(7)).toBe('7,0');
    expect(num(-0.5)).toBe(`${MINUS}0,5`);
    expect(num(0)).toBe('0,0');
    expect(num(-0.01)).toBe('0,0');
    expect(num(9999, 0)).toBe('9999');
    expect(num(10000, 0)).toBe('10.000');
    expect(num(1234.5)).toBe('1234,5');
    expect(num(12345.5)).toBe('12.345,5');
    expect(num(-123456, 0)).toBe(`${MINUS}123.456`);
    expect(num(NaN)).toBe('—');
    expect(num(undefined)).toBe('—');
    expect(num(Infinity)).toBe('—');
  });
  it('puts a no-break space before the unit', () => {
    expect(qty(7, 'kt')).toBe(`7,0${NB}kt`);
    expect(qty(1.94, 'NM')).toBe(`1,9${NB}NM`);
    expect(qty(12, 'm', 0)).toBe(`12${NB}m`);
    expect(qty(28.5, 'm²')).toBe(`28,5${NB}m²`);
    expect(qty(612, 's/NM')).toBe(`612,0${NB}s/NM`);
    expect(qty(NaN, 'kt')).toBe('—');
  });
  it('percent without a space', () => {
    expect(pct(98)).toBe('98%');
    expect(pct(97.6)).toBe('98%');
    expect(pct(-3)).toBe(`${MINUS}3%`);
    expect(pct(NaN)).toBe('—');
  });
});

describe('dir / angle', () => {
  it('always three digits and a reference', () => {
    expect(dir(45)).toBe('045°T');
    expect(dir(40, 'M')).toBe('040°M');
    expect(dir(0)).toBe('000°T');
    expect(dir(359.6)).toBe('000°T');
    expect(dir(-10)).toBe('350°T');
    expect(dir(NaN)).toBe('—');
  });
  it('follows the magnetic setting like fmtDir', () => {
    expect(dir(45, { manualMagnetic: true, declination: 5 })).toBe('040°M');
    expect(dir(45, { manualMagnetic: false, declination: 5 })).toBe('045°T');
  });
  it('angles have no reference', () => {
    expect(angle(42.3)).toBe('42°');
    expect(angle(-30)).toBe(`${MINUS}30°`);
    expect(angle(undefined)).toBe('—');
  });
});

describe('dates and times', () => {
  const at = (y: number, m: number, d: number, h = 0, min = 0, s = 0) => new Date(y, m - 1, d, h, min, s).getTime();
  it('dd/mm/yyyy with a leading zero, also the 1st of a month', () => {
    expect(date(at(2026, 11, 5))).toBe('05/11/2026');
    expect(date(at(2026, 12, 1))).toBe('01/12/2026');
    expect(date(NaN)).toBe('—');
  });
  it('short day', () => {
    expect(day(at(2026, 11, 21))).toBe('Σάβ 21/11');
    expect(day(at(2026, 11, 22))).toBe('Κυρ 22/11');
    expect(day(at(2026, 11, 18, 14, 5))).toBe('Τετ 18/11');
  });
  it('24-hour times, around midnight', () => {
    expect(time(at(2026, 11, 23, 9, 5))).toBe('09:05');
    expect(time(at(2026, 11, 23, 23, 59))).toBe('23:59');
    expect(time(at(2026, 11, 24, 0, 0))).toBe('00:00');
    expect(time(at(2026, 11, 23, 14, 32))).toBe('14:32');
    expect(timeSec(at(2026, 11, 23, 9, 5, 7))).toBe('09:05:07');
    expect(dayTime(at(2026, 11, 21, 11, 0))).toBe('Σάβ 21/11 11:00');
    expect(time(undefined)).toBe('—');
  });
});

describe('durations and countdowns (KA-E2)', () => {
  it('duration h:mm:ss', () => {
    expect(duration(2359)).toBe('0:39:19');
    expect(duration(0)).toBe('0:00:00');
    expect(duration(-48)).toBe(`${MINUS}0:00:48`);
    expect(duration(NaN)).toBe('—');
  });
  it('inTime', () => {
    expect(inTime(45)).toBe('σε 45″');
    expect(inTime(408)).toBe('σε 6′48″');
    expect(inTime(3900)).toBe('σε 1 ώ 05′');
    expect(inTime(0)).toBe('τώρα');
    expect(inTime(-5)).toBe('τώρα');
    expect(inTime(60)).toBe('σε 1′00″');
  });
  it('inTimeWords for screen readers', () => {
    expect(inTimeWords(408)).toBe('σε 6 λεπτά και 48 δευτερόλεπτα');
    expect(inTimeWords(61)).toBe('σε 1 λεπτό και 1 δευτερόλεπτο');
    expect(inTimeWords(3900)).toBe('σε 1 ώρα και 5 λεπτά');
    expect(clockWords(120)).toBe('2 λεπτά');
    expect(inTimeWords(0)).toBe('τώρα');
  });
  it('ago and span', () => {
    expect(ago(30)).toBe('τώρα');
    expect(ago(240)).toBe('πριν από 4′');
    expect(ago(3900)).toBe('πριν από 1 ώ 05′');
    expect(span(45 * 60)).toBe('45′');
    expect(span(125 * 60)).toBe('2 ώ 05′');
  });
  it('gap', () => {
    expect(gap(65)).toBe('+1:05');
    expect(gap(-48)).toBe(`${MINUS}0:48`);
    expect(gap(3723)).toBe('+1:02:03');
    expect(gap(0)).toBe('+0:00');
  });
  it('count', () => {
    expect(count(1, 'μανούβρα', 'μανούβρες', 'χωρίς μανούβρες')).toBe('1 μανούβρα');
    expect(count(2, 'μανούβρα', 'μανούβρες', 'χωρίς μανούβρες')).toBe('2 μανούβρες');
    expect(count(0, 'μανούβρα', 'μανούβρες', 'χωρίς μανούβρες')).toBe('χωρίς μανούβρες');
    expect(count(0, 'σκάφος', 'σκάφη')).toBe('0 σκάφη');
  });
});

describe('parsing typed dates and times', () => {
  it('dates', () => {
    expect(parseDate('23/11/2026')).toEqual({ y: 2026, m: 11, d: 23 });
    expect(parseDate('1/2/2026')).toEqual({ y: 2026, m: 2, d: 1 });
    expect(parseDate('23.11.2026')).toEqual({ y: 2026, m: 11, d: 23 });
    expect(parseDate('31/02/2026')).toBeUndefined();
    expect(parseDate('2026-11-23')).toBeUndefined();
    expect(parseDate('23-11-26')).toEqual({ y: 2026, m: 11, d: 23 });
    expect(parseDate('23112026')).toEqual({ y: 2026, m: 11, d: 23 });
    expect(parseDate('')).toBeUndefined();
  });
  it('times', () => {
    expect(parseTime('11:00')).toEqual({ h: 11, min: 0 });
    expect(parseTime('9.05')).toEqual({ h: 9, min: 5 });
    expect(parseTime('0000')).toEqual({ h: 0, min: 0 });
    expect(parseTime('9')).toEqual({ h: 9, min: 0 });
    expect(parseTime('9.30')).toEqual({ h: 9, min: 30 });
    expect(parseTime('24:00')).toBeUndefined();
    expect(parseTime('11:60')).toBeUndefined();
    expect(parseTime('')).toBeUndefined();
  });
  it('puts in «/» and «:» while typing digits', async () => {
    const { autoDate, autoTime } = await import('./index');
    expect(autoDate('2')).toBe('2');
    expect(autoDate('2311')).toBe('23/11');
    expect(autoDate('23112026')).toBe('23/11/2026');
    expect(autoDate('23/11')).toBe('23/11');
    // Digit by digit, as a phone types: each step gets the previous result plus one digit.
    let typed = '';
    for (const c of '28112026') typed = autoDate(typed + c);
    expect(typed).toBe('28/11/2026');
    let t = '';
    for (const c of '1100') t = autoTime(t + c);
    expect(t).toBe('11:00');
    // Deleting back over a «/», and a date written another way, stay as they are.
    expect(autoDate('28/11/')).toBe('28/11/');
    expect(autoDate('1/2/2026')).toBe('1/2/2026');
    expect(autoTime('110')).toBe('11:0');
    expect(autoTime('1100')).toBe('11:00');
    expect(autoTime('9.30')).toBe('9.30');
  });
  it('never «now» by itself', () => {
    expect(dateTimeToMs('', '11:00')).toBeUndefined();
    expect(dateTimeToMs('23/11/2026', 'xx')).toBeUndefined();
    expect(dateTimeToMs('23/11/2026', '11:00')).toBe(new Date(2026, 10, 23, 11, 0).getTime());
    expect(dateTimeToMs('23/11/2026')).toBe(new Date(2026, 10, 23).getTime());
  });
});

describe('duration = formatDuration (the Worker keeps its own copy)', () => {
  it('formats the same', async () => {
    const { formatDuration } = await import('../scoring/corrected');
    for (const s of [0, 1, 59, 60, 2359, 3600, 86_399, 100_000, -48, -3661, 0.4, 59.5]) expect(duration(s)).toBe(formatDuration(s));
  });
});
