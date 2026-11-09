import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useNav } from './NavContext';
import { AGREEMENT_TEXT, agreement, spreadAt, spreadTimeline, valueAt, type Comparison, type ModelSeries } from '../weather/compare';
import { norm360 } from '../performance/angles';

const fmtHour = (ms: number) => new Date(ms).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
const fmtDay = (ms: number) => new Date(ms).toLocaleString('el-GR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

/** Fixed colour slot per series (Open-Meteo models in catalogue order; Windy series share a neutral dashed style). */
const colorOf = (s: ModelSeries, i: number) => (s.source === 'windy' ? 'var(--mc-windy)' : `var(--mc-s${(i % 8) + 1})`);

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

interface ChartProps {
  c: Comparison;
  kind: 'tws' | 'twd';
  from: number;
  to: number;
  focus?: string;
  hoverT?: number;
  setHoverT: (t?: number) => void;
  start: number;
}

function ModelChart({ c, kind, from, to, focus, hoverT, setHoverT, start }: ChartProps) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = 150;
  const pad = { l: 34, r: 8, t: 8, b: 20 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  // Hourly samples; TWD is unwrapped around the hourly mean so 355°/5° stay together.
  const hours = useMemo(() => {
    const out: number[] = [];
    for (let t = Math.ceil(from / 3_600_000) * 3_600_000; t <= to; t += 3_600_000) out.push(t);
    return out;
  }, [from, to]);
  const spreads = useMemo(() => hours.map((t) => spreadAt(c.series, t)), [c, hours]);
  const val = (s: ModelSeries, t: number, k: number): number | undefined => {
    if (kind === 'tws') return valueAt(s.times, s.tws, t);
    const d = valueAt(s.times, s.twd, t, true);
    const m = spreads[k]?.meanTwd;
    if (d === undefined || m === undefined) return d;
    let x = norm360(d - m);
    if (x > 180) x -= 360;
    return m + x;
  };
  const lines = c.series.map((s) => hours.map((t, k) => val(s, t, k)));
  const all = lines.flat().filter((x): x is number => x !== undefined);
  if (!all.length || hours.length < 2) return null;
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (kind === 'tws') lo = 0;
  const span = Math.max(kind === 'tws' ? 6 : 30, hi - lo);
  hi = lo + span * 1.08;
  if (kind === 'twd') lo -= span * 0.04;
  const x = (t: number) => pad.l + ((t - hours[0]) / (hours[hours.length - 1] - hours[0])) * iw;
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * ih;
  const path = (vs: (number | undefined)[]) => {
    let d = '';
    let pen = false;
    vs.forEach((v, k) => {
      if (v === undefined) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(hours[k]).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  // Envelope (min–max of all models) and mean.
  const env = hours.map((_, k) => {
    const vs = lines.map((l) => l[k]).filter((v): v is number => v !== undefined);
    return vs.length ? [Math.min(...vs), Math.max(...vs)] : undefined;
  });
  const band =
    env.every(Boolean) &&
    `M${hours.map((t, k) => `${x(t).toFixed(1)},${y(env[k]![1]).toFixed(1)}`).join('L')}L${hours
      .map((t, k) => `${x(t).toFixed(1)},${y(env[k]![0]).toFixed(1)}`)
      .reverse()
      .join('L')}Z`;
  const mean = hours.map((_, k) => (kind === 'tws' ? spreads[k]?.meanTws : spreads[k]?.meanTwd));
  const ticks = (() => {
    const step = kind === 'tws' ? (span > 20 ? 10 : 5) : span > 120 ? 60 : span > 60 ? 30 : 15;
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
    return out;
  })();
  const xTicks = hours.filter((t) => new Date(t).getHours() % (hours.length > 14 ? 3 : 2) === 0);

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const f = (px - pad.l) / iw;
    if (f < -0.05 || f > 1.05) return setHoverT(undefined);
    const k = Math.round(Math.min(1, Math.max(0, f)) * (hours.length - 1));
    setHoverT(hours[k]);
  };
  const hk = hoverT !== undefined ? hours.indexOf(hoverT) : -1;

  return (
    <div ref={ref} className="mc-chart">
      <svg
        width={W}
        height={H}
        role="img"
        aria-label={kind === 'tws' ? 'Ένταση ανέμου ανά μοντέλο' : 'Κατεύθυνση ανέμου ανά μοντέλο'}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHoverT(undefined)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line className="mc-grid" x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} />
            <text className="mc-axis" x={pad.l - 4} y={y(v) + 3} textAnchor="end">
              {kind === 'twd' ? `${Math.round(norm360(v))}°` : v}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} className="mc-axis" x={x(t)} y={H - 5} textAnchor="middle">
            {new Date(t).getHours()}
          </text>
        ))}
        {start >= hours[0] && start <= hours[hours.length - 1] && (
          <line className="mc-start" x1={x(start)} x2={x(start)} y1={pad.t} y2={pad.t + ih} />
        )}
        {band && <path className="mc-band" d={band} />}
        {c.series.map((s, i) => (
          <path
            key={s.id}
            d={path(lines[i])}
            fill="none"
            stroke={colorOf(s, i)}
            strokeWidth={focus === s.id ? 3 : 1.5}
            strokeDasharray={s.source === 'windy' ? '4 3' : undefined}
            opacity={focus && focus !== s.id ? 0.25 : 0.9}
          />
        ))}
        <path className="mc-mean" d={path(mean)} />
        {hk >= 0 && <line className="mc-cross" x1={x(hours[hk])} x2={x(hours[hk])} y1={pad.t} y2={pad.t + ih} />}
      </svg>
    </div>
  );
}

