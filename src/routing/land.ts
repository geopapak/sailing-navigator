import type { LatLon } from '../nav/geo';

/** Polylines as [lon, lat] pairs (GeoJSON order). */
export type Polyline = [number, number][];

/**
 * Spatial index of coastline segments for fast "does this leg cross land?" tests.
 * Works on coastline polylines only (no polygons needed): a move between two
 * points at sea is legal iff it does not cross any coastline segment.
 */
export class LandIndex {
  private readonly ax: Float64Array;
  private readonly ay: Float64Array;
  private readonly bx: Float64Array;
  private readonly by: Float64Array;
  private readonly cells = new Map<number, number[]>();
  private readonly kx: number;
  private readonly cell: number;
  private stamp = 0;
  private readonly seen: Uint32Array;

  /** @param cellDeg grid cell size in degrees of latitude */
  constructor(lines: Polyline[], refLat = 37.7, cellDeg = 0.02) {
    this.kx = Math.cos((refLat * Math.PI) / 180);
    this.cell = cellDeg;
    const segs: number[] = [];
    for (const l of lines) for (let i = 0; i + 1 < l.length; i++) segs.push(l[i][0], l[i][1], l[i + 1][0], l[i + 1][1]);
    const n = segs.length / 4;
    this.ax = new Float64Array(n);
    this.ay = new Float64Array(n);
    this.bx = new Float64Array(n);
    this.by = new Float64Array(n);
    this.seen = new Uint32Array(n);
    for (let s = 0; s < n; s++) {
      this.ax[s] = segs[s * 4] * this.kx;
      this.ay[s] = segs[s * 4 + 1];
      this.bx[s] = segs[s * 4 + 2] * this.kx;
      this.by[s] = segs[s * 4 + 3];
      this.forCells(this.ax[s], this.ay[s], this.bx[s], this.by[s], (k) => {
        let arr = this.cells.get(k);
        if (!arr) this.cells.set(k, (arr = []));
        arr.push(s);
      });
    }
  }

  get segmentCount(): number {
    return this.ax.length;
  }

  private forCells(x0: number, y0: number, x1: number, y1: number, fn: (key: number) => void) {
    const c = this.cell;
    const cx0 = Math.floor(Math.min(x0, x1) / c);
    const cx1 = Math.floor(Math.max(x0, x1) / c);
    const cy0 = Math.floor(Math.min(y0, y1) / c);
    const cy1 = Math.floor(Math.max(y0, y1) / c);
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) fn(cx * 100003 + cy);
  }

  /** True if the straight move a→b crosses a coastline segment. */
  crosses(a: LatLon, b: LatLon): boolean {
    const px = a.lon * this.kx;
    const py = a.lat;
    const qx = b.lon * this.kx;
    const qy = b.lat;
    if (++this.stamp === 0xffffffff) {
      this.seen.fill(0);
      this.stamp = 1;
    }
    const stamp = this.stamp;
    let hit = false;
    this.forCells(px, py, qx, qy, (k) => {
      if (hit) return;
      const arr = this.cells.get(k);
      if (!arr) return;
      for (const s of arr) {
        if (this.seen[s] === stamp) continue;
        this.seen[s] = stamp;
        if (segIntersect(px, py, qx, qy, this.ax[s], this.ay[s], this.bx[s], this.by[s])) {
          hit = true;
          return;
        }
      }
    });
    return hit;
  }
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** Proper or touching intersection of segments PQ and AB. */
export function segIntersect(
  px: number, py: number, qx: number, qy: number,
  ax: number, ay: number, bx: number, by: number,
): boolean {
  const d1 = orient(ax, ay, bx, by, px, py);
  const d2 = orient(ax, ay, bx, by, qx, qy);
  const d3 = orient(px, py, qx, qy, ax, ay);
  const d4 = orient(px, py, qx, qy, bx, by);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = (ox: number, oy: number, sx: number, sy: number, ex: number, ey: number) =>
    Math.min(sx, ex) <= ox && ox <= Math.max(sx, ex) && Math.min(sy, ey) <= oy && oy <= Math.max(sy, ey);
  if (d1 === 0 && on(px, py, ax, ay, bx, by)) return true;
  if (d2 === 0 && on(qx, qy, ax, ay, bx, by)) return true;
  if (d3 === 0 && on(ax, ay, px, py, qx, qy)) return true;
  if (d4 === 0 && on(bx, by, px, py, qx, qy)) return true;
  return false;
}

/** An index with no land (open water). */
export const NO_LAND = { crosses: () => false } as Pick<LandIndex, 'crosses'>;
