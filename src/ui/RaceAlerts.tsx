import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { MUTE_MS, isMuted, newEngine, step, type Alert, type Situation } from '../race/alerts';
import { distanceNm } from '../nav/geo';
import { meanWind, pushWind, type WindReading } from '../weather/windAverage';
import { useApp } from './AppContext';
import { useNav } from './NavContext';
import { useInstruments } from './InstrumentsContext';
import { useRace } from './RaceContext';
import { useLaylines, type LaylineView } from './useLaylines';
import { audioReady, notify, unlockAudio } from './sound';

/** Manoeuvre alerts while a race records (P-023): one engine for the whole app. */
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
  // Φ1 (P-033): manoeuvre alerts only in a race; training and cruise have none yet.
  const on = race.recording && race.kind === 'race';
  const engine = useRef(newEngine());
  const [banner, setBanner] = useState<AlertsState['banner']>();
  const [, setTick] = useState(0);
  const [audioOk, setAudioOk] = useState(audioReady());
  const instSamples = useRef<WindReading[]>([]);

  const fix = nav.gps.fix;
  const mark = nav.course?.marks[nav.nextMark];
  const markInSec =
    fix && mark && (fix.sog ?? 0) > 1 ? (distanceNm(fix, mark) / fix.sog!) * 3600 : undefined;
  const layInSec =
    lay && lay.result.leg !== 'reach' && lay.result.toLayMin !== undefined ? lay.result.toLayMin * 60 : undefined;

  const latest = useRef({ settings, nav, inst, lay, markInSec, layInSec });
  latest.current = { settings, nav, inst, lay, markInSec, layInSec };

  useEffect(() => {
    if (!on) {
      engine.current = newEngine();
      setBanner(undefined);
      instSamples.current = [];
      return;
    }
    const t = window.setInterval(() => {
      const { settings: s, nav: n, inst: i, lay: l, markInSec: m, layInSec: li } = latest.current;
      const now = Date.now();
      let instTwd: number | undefined;
      if (i.live && i.values.twd !== undefined && i.values.tws !== undefined) {
        const r: WindReading = { t: now, tws: i.values.tws, twd: i.values.twd, from: 'instruments' };
        // Also feeds the few-minute mean used by laylines and re-routing, in every tab.
        pushWind(r);
        instSamples.current = [...instSamples.current.filter((q) => q.t >= now - SHIFT_WINDOW_MS), r];
        // Need most of the window before judging a shift.
        if (instSamples.current.length >= 6) instTwd = meanWind(now, SHIFT_WINDOW_MS, instSamples.current)?.twd;
      } else instSamples.current = [];
      const marks = n.course?.marks ?? [];
      const x: Situation = {
        now,
        markIndex: n.nextMark,
        markName: marks[n.nextMark]?.name ?? 'σημαδούρα',
        isFinish: marks.length > 1 && n.nextMark === marks.length - 1,
        leg: l?.result.leg,
        board: l?.result.board,
        layInSec: li,
        markInSec: m,
        instTwd,
      };
      const a = step(engine.current, s.alerts, x);
      if (a) {
        const muted = isMuted(engine.current, now);
        setBanner({ ...a, muted });
        if (!muted) notify(a, s.alerts);
      }
      setTick((v) => v + 1);
    }, STEP_MS);
    return () => window.clearInterval(t);
  }, [on]);

  // Hide the banner after a while ("now" sooner).
  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => setBanner(undefined), banner.kind === 'now' ? 15_000 : 30_000);
    return () => window.clearTimeout(t);
  }, [banner]);

  // Browsers play sound only after a tap: the first tap during a race unlocks it.
  useEffect(() => {
    if (!on || settings.alerts.sound === 'off' || audioOk) return;
    const onTap = () => setAudioOk(unlockAudio() && audioReady());
    document.addEventListener('pointerdown', onTap, { once: true });
    return () => document.removeEventListener('pointerdown', onTap);
  }, [on, settings.alerts.sound, audioOk]);

  const now = Date.now();
  const muteLeft = Math.max(0, Math.round((engine.current.muteUntil - now) / 1000));
  const toggleMute = useCallback(() => {
    const e = engine.current;
    e.muteUntil = isMuted(e, Date.now()) ? 0 : Date.now() + MUTE_MS;
    setTick((v) => v + 1);
  }, []);
  const enableAudio = useCallback(() => {
    unlockAudio();
    window.setTimeout(() => setAudioOk(audioReady()), 50);
  }, []);

  return (
    <Ctx.Provider
      value={{ banner, dismiss: () => setBanner(undefined), muteLeft, toggleMute, audioOk, enableAudio, lay, markInSec, layInSec }}
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
        {how && ` · ${how}`} · πάτα για κλείσιμο
      </span>
    </button>
  );
}
