import { useMemo } from 'react';
import type { BoatProfile } from '../boat/types';
import { optimums, sampleCurve } from '../performance/polar';
import { recommendSail } from '../performance/sails';

interface Props {
  boat: BoatProfile;
  /** TWS curves to draw. */
  twsList: number[];
  /** Highlighted TWS (also used for optimum markers and the sail band). */
  tws?: number;
  /** Current reading. */
  point?: { twa: number; bsp: number };
  showSails?: boolean;
  compact?: boolean;
}

const SAIL_COLORS = ['#2f7ed8', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#ca8a04', '#db2777'];

export function sailColor(boat: BoatProfile, sailId: string): string {
  const i = boat.sails.filter((s) => s.kind !== 'main').findIndex((s) => s.id === sailId);
  return SAIL_COLORS[(i < 0 ? 0 : i) % SAIL_COLORS.length];
}

/** Half-polar diagram: 0° up, 180° down, speeds as radius. */
export function PolarChart({ boat, twsList, tws, point, showSails = true, compact }: Props) {
  const p = boat.polar;
  const f = boat.performanceFactor || 1;

  const data = useMemo(() => {
    if (!p) return null;
    const curves = twsList.map((t) => ({
      tws: t,
      pts: sampleCurve(p, t, 2).map((x) => ({ twa: x.twa, bsp: x.bsp * f })),
    }));
    const hl = tws !== undefined ? sampleCurve(p, tws, 1).map((x) => ({ twa: x.twa, bsp: x.bsp * f })) : undefined;
    const maxBsp = Math.max(
      ...curves.flatMap((c) => c.pts.map((x) => x.bsp)),
      ...(hl ?? []).map((x) => x.bsp),
      point?.bsp ?? 0,
      4,
    );
    return { curves, hl, maxR: Math.ceil(maxBsp / 2) * 2 };
  }, [p, f, twsList, tws, point?.bsp]);

  if (!p || !data) return <p className="muted">Δεν υπάρχουν polars για αυτό το σκάφος.</p>;

  const W = 340;
  const H = 600;
  const cx = 30;
  const cy = 300;
  const R = 270;
  const sc = (v: number) => (v / data.maxR) * R;
  const xy = (twa: number, bsp: number) => {
    const a = (twa * Math.PI) / 180;
    return [cx + sc(bsp) * Math.sin(a), cy - sc(bsp) * Math.cos(a)] as const;
  };
  const path = (pts: { twa: number; bsp: number }[]) =>
    pts.map((x, i) => `${i ? 'L' : 'M'}${xy(x.twa, x.bsp).map((n) => n.toFixed(1)).join(',')}`).join(' ');

  const rings: number[] = [];
  for (let v = 2; v <= data.maxR; v += 2) rings.push(v);

  const opt = tws !== undefined ? optimums(p, tws) : undefined;

  // Sail band just outside the outer ring.
  const band: { id: string; from: number; to: number }[] = [];
  if (showSails && tws !== undefined) {
    for (let a = 0; a < 180; a += 1) {
      const s = recommendSail(boat, tws, a + 0.5);
      const id = s?.id ?? '';
      const last = band[band.length - 1];
      if (last && last.id === id) last.to = a + 1;
      else band.push({ id, from: a, to: a + 1 });
    }
  }
  const arc = (r: number, a0: number, a1: number) => {
    const [x0, y0] = [cx + r * Math.sin((a0 * Math.PI) / 180), cy - r * Math.cos((a0 * Math.PI) / 180)];
    const [x1, y1] = [cx + r * Math.sin((a1 * Math.PI) / 180), cy - r * Math.cos((a1 * Math.PI) / 180)];
    return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
  };

  return (
    <div className={`polar ${compact ? 'compact' : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Polar διάγραμμα">
        {rings.map((v) => (
          <g key={v}>
            <path d={arc(sc(v), 0, 180)} className="grid" fill="none" />
            <text x={cx + 3} y={cy - sc(v) + 12} className="axis">
              {v}
            </text>
          </g>
        ))}
        {[0, 30, 45, 60, 90, 120, 135, 150, 180].map((a) => {
          const [x, y] = xy(a, data.maxR);
          const [lx, ly] = xy(a, data.maxR * 1.07);
          return (
            <g key={a}>
              <line x1={cx} y1={cy} x2={x} y2={y} className="grid" />
              <text x={lx} y={ly + 4} className="axis" textAnchor="middle">
                {a}°
              </text>
            </g>
          );
        })}
        {band
          .filter((b) => b.id)
          .map((b) => (
            <path
              key={`${b.id}-${b.from}`}
              d={arc(R + 6, b.from, b.to)}
              stroke={sailColor(boat, b.id)}
              strokeWidth={8}
              fill="none"
            />
          ))}
        {data.curves.map((c) => (
          <path key={c.tws} d={path(c.pts)} className="curve" fill="none" />
        ))}
        {data.hl && <path d={path(data.hl)} className="curve-hl" fill="none" />}
        {opt && (
          <>
            <circle cx={xy(opt.beat.angle, opt.beat.bsp * f)[0]} cy={xy(opt.beat.angle, opt.beat.bsp * f)[1]} r={6} className="opt" />
            <circle cx={xy(opt.run.angle, opt.run.bsp * f)[0]} cy={xy(opt.run.angle, opt.run.bsp * f)[1]} r={6} className="opt" />
          </>
        )}
        {point && point.bsp > 0 && (
          <circle cx={xy(point.twa, point.bsp)[0]} cy={xy(point.twa, point.bsp)[1]} r={8} className="now" />
        )}
        {data.curves.map((c) => {
          const lbl = c.pts.find((x) => x.twa === 110);
          if (!lbl) return null;
          const [x, y] = xy(110, lbl.bsp);
          return (
            <text key={c.tws} x={x + 4} y={y + 4} className="curve-label">
              {c.tws}
            </text>
          );
        })}
      </svg>
      {showSails && tws !== undefined && (
        <div className="legend">
          {[...new Set(band.map((b) => b.id).filter(Boolean))].map((id) => (
            <span key={id} className="legend-item">
              <i style={{ background: sailColor(boat, id) }} />
              {boat.sails.find((s) => s.id === id)?.name ?? id}
            </span>
          ))}
          <span className="legend-item">
            <i className="opt-dot" />
            βέλτιστες γωνίες
          </span>
          {point && (
            <span className="legend-item">
              <i className="now-dot" />
              τώρα
            </span>
          )}
        </div>
      )}
    </div>
  );
}