export function ModelCompareCard() {
  const nav = useNav();
  const c = nav.comparison;
  const [focus, setFocus] = useState<string>();
  const [hoverT, setHoverT] = useState<number>();
  const start = c?.start ?? 0;
  const from = c ? Math.max(c.series[0].times[0], c.start - 2 * 3_600_000) : 0;
  const to = c ? c.end + 3_600_000 : 0;
  const atStart = c ? spreadAt(c.series, c.start) : undefined;
  const ag = atStart && agreement(atStart);
  const shown = hoverT ?? start;
  const hoverSpread = c && hoverT !== undefined ? spreadAt(c.series, hoverT) : undefined;
  const rows = useMemo(() => (c ? spreadTimeline(c.series, c.start - 3_600_000, c.end + 3_600_000) : []), [c]);
  const waves = useMemo(() => {
    if (!c?.waves) return undefined;
    const hs: number[] = [];
    for (let t = c.start; t <= c.end; t += 3_600_000) {
      const h = valueAt(c.waves.times, c.waves.height, t);
      if (h !== undefined) hs.push(h);
    }
    const d = valueAt(c.waves.times, c.waves.dir, c.start, true);
    const p = valueAt(c.waves.times, c.waves.period, c.start);
    return hs.length ? { min: Math.min(...hs), max: Math.max(...hs), dir: d, period: p } : undefined;
  }, [c]);
  const stale = c && nav.course?.marks[0] && (Math.abs(nav.course.marks[0].lat - c.lat) > 0.01 || Math.abs(nav.course.marks[0].lon - c.lon) > 0.01);

  return (
    <section className="card mc">
      <div className="advisor-head">
        <h3>Σύγκριση μοντέλων</h3>
        {c && <span className="muted small">λήψη {fmtHour(c.fetchedAt)}</span>}
      </div>
      <p className="muted small">
        Τι λένε {c ? c.series.length : 'όλα τα'} μοντέλα για {c ? <b>{c.place}</b> : 'την εκκίνηση'}. Όσο πιο κοντά οι γραμμές, τόσο πιο σίγουρη η πρόγνωση.
      </p>
      <button className="btn primary" disabled={nav.comparisonStatus.busy} onClick={nav.loadComparison}>
        {nav.comparisonStatus.busy ? 'Λήψη μοντέλων…' : c ? '↻ Ανανέωση σύγκρισης' : 'Σύγκριση μοντέλων'}
      </button>
      {nav.comparisonStatus.error && <p className="warn-text">{nav.comparisonStatus.error}</p>}
      {stale && <p className="muted small">Η σύγκριση είναι για άλλο σημείο εκκίνησης — πάτα ανανέωση.</p>}

      {c && atStart && ag && (
        <>
          <div className={`mc-verdict mc-${ag}`}>
            <span className="mc-badge">{ag === 'good' ? '✓' : ag === 'fair' ? '≈' : '⚠'} {AGREEMENT_TEXT[ag]}</span>
            <span>
              Στην εκκίνηση ({fmtDay(c.start)}): <b>{atStart.meanTws.toFixed(0)} kt</b> (±{atStart.spreadTws.toFixed(1)}, εύρος {atStart.minTws.toFixed(0)}–
              {atStart.maxTws.toFixed(0)}) από <b>{atStart.meanTwd.toFixed(0)}°</b> (±{atStart.spreadTwd.toFixed(0)}°)
            </span>
          </div>
          {waves && (
            <p className="small">
              Κύμα στη διάρκεια: {waves.min.toFixed(1)}–{waves.max.toFixed(1)} m
              {waves.dir !== undefined && ` από ${waves.dir.toFixed(0)}°`}
              {waves.period !== undefined && `, περίοδος ${waves.period.toFixed(0)} s`}
            </p>
          )}

          <div className="mc-legend" role="list">
            <button className={`mc-key ${!focus ? 'on' : ''}`} onClick={() => setFocus(undefined)}>
              <span className="mc-swatch mean" /> Μ.Ο.
            </button>
            {c.series.map((s, i) => (
              <button key={s.id} className={`mc-key ${focus === s.id ? 'on' : ''}`} onClick={() => setFocus(focus === s.id ? undefined : s.id)} title={s.label}>
                <span className={`mc-swatch ${s.source === 'windy' ? 'dash' : ''}`} style={{ background: colorOf(s, i) }} />
                {s.short}
              </button>
            ))}
          </div>

          <div className="mc-readout small" aria-live="polite">
            {fmtDay(shown)} ·{' '}
            {(hoverSpread ?? atStart) &&
              c.series
                .map((s) => {
                  const v = (hoverSpread ?? atStart).byModel[s.short];
                  return v ? `${s.short} ${v[0].toFixed(0)}/${v[1]}°` : null;
                })
                .filter(Boolean)
                .join(' · ')}
          </div>
          <h4 className="mc-title">Ένταση (kt)</h4>
          <ModelChart c={c} kind="tws" from={from} to={to} focus={focus} hoverT={hoverT} setHoverT={setHoverT} start={start} />
          <h4 className="mc-title">Κατεύθυνση (από, °)</h4>
          <ModelChart c={c} kind="twd" from={from} to={to} focus={focus} hoverT={hoverT} setHoverT={setHoverT} start={start} />
          <p className="muted small">Γκρι ζώνη: εύρος όλων των μοντέλων · παχιά γραμμή: μέσος όρος · κάθετη: εκκίνηση.</p>

          <details>
            <summary>Πίνακας ανά ώρα</summary>
            <div className="mc-table-wrap">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th>Ώρα</th>
                    <th>Μ.Ο.</th>
                    <th>±kt / ±°</th>
                    {c.series.map((s) => (
                      <th key={s.id}>{s.short}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ t, s }) => {
                    const a = agreement(s);
                    return (
                      <tr key={t}>
                        <td>{fmtHour(t)}</td>
                        <td>
                          <b>
                            {s.meanTws.toFixed(0)}/{s.meanTwd.toFixed(0)}°
                          </b>
                        </td>
                        <td className={`mc-${a}`}>
                          {s.spreadTws.toFixed(1)} / {s.spreadTwd.toFixed(0)}
                        </td>
                        {c.series.map((m) => {
                          const v = s.byModel[m.short];
                          return <td key={m.id}>{v ? `${v[0].toFixed(0)}/${v[1]}°` : '—'}</td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
          {c.windyNote && <p className="muted small">Windy: {c.windyNote}</p>}
        </>
      )}
    </section>
  );
}
