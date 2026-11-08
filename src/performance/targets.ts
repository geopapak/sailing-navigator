import type { BoatProfile } from '../boat/types';
import { absTwa, DEG } from './angles';
import { optimums, polarSpeed, type Optimum } from './polar';

export type SailingMode = 'upwind' | 'reach' | 'downwind';

export interface LiveInput {
  tws: number;
  /** Signed or unsigned TWA; sign only indicates tack. */
  twa: number;
  /** Measured boat speed; optional (targets are still computed without it). */
  bsp?: number;
}

export interface LiveResult {
  tws: number;
  twa: number; // absolute 0–180
  tack: 'starboard' | 'port' | 'none';
  mode: SailingMode;
  /** Polar speed at the current TWA (performance factor applied). */
  polarBsp: number;
  /** Optimum beat and run (performance factor applied to speeds/VMG). */
  beat: Optimum;
  run: Optimum;
  /** Target BSP for the current mode: beat target upwind, run target downwind, polar at TWA when reaching. */
  targetBsp: number;
  /** Target TWA for the current mode (undefined when reaching). */
  targetTwa?: number;
  /** Target VMG for the current mode (undefined when reaching). */
  targetVmg?: number;
  bsp?: number;
  /** Measured VMG magnitude (towards/away from the wind). */
  vmg?: number;
  /** bsp / targetBsp. */
  pctTarget?: number;
  /** bsp / polarBsp. */
  pctPolar?: number;
  /** vmg / targetVmg. */
  pctVmg?: number;
}

/**
 * Mode boundaries: halfway between the optimum beat angle and 90°, and
 * between 90° and the optimum gybe angle. E.g. beat 40° → upwind below 65°.
 */
export function modeFor(twa: number, beatAngle: number, gybeAngle: number): SailingMode {
  const a = absTwa(twa);
  if (a < (beatAngle + 90) / 2) return 'upwind';
  if (a > (gybeAngle + 90) / 2) return 'downwind';
  return 'reach';
}

/** VMG magnitude for a given speed and TWA (always ≥ 0). */
export function vmgOf(bsp: number, twa: number): number {
  return Math.abs(bsp * Math.cos(absTwa(twa) * DEG));
}

export function computeLive(boat: BoatProfile, input: LiveInput): LiveResult | null {
  const p = boat.polar;
  if (!p || !(input.tws >= 0) || !Number.isFinite(input.twa)) return null;
  const f = boat.performanceFactor || 1;
  const twa = absTwa(input.twa);
  const opt = optimums(p, input.tws);
  const beat: Optimum = { angle: opt.beat.angle, bsp: opt.beat.bsp * f, vmg: opt.beat.vmg * f };
  const run: Optimum = { angle: opt.run.angle, bsp: opt.run.bsp * f, vmg: opt.run.vmg * f };
  const polarBsp = polarSpeed(p, input.tws, twa) * f;
  const mode = modeFor(twa, beat.angle, run.angle);

  const tack: LiveResult['tack'] =
    twa === 0 || twa === 180 ? 'none' : ((input.twa % 360) + 360) % 360 < 180 ? 'starboard' : 'port';

  const res: LiveResult = {
    tws: input.tws,
    twa,
    tack,
    mode,
    polarBsp,
    beat,
    run,
    targetBsp: mode === 'upwind' ? beat.bsp : mode === 'downwind' ? run.bsp : polarBsp,
    targetTwa: mode === 'upwind' ? beat.angle : mode === 'downwind' ? run.angle : undefined,
    targetVmg: mode === 'upwind' ? beat.vmg : mode === 'downwind' ? run.vmg : undefined,
  };

  const bsp = input.bsp;
  if (bsp !== undefined && Number.isFinite(bsp) && bsp >= 0) {
    res.bsp = bsp;
    res.vmg = vmgOf(bsp, twa);
    res.pctTarget = res.targetBsp > 0 ? bsp / res.targetBsp : undefined;
    res.pctPolar = polarBsp > 0 ? bsp / polarBsp : undefined;
    res.pctVmg = res.targetVmg ? res.vmg / res.targetVmg : undefined;
  }
  return res;
}
