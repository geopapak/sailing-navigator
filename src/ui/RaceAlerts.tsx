import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MUTE_MS, isMuted, newEngine, profileFor, soundFor, step, type Alert, type AlertProfile, type Situation } from '../race/alerts';
import { meanPct, pushPct, type PctSample } from '../race/liveNumbers';
import { newManoeuvres, recoveryDone, recoverySec } from '../race/training';
import type { Manoeuvre } from '../race/types';
import { stallMinutes } from '../race/session';
import { distanceNm } from '../nav/geo';
import { clearWind, meanWind, pushWind, type WindReading } from '../weather/windAverage';
import { fmtAge } from '../race/manualWind';
import { useApp } from './AppContext';
import { useNav } from './NavContext';
import { useInstruments } from './InstrumentsContext';
import { useRace } from './RaceContext';
import { useLaylines, type LaylineView } from './useLaylines';
import { useCruiseNav, useLiveNumbers, useSessionMarks } from './useSession';
import { AHEAD_NM, aheadOf, arriveStep, sampleDue, type DepthReading } from '../race/cruise';
import { chartDepthAt, claimAhead } from './depthCache';
import { audioReady, notify, unlockAudio } from './sound';

/** Manoeuvre alerts while a session records (P-023; per kind, P-034): one engine for the whole app. */
interface AlertsState {
  banner?: Alert & { muted: boolean };
  dismiss: () => void;
  /** Seconds left of "🔕 Σίγαση 5′" (0 = not muted). */
  muteLeft: number;
  toggleMute: () => void;
  audioOk: boolean;
  enableAudio: () => void;
  lay?: LaylineView;
  markInSec?: number;
  layInSec?: number;
  /** Alerts of the running session's kind. */
  profile?: AlertProfile;
  /** 15″ rolling mean of the speed as % of target (P-034), while a session records. */
  pct15?: number;
  /** Training: a manoeuvre found live whose recovery to 90% is still being measured. */
  pendingManoeuvre?: Pick<Manoeuvre, 't' | 'kind'>;
  /** Shows an alert that does not come from the engine (the start practice countdown). */
  announce: (a: Alert) => void;
}

const Ctx = createContext<AlertsState | null>(null);
const STEP_MS = 2_000;
const SHIFT_WINDOW_MS = 20_000;

