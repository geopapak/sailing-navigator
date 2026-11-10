import { useMemo, useState } from 'react';
import { useApp } from './AppContext';
import { useRace } from './RaceContext';
import { useNav } from './NavContext';
import { DEFAULT_SERVER } from './settings';
import { accountApi } from '../sync/api';
import { analyseRace, analysisSummary, countManoeuvres, toCsv, toGpx, type RaceAnalysis } from '../race/analysis';
import { fmtGap } from '../race/estimate';
import { formatDuration, parseDuration } from '../scoring/corrected';
import type { Race } from '../race/types';
import type { LatLon } from '../nav/geo';

const MODE = { upwind: 'όρτσα', reach: 'ανοιχτά', downwind: 'πρίμα' } as const;
const pctTxt = (v?: number) => (v === undefined ? '—' : `${Math.round(v * 100)}%`);
const sinceStart = (race: Race, t: number) => formatDuration((t - race.start) / 1000).replace(/:\d\d$/, '');

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const fileName = (r: Race) =>
  `${r.name.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'race'}_${new Date(r.start).toISOString().slice(0, 10)}`;

export function RaceAnalysisView({ id, onBack }: { id: string; onBack: () => void }) {
  const { settings, account } = useApp();
  const { races, save } = useRace();
  const nav = useNav();
  const race = races.find((r) => r.id === id);
  const a = useMemo(() => (race ? analyseRace(race) : undefined), [race]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!race || !a) return <p className="muted">Ο αγώνας δεν βρέθηκε.</p>;
  const planned = race.courseId && nav.course?.id === race.courseId ? nav.planned : undefined;

  const ask = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const r = await accountApi.analysis(settings.aiUrl || DEFAULT_SERVER, settings.authToken, analysisSummary(race, a));
      await save({ ...race, analysis: { lessons: r.lessons, at: Date.now(), model: r.model } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="race-analysis">
      <section className="card">
        <div className="row between">
          <div>
            <h2>{race.name}</h2>
            <p className="muted small">
              {a.rank ? `${a.rank}ος / ${a.of} · ` : ''}
              {formatDuration(a.durationSec)} · {a.sailedNm.toFixed(1).replace('.', ',')} NM
            </p>
          </div>
          <button className="btn small-btn" onClick={onBack}>
            Αγώνες
          </button>
        </div>
        {race.track.length < 2 ? (
          <p className="muted">Δεν καταγράφηκε πορεία σε αυτόν τον αγώνα (χρειάζεται GPS ή όργανα κατά τη διάρκεια).</p>
        ) : (
          <TrackMap race={race} planned={planned?.legs.flatMap((l) => l.track)} />
        )}
        <div className="stat-row">
          <div>
            <div className="big-num">{pctTxt(a.avgPct)}</div>
            <div className="muted small">% target</div>
          </div>
          <div>
            <div className="big-num">{a.tacks}</div>
            <div className="muted small">αναστροφές</div>
          </div>
          <div>
            <div className="big-num">{a.gybes}</div>
            <div className="muted small">υψώσεις</div>
          </div>
          {planned && (
            <div>
              <div className="big-num">{fmtGap(a.durationSec - planned.elapsedSec)}</div>
              <div className="muted small">vs βέλτιστη</div>
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <h3>Τι να κρατήσουμε (σύμβουλος AI)</h3>
        {race.analysis?.lessons.length ? (
          <ul className="lessons">
            {race.analysis.lessons.map((l, i) => (
              <li key={i}>
                {l.text}
                {l.impact && <span className="muted small"> · {l.impact}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">Ο σύμβουλος διαβάζει τα νούμερα του αγώνα (σκέλη, % target, αναστροφές, πανιά) και γράφει τι να αλλάξετε την επόμενη φορά.</p>
        )}
        {error && <p className="errors">{error}</p>}
        <button className="btn wide" disabled={busy || !account || race.track.length < 2} onClick={ask}>
          {busy ? 'Ο σύμβουλος γράφει…' : race.analysis ? 'Ξανά από τον σύμβουλο' : 'Ζήτα μαθήματα από τον σύμβουλο'}
        </button>
        <p className="muted small">Με βάση την καταγραφή και τα polars · η απόφαση είναι του κυβερνήτη · μετράει ως 1 ερώτηση AI.</p>
      </section>

      {a.legs.length > 0 && (
        <section className="card">
          <h3>Σκέλη</h3>
          <ul className="rows legs">
            {a.legs.map((l, i) => (
              <li key={i}>
                <span>
                  <strong>
                    {l.from} → {l.to}
                  </strong>
                  <span className="muted small">
                    {' '}
                    · {MODE[l.mode]} · {formatDuration(l.durationSec)} · {l.sailedNm.toFixed(1)}/{l.rhumbNm.toFixed(1)} NM
                    {l.avgTws !== undefined && ` · ${l.avgTws.toFixed(0)} kt`} · {l.tacks + l.gybes} μανούβρες
                  </span>
                </span>
                <span className={`badge ${l.avgPct !== undefined && l.avgPct >= 0.95 ? 'ok' : ''}`}>{pctTxt(l.avgPct)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {a.timeline.length > 1 && (
        <section className="card">
          <h3>% target στη διάρκεια του αγώνα</h3>
          <PctTimeline race={race} a={a} />
          {a.lowSpots.length > 0 && (
            <ul className="rows compact">
              {a.lowSpots.map((s, i) => (
                <li key={i}>
                  <span>
                    {sinceStart(race, s.t)} · {Math.round(s.durationSec / 60)}′ στο {pctTxt(s.avgPct)}
                  </span>
                  <span className="muted small">
                    {s.twa !== undefined && `TWA ${Math.abs(Math.round(s.twa))}°`} {s.tws !== undefined && `· ${s.tws.toFixed(0)} kt`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <OpponentResults race={race} a={a} onSave={save} />

      <section className="card">
        <h3>Export</h3>
        <div className="btn-row">
          <button className="btn" disabled={!race.track.length} onClick={() => download(`${fileName(race)}.gpx`, toGpx(race), 'application/gpx+xml')}>
            GPX
          </button>
          <button className="btn" disabled={!race.track.length} onClick={() => download(`${fileName(race)}.csv`, toCsv(race), 'text/csv')}>
            CSV
          </button>
        </div>
        <p className="muted small">GPX για χάρτες και εφαρμογές πλοήγησης, CSV για Excel (όλα τα νούμερα ανά 5″).</p>
      </section>
    </div>
  );
}

/** Opponents' gaps, with their finish times typed from the results if we know them. */
function OpponentResults({ race, a, onSave }: { race: Race; a: RaceAnalysis; onSave: (r: Race) => Promise<void> }) {
  const [edit, setEdit] = useState<string>();
  const others = race.entries.filter((e) => !e.own);
  if (!others.length) return null;
  return (
    <section className="card">
      <h3>Απέναντι στους αντιπάλους</h3>
      <ul className="rows">
        {others.map((e) => {
          const g = a.gaps.find((x) => x.name === e.name)?.gap;
          const res = race.results?.[e.id];
          return (
            <li key={e.id}>
              <span>
                <strong>{e.name}</strong>
                <span className="muted small"> · {res !== undefined ? `πραγματικός ${formatDuration(res)}` : 'χωρίς χρόνο τερματισμού'}</span>
              </span>
              {edit === e.id ? (
                <input
                  className="time-input"
                  autoFocus
                  placeholder="h:mm:ss"
                  defaultValue={res !== undefined ? formatDuration(res) : ''}
                  onBlur={async (ev) => {
                    const sec = parseDuration(ev.target.value);
                    const results = { ...(race.results ?? {}) };
                    if (Number.isFinite(sec) && sec > 0) results[e.id] = sec;
                    else delete results[e.id];
                    setEdit(undefined);
                    await onSave({ ...race, results });
                  }}
                />
              ) : (
                <button className="link-btn" onClick={() => setEdit(e.id)}>
                  {g !== undefined ? fmtGap(g) : 'χρόνος…'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="muted small">+ σημαίνει ότι τερμάτισε πίσω μας σε διορθωμένο. Πάτα για να γράψεις τον πραγματικό του χρόνο από τα αποτελέσματα.</p>
    </section>
  );
}

/** Plain SVG of the track (equirectangular, fine for a few NM): upwind blue, downwind orange, marks, optimal route dashed. */
function TrackMap({ race, planned }: { race: Race; planned?: LatLon[] }) {
  const pts = race.track;
  const all: LatLon[] = [...pts, ...race.marks, ...(planned ?? [])];
  const lat0 = all.reduce((s, p) => s + p.lat, 0) / all.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = all.map((p) => p.lon * k);
  const ys = all.map((p) => p.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const W = 320;
  const span = Math.max(maxX - minX, maxY - minY, 1e-4);
  const s = (W - 30) / span;
  const H = Math.max(140, Math.min(380, (maxY - minY) * s + 30));
  const X = (p: LatLon) => 15 + (p.lon * k - minX) * s;
  const Y = (p: LatLon) => H - 15 - (p.lat - minY) * s;
  // Segments coloured by point of sail.
  const segs: { d: string; cls: string }[] = [];
  let cur: { d: string; cls: string } | undefined;
  for (const p of pts) {
    const twa = p.twa === undefined ? undefined : Math.abs(p.twa);
    const cls = twa === undefined ? 'trk' : twa < 80 ? 'trk up' : twa > 110 ? 'trk down' : 'trk reach';
    if (!cur || cur.cls !== cls) {
      if (cur) cur.d += ` L${X(p).toFixed(1)},${Y(p).toFixed(1)}`;
      cur = { d: `M${X(p).toFixed(1)},${Y(p).toFixed(1)}`, cls };
      segs.push(cur);
    } else cur.d += ` L${X(p).toFixed(1)},${Y(p).toFixed(1)}`;
  }
  const man = countManoeuvres(pts).at;
  // Marks at the same spot (start = finish) share one dot and label.
  const marksAt: (LatLon & { name: string })[] = [];
  for (const m of race.marks) {
    const same = marksAt.find((x) => Math.abs(x.lat - m.lat) < 1e-5 && Math.abs(x.lon - m.lon) < 1e-5);
    if (same) {
      if (!same.name.split(' / ').includes(m.name)) same.name += ` / ${m.name}`;
    } else marksAt.push({ lat: m.lat, lon: m.lon, name: m.name });
  }
  return (
    <figure className="track-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Πορεία αγώνα">
        {planned && planned.length > 1 && <path className="trk opt" d={planned.map((p, i) => `${i ? 'L' : 'M'}${X(p).toFixed(1)},${Y(p).toFixed(1)}`).join(' ')} />}
        {segs.map((g, i) => (
          <path key={i} className={g.cls} d={g.d} />
        ))}
        {man.map((m, i) => {
          const p = pts.find((x) => x.t === m.t)!;
          return <circle key={i} className="man" cx={X(p)} cy={Y(p)} r={2.5} />;
        })}
        {marksAt.map((m, i) => (
          <g key={i}>
            <circle className="mk" cx={X(m)} cy={Y(m)} r={5} />
            <text x={X(m) + 8} y={Y(m) + 4}>
              {m.name}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="legend small">
        <span className="lg up">━ όρτσα</span> <span className="lg reach">━ ανοιχτά</span> <span className="lg down">━ πρίμα</span>
        {planned && <span className="lg opt">┅ βέλτιστη</span>} <span className="lg man">● μανούβρα</span>
      </figcaption>
    </figure>
  );
}

function PctTimeline({ race, a }: { race: Race; a: RaceAnalysis }) {
  const W = 320;
  const H = 130;
  const t0 = a.timeline[0].t;
  const t1 = a.timeline[a.timeline.length - 1].t;
  const lo = 0.8;
  const hi = 1.05;
  const X = (t: number) => 28 + ((t - t0) / Math.max(1, t1 - t0)) * (W - 36);
  const Y = (v: number) => 8 + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (H - 28);
  const [hover, setHover] = useState<number>();
  const d = a.timeline.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.pct).toFixed(1)}`).join(' ');
  const h = hover === undefined ? undefined : a.timeline[hover];
  return (
    <figure className="pct-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="% target στον χρόνο"
        onPointerMove={(e) => {
          const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = ((e.clientX - box.left) / box.width) * W;
          let best = 0;
          a.timeline.forEach((p, i) => Math.abs(X(p.t) - x) < Math.abs(X(a.timeline[best].t) - x) && (best = i));
          setHover(best);
        }}
        onPointerLeave={() => setHover(undefined)}
      >
        {[1, 0.95, 0.9].map((v) => (
          <g key={v}>
            <line className="grid" x1={28} x2={W - 8} y1={Y(v)} y2={Y(v)} />
            <text className="axis" x={2} y={Y(v) + 4}>
              {Math.round(v * 100)}
            </text>
          </g>
        ))}
        <path className="pct-line" d={d} />
        {h && (
          <g>
            <line className="cross" x1={X(h.t)} x2={X(h.t)} y1={8} y2={H - 20} />
            <circle className="pct-dot" cx={X(h.t)} cy={Y(h.pct)} r={4} />
          </g>
        )}
        <text className="axis" x={28} y={H - 4}>
          0:00
        </text>
        <text className="axis" x={W - 8} y={H - 4} textAnchor="end">
          {sinceStart(race, t1)}
        </text>
      </svg>
      <figcaption className="muted small" aria-live="polite">
        {h ? `${sinceStart(race, h.t)} · ${pctTxt(h.pct)}` : 'Πέρασε το δάχτυλο πάνω στη γραμμή για τιμές.'}
      </figcaption>
    </figure>
  );
}
