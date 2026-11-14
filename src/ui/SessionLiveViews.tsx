import { useEffect, useRef, useState } from 'react';
import { useApp } from './AppContext';
import { useRace } from './RaceContext';
import { useTraining } from './TrainingContext';
import { SheetFrame, useNow } from './SessionBar';
import { flashSession } from './sessionFlash';
import { selectableSails } from '../performance/sails';
import { bestLap, goalOf, liveLaps, manoeuvreStats, mss, noteLap, TRIM_MAX } from '../race/training';
import type { Lap } from '../race/types';
import { useNav } from './NavContext';
import { useInstruments } from './InstrumentsContext';
import { useAlerts } from './RaceAlerts';
import { useLiveNumbers, usePublishLive } from './useSession';
import { PolarTrimPanel } from './PolarTrimPanel';
import { requestKindSheet, hhmm } from './SessionBar';
import { LIVE_TEXT, TRAINING_TEXT as TT } from './sessionText';
import { depthDue, legOf, nextChange, trainingHint, type WindAt } from '../race/liveNumbers';
import { fetchDepth, type DepthSample } from './nauticalStyle';
import { gridField } from '../weather/field';

const f1 = (v?: number) => (v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(1).replace('.', ','));

/** «ενδεικτικό» next to a number without instruments (current, manual wind). */
const Ind = ({ on }: { on: boolean }) => (on ? <span className="ind">{LIVE_TEXT.indicative}</span> : null);

/**
 * Training Live per «Τι δουλεύουμε» (P-034 AC 4–6, P-035 AC 5–9): the goal's big
 * number first, then % of target / wind angle / speed, the mini row, «⏱ Γύρος» with
 * undo and notes, the laps, the polar panel and «⇄ Γίνε Βόλτα».
 */
