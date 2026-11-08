import type { PolarTable } from '../boat/types';
import { absTwa, DEG } from './angles';

export interface PolarPoint {
  twa: number;
  bsp: number;
}

/** TWA (deg) at which boat speed is assumed to reach zero (head to wind side). */
export const NO_GO_TWA = 25;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Locates `x` within ascending `xs` and returns [lowerIndex, fraction].
 * Values outside the range are clamped to the ends.
 */
export function bracket(xs: number[], x: number): [number, number] {
  const n = xs.length;
  if (x <= xs[0]) return [0, 0];
  if (x >= xs[n - 1]) return [n - 2, 1];
  let i = 0;
  while (i < n - 2 && x > xs[i + 1]) i++;
  return [i, (x - xs[i]) / (xs[i + 1] - xs[i])];
}

/** Linear interpolation of ys over ascending xs, clamped at the ends. */
export function interp1(xs: number[], ys: number[], x: number): number {
  if (xs.length === 1) return ys[0];
  const [i, t] = bracket(xs, x);
  return lerp(ys[i], ys[i + 1], t);
}

/**
 * Full speed curve (TWA → BSP) for the TWS column `i` of the table:
 * the fixed-angle speeds plus the optimum beat and gybe points derived from
 * VMG (BSP = VMG / cos(angle)), a zero-speed point at NO_GO_TWA and a dead-run
 * point at 180° with BSP = run VMG. Sorted by TWA, duplicates removed.
 */
export function polarCurve(p: PolarTable, i: number): PolarPoint[] {
  const beat = p.beatAngle[i];
  const gybe = p.gybeAngle[i];
  const pts: PolarPoint[] = [
    { twa: Math.min(NO_GO_TWA, beat - 1), bsp: 0 },
    { twa: beat, bsp: p.beatVMG[i] / Math.cos(beat * DEG) },
    { twa: gybe, bsp: p.runVMG[i] / Math.cos((180 - gybe) * DEG) },
  ];
  if (gybe < 180) pts.push({ twa: 180, bsp: p.runVMG[i] });
  for (const [k, row] of Object.entries(p.speeds)) pts.push({ twa: Number(k), bsp: row[i] });
  pts.sort((a, b) => a.twa - b.twa);
  // If a fixed angle coincides with beat/gybe angle keep the first one.
  return pts.filter((pt, j) => j === 0 || Math.abs(pt.twa - pts[j - 1].twa) > 1e-9);
}

/** Cached curves per table (tables are treated as immutable). */
const curveCache = new WeakMap<PolarTable, PolarPoint[][]>();

export function polarCurves(p: PolarTable): PolarPoint[][] {
  let c = curveCache.get(p);
  if (!c) {
    c = p.tws.map((_, i) => polarCurve(p, i));
    curveCache.set(p, c);
  }
  return c;
}

function speedOnCurve(curve: PolarPoint[], twa: number): number {
  if (twa <= curve[0].twa) return 0;
  return interp1(
    curve.map((c) => c.twa),
    curve.map((c) => c.bsp),
    twa,
  );
}

/**
 * Polar boat speed for any TWS/TWA: linear in TWA along each TWS curve, then
 * linear in TWS. Below the lowest TWS speed scales proportionally to TWS;
 * above the highest it is held constant.
 */
export function polarSpeed(p: PolarTable, tws: number, twa: number): number {
  if (!(tws > 0)) return 0;
  const a = absTwa(twa);
  const curves = polarCurves(p);
  const minTws = p.tws[0];
  if (tws < minTws) return speedOnCurve(curves[0], a) * (tws / minTws);
  const [i, t] = bracket(p.tws, tws);
  return lerp(speedOnCurve(curves[i], a), speedOnCurve(curves[i + 1], a), t);
}

export interface Optimum {
  /** Optimum TWA. */
  angle: number;
  /** Boat speed at the optimum angle. */
  bsp: number;
  /** VMG (positive magnitude, upwind or downwind). */
  vmg: number;
}

export interface Optimums {
  beat: Optimum;
  run: Optimum;
}

/** Optimum beat and run angles/speeds/VMG for any TWS (interpolated from the certificate table). */
export function optimums(p: PolarTable, tws: number): Optimums {
  const minTws = p.tws[0];
  const scale = tws < minTws ? Math.max(tws, 0) / minTws : 1;
  const beatAngle = interp1(p.tws, p.beatAngle, tws);
  const gybeAngle = interp1(p.tws, p.gybeAngle, tws);
  const beatVmg = interp1(p.tws, p.beatVMG, tws) * scale;
  const runVmg = interp1(p.tws, p.runVMG, tws) * scale;
  return {
    beat: { angle: beatAngle, vmg: beatVmg, bsp: beatVmg / Math.cos(beatAngle * DEG) },
    run: { angle: gybeAngle, vmg: runVmg, bsp: runVmg / Math.cos((180 - gybeAngle) * DEG) },
  };
}

/** Sampled curve for drawing: BSP at each TWA step for a given TWS. */
export function sampleCurve(p: PolarTable, tws: number, step = 2): PolarPoint[] {
  const out: PolarPoint[] = [];
  for (let a = 0; a <= 180; a += step) out.push({ twa: a, bsp: polarSpeed(p, tws, a) });
  return out;
}
