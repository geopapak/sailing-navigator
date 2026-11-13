import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from './AppContext';
import { useRace } from './RaceContext';
import { Icon } from './Icons';
import { Toggle } from './AlertsCard';
import { useCrews } from './CrewViews';
import { syncShare, SHARE_TEXT } from './crewShare';
import { DEFAULT_SERVER } from './settings';
import { TRAINING_TEXT as TT } from './sessionText';
import { dayStr, hhmm } from './SessionBar';
import { accountApi, ApiError } from '../sync/api';
import { toCsv, toGpx } from '../race/analysis';
import { trackSegments } from '../race/pauses';
import {
  analysisBody,
  bestLap,
  cardOrder,
  goalName,
  goalOf,
  LEG_NAME,
  mss,
  trainingSummary,
  type Leg,
  type SummaryCard,
  type TrainingSummary,
} from '../race/training';
import { formatDuration } from '../scoring/corrected';
import type { OwnedCrew } from '../crew/api';
import type { BoatProfile } from '../boat/types';
import type { Race, TrainingGoal } from '../race/types';
import type { LatLon } from '../nav/geo';

const n1 = (x: number) => x.toFixed(1).replace('.', ',');
const Ind = ({ on }: { on: boolean }) => (on ? <span className="ind">ενδεικτικό</span> : null);
const pctTxt = (p: number | null) => (p === null ? '—' : `${p}%`);

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const fileName = (r: Race) =>
  `${(r.name || 'Προπόνηση').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'training'}_${new Date(r.start).toISOString().slice(0, 10)}`;

/**
 * The cards of a training summary (P-035 AC 20–22, 24), in the order of «Τι δουλεύουμε».
 * The crew sees the same cards from the shared summary, without the track (AC 28).
 */
export function TrainingCards({ s, goal, track }: { s: TrainingSummary; goal: TrainingGoal; track?: ReactNode }) {
  const cards: Record<SummaryCard, ReactNode> = {
    laps: <LapsCard key="laps" s={s} />,
    pct: <PctCard key="pct" s={s} />,
    manoeuvres: <ManoeuvresCard key="man" s={s} />,
    track: track ? <section key="track" className="card">{track}</section> : null,
  };
  return <>{cardOrder(goal).map((c) => cards[c])}</>;
}