export function TrainingLive() {
  const { activeBoat } = useApp();
  const race = useRace();
  const al = useAlerts();
  const tr = useTraining();
  const nb = useLiveNumbers();
  usePublishLive(nb);
  const now = useNow(1000);
  const [noteFor, setNoteFor] = useState<number>();
  const s = race.session;
  if (!s) return null;
  const r = nb.result;
  const ind = !nb.withInst;
  const goal = goalOf(s);
  const paused = race.paused;
  const pct = nb.bsp === undefined ? undefined : al.pct15;
  const hint = trainingHint(pct, r ?? undefined);
  const twa = r ? r.twa : undefined;
  const laps = liveLaps(s, now);
  const best = bestLap(laps.done);
  const lastDone = laps.done[laps.done.length - 1];

  const pctTile = (hero: boolean) => (
    <div className={`rs-tile ${hero ? 'hero' : ''}`} key="pct">
      <span>
        <span className="lab">{LIVE_TEXT.pctTitle}</span>
        <span className="ab">
          {LIVE_TEXT.pctMean} <Ind on={ind} />
        </span>
        <span className={`sub ${pct !== undefined && pct > 95 ? 'good' : 'fair'}`}>{hint}</span>
      </span>
      {pct === undefined ? (
        <span className="val wait" aria-label={LIVE_TEXT.waitingSpeed}>
          …
        </span>
      ) : (
        <span className="val">
          {Math.round(pct)}
          <small>%</small>
        </span>
      )}
    </div>
  );
  const twaTile = (
    <div className="rs-tile" key="twa">
      <span>
        <span className="lab">{LIVE_TEXT.windAngle}</span>
        <span className="ab">
          TWA{nb.windManual ? ` · ${LIVE_TEXT.manualWind}` : ''} <Ind on={ind} />
        </span>
        {r?.targetTwa !== undefined && (
          <span className="sub">
            {LIVE_TEXT.target} {Math.round(r.targetTwa)}°
          </span>
        )}
      </span>
      <span className="val">{twa === undefined ? '—' : `${Math.round(twa)}°`}</span>
    </div>
  );
  const speedTile = (
    <div className="rs-tile" key="bsp">
      <span>
        <span className="lab">{LIVE_TEXT.speed}</span>
        <span className="ab">
          {nb.bspFrom === 'BSP' ? 'BSP' : LIVE_TEXT.sogFromGps} <Ind on={ind} />
        </span>
        {r && (
          <span className="sub">
            {LIVE_TEXT.target} {f1(r.targetBsp)} κν
          </span>
        )}
        {nb.bsp === undefined && <span className="sub fair">{LIVE_TEXT.waitingSpeed}</span>}
      </span>
      {nb.bsp === undefined ? (
        <span className="val wait" aria-label={LIVE_TEXT.waitingSpeed}>
          …
        </span>
      ) : (
        <span className="val">
          {f1(nb.bsp)}
          <small> κν</small>
        </span>
      )}
    </div>
  );
  const vmgPct = r?.pctVmg === undefined ? undefined : Math.round(r.pctVmg * 100);
  const vmgTile = (
    <div className="rs-tile hero" key="vmg">
      <span>
        <span className="lab">{TT.vmg}</span>
        <span className="ab">
          {TT.vmgAb} <Ind on={ind} />
        </span>
        <span className="sub">
          {LIVE_TEXT.target} {f1(r?.targetVmg)} κν · % {vmgPct ?? '—'}
        </span>
      </span>
      <span className="val">
        {f1(r?.vmg)}
        <small> κν</small>
      </span>
    </div>
  );

  let tiles: React.ReactNode;
  if (goal === 'starts') tiles = [<StartTile key="start" />, pctTile(false), twaTile];
  else if (goal === 'tacks' || goal === 'gybes') tiles = [<RecoveryTile key="rec" kind={goal === 'tacks' ? 'tack' : 'gybe'} now={now} />, pctTile(false), twaTile];
  else if (goal === 'downwind') tiles = [vmgTile, twaTile, pctTile(false)];
  else tiles = [pctTile(true), twaTile, speedTile];

  return (
    <div className="session-live">
      {ind && <p className="msg warn">{LIVE_TEXT.noInstTraining}</p>}
      {!activeBoat?.polar && <p className="msg warn">{LIVE_TEXT.noPolar}</p>}
      {activeBoat?.polar && !r && <p className="msg warn">{LIVE_TEXT.noWind}</p>}
      <section className="card race-screen">
        {tiles}
        <div className="bl-mini train">
          {goal === 'downwind' ? (
            <div>
              <b>{f1(nb.bsp)}</b>
              <span className="small muted">
                {nb.bspFrom} · {LIVE_TEXT.target} {f1(r?.targetBsp)}
              </span>
            </div>
          ) : (
            <div>
              <b>{f1(r?.vmg)}</b>
              <span className="small muted">VMG κν</span>
            </div>
          )}
          <div>
            <b>{f1(r?.tws)}</b>
            <span className="small muted">
              TWS κν{nb.windManual ? ` ${LIVE_TEXT.manualShort}` : ''}
            </span>
          </div>
          <div>
            <b className="leg">{twa === undefined ? '—' : legOf(twa)}</b>
            <span className="small muted">{LIVE_TEXT.leg}</span>
          </div>
        </div>
      </section>
      <button
        type="button"
        className="lap-btn"
        disabled={paused}
        aria-label={TT.lapAria(laps.current.n, mss(laps.current.sec))}
        onClick={tr.lap}
      >
        {TT.lapBtn(laps.current.n, mss(laps.current.sec))}
      </button>
      {tr.undoLeft > 0 && lastDone ? (
        <div className="g2">
          <button type="button" className="btn" onClick={tr.undo}>
            {TT.undo(tr.undoLeft)}
          </button>
          <button type="button" className="btn" onClick={() => setNoteFor(lastDone.n)}>
            {TT.noteNow}
          </button>
        </div>
      ) : (
        lastDone && (
          <button type="button" className="btn wide" onClick={() => setNoteFor(lastDone.n)}>
            {TT.noteFor(lastDone.n)}
          </button>
        )
      )}
      {laps.done.length ? (
        <p className="lap-list">
          {[...laps.done]
            .reverse()
            .slice(0, 5)
            .map((l) => `Γύρος ${l.n}: ${mss(l.sec)}${l.n === best ? ' ★' : ''}`)
            .join(' · ')}
        </p>
      ) : (
        <p className="small muted">{TT.lapsHint}</p>
      )}
      <PolarTrimPanel />
      <button type="button" className="btn big-btn wide swap-btn" onClick={requestKindSheet}>
        {LIVE_TEXT.toCruise}
      </button>
      {noteFor !== undefined && <LapNoteSheet n={noteFor} sec={laps.done.find((l) => l.n === noteFor)?.sec ?? 0} onClose={() => setNoteFor(undefined)} />}
    </div>
  );
}