export function AlertsProvider({ children }: { children: ReactNode }) {
  const { settings } = useApp();
  const nav = useNav();
  const inst = useInstruments();
  const race = useRace();
  const lay = useLaylines();
  const marks = useSessionMarks();
  const numbers = useLiveNumbers();
  const kind = race.recording ? race.kind : undefined;
  const profile = useMemo(() => (kind ? profileFor(kind, settings) : undefined), [kind, settings]);
  // The engine runs while a session records (it also feeds the 15″ % mean); a cruise has safety alerts only.
  const on = !!kind;
  const cruise = useCruiseNav();
  // Cruise: the latest chart sample ahead (EMODnet), used until the next one.
  const ahead = useRef<DepthReading>();
  const engine = useRef(newEngine());
  const [banner, setBanner] = useState<AlertsState['banner']>();
  const [, setTick] = useState(0);
  const [audioOk, setAudioOk] = useState(audioReady());
  const instSamples = useRef<WindReading[]>([]);
  const pctSamples = useRef<PctSample[]>([]);
  const [pct15, setPct15] = useState<number>();
  // Training: dense samples (every 2″, in memory only) for the manoeuvres and their recovery (P-035).
  const manSamples = useRef<{ t: number; twa?: number; pct?: number }[]>([]);
  const pendingMan = useRef<(Pick<Manoeuvre, 't' | 'kind' | 'indicative'>)[]>([]);
  const [pendingManoeuvre, setPendingManoeuvre] = useState<AlertsState['pendingManoeuvre']>();
  const update = race.update;
  const known = race.session?.manoeuvres;

  const fix = nav.gps.fix;
  const mark = marks.mark;
  const markInSec =
    fix && mark && (fix.sog ?? 0) > 1 ? (distanceNm(fix, mark) / fix.sog!) * 3600 : undefined;
  const layInSec =
    lay && lay.result.leg !== 'reach' && lay.result.toLayMin !== undefined ? lay.result.toLayMin * 60 : undefined;
  // Lost: the track has stalled, or no position has come for as long since recording began here.
  const waitingFor = race.waitingGps ? stallMinutes(race.everyMs) * 60_000 : undefined;
  const stalled = !!race.stalledMin;

  const latest = useRef({ settings, inst, lay, markInSec, layInSec, marks, profile, numbers, stalled, waitingFor, known, cruise, fix, session: race.session });
  latest.current = { settings, inst, lay, markInSec, layInSec, marks, profile, numbers, stalled, waitingFor, known, cruise, fix, session: race.session };

  // P-053 AC 26: the rolling mean starts afresh when the manual wind is switched on or off.
  const manualOn = !!race.session?.manualWind?.on;
  const wasManual = useRef(manualOn);
  useEffect(() => {
    if (wasManual.current !== manualOn) clearWind();
    wasManual.current = manualOn;
  }, [manualOn]);

  useEffect(() => {
    // A new kind (training ↔ cruise) starts the engine afresh and hides the alert (AC 17).
    engine.current = newEngine();
    setBanner(undefined);
    instSamples.current = [];
    pctSamples.current = [];
    setPct15(undefined);
    manSamples.current = [];
    setPendingManoeuvre(undefined);
    ahead.current = undefined;
    // Cruise: «ΦΤΑΝΕΙΣ» once per destination, also after a pause, a switch or a reload (kept on the session).
    const firedDest = latest.current.session?.arriveFired;
    if (firedDest) engine.current.fired.add(`arrive-${firedDest}`);
    if (!on) return;
    const since = Date.now();
    const training = kind === 'training';
    const writeMan = (m: Manoeuvre) => update((r) => ({ manoeuvres: [...(r.manoeuvres ?? []), m].sort((a, b) => a.t - b.t) }));
    const t = window.setInterval(() => {
      const { settings: s, inst: i, lay: l, markInSec: m, layInSec: li, marks: mk, profile: p, numbers: nb, stalled: st, waitingFor: wf } = latest.current;
      const now = Date.now();
      const lost = st || (wf !== undefined && now - since > wf);
      let instTwd: number | undefined;
      const mw = latest.current.session?.manualWind;
      if (mw?.on) {
        // P-053: the manual wind feeds the mean (re-routing only, one reading per 10″); the
        // instruments' wind does not, and no wind shift is judged (`instTwd` stays undefined).
        pushWind({ t: now, tws: mw.tws, twd: mw.twdTrue, from: 'typed' });
        instSamples.current = [];
      } else if (i.live && i.values.twd !== undefined && i.values.tws !== undefined) {
        const r: WindReading = { t: now, tws: i.values.tws, twd: i.values.twd, from: 'instruments' };
        // Also feeds the few-minute mean used by laylines and re-routing, in every tab.
        pushWind(r);
        instSamples.current = [...instSamples.current.filter((q) => q.t >= now - SHIFT_WINDOW_MS), r];
        // Need most of the window before judging a shift.
        if (instSamples.current.length >= 6) instTwd = meanWind(now, SHIFT_WINDOW_MS, instSamples.current)?.twd;
      } else instSamples.current = [];
      const pt = nb.result?.pctTarget;
      pctSamples.current = pushPct(pctSamples.current, now, pt === undefined ? undefined : pt * 100);
      const pm = meanPct(pctSamples.current, now);
      setPct15(pm);
      if (training) {
        // Manoeuvres from the signed TWA; recovery: the mean after it back at ≥ 90% (P-035 AC 7).
        const res = nb.result;
        const twa = res ? (res.tack === 'port' ? -res.twa : res.twa) : undefined;
        manSamples.current = [...manSamples.current.filter((q) => q.t >= now - 4 * 60_000), { t: now, twa, pct: pt === undefined ? undefined : pt * 100 }];
        const seen = [...(latest.current.known ?? []), ...pendingMan.current];
        for (const m of newManoeuvres(manSamples.current, seen)) pendingMan.current.push({ ...m, indicative: !nb.withInst || undefined });
        const left: typeof pendingMan.current = [];
        for (const m of pendingMan.current) {
          if (recoveryDone(manSamples.current, m.t, now)) writeMan({ ...m, recoverSec: recoverySec(manSamples.current, m.t) });
          else left.push(m);
        }
        pendingMan.current = left;
        const last = left[left.length - 1];
        setPendingManoeuvre((p) => (p?.t === last?.t ? p : last ? { t: last.t, kind: last.kind } : undefined));
      }
      // Cruise: depth from the sounder, else the chart sample ahead; the destination left.
      let depth: DepthReading | undefined;
      let destNm: number | undefined;
      let destKey: string | undefined;
      if (kind === 'cruise') {
        const { cruise: cn, session: r, fix: f } = latest.current;
        const sounder = i.live ? i.values.depth : undefined;
        depth = sounder !== undefined ? { depth: sounder, from: 'sounder' } : ahead.current;
        if (r) {
          // Armed only once > 0,6 nm from the destination since it was set (a return to the
          // own marina does not «arrive» at the start); «άφιξη» of the summary at 0,1 nm.
          const a = arriveStep(r, { key: cn.key, leftNm: cn.leftNm, toLastNm: cn.toLastNm, hasFix: !!f && cn.hasFix, now });
          if (a.patch) update(a.patch);
          if (a.alertNm !== undefined) {
            destNm = a.alertNm;
            destKey = cn.key;
          }
        }
      }
      if (p && p.types.length) {
        const x: Situation = {
          now,
          markIndex: mk.index,
          markName: mk.mark?.name ?? 'σημαδούρα',
          isFinish: mk.isFinish,
          leg: l?.result.leg,
          board: l?.result.board,
          layInSec: li,
          markInSec: m,
          instTwd,
          gpsLost: lost,
          pct15: pm,
          instruments: nb.withInst,
          // P-053 AC 21: an old manual wind says its age on the layline alert.
          windAge: nb.windFrom === 'manual' && nb.stale && nb.manualAgeMin !== undefined ? fmtAge(nb.manualAgeMin) : undefined,
          depth,
          destNm,
          destKey,
        };
        const a = step(engine.current, s.alerts, x, p);
        if (a?.type === 'arrive' && destKey) update({ arriveFired: destKey });
        if (a) {
          const muted = isMuted(engine.current, now);
          setBanner({ ...a, muted });
          if (!muted) notify(a, { ...s.alerts, sound: soundFor(p, s.alerts.sound) });
        }
      }
      setTick((v) => v + 1);
    }, STEP_MS);
    return () => {
      window.clearInterval(t);
      // A pause or a switch cuts the measurement short: keep the manoeuvre, without a recovery.
      for (const m of pendingMan.current) writeMan({ ...m });
      pendingMan.current = [];
    };
  }, [on, kind, update]);

  // Cruise «Ρηχά μπροστά» without a sounder: one EMODnet sample 0,3 nm ahead on the COG, at
  // most once a minute, online and moving (> 1 kn) only; nothing is sent when the alert is off.
  const shallowOn = kind === 'cruise' && profile?.types.includes('shallow');
  useEffect(() => {
    if (!shallowOn) return;
    let stop = false;
    const tick = () => {
      const { inst: i, fix: f } = latest.current;
      const now = Date.now();
      if (i.live && i.values.depth !== undefined) return; // the sounder answers
      const online = navigator.onLine !== false;
      if (!f || f.cog === undefined || !online || (f.sog ?? 0) <= 1) return;
      claimAhead(now);
      // The shared budget (depthCache) keeps it to one request a minute, shared with «Βάθος εδώ».
      if (!sampleDue(undefined, now, { online, sog: f.sog })) return;
      chartDepthAt(aheadOf(f, f.cog, AHEAD_NM), now, 'ahead').then((c) => {
        if (stop || !c) return;
        // Land ahead counts as no water at all.
        if (c.land) ahead.current = { depth: 0, from: 'chart', aheadNm: AHEAD_NM };
        else if (c.d) ahead.current = { depth: c.d.depth, from: 'chart', aheadNm: AHEAD_NM };
      });
    };
    tick();
    const t = window.setInterval(tick, 5_000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [shallowOn]);

  // Hide the banner after a while ("now" sooner).
  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => setBanner(undefined), banner.kind === 'now' ? 15_000 : 30_000);
    return () => window.clearTimeout(t);
  }, [banner]);

  // Browsers play sound only after a tap: the first tap during a race unlocks it.
  useEffect(() => {
    if (!on || !profile?.types.length || settings.alerts.sound === 'off' || audioOk) return;
    // Unlock inside the tap (browsers need that), but hide the «Ενεργοποίηση ήχου» line only after
    // the tap's click: removing it at pointerdown moves the screen up and the click misses its button.
    let done = false;
    let timer: number | undefined;
    const apply = (ok: boolean) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      document.removeEventListener('click', afterClick);
      setAudioOk(ok);
    };
    let ok = false;
    const afterClick = () => window.setTimeout(() => apply(ok), 0);
    const onTap = () => {
      ok = unlockAudio() && audioReady();
      document.addEventListener('click', afterClick, { once: true });
      // A tap that never becomes a click (a scroll, a long press): hide it a moment later.
      timer = window.setTimeout(() => apply(ok), 1000);
    };
    document.addEventListener('pointerdown', onTap, { once: true });
    return () => {
      done = true;
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', onTap);
      document.removeEventListener('click', afterClick);
    };
  }, [on, profile?.types.length, settings.alerts.sound, audioOk]);

  const now = Date.now();
  const muteLeft = Math.max(0, Math.round((engine.current.muteUntil - now) / 1000));
  const toggleMute = useCallback(() => {
    const e = engine.current;
    e.muteUntil = isMuted(e, Date.now()) ? 0 : Date.now() + MUTE_MS;
    setTick((v) => v + 1);
  }, []);
  const announce = useCallback((a: Alert) => {
    const s = latest.current.settings;
    const p = latest.current.profile;
    const e = engine.current;
    const muted = isMuted(e, a.at);
    e.last = a.at;
    setBanner({ ...a, muted });
    if (!muted) notify(a, { ...s.alerts, sound: p ? soundFor(p, s.alerts.sound) : s.alerts.sound });
  }, []);
  const enableAudio = useCallback(() => {
    unlockAudio();
    window.setTimeout(() => setAudioOk(audioReady()), 50);
  }, []);

  return (
    <Ctx.Provider
      value={{ banner, dismiss: () => setBanner(undefined), muteLeft, toggleMute, audioOk, enableAudio, lay, markInSec, layInSec, profile, pct15, pendingManoeuvre, announce }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAlerts(): AlertsState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAlerts outside AlertsProvider');
  return c;
}

export const mmss = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Full-width alert band, always in the same place, in every tab (P-023). */
export function AlertBanner() {
  const a = useAlerts();
  const b = a.banner;
  if (!b) return null;
  const how = b.muted ? 'σε σίγαση' : '';
  return (
    <button type="button" className={`alert-band ${b.kind}`} aria-live="assertive" onClick={a.dismiss}>
      <span className="big">{b.big}</span>
      <span className="sub">{b.sub}</span>
      <span className="meta">
        {new Date(b.at).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        {how && ` · ${how}`} · πάτα για απόκρυψη
      </span>
    </button>
  );
}
