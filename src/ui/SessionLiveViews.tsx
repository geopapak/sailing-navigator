import { useEffect, useRef, useState } from 'react';
import { useApp } from './AppContext';
import { useNav } from './NavContext';
import { useInstruments } from './InstrumentsContext';
import { useAlerts } from './RaceAlerts';
import { useLiveNumbers, usePublishLive } from './useSession';
import { PolarTrimPanel } from './PolarTrimPanel';
import { requestKindSheet, hhmm } from './SessionBar';
import { LIVE_TEXT } from './sessionText';
import { depthDue, legOf, nextChange, trainingHint, type WindAt } from '../race/liveNumbers';
import { fetchDepth, type DepthSample } from './nauticalStyle';
import { gridField } from '../weather/field';

const f1 = (v?: number) => (v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(1).replace('.', ','));

/** «ενδεικτικό» next to a number without instruments (current, manual wind). */
const Ind = ({ on }: { on: boolean }) => (on ? <span className="ind">{LIVE_TEXT.indicative}</span> : null);

/**
 * Training Live, «Ελεύθερη» (P-034 AC 4–6): % of target (15″ mean), wind angle,
 * speed, then VMG · TWS · leg, the polar panel and «⇄ Γίνε Βόλτα».
 */
export function TrainingLive() {
  const { activeBoat } = useApp();
  const al = useAlerts();
  const nb = useLiveNumbers();
  usePublishLive(nb);
  const r = nb.result;
  const ind = !nb.withInst;
  const pct = nb.bsp === undefined ? undefined : al.pct15;
  const hint = trainingHint(pct, r ?? undefined);
  const twa = r ? r.twa : undefined;
  return (
    <div className="session-live">
      {ind && <p className="msg warn">{LIVE_TEXT.noInstTraining}</p>}
      {!activeBoat?.polar && <p className="msg warn">{LIVE_TEXT.noPolar}</p>}
      {activeBoat?.polar && !r && <p className="msg warn">{LIVE_TEXT.noWind}</p>}
      <section className="card race-screen">
        <div className="rs-tile hero">
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
        <div className="rs-tile">
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
        <div className="rs-tile">
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
        <div className="bl-mini train">
          <div>
            <b>{f1(r?.vmg)}</b>
            <span className="small muted">VMG κν</span>
          </div>
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
      <PolarTrimPanel />
      <button type="button" className="btn big-btn wide swap-btn" onClick={requestKindSheet}>
        {LIVE_TEXT.toCruise}
      </button>
    </div>
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
