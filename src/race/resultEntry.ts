/**
 * The keypad of the «Αποτελέσματα» sheet (P-040, design/events-2026-11): digits fill from the
 * right like a microwave («24110» = 2:41:10), no «:» to type. Pure functions, no React.
 */
import { elapsedFromClock } from './event';

export type EntryMode = 'clock' | 'elapsed';

/** At most HHMMSS. */
const MAX_DIGITS = 6;

/**
 * One key: '0'–'9', 'C' clears, 'B' removes the last digit. `fresh`: the first key after opening
 * replaces the shown value instead of adding to it.
 */
export function pressKey(buf: string, key: string, fresh = false): string {
  if (key === 'C') return '';
  if (key === 'B') return fresh ? '' : buf.slice(0, -1);
  if (!/^\d$/.test(key)) return buf;
  return ((fresh ? '' : buf) + key).replace(/^0+/, '').slice(-MAX_DIGITS);
}

/** «02:41:10»; empty buffer: undefined (the sheet shows «––:––:––»). */
export function bufText(buf: string): string | undefined {
  if (!buf) return undefined;
  const s = buf.padStart(MAX_DIGITS, '0');
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;
}

export type EntryCheck = { ok: true; elapsed: number; nextDay: boolean } | { ok: false; why: 'empty' | 'minsec' | 'hour' | 'zero' };

/** The buffer as elapsed seconds from the start: a finish time of day or the elapsed time itself. */
export function checkEntry(mode: EntryMode, buf: string, start: number): EntryCheck {
  if (!buf.replace(/^0+/, '')) return { ok: false, why: 'empty' };
  const s = buf.padStart(MAX_DIGITS, '0');
  const h = Number(s.slice(0, 2));
  const m = Number(s.slice(2, 4));
  const x = Number(s.slice(4, 6));
  if (m > 59 || x > 59) return { ok: false, why: 'minsec' };
  const sec = h * 3600 + m * 60 + x;
  if (mode === 'elapsed') return { ok: true, elapsed: sec, nextDay: false };
  if (h > 23) return { ok: false, why: 'hour' };
  const c = elapsedFromClock(start, sec);
  return c && c.elapsed > 0 ? { ok: true, ...c } : { ok: false, why: 'zero' };
}

/** The digits that show an existing result in a mode (finish time of day, or elapsed). */
export function bufOf(mode: EntryMode, elapsed: number, start: number): string {
  let sec: number;
  if (mode === 'elapsed') sec = Math.round(elapsed);
  else {
    const d = new Date(start + Math.round(elapsed) * 1000);
    sec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  }
  if (sec >= 100 * 3600) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(sec / 3600))}${p(Math.floor(sec / 60) % 60)}${p(sec % 60)}`.replace(/^0+/, '');
}
