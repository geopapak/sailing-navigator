import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { deleteRace as dbDelete, listRaces, saveRace } from '../boat/store';
import type { Race, RaceFix, SessionKind, TrackPoint } from '../race/types';
import { kindOf, recordFrom, shouldWritePoint, stallMinutes, trackEveryMs } from '../race/session';
import { estimateRace, type EstimateRow, type Wind } from '../race/estimate';
import { getLiveSnapshot } from '../ai/snapshot';
import { computeLive } from '../performance/targets';
import { gridField } from '../weather/field';
import { accountApi, ApiError } from '../sync/api';
import { useApp } from './AppContext';
import { useNav } from './NavContext';
import { useInstruments } from './InstrumentsContext';
import { DEFAULT_SERVER } from './settings';
import { useStoredState, useWakeLock } from './hooks';
import { trackGap } from '../race/gaps';
import { isPaused, pauseAt, resumeAt } from '../race/pauses';

export type WindSource = 'instruments' | 'live' | 'forecast';

interface RaceState {
  races: Race[];
  active?: Race;
  activeId?: string;
  setActiveId: (id: string | undefined) => void;
  save: (r: Race) => Promise<void>;
  update: (patch: Partial<Race> | ((r: Race) => Partial<Race>)) => void;
  /** Changes one saved session (e.g. the crew share state after it reached the server) and stores it. */
  patchRace: (id: string, patch: Partial<Race>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  addFix: (f: RaceFix) => void;
  /** Live leaderboard of the active race. */
  rows: EstimateRow[];
  wind?: Wind & { source: WindSource };
  ais: { status: 'off' | 'ok' | 'nokey' | 'error'; message?: string; at?: number };
  recording: boolean;
  /** Race mode (P-013): the screen is kept on in every tab while recording. */
  wakeOn: boolean;
  /** Minutes without a new track point while recording (no GPS, or the page was asleep). */
  stalledMin?: number;
  /** Last gap found when coming back to the app (screen locked / app in background). */
  gap?: { minutes: number; at: number };
  /** Recording has begun but no position has come in yet. */
  waitingGps: boolean;
  dismissGap: () => void;
  /** The session ("έξοδος", P-033) that is running now, if any: the active race with status 'running'. */
  session?: Race;
  /** Kind of the running session. */
  kind?: SessionKind;
  /** Track interval of the running session (ms). */
  everyMs: number;
  /** The running session is paused (P-039): no track, no alerts, the screen may sleep. */
  paused: boolean;
  /** «⏸ Παύση» / «▶ Συνέχεια» (training and cruise only). Saved at once. */
  pause: () => void;
  resume: () => void;
  /** The races of this account have been read from the device. */
  loaded: boolean;
  /** Session that has just ended: shown as «νέα» in the history. */
  freshId?: string;
  setFreshId: (id: string | undefined) => void;
  /** Saving to the device failed (the session goes on in memory). */
  saveError?: string;
  retrySave: () => void;
}

const Ctx = createContext<RaceState | null>(null);

/** The recording timer ticks every 5″; each kind writes a point every 5″, 15″ or 30″. */
const TRACK_EVERY_MS = 5_000;
const OWN_FIX_EVERY_MS = 30_000;
const AISSTREAM_EVERY_MS = 2 * 60_000;
const SAVE_EVERY_MS = 15_000;

/**
 * The race being sailed: records our track (instruments or phone GPS plus the
 * Live numbers), collects opponents' positions (boat AIS, aisstream.io, manual)
 * and keeps the corrected-time estimate up to date.
 */
export function RaceProvider({ children }: { children: ReactNode }) {
  const { settings, account, activeBoat } = useApp();
  const nav = useNav();
  const inst = useInstruments();
  const [races, setRaces] = useState<Race[]>([]);
  const [ui, setUi] = useStoredState<{ activeId?: string; freshId?: string }>('race-ui', {});
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [ais, setAis] = useState<RaceState['ais']>({ status: 'off' });
  const [tick, setTick] = useState(0);
  const dirty = useRef(false);
  const racesRef = useRef<Race[]>([]);
  racesRef.current = races;

  // Each account sees only its own races on a shared phone (P-014).
  useEffect(() => {
    setLoaded(false);
    listRaces(account?.id)
      .then(setRaces)
      .finally(() => setLoaded(true));
  }, [account?.id]);

  // A running session always opens again (after a reload or when the app was closed).
  useEffect(() => {
    if (!loaded) return;
    const cur = races.find((r) => r.id === ui.activeId);
    if (cur?.status === 'running') return;
    const run = races.filter((r) => r.status === 'running').sort((a, b) => b.start - a.start)[0];
    if (run) setUi((u) => ({ ...u, activeId: run.id }));
  }, [loaded, races, ui.activeId, setUi]);

  const active = races.find((r) => r.id === ui.activeId);
  const activeRef = useRef(active);
  activeRef.current = active;

  const save = useCallback(async (r0: Race) => {
    const r = r0.owner || !account?.id ? r0 : { ...r0, owner: account.id };
    // Keep it in memory even when the device refuses to store it (the session goes on).
    setRaces((list) => [r, ...list.filter((x) => x.id !== r.id)].sort((a, b) => b.start - a.start));
    try {
      await saveRace(r);
      setSaveError(undefined);
    } catch (e) {
      dirty.current = true;
      setSaveError((e as Error).message || 'save failed');
      throw e;
    }
  }, [account?.id]);

  const update = useCallback((patch: Partial<Race> | ((r: Race) => Partial<Race>)) => {
    const id = activeRef.current?.id;
    if (!id) return;
    setRaces((list) => list.map((r) => (r.id === id ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch), updatedAt: Date.now() } : r)));
    dirty.current = true;
  }, []);

  const remove = useCallback(async (id: string) => {
    await dbDelete(id);
    setRaces((list) => list.filter((r) => r.id !== id));
    if (ui.activeId === id) setUi((u) => ({ freshId: u.freshId }));
  }, [setUi, ui.activeId]);

  const patchRace = useCallback(
    async (id: string, patch: Partial<Race>) => {
      const cur = racesRef.current.find((r) => r.id === id);
      if (cur) await save({ ...cur, ...patch, updatedAt: Date.now() });
    },
    [save],
  );

  const addFix = useCallback((f: RaceFix) => update((r) => ({ fixes: [...r.fixes, f] })), [update]);

  // Persist the active race now and then (and when leaving the page).
  const flushRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    const flush = () => {
      const r = activeRef.current;
      if (dirty.current && r) {
        dirty.current = false;
        saveRace(r).then(
          () => setSaveError(undefined),
          (e: Error) => {
            dirty.current = true;
            setSaveError(e.message || 'save failed');
          },
        );
      }
    };
    flushRef.current = flush;
    const t = window.setInterval(flush, SAVE_EVERY_MS);
    window.addEventListener('pagehide', flush);
    return () => {
      flush();
      window.clearInterval(t);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  const running = active?.status === 'running';
  const kind = running && active ? kindOf(active) : undefined;
  const everyMs = trackEveryMs(kind ?? 'race', settings.cruiseTrackSec);
  const paused = running && !!active && isPaused(active);
  const recording = running && !!active && !paused && Date.now() >= recordFrom(active);
  // A session needs the position: start the phone's GPS when one starts (a user action,
  // so a permission prompt appears then) or opens again after a reload.
  const { requestGps } = nav;
  useEffect(() => {
    if (running) requestGps();
  }, [running, requestGps]);

  // Race mode (P-013): keep the screen on in every tab, and notice holes in the track.
  const wakeOn = useWakeLock(!!recording);
  const [gap, setGap] = useState<{ minutes: number; at: number }>();
  useEffect(() => {
    if (!recording) {
      setGap(undefined);
      return;
    }
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const r = activeRef.current;
      const g = r && r.track.length ? trackGap(r, Date.now()) : 0;
      if (g >= 1) setGap({ minutes: g, at: Date.now() });
      setTick((x) => x + 1);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [recording]);
  const waitingGps = !!recording && !!active && active.track.length === 0;
  const stalled = recording && active && !waitingGps ? trackGap(active, Date.now(), stallMinutes(everyMs)) : 0;

  // Wind for the estimate: instruments, else what the crew has in Live, else the forecast here.
  const live = getLiveSnapshot(5);
  const iv = inst.values;
  const fix = nav.gps.fix;
  const field = useMemo(() => (nav.forecast ? gridField(nav.forecast) : undefined), [nav.forecast]);
  let wind: RaceState['wind'];
  if (inst.live && iv.tws !== undefined && iv.twd !== undefined) wind = { tws: iv.tws, twd: iv.twd, source: 'instruments' };
  else if (live?.ctx.live && live.ctx.nav?.observedTwd !== undefined) wind = { tws: live.ctx.live.tws, twd: live.ctx.nav.observedTwd, source: 'live' };
  else if (field && (fix || active?.marks[0])) {
    const p = fix ?? active!.marks[0];
    const w = field.at(p.lat, p.lon, Date.now());
    wind = { tws: w.tws, twd: w.twd, source: 'forecast' };
  }

  // Recording: our track every 5 s, our fix every 30 s, opponents seen by the boat's AIS.
  const lastOwnFix = useRef(0);
  // Latest readings, read by the timer (so it does not restart on every reading).
  const latest = useRef({ fix: nav.gps.fix, inst, boat: activeBoat, cruiseSec: settings.cruiseTrackSec });
  latest.current = { fix: nav.gps.fix, inst, boat: activeBoat, cruiseSec: settings.cruiseTrackSec };
  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => {
      setTick((x) => x + 1);
      const r = activeRef.current;
      if (!r || r.status !== 'running' || isPaused(r)) return;
      const now = Date.now();
      const { fix: f, inst, boat, cruiseSec } = latest.current;
      const snap = getLiveSnapshot(2)?.ctx.live;
      const add: Partial<Race> = {};
      const k = kindOf(r);
      const lastT = r.track.length ? r.track[r.track.length - 1].t : undefined;
      if (f && now >= recordFrom(r) && shouldWritePoint(lastT, now, trackEveryMs(k, cruiseSec))) {
        const v = inst.live ? inst.values : {};
        // Targets from the polar with the instruments' numbers; else what Live last computed.
        const calc =
          boat?.polar && v.tws !== undefined && v.twa !== undefined ? computeLive(boat, { tws: v.tws, twa: v.twa, bsp: v.bsp }) : null;
        const p: TrackPoint = {
          t: now,
          lat: f.lat,
          lon: f.lon,
          sog: f.sog,
          cog: f.cog,
          tws: v.tws ?? snap?.tws,
          twa: v.twa ?? snap?.twa,
          twd: v.twd,
          bsp: v.bsp ?? snap?.bsp,
          targetBsp: calc ? calc.targetBsp : snap?.targetBsp,
          targetTwa: calc ? calc.targetTwa : snap?.targetTwa,
          pct: calc ? calc.pctTarget : snap?.pctTarget,
          sail: snap?.currentSail,
          src: inst.live ? 'instruments' : 'phone',
        };
        add.track = [...r.track, p];
        // Fixes (for the leaderboard) only in a race; training and cruise keep just the track.
        if (k === 'race' && now - lastOwnFix.current >= OWN_FIX_EVERY_MS) {
          const own = r.entries.find((e) => e.own);
          if (own) add.fixes = [...r.fixes, { entryId: own.id, t: now, lat: f.lat, lon: f.lon, source: 'own' }];
          lastOwnFix.current = now;
        }
      }
      // Boat AIS: newer reports of entries with an MMSI.
      const fixes = add.fixes ?? r.fixes;
      const newer: RaceFix[] = [];
      for (const e of k === 'race' ? r.entries : []) {
        if (!e.mmsi || e.own) continue;
        const a = inst.ais.find((x) => x.mmsi === e.mmsi);
        if (!a || a.lat === undefined || a.lon === undefined) continue;
        const last = fixes.filter((x) => x.entryId === e.id).reduce((m, x) => Math.max(m, x.t), 0);
        if (a.at > last + 1000) newer.push({ entryId: e.id, t: a.at, lat: a.lat, lon: a.lon, source: 'ais' });
      }
      if (newer.length) add.fixes = [...fixes, ...newer];
      if (add.track || add.fixes) update(add);
    }, TRACK_EVERY_MS);
    return () => window.clearInterval(t);
  }, [recording, update]);

  // aisstream.io (over the internet) for entries with an MMSI, every 2 minutes.
  const mmsiKey = active?.entries.filter((e) => e.mmsi && !e.own).map((e) => e.mmsi).join(',') ?? '';
  useEffect(() => {
    if (!running || kind !== 'race' || !mmsiKey || !account || !settings.authToken) {
      setAis({ status: 'off' });
      return;
    }
    let stop = false;
    const poll = async () => {
      if (navigator.onLine === false) return;
      try {
        const r = await accountApi.ais(settings.aiUrl || DEFAULT_SERVER, settings.authToken, mmsiKey.split(','));
        if (stop) return;
        const race = activeRef.current;
        if (race && r.positions.length) {
          const add: RaceFix[] = [];
          for (const p of r.positions) {
            const e = race.entries.find((x) => x.mmsi === p.mmsi);
            if (!e) continue;
            const last = race.fixes.filter((x) => x.entryId === e.id).reduce((m, x) => Math.max(m, x.t), 0);
            if (p.t > last + 1000) add.push({ entryId: e.id, t: p.t, lat: p.lat, lon: p.lon, source: 'aisstream' });
          }
          if (add.length) update((x) => ({ fixes: [...x.fixes, ...add] }));
        }
        setAis({ status: 'ok', at: Date.now(), message: `${r.positions.length} θέσεις` });
      } catch (e) {
        if (stop) return;
        if (e instanceof ApiError && e.status === 501) {
          setAis({ status: 'nokey', message: 'Οι θέσεις AIS μέσω internet δεν έχουν ενεργοποιηθεί ακόμα.' });
          stop = true;
        } else setAis({ status: 'error', message: (e as Error).message });
      }
    };
    poll();
    const t = window.setInterval(() => !stop && poll(), AISSTREAM_EVERY_MS);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [running, kind, mmsiKey, account, settings.aiUrl, settings.authToken, update]);

  // Refresh the estimate also when not recording (e.g. viewing a planned race).
  useEffect(() => {
    if (recording) return;
    const t = window.setInterval(() => setTick((x) => x + 1), 15_000);
    return () => window.clearInterval(t);
  }, [recording]);

  const windKey = wind ? `${wind.source}:${Math.round(wind.tws * 2)}:${Math.round(wind.twd / 5)}` : '';
  const rows = useMemo(
    () => (active ? estimateRace(active, wind, active.status === 'finished' ? active.finish : Date.now()) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, windKey, tick],
  );

  const togglePause = useCallback(
    (on: boolean) => {
      const r = activeRef.current;
      if (!r || r.status !== 'running') return;
      const p = on ? pauseAt(r, Date.now()) : resumeAt(r, Date.now());
      // Saved at once: a pause must survive the app being closed right after.
      if (p) save({ ...r, ...p, updatedAt: Date.now() }).catch(() => undefined);
    },
    [save],
  );

  return (
    <Ctx.Provider
      value={{
        races,
        active,
        activeId: ui.activeId,
        setActiveId: (id) => setUi((u) => ({ ...u, activeId: id })),
        save,
        update,
        patchRace,
        remove,
        addFix,
        rows,
        wind,
        ais,
        recording: !!recording,
        wakeOn,
        stalledMin: stalled > 0 ? stalled : undefined,
        gap,
        waitingGps,
        dismissGap: () => setGap(undefined),
        session: running ? active : undefined,
        kind,
        everyMs,
        paused,
        pause: () => togglePause(true),
        resume: () => togglePause(false),
        loaded,
        freshId: ui.freshId,
        setFreshId: (id) => setUi((u) => ({ ...u, freshId: id })),
        saveError,
        retrySave: () => {
          dirty.current = true;
          flushRef.current();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useRace(): RaceState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useRace outside RaceProvider');
  return c;
}
