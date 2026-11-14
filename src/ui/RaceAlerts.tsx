import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MUTE_MS, isMuted, newEngine, profileFor, soundFor, step, type Alert, type AlertProfile, type Situation } from '../race/alerts';
import { meanPct, pushPct, type PctSample } from '../race/liveNumbers';
import { newManoeuvres, recoveryDone, recoverySec } from '../race/training';
import type { Manoeuvre } from '../race/types';
import { stallMinutes } from '../race/session';
import { distanceNm } from '../nav/geo';
import { meanWind, pushWind, type WindReading } from '../weather/windAverage';
import { useApp } from './AppContext';
import { useNav } from './NavContext';
import { useInstruments } from './InstrumentsContext';
import { useRace } from './RaceContext';
import { useLaylines, type LaylineView } from './useLaylines';
import { useLiveNumbers, useSessionMarks } from './useSession';
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
  // The engine runs while a session records (it also feeds the 15″ % mean); a cruise has no alerts yet.
  const on = !!kind;
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

  const latest = useRef({ settings, inst, lay, markInSec, layInSec, marks, profile, numbers, stalled, waitingFor, known });
  latest.current = { settings, inst, lay, markInSec, layInSec, marks, profile, numbers, stalled, waitingFor, known };

  useEffect(() => {
    // A new kind (training ↔ cruise) starts the engine afresh and hides the alert (AC 17).
    engine.current = newEngine();
    setBanner(undefined);
    instSamples.current = [];
    pctSamples.current = [];
    setPct15(undefined);
    manSamples.current = [];
    setPendingManoeuvre(undefined);
    if (!on) return;
    const since = Date.now();
    const training = kind === 'training';
    const writeMan = (m: Manoeuvre) => update((r) => ({ manoeuvres: [...(r.manoeuvres ?? []), m].sort((a, b) => a.t - b.t) }));
    const t = window.setInterval(() => {
      const { settings: s, inst: i, lay: l, markInSec: m, layInSec: li, marks: mk, profile: p, numbers: nb, stalled: st, waitingFor: wf } = latest.current;
      const now = Date.now();
      const lost = st || (wf !== undefined && now - since > wf);
      let instTwd: number | undefined;
      if (i.live && i.values.twd !== undefined && i.values.tws !== undefined) {
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
        };
        const a = step(engine.current, s.alerts, x, p);
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

  // Hide the banner after a while ("now" sooner).
  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => setBanner(undefined), banner.kind === 'now' ? 15_000 : 30_000);
    return () => window.clearTimeout(t);
  }, [banner]);

  // Browsers play sound only after a tap: the first tap during a race unlocks it.
  useEffect(() => {
    if (!on || !profile?.types.length || settings.alerts.sound === 'off' || audioOk) return;
    const onTap = () => setAudioOk(unlockAudio() && audioReady());
    document.addEventListener('pointerdown', onTap, { once: true });
    return () => document.removeEventListener('pointerdown', onTap);
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
  const how = b.muted ? '🔕 σε σίγαση' : '';
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
