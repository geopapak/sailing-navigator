import { describe, expect, it } from 'vitest';
import type { Race, TrackPoint } from './types';
import { forgottenPrompt, isIdle, keepGoing, lastMovement, IDLE_MS, STALE_MS } from './idle';

const T0 = Date.UTC(2026, 10, 12, 9, 0, 0);
const H = 3600_000;
const M = 60_000;

const pt = (t: number, lat = 37.9, lon = 23.6, sog = 0.1): TrackPoint => ({ t, lat, lon, sog });

const session = (p: Partial<Race> = {}): Race => ({
  id: 's',
  name: 'Βόλτα',
  kind: 'cruise',
  marks: [],
  start: T0,
  scoringOptionId: '',
  method: 'ToT',
  entries: [],
  status: 'running',
  track: [],
  fixes: [],
  updatedAt: T0,
  ...p,
});

/** Sailing for an hour (moving away), then moored for `idleH` hours. */
function sailThenMoor(idleH: number): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (let m = 0; m <= 60; m += 5) out.push(pt(T0 + m * M, 37.8 + m * 0.001, 23.6, 5));
  const moor = out[out.length - 1];
  for (let m = 5; m <= idleH * 60; m += 5) out.push(pt(moor.t + m * M, moor.lat + 0.0001, moor.lon, 0.2));
  return out;
}

describe('lastMovement', () => {
  it('is the start of recording when there is no point', () => {
    expect(lastMovement([], T0)).toBe(T0);
  });

  it('is the last point when that point still moves', () => {
    const tr = [pt(T0, 37.8, 23.6, 5), pt(T0 + M, 37.81, 23.6, 5)];
    expect(lastMovement(tr, T0)).toBe(T0 + M);
  });

  it('is the moment the boat stopped', () => {
    const tr = sailThenMoor(3);
    // The last moving point is at 60′ and it is also where the boat stopped.
    expect(lastMovement(tr, T0)).toBe(T0 + 60 * M);
  });

  it('ignores GPS drift within 0.05 nm', () => {
    const tr = [pt(T0, 37.8, 23.6, 6), pt(T0 + M, 37.8003, 23.6, 0.3), pt(T0 + 2 * M, 37.8, 23.6003, 0.2)];
    expect(lastMovement(tr, T0)).toBe(T0);
  });

  it('counts a point far away (or with SOG ≥ 0.5) as movement', () => {
    const tr = [pt(T0, 37.8, 23.6, 0.2), pt(T0 + M, 37.81, 23.6, 0.2), pt(T0 + 2 * M, 37.8101, 23.6, 0.2)];
    expect(lastMovement(tr, T0)).toBe(T0 + M);
  });
});

describe('isIdle', () => {
  it('after 2 hours without movement', () => {
    const tr = sailThenMoor(2.5);
    expect(isIdle(tr, T0 + 60 * M + 2 * H, IDLE_MS, T0)).toBe(true);
    expect(isIdle(tr, T0 + 60 * M + 1.5 * H, IDLE_MS, T0)).toBe(false);
  });

  it('also when no point came for 2 hours', () => {
    const tr = [pt(T0, 37.8, 23.6, 5), pt(T0 + M, 37.81, 23.6, 5)];
    expect(isIdle(tr, T0 + M + 2 * H, IDLE_MS, T0)).toBe(true);
  });

  it('counts from the start without GPS', () => {
    expect(isIdle([], T0 + 2 * H, IDLE_MS, T0)).toBe(true);
    expect(isIdle([], T0 + H, IDLE_MS, T0)).toBe(false);
  });
});

describe('forgottenPrompt', () => {
  it('asks after 2 idle hours, with the time of the last movement', () => {
    const r = session({ track: sailThenMoor(3) });
    expect(forgottenPrompt(r, T0 + 60 * M + H)).toBeUndefined();
    expect(forgottenPrompt(r, T0 + 60 * M + 2 * H)).toEqual({ kind: 'idle', lastMove: T0 + 60 * M });
  });

  it('after «Όχι, συνεχίζω» asks again only after another 2 idle hours', () => {
    const now = T0 + 60 * M + 2 * H;
    const r0 = session({ track: sailThenMoor(6) });
    const p = forgottenPrompt(r0, now)!;
    const r = { ...r0, ...keepGoing(p, now) };
    expect(forgottenPrompt(r, now + H)).toBeUndefined();
    expect(forgottenPrompt(r, now + 2 * H)?.kind).toBe('idle');
  });

  it('asks after 24 hours even when moving, then again after another 24', () => {
    const now = T0 + STALE_MS + 2 * H;
    const r0 = session({ track: [pt(now - M, 37.8, 23.6, 5)] });
    const p = forgottenPrompt(r0, now)!;
    expect(p).toEqual({ kind: 'stale', lastMove: now - M, hours: 26 });
    const r = { ...r0, ...keepGoing(p, now), track: [pt(now + 10 * H, 37.8, 23.6, 5)] };
    expect(forgottenPrompt(r, now + 10 * H)).toBeUndefined();
    expect(forgottenPrompt({ ...r, track: [pt(now + STALE_MS, 37.8, 23.6, 5)] }, now + STALE_MS)?.kind).toBe('stale');
  });

  it('the 24-hour prompt wins over the idle one, and also silences it', () => {
    const now = T0 + 25 * H;
    const r0 = session();
    const p = forgottenPrompt(r0, now)!;
    expect(p.kind).toBe('stale');
    const r = { ...r0, ...keepGoing(p, now) };
    expect(forgottenPrompt(r, now + M)).toBeUndefined();
  });

  it('never asks for a finished session, nor before a race starts recording', () => {
    expect(forgottenPrompt(session({ status: 'finished' }), T0 + 30 * H)).toBeUndefined();
    const future = session({ kind: 'race', start: T0 + 5 * H });
    expect(forgottenPrompt(future, T0 + 3 * H)).toBeUndefined();
  });
});
