import { describe, expect, it } from 'vitest';
import { TRE_IRENE } from '../boat/treIrene';
import { computeLive, modeFor, vmgOf } from './targets';
import { recommendSail, sailOutlook, selectableSails } from './sails';
import { adviceFor } from './advice';
import { twaFromTwd, twdFromTwa, norm180, magToTrue } from './angles';

const boat = TRE_IRENE;

describe('angles', () => {
  it('signed TWA from TWD and heading', () => {
    expect(twaFromTwd(0, 315)).toBe(45); // wind N, heading NW → starboard tack
    expect(twaFromTwd(0, 45)).toBe(-45); // port tack
    expect(twaFromTwd(350, 10)).toBe(-20);
    expect(twdFromTwa(-45, 45)).toBe(0);
    expect(norm180(540)).toBe(180);
    expect(magToTrue(358, 5)).toBe(3);
  });
});

describe('VMG and mode', () => {
  it('vmg', () => {
    expect(vmgOf(8, 60)).toBeCloseTo(4, 9);
    expect(vmgOf(8, 120)).toBeCloseTo(4, 9);
    expect(vmgOf(8, -60)).toBeCloseTo(4, 9);
  });
  it('mode thresholds', () => {
    expect(modeFor(50, 40, 150)).toBe('upwind');
    expect(modeFor(65, 40, 150)).toBe('reach');
    expect(modeFor(120, 40, 150)).toBe('reach');
    expect(modeFor(121, 40, 150)).toBe('downwind');
  });
});

describe('computeLive', () => {
  it('upwind targets at 10 kt', () => {
    const r = computeLive(boat, { tws: 10, twa: -42, bsp: 6.5 })!;
    expect(r.mode).toBe('upwind');
    expect(r.tack).toBe('port');
    expect(r.targetTwa).toBe(40.5);
    expect(r.targetBsp).toBeCloseTo(6.786, 3);
    expect(r.targetVmg).toBe(5.16);
    expect(r.vmg).toBeCloseTo(6.5 * Math.cos((42 * Math.PI) / 180), 9);
    expect(r.pctTarget).toBeCloseTo(6.5 / 6.786, 3);
  });

  it('downwind uses run targets', () => {
    const r = computeLive(boat, { tws: 14, twa: 160, bsp: 8 })!;
    expect(r.mode).toBe('downwind');
    expect(r.tack).toBe('starboard');
    expect(r.targetTwa).toBe(161.9);
    expect(r.targetVmg).toBe(7.4);
  });

  it('reaching uses polar speed at TWA', () => {
    const r = computeLive(boat, { tws: 12, twa: 90, bsp: 8.34 })!;
    expect(r.mode).toBe('reach');
    expect(r.targetBsp).toBeCloseTo(8.34, 9);
    expect(r.pctTarget).toBeCloseTo(1, 9);
    expect(r.targetVmg).toBeUndefined();
  });

  it('applies the performance factor to all targets', () => {
    const r = computeLive({ ...boat, performanceFactor: 0.95 }, { tws: 12, twa: 90, bsp: 8.34 })!;
    expect(r.targetBsp).toBeCloseTo(8.34 * 0.95, 9);
    expect(r.beat.vmg).toBeCloseTo(5.56 * 0.95, 9);
    expect(r.pctTarget).toBeCloseTo(1 / 0.95, 9);
  });

  it('works without BSP and returns null without polars', () => {
    const r = computeLive(boat, { tws: 12, twa: 45 })!;
    expect(r.bsp).toBeUndefined();
    expect(r.pctTarget).toBeUndefined();
    expect(computeLive({ ...boat, polar: undefined }, { tws: 12, twa: 45 })).toBeNull();
  });
});

describe('sails', () => {
  it('recommends by TWS/TWA rules', () => {
    expect(recommendSail(boat, 10, 45)?.id).toBe('J1.5');
    expect(recommendSail(boat, 14, 45)?.id).toBe('J2'); // boundary belongs to the upper rule
    expect(recommendSail(boat, 22, 45)?.id).toBe('HWJ');
    expect(recommendSail(boat, 8, 120)?.id).toBe('S1');
    expect(recommendSail(boat, 11, 150)?.id).toBe('S1.5');
    expect(recommendSail(boat, 15, -150)?.id).toBe('S2');
    expect(recommendSail(boat, 25, 180)?.id).toBe('S4');
    expect(recommendSail(boat, 10, 94.9)?.id).toBe('J1.5');
    expect(recommendSail(boat, 10, 95)?.id).toBe('S1.5');
  });

  it('outlook flags nearby thresholds', () => {
    const o = sailOutlook(boat, 13, 45);
    expect(o.recommended?.id).toBe('J1.5');
    expect(o.ifStronger?.id).toBe('J2');
    expect(o.ifLighter).toBeUndefined();
    expect(sailOutlook(boat, 10, 45).ifStronger).toBeUndefined();
  });

  it('selectable sails exclude the main', () => {
    expect(selectableSails(boat).map((s) => s.id)).toEqual(['J1.5', 'J2', 'HWJ', 'S1', 'S1.5', 'S2', 'S4']);
  });
});

describe('advice', () => {
  const ids = (tws: number, twa: number, bsp?: number, sail?: string) => {
    const r = computeLive(boat, { tws, twa, bsp })!;
    return adviceFor(r, { ...sailOutlook(boat, tws, twa), currentSailId: sail }).map((a) => a.id);
  };

  it('pinching upwind', () => expect(ids(10, 36, 6.0)).toContain('pinch'));
  it('sailing low with speed upwind', () => expect(ids(10, 46, 7.2)).toContain('low'));
  it('slow at target angle', () => expect(ids(10, 40.5, 6.0)).toContain('slow-up'));
  it('fast at target angle', () => expect(ids(10, 40.5, 7.1)).toContain('fast-up'));
  it('on target', () => expect(ids(10, 40.5, 6.8)).toContain('on-target-up'));
  it('too deep downwind', () => expect(ids(14, 172, 7.0)).toContain('deep-down'));
  it('high with speed downwind', () => expect(ids(14, 150, 9.2)).toContain('high-down'));
  it('implausible readings', () => expect(ids(10, 90, 11)).toContain('check-inputs'));
  it('sail change comes first', () => {
    const a = ids(16, 45, 7.4, 'J1.5');
    expect(a[0]).toBe('sail-change');
  });
  it('no BSP → target hint only', () => expect(ids(10, 45)).toEqual(['target-up']));
});