/** «Ανάκαμψη στο 90%» (AC 7): the last tack or gybe, with count, mean and best. */
function RecoveryTile({ kind, now }: { kind: 'tack' | 'gybe'; now: number }) {
  const race = useRace();
  const al = useAlerts();
  const s = race.session!;
  const st = manoeuvreStats(s, { now }).find((m) => m.kind === kind)!;
  const list = (s.manoeuvres ?? []).filter((m) => m.kind === kind);
  const last = list[list.length - 1];
  const pending = al.pendingManoeuvre?.kind === kind && (!last || al.pendingManoeuvre.t > last.t);
  const w = kind === 'tack' ? 'αναστροφή' : 'υποσταύρωση';
  const many = kind === 'tack' ? (st.count === 1 ? 'αναστροφή' : 'αναστροφές') : st.count === 1 ? 'υποσταύρωση' : 'υποσταυρώσεις';
  const ind = list.some((m) => m.indicative);
  const t = (x: number | null) => (x === null ? '—' : mss(x));
  return (
    <div className="rs-tile hero">
      <span>
        <span className="lab">{TT.recovery}</span>
        <span className="ab">
          {TT.last(w)} <Ind on={ind} />
        </span>
        <span className="sub">
          {st.count} {many} · μέσος {t(st.avgRecoverSec)} · καλύτερη {t(st.bestRecoverSec)}
        </span>
      </span>
      {pending ? (
        <span className="val wait">…</span>
      ) : (
        <span className="val">{!last ? '—' : last.recoverSec === undefined ? TT.overMax : mss(last.recoverSec)}</span>
      )}
    </div>
  );
}

/** «Εκκίνηση» (AC 8): 5′ countdown, «Συγχρ. λεπτού», a new lap at 0. */
function StartTile() {
  const tr = useTraining();
  const race = useRace();
  const left = tr.cdLeft;
  const runs = left !== undefined && left > 0;
  return (
    <>
      <div className="rs-tile hero">
        <span>
          <span className="lab">{TT.start}</span>
          <span className="ab">{TT.startAb}</span>
          <span className={`sub ${left === 0 ? 'good' : ''}`}>{left === undefined ? TT.startIdle : left === 0 ? TT.startGone : TT.startRunning}</span>
        </span>
        <span className="val">{left === undefined ? '5:00' : mss(Math.ceil(left / 1000))}</span>
      </div>
      <div className="g2 cd-row">
        <button type="button" className="btn big-btn primary" disabled={race.paused} onClick={tr.cdStart}>
          {left === undefined ? TT.cdStart : TT.cdRestart}
        </button>
        <button type="button" className="btn big-btn" disabled={!runs || race.paused} onClick={tr.cdSync}>
          {TT.cdSync}
        </button>
      </div>
    </>
  );
}

