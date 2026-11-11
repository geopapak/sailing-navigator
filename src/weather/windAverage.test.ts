import { beforeEach, describe, expect, it } from 'vitest';
import { clearWind, meanLabel, meanWind, pushWind } from './windAverage';

describe('rolling measured wind (P-018)', () => {
  beforeEach(clearWind);

  it('averages direction across north as a vector, not arithmetically', () => {
    const t0 = 1_000_000;
    pushWind({ t: t0, tws: 10, twd: 350, from: 'heading' });
    pushWind({ t: t0 + 60_000, tws: 14, twd: 10, from: 'heading' });
    const m = meanWind(t0 + 60_000)!;
    expect(Math.min(m.twd, 360 - m.twd)).toBeLessThan(0.5);
    expect(m.tws).toBe(12);
    expect(m.n).toBe(2);
    expect(meanLabel(m)).toBe('μέσος όρος 1′ από 2 μετρήσεις');
  });

  it('one shift reading does not swing the mean much', () => {
    const t0 = 2_000_000;
    for (let i = 0; i < 12; i++) pushWind({ t: t0 + i * 20_000, tws: 12, twd: 200, from: 'instruments' });
    pushWind({ t: t0 + 12 * 20_000, tws: 12, twd: 230, from: 'instruments' });
    const m = meanWind(t0 + 12 * 20_000)!;
    expect(m.twd).toBeGreaterThan(200);
    expect(m.twd).toBeLessThan(203);
    expect(m.minutes).toBe(4);
  });

  it('drops readings older than the window and keeps one per 10 s', () => {
    const t0 = 3_000_000;
    pushWind({ t: t0, tws: 5, twd: 90, from: 'typed' });
    pushWind({ t: t0 + 3_000, tws: 6, twd: 90, from: 'typed' });
    expect(meanWind(t0 + 3_000)!.n).toBe(1);
    expect(meanWind(t0 + 10 * 60_000)).toBeUndefined();
  });

  it('says when GPS course was used', () => {
    pushWind({ t: 5_000, tws: 8, twd: 40, from: 'cog' });
    expect(meanLabel(meanWind(5_000)!)).toBe('μία μέτρηση, ≈ από την πορεία GPS');
  });
});