function LapsCard({ s }: { s: TrainingSummary }) {
  const best = bestLap(s.laps);
  return (
    <section className="card">
      <h3>{TT.laps}</h3>
      {s.laps.length < 2 ? (
        <p className="small">{TT.oneLap}</p>
      ) : (
        <>
          <div className="tbl-wrap tall">
            <table className="tbl laps-tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>χρόνος</th>
                  <th>% στόχου</th>
                  <th>σημείωση</th>
                </tr>
              </thead>
              <tbody>
                {s.laps.map((l) => (
                  <tr key={l.n} className={l.n === best ? 'best' : ''}>
                    <td>
                      {l.n}
                      {l.n === best ? ' ★' : ''}
                    </td>
                    <td>{mss(l.sec)}</td>
                    <td>
                      {pctTxt(l.pct)}
                    </td>
                    <td className="note">{[l.sail, l.helm ? `τιμ. ${l.helm}` : '', l.trim].filter(Boolean).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">
            {TT.bestLegend} <Ind on={s.indicative} />
          </p>
        </>
      )}
    </section>
  );
}

function PctCard({ s }: { s: TrainingSummary }) {
  const bands = [...new Set(s.pctTable.map((c) => c.band))];
  const legs: Leg[] = ['upwind', 'reach', 'downwind'];
  return (
    <section className="card">
      <h3>{TT.pctCard}</h3>
      {bands.length === 0 ? (
        <p className="small muted">Δεν υπάρχουν ακόμα νούμερα: χρειάζονται ταχύτητα, άνεμος και polar.</p>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th />
                {bands.map((b) => (
                  <th key={b}>{b} κν</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {legs.map((leg) => (
                <tr key={leg}>
                  <td>{LEG_NAME[leg]}</td>
                  {bands.map((b) => (
                    <td key={b}>{pctTxt(s.pctTable.find((c) => c.leg === leg && c.band === b)?.pct ?? null)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted">
        {TT.pctNote} <Ind on={s.indicative} />
      </p>
    </section>
  );
}

function ManoeuvresCard({ s }: { s: TrainingSummary }) {
  const t = (x: number | null) => (x === null ? '—' : mss(x));
  return (
    <section className="card">
      <h3>{TT.manCard}</h3>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th />
              <th>πόσες</th>
              <th>ανάκαμψη στο 90%</th>
            </tr>
          </thead>
          <tbody>
            {s.manoeuvres.map((m) => (
              <tr key={m.kind}>
                <td>{m.kind === 'tack' ? TT.tacks : TT.gybes}</td>
                <td>{m.count}</td>
                <td>{m.avgRecoverSec === null ? '—' : `μέση ${t(m.avgRecoverSec)} · καλύτερη ${t(m.bestRecoverSec)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {s.indicative && (
        <p className="small muted">
          <Ind on />
        </p>
      )}
    </section>
  );
}

/**
 * The track coloured by % of target (AC 20): > 95% solid, 90–95% dashed, < 90% dotted,
 * so it reads in Night (red only) by the kind of line alone. Cut at every pause.
 */
export function ColouredTrack({ r }: { r: Race }) {
  const segs = trackSegments(r);
  const pts = segs.flat();
  if (pts.length < 2) return <p className="small muted">Δεν καταγράφηκε ίχνος (χρειάζεται GPS ή όργανα όσο τρέχει η προπόνηση).</p>;
  const lat0 = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map((p) => p.lon * k);
  const ys = pts.map((p) => p.lat);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const W = 320;
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 1e-4);
  const sc = (W - 30) / span;
  const H = Math.max(140, Math.min(380, (Math.max(...ys) - minY) * sc + 30));
  const X = (p: LatLon) => (15 + (p.lon * k - minX) * sc).toFixed(1);
  const Y = (p: LatLon) => (H - 15 - (p.lat - minY) * sc).toFixed(1);
  const cls = (pct?: number) => (pct === undefined || !(pct > 0.3) ? 'n' : pct > 0.95 ? 'g' : pct >= 0.9 ? 'f' : 'b');
  const paths: { d: string; c: string }[] = [];
  for (const seg of segs) {
    for (let i = 1; i < seg.length; i++) {
      const c = cls(seg[i].pct);
      const last = paths[paths.length - 1];
      if (i > 1 && last && last.c === c) last.d += ` L${X(seg[i])},${Y(seg[i])}`;
      else paths.push({ c, d: `M${X(seg[i - 1])},${Y(seg[i - 1])} L${X(seg[i])},${Y(seg[i])}` });
    }
  }
  return (
    <>
      <figure className="track-map pct-track">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ίχνος χρωματισμένο με το % του στόχου">
          {paths.map((p, i) => (
            <path key={i} className={`tp ${p.c}`} d={p.d} />
          ))}
        </svg>
        <div className="disc">{TT.notNav}</div>
      </figure>
      <p className="pct-legend small">
        <span>
          <i className="g" />
          {TT.above95}
        </span>
        <span>
          <i className="f" />
          {TT.mid}
        </span>
        <span>
          <i className="b" />
          {TT.below90}
        </span>
      </p>
    </>
  );
}

/** The crew of the boat this training was sailed with: the one it is shared with, else the owner's crew of the boat. */
export function crewFor(owned: OwnedCrew[] | undefined, r: Race, boat?: BoatProfile): OwnedCrew | undefined {
  if (!owned) return undefined;
  if (r.crewId) return owned.find((c) => c.id === r.crewId);
  const own = r.entries.find((e) => e.own);
  if (!own) return undefined;
  return owned.find((c) => boat && c.boatId === boat.id && boat.name === own.name) ?? owned.find((c) => c.boatName === own.name);
}

/** «Μοιράσου με το πλήρωμα» on the summary (AC 25), with the owner's note. */
function ShareCard({ r }: { r: Race }) {
  const { activeBoat } = useApp();
  const race = useRace();
  const c = useCrews();
  const crew = crewFor(c.data?.owned, r, activeBoat);
  const [msg, setMsg] = useState<{ text: string; retry: boolean }>();
  const [busy, setBusy] = useState(false);
  const can = c.signedIn && (!!crew || !!r.crewId);
  const send = async (patch: Partial<Race>) => {
    const next: Race = { ...r, ...patch, crewId: r.crewId ?? crew?.id };
    setBusy(true);
    try {
      await race.patchRace(r.id, { ...patch, crewId: next.crewId });
      const { out, patch: p } = await syncShare(next, { server: c.server, token: c.token });
      await race.patchRace(r.id, p);
      setMsg({ text: out.text, retry: !out.ok && out.pending });
    } finally {
      setBusy(false);
    }
  };
  const shared = !!r.crewShared;
  return (
    <section className="card">
      <Toggle on={shared} disabled={!can || busy} label={TT.share} sub={can ? (shared ? TT.shareOn : TT.shareOff) : TT.shareNeedsCrew} onChange={(v) => send({ crewShared: v })} />
      {shared && (
        <label className="field">
          <span>Σημείωση για το πλήρωμα</span>
          <textarea
            rows={2}
            maxLength={500}
            defaultValue={r.crewNote ?? ''}
            placeholder="π.χ. Καλή δουλειά στις αναστροφές, την Κυριακή δουλεύουμε πρίμα"
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== (r.crewNote ?? '')) void send({ crewNote: v });
            }}
          />
        </label>
      )}
      {(msg || r.crewSharePending) && (
        <p className="small" role="status">
          {msg?.text ?? SHARE_TEXT.offline}{' '}
          {(msg?.retry ?? r.crewSharePending) && (
            <button type="button" className="link" disabled={busy} onClick={() => send({})}>
              Ξανά
            </button>
          )}
        </p>
      )}
    </section>
  );
}

/** «Ανάλυση και μαθήματα» for a training (AC 23): one `/analysis` call, kept in `Race.analysis`. */
function LessonsCard({ r }: { r: Race }) {
  const { settings, account } = useApp();
  const race = useRace();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [waiting, setWaiting] = useState(false);
  const inFlight = useRef(false);
  const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
  const ask = async () => {
    // One paid call at a time: the «online» retry and a «Ξανά» tap must not both go.
    if (inFlight.current || r.analysis?.lessons.length) return;
    if (offline()) {
      setWaiting(true);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setErr(undefined);
    try {
      const b = analysisBody(r);
      const res = await accountApi.analysis(settings.aiUrl || DEFAULT_SERVER, settings.authToken, b.summary, b.kind);
      setWaiting(false);
      await race.patchRace(r.id, { analysis: { lessons: res.lessons, at: Date.now(), model: res.model } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 0 && offline()) setWaiting(true);
      else setErr((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  // «θα φτιαχτούν όταν επιστρέψει»: asked once more when the internet is back (still one call).
  useEffect(() => {
    if (!waiting) return;
    const on = () => void ask();
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);
  if (r.analysis?.lessons.length)
    return (
      <section className="card">
        <h3>{TT.lessons}</h3>
        <ul className="lessons">
          {r.analysis.lessons.map((l, i) => (
            <li key={i}>
              {l.text}
              {l.impact && <span className="muted small"> · {l.impact}</span>}
            </li>
          ))}
        </ul>
        <p className="muted small">Από τον σύμβουλο AI με βάση τους αριθμούς της προπόνησης · η απόφαση είναι του κυβερνήτη.</p>
      </section>
    );
  return (
    <>
      <button type="button" className="btn big-btn wide" disabled={busy || !account} onClick={ask}>
        {busy ? 'Ο σύμβουλος γράφει…' : TT.lessons}
      </button>
      {!account && <p className="small muted">Χρειάζεται σύνδεση στον λογαριασμό.</p>}
      {waiting && (
        <p className="small" role="status">
          {TT.lessonsOffline}{' '}
          <button type="button" className="link" disabled={busy} onClick={ask}>
            Ξανά
          </button>
        </p>
      )}
      {err && (
        <p className="errors">
          {err}{' '}
          <button type="button" className="link" disabled={busy} onClick={ask}>
            Ξανά
          </button>
        </p>
      )}
      {account && !waiting && !err && <p className="muted small">Μετράει ως 1 ερώτηση AI. Στέλνονται μόνο οι αριθμοί και οι σημειώσεις, όχι το ίχνος.</p>}
    </>
  );
}

/** «Η έξοδος τελείωσε» / Ιστορικό of a training (AC 19–25). */
export function TrainingSummaryView({ r }: { r: Race }) {
  const s = useMemo(() => trainingSummary(r), [r]);
  const goal = goalOf(r);
  const ind = s.indicative;
  const stats: [string, string][] = [
    [formatDuration(s.durationSec), 'διάρκεια'],
    [s.distanceNm === null ? '—' : `${n1(s.distanceNm)} νμ`, 'απόσταση'],
    [s.twsMin === null || s.twsMax === null ? '—' : s.twsMin === s.twsMax ? `${s.twsMin} κν` : `${s.twsMin}–${s.twsMax} κν`, 'εύρος TWS'],
    [pctTxt(s.avgPct), 'μέσος % του στόχου'],
  ];
  return (
    <>
      <section className="card session-summary">
        <div className="row">
          <span className="hist-ic">
            <Icon name="training" />
          </span>
          <span>
            <b>Προπόνηση · {goalName(goal)}</b>
            <br />
            <span className="small muted">
              {r.name && r.name !== 'Προπόνηση' ? `${r.name} · ` : ''}
              {dayStr(r.start)} · {hhmm(r.start)}
              {r.finish ? `–${hhmm(r.finish)}` : ''}
            </span>
          </span>
        </div>
        <div className="stats">
          {stats.map(([v, l]) => (
            <div key={l}>
              <b>{v}</b>
              <span className="small muted">
                {l} {l === 'μέσος % του στόχου' && <Ind on={ind} />}
              </span>
            </div>
          ))}
        </div>
        {s.pausedSec > 0 && <p className="small muted">{TT.noPauses(mss(s.pausedSec))}</p>}
        <p className="small muted">
          {TT.worked}: <b>{goalName(goal)}</b>
        </p>
      </section>
      <TrainingCards
        s={s}
        goal={goal}
        track={
          <>
            <h3>{TT.trackCard}</h3>
            <ColouredTrack r={r} />
            <div className="g2">
              <button type="button" className="btn" disabled={!r.track.length} onClick={() => download(`${fileName(r)}.gpx`, toGpx(r), 'application/gpx+xml')}>
                GPX
              </button>
              <button type="button" className="btn" disabled={!r.track.length} onClick={() => download(`${fileName(r)}.csv`, toCsv(r), 'text/csv')}>
                CSV
              </button>
            </div>
            <p className="small muted">Το ίχνος μένει μόνο σε αυτό το κινητό. Το GPX/CSV βγαίνει μόνο όταν το πατήσεις.</p>
          </>
        }
      />
      <ShareCard r={r} />
      <LessonsCard r={r} />
    </>
  );
}

/** The crew member's read-only view of a shared training (AC 28): no track card. */
export function SharedTrainingView({ s, goal, note, owner }: { s: TrainingSummary; goal: TrainingGoal; note?: string; owner: string }) {
  return (
    <div className="shared-training">
      <p className="small">
        {formatDuration(s.durationSec)} · {s.distanceNm === null ? '—' : `${n1(s.distanceNm)} νμ`}
        {s.twsMin !== null && s.twsMax !== null ? ` · ${s.twsMin}–${s.twsMax} κν` : ''} · {pctTxt(s.avgPct)} του στόχου <Ind on={s.indicative} />
      </p>
      <p className="small muted">
        {TT.worked}: <b>{goalName(goal)}</b>
      </p>
      {note && (
        <p className="crew-note">
          «{note}» — {owner}
        </p>
      )}
      <TrainingCards s={s} goal={goal} />
    </div>
  );
}