/** «Σημείωση · γύρος N»: sail, helm (Α/Β/Γ, never names), trim (≤ 60). */
function LapNoteSheet({ n, sec, onClose }: { n: number; sec: number; onClose: () => void }) {
  const { activeBoat } = useApp();
  const race = useRace();
  const s = race.session;
  const lap = s?.laps?.[n - 1];
  const sails = activeBoat ? selectableSails(activeBoat).map((x) => x.name) : [];
  if (lap?.sail && !sails.includes(lap.sail)) sails.push(lap.sail);
  const set = (p: Omit<Lap, 't'>) => s && race.update((cur) => noteLap(cur, n, p));
  return (
    <SheetFrame label={TT.noteTitle(n, mss(sec))} onClose={onClose}>
      <h3>{TT.noteTitle(n, mss(sec))}</h3>
      {sails.length > 0 && (
        <>
          <div className="settings-sub">{TT.sail}</div>
          <div className="seg wrap" role="group" aria-label={TT.sail}>
            {sails.map((x) => (
              <button key={x} type="button" className={lap?.sail === x ? 'on' : ''} aria-pressed={lap?.sail === x} onClick={() => set({ sail: x })}>
                {x}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="settings-sub">{TT.helm}</div>
      <div className="seg" role="group" aria-label={TT.helm}>
        {(['Α', 'Β', 'Γ'] as const).map((h) => (
          <button key={h} type="button" className={lap?.helm === h ? 'on' : ''} aria-pressed={lap?.helm === h} onClick={() => set({ helm: h })}>
            {h}
          </button>
        ))}
      </div>
      <label className="field">
        <span>{TT.trim}</span>
        <input value={lap?.trim ?? ''} maxLength={TRIM_MAX} placeholder={TT.trimPh} onChange={(e) => set({ trim: e.target.value })} />
      </label>
      <button type="button" className="btn primary big-btn wide" onClick={onClose}>
        {TT.done}
      </button>
    </SheetFrame>
  );
}

/** «⏸ Σε παύση» on the Live of training and cruise (P-039 AC 14). */
export function PauseCard() {
  const race = useRace();
  if (!race.paused) return null;
  return (
    <section className="card pause-card" role="status">
      <b>{TT.pausedTitle}</b>
      <span className="small">{TT.pausedText}</span>
      <button
        type="button"
        className="btn primary big-btn wide"
        onClick={() => {
          race.resume();
          flashSession(TT.resumed);
        }}
      >
        {TT.resume}
      </button>
    </section>
  );
}

function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Last chart depth, kept across re-mounts so tab switches do not ask again within 60″. */
let chartDepth: { at: number; d?: DepthSample } | undefined;

/** Depth from the chart (EMODnet `depth_sample`) at our position: at most once every 60″, online only. */
function useChartDepth(pos: { lat: number; lon: number } | undefined, enabled: boolean, online: boolean): DepthSample | undefined {
  const [d, setD] = useState(chartDepth?.d);
  const has = !!pos;
  const ref = useRef(pos);
  ref.current = pos;
  useEffect(() => {
    if (!enabled || !online || !has) return;
    let ctl: AbortController | undefined;
    const tick = () => {
      const p = ref.current;
      if (!p || !depthDue(chartDepth?.at, Date.now(), navigator.onLine !== false)) return;
      chartDepth = { at: Date.now(), d: chartDepth?.d };
      ctl = new AbortController();
      fetchDepth(p.lat, p.lon, ctl.signal)
        .then((x) => {
          chartDepth = { at: Date.now(), d: x };
          setD(x);
        })
        .catch(() => undefined);
    };
    tick();
    const t = window.setInterval(tick, 5_000);
    return () => {
      window.clearInterval(t);
      ctl?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, online, has]);
  return d;
}

/**
 * Cruise Live, basic (P-034 AC 7–8): speed over ground with course, depth
 * (sounder, or the chart: indicative, not for navigation), weather and «⇄ Γίνε Προπόνηση».
 * Destination and ETA come in Φ4.
 */
export function CruiseLive() {
  const nav = useNav();
  const inst = useInstruments();
  const online = useOnline();
  const fix = nav.gps.fix;
  const sounder = inst.live ? inst.values.depth : undefined;
  const chart = useChartDepth(fix ? { lat: fix.lat, lon: fix.lon } : undefined, sounder === undefined, online);
  const depth = sounder ?? (online ? chart?.depth : undefined);
  return (
    <div className="session-live">
      <section className="card race-screen">
        <div className="rs-tile">
          <span>
            <span className="lab">{LIVE_TEXT.speed}</span>
            <span className="ab">{LIVE_TEXT.sogGround}</span>
            <span className="sub">
              {LIVE_TEXT.course} {fix?.cog === undefined ? '—' : `${Math.round(fix.cog)}°`}
            </span>
          </span>
          <span className="val">
            {f1(fix?.sog)}
            <small> κν</small>
          </span>
        </div>
        <div className="rs-tile">
          <span>
            <span className="lab">{LIVE_TEXT.depth}</span>
            <span className="ab">{sounder !== undefined ? LIVE_TEXT.depthSounder : LIVE_TEXT.depthChart}</span>
          </span>
          <span className="val">
            {depth === undefined ? '—' : `${sounder === undefined ? '~' : ''}${depth < 10 ? f1(depth) : Math.round(depth)}`}
            <small> μ</small>
          </span>
        </div>
      </section>
      <CruiseWeather online={online} />
      <button type="button" className="btn big-btn wide swap-btn" onClick={requestKindSheet}>
        {LIVE_TEXT.toTraining}
      </button>
    </div>
  );
}

/** «Καιρός» of the cruise: wind, gusts and when it changes, from the forecast the app already has. */
function CruiseWeather({ online }: { online: boolean }) {
  const nav = useNav();
  const f = nav.forecast;
  const [flash, setFlash] = useState<string>();
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(undefined), 4000);
    return () => window.clearTimeout(t);
  }, [flash]);
  const p = nav.gps.fix ?? { lat: 37.85, lon: 23.55 };
  const now = Date.now();
  const inRange = f && now >= f.times[0] - 3600_000 && now <= f.times[f.times.length - 1];
  const field = inRange ? gridField(f) : undefined;
  const w = field?.at(p.lat, p.lon, now);
  const series: WindAt[] = [];
  if (field && f) for (let t = now; t <= Math.min(now + 12 * 3600_000, f.times[f.times.length - 1]); t += 3600_000) series.push({ t, ...field.at(p.lat, p.lon, t) });
  const change = nextChange(series);
  const retry = () => {
    if (navigator.onLine === false) setFlash(f ? LIVE_TEXT.stillOffline(hhmm(f.fetchedAt)) : LIVE_TEXT.noForecastOffline);
    else nav.loadForecast();
  };
  return (
    <section className="card">
      <b>{LIVE_TEXT.weather}</b>
      {w ? (
        <div className="bl-mini">
          <div>
            <b>
              {Math.round(w.tws)} · {Math.round(w.twd)}°
            </b>
            <span className="small muted">άνεμος κν</span>
          </div>
          <div>
            <b>{w.gust === undefined ? '—' : Math.round(w.gust)}</b>
            <span className="small muted">ριπές κν</span>
          </div>
          <div>
            <b>{change ? hhmm(change.t) : '—'}</b>
            <span className="small muted">{change ? change.how : 'σταθερός'}</span>
          </div>
        </div>
      ) : (
        <p className="small muted">{LIVE_TEXT.noForecast}</p>
      )}
      {!online && f && <p className="small">{LIVE_TEXT.forecastOffline(hhmm(f.fetchedAt))}</p>}
      {flash && (
        <p className="small" role="status">
          {flash}
        </p>
      )}
      {nav.forecastStatus.error && online && <p className="small warn-text">{nav.forecastStatus.error}</p>}
      {(!online || !w || nav.forecastStatus.error) && (
        <button type="button" className="btn" disabled={nav.forecastStatus.busy} onClick={retry}>
          {nav.forecastStatus.busy ? 'Φόρτωση…' : LIVE_TEXT.retry}
        </button>
      )}
    </section>
  );
}
