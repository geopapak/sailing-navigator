import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { deleteRace as dbDelete, listRaces, saveRace } from '../boat/store';
import type { Race, RaceFix, TrackPoint } from '../race/types';
import { estimateRace, type EstimateRow, type Wind } from '../race/estimate';
import { getLiveSnapshot } from '../ai/snapshot';
import { computeLive } from '../performance/targets';
import { gridField } from '../weather/field';
import { accountApi, ApiError } from '../sync/api';
import { useApp } from './AppContext';
import { useNav } from './NavContext';
import { useInstruments } from './InstrumentsContext';
import { DEFAULT_SERVER } from './settings';
import { useStoredState } from './hooks';

export type WindSource = 'instruments' | 'live' | 'forecast';

interface RaceState {
  races: Race[];
  active?: Race;
  activeId?: string;
  setActiveId: (id: string | undefined) => void;
  save: (r: Race) => Promise<void>;
  update: (patch: Partial<Race> | ((r: Race) => Partial<Race>)) => void;
  remove: (id: string) => Promise<void>;
  addFix: (f: RaceFix) => void;
  /** Live leaderboard of the active race. */
  rows: EstimateRow[];
  wind?: Wind & { source: WindSource };
  ais: { status: 'off' | 'ok' | 'nokey' | 'error'; message?: string; at?: number };
  recording: boolean;
}

const Ctx = createContext<RaceState | null>(null);

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
  const [ui, setUi] = useStoredState<{ activeId?: string }>('race-ui', {});
  const [ais, setAis] = useState<RaceState['ais']>({ status: 'off' });
  const [tick, setTick] = useState(0);
  const dirty = useRef(false);
  const racesRef = useRef<Race[]>([]);
  racesRef.current = races;

  useEffect(() => {
    listRaces().then(setRaces);
  }, []);

  const active = races.find((r) => r.id === ui.activeId);
  const activeRef = useRef(active);
  activeRef.current = active;

  const save = useCallback(async (r: Race) => {
    await saveRace(r);
    setRaces((list) => [r, ...list.filter((x) => x.id !== r.id)].sort((a, b) => b.start - a.start));
  }, []);

  const update = useCallback((patch: Partial<Race> | ((r: Race) => Partial<Race>)) => {
    const id = activeRef.current?.id;
    if (!id) return;
    setRaces((list) => list.map((r) => (r.id === id ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch), updatedAt: Date.now() } : r)));
    dirty.current = true;
  }, []);

  const remove = useCallback(async (id: string) => {
    await dbDelete(id);
    setRaces((list) => list.filter((r) => r.id !== id));
    if (ui.activeId === id) setUi({});
  }, [setUi, ui.activeId]);

  const addFix = useCallback((f: RaceFix) => update((r) => ({ fixes: [...r.fixes, f] })), [update]);

  // Persist the active race now and then (and when leaving the page).
  useEffect(() => {
    const flush = () => {
      const r = activeRef.current;
      if (dirty.current && r) {
        dirty.current = false;
        saveRace(r);
      }
    };
    const t = window.setInterval(flush, SAVE_EVERY_MS);
    window.addEventListener('pagehide', flush);
    return () => {
      flush();
      window.clearInterval(t);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  const running = active?.status === 'running';
  const recording = running && Date.now() >= (active?.start ?? 0) - 10 * 60_000;

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
  const latest = useRef({ fix: nav.gps.fix, inst, boat: activeBoat });
  latest.current = { fix: nav.gps.fix, inst, boat: activeBoat };
  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => {
      setTick((x) => x + 1);
      const r = activeRef.current;
      if (!r || r.status !== 'running') return;
      const now = Date.now();
      const { fix: f, inst, boat } = latest.current;
      const snap = getLiveSnapshot(2)?.ctx.live;
      const add: Partial<Race> = {};
      if (f && now >= r.start - 10 * 60_000) {
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
        if (now - lastOwnFix.current >= OWN_FIX_EVERY_MS) {
          const own = r.entries.find((e) => e.own);
          if (own) add.fixes = [...r.fixes, { entryId: own.id, t: now, lat: f.lat, lon: f.lon, source: 'own' }];
          lastOwnFix.current = now;
        }
      }
      // Boat AIS: newer reports of entries with an MMSI.
      const fixes = add.fixes ?? r.fixes;
      const newer: RaceFix[] = [];
      for (const e of r.entries) {
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
    if (!running || !mmsiKey || !account || !settings.authToken) {
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
          setAis({ status: 'nokey', message: 'Ο server δεν έχει κλειδί aisstream.io.' });
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
  }, [running, mmsiKey, account, settings.aiUrl, settings.authToken, update]);

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

  return (
    <Ctx.Provider
      value={{
        races,
        active,
        activeId: ui.activeId,
        setActiveId: (id) => setUi({ activeId: id }),
        save,
        update,
        remove,
        addFix,
        rows,
        wind,
        ais,
        recording: !!recording,
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
