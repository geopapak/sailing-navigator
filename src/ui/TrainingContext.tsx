import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from './AppContext';
import { useRace } from './RaceContext';
import { useAlerts } from './RaceAlerts';
import { getLiveSail } from './LiveView';
import { flashSession } from './sessionFlash';
import { startAlert } from '../race/alerts';
import { kindOf } from '../race/session';
import { addLap, liveLaps, LAP_UNDO_MS, mss, undoLap } from '../race/training';
import type { Lap } from '../race/types';

/**
 * Training in memory (P-035): the «Γύρος» button with its 5″ undo, and the
 * «Εκκινήσεις» countdown. Both stop in a pause and go on from where they were.
 */
interface TrainingState {
  /** «⏱ Γύρος»: closes the running lap, starts the next. */
  lap: () => void;
  /** Seconds left of «↶ Αναίρεση» (0: none). */
  undoLeft: number;
  undo: () => void;
  /** Start practice: ms left (undefined: not started; 0: the start has gone). */
  cdLeft?: number;
  /** «▶ Αντίστροφη 5′» / «↺ Από 5′». */
  cdStart: () => void;
  /** «Συγχρ. λεπτού»: to the nearest whole minute. */
  cdSync: () => void;
}

const Ctx = createContext<TrainingState | null>(null);
export const COUNTDOWN_MS = 5 * 60_000;

type Countdown = { endsAt?: number; leftMs: number; oneMin: boolean };

export function TrainingProvider({ children }: { children: ReactNode }) {
  const { activeBoat, settings } = useApp();
  const race = useRace();
  const { announce } = useAlerts();
  const r = race.session;
  const training = !!r && kindOf(r) === 'training';
  const paused = race.paused;
  const [undoState, setUndoState] = useState<{ until: number; prev: Lap[] | undefined }>();
  const [cd, setCd] = useState<Countdown>();
  const [, setTick] = useState(0);
  const rRef = useRef(r);
  rRef.current = r;

  // A new session (or none) forgets the undo and the countdown.
  useEffect(() => {
    setUndoState(undefined);
    setCd(undefined);
  }, [r?.id]);

  const lap = useCallback(
    (auto = false) => {
      const cur = rRef.current;
      if (!cur || kindOf(cur) !== 'training' || race.paused) return false;
      const now = Date.now();
      const sailId = getLiveSail();
      const sail = activeBoat?.sails.find((s) => s.id === sailId)?.name;
      // The new lap: the sail of the Live; `addLap` carries over the helm of the lap before.
      const p = addLap(cur, now, sail ? { sail } : {});
      if (!p) return false;
      race.update(p);
      try {
        if (navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate(80);
      } catch {
        /* no vibration */
      }
      const done = liveLaps({ ...cur, ...p }, now).done;
      const closed = done[done.length - 1];
      if (!auto && closed) flashSession(`Γύρος ${closed.n}: ${mss(closed.sec)}`);
      setUndoState({ until: now + LAP_UNDO_MS, prev: cur.laps });
      return true;
    },
    [activeBoat, race],
  );

  const undo = useCallback(() => {
    const cur = rRef.current;
    if (!cur || !undoState || Date.now() > undoState.until) return;
    // Drop only the last lap limit; a note written in the 5″ stays.
    const p = undoLap(cur);
    if (p) race.update(p);
    setUndoState(undefined);
    flashSession('Ο γύρος αναιρέθηκε');
  }, [race, undoState]);

  // A pause cancels the lap undo and freezes the countdown; «Συνέχεια» goes on from there.
  useEffect(() => {
    if (paused) {
      setUndoState(undefined);
      setCd((c) => (c?.endsAt ? { ...c, endsAt: undefined, leftMs: Math.max(0, c.endsAt - Date.now()) } : c));
    } else setCd((c) => (c && !c.endsAt && c.leftMs > 0 ? { ...c, endsAt: Date.now() + c.leftMs } : c));
  }, [paused]);

  // Ticks: the undo countdown and the start countdown (1′ alert, then a new lap at 0).
  const lapRef = useRef(lap);
  lapRef.current = lap;
  const cdRef = useRef(cd);
  cdRef.current = cd;
  const alertOn = settings.training?.startCountdown !== false;
  const running = !!cd?.endsAt;
  useEffect(() => {
    if (!undoState && !running) return;
    const t = window.setInterval(() => {
      const now = Date.now();
      setUndoState((u) => (u && now > u.until ? undefined : u));
      const c = cdRef.current;
      if (c?.endsAt) {
        const left = c.endsAt - now;
        if (left <= 0) {
          setCd({ leftMs: 0, oneMin: true });
          lapRef.current(true);
        } else if (!c.oneMin && left <= 60_000) {
          if (alertOn) announce(startAlert(now));
          setCd({ ...c, oneMin: true, leftMs: left });
        } else setCd({ ...c, leftMs: left });
      }
      setTick((x) => x + 1);
    }, 250);
    return () => window.clearInterval(t);
  }, [undoState, running, announce, alertOn]);

  const cdStart = useCallback(() => {
    if (race.paused) return;
    setCd({ endsAt: Date.now() + COUNTDOWN_MS, leftMs: COUNTDOWN_MS, oneMin: false });
  }, [race.paused]);
  const cdSync = useCallback(() => {
    setCd((c) => {
      if (!c?.endsAt) return c;
      const left = Math.round((c.endsAt - Date.now()) / 60_000) * 60_000;
      return { ...c, endsAt: Date.now() + left, leftMs: left };
    });
  }, []);

  const undoLeft = undoState ? Math.max(0, Math.ceil((undoState.until - Date.now()) / 1000)) : 0;
  return (
    <Ctx.Provider
      value={{
        lap: () => void lap(false),
        undoLeft: training ? undoLeft : 0,
        undo,
        cdLeft: training && cd ? (cd.endsAt ? Math.max(0, cd.endsAt - Date.now()) : cd.leftMs) : undefined,
        cdStart,
        cdSync,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useTraining(): TrainingState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTraining outside TrainingProvider');
  return c;
}
