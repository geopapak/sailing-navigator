import { useEffect, useMemo } from 'react';
import { useApp } from './AppContext';
import { useNav } from './NavContext';
import { useInstruments } from './InstrumentsContext';
import { useRace } from './RaceContext';
import { computeLive, type LiveResult } from '../performance/targets';
import { magToTrue, twaFromTwd } from '../performance/angles';
import { marksSource, nextMarkInfo, type MarksSource } from '../race/sessionMarks';
import { sailOutlook } from '../performance/sails';
import { adviceFor } from '../performance/advice';
import { boatInfo, buildLiveContext, localIso } from '../ai/context';
import { setLiveSnapshot } from '../ai/snapshot';
import type { AdvisorContext, NavSnapshot } from '../ai/types';
import { cruiseNext, destKey, destName, etaFrom, meanSog, pausedEta, remainingNm } from '../race/cruise';
import { distanceNm, type LatLon } from '../nav/geo';
import type { Mark } from '../routing/isochrones';

/** Marks of the running session, else the Χάρτης course (P-034: one source of marks). */
export function useSessionMarks(): MarksSource & ReturnType<typeof nextMarkInfo> {
  const nav = useNav();
  const r = useRace().session;
  // Rounding is re-checked when a point or a fix is added.
  const src = useMemo(
    () => marksSource(r, nav),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [r?.id, r?.marks, r?.track.length, r?.fixes.length, nav.course, nav.nextMark],
  );
  return { ...src, ...nextMarkInfo(src) };
}

/**
 * The wind typed in «Γρήγορη ματιά» (same `live-state` as LiveView), for the Live
 * inside a session without instruments: TWS and a signed TWA (port negative).
 */
export function getManualWind(cogTrue: number | undefined, o: { manualMagnetic: boolean; declination: number }): { tws?: number; twa?: number } {
  try {
    const s = { windInput: 'twa', tws: 10, twa: 42, side: 'stbd', twd: null, ...JSON.parse(localStorage.getItem('live-state') ?? '{}') } as {
      windInput: 'twa' | 'twd';
      tws: number | null;
      twa: number | null;
      side: 'stbd' | 'port';
      twd: number | null;
    };
    const tws = s.tws ?? undefined;
    if (s.windInput === 'twa') return { tws, twa: s.twa === null ? undefined : s.side === 'port' ? -s.twa : s.twa };
    if (s.twd === null || cogTrue === undefined) return { tws };
    return { tws, twa: twaFromTwd(o.manualMagnetic ? magToTrue(s.twd, o.declination) : s.twd, cogTrue) };
  } catch {
    return {};
  }
}

export interface LiveNumbers {
  /** Polar targets for the wind now; null without wind or polar. */
  result: LiveResult | null;
  /** Wind and speed come from the boat's instruments. */
  withInst: boolean;
  /** Speed: boat speed from the instruments, else speed over ground. */
  bsp?: number;
  bspFrom: 'BSP' | 'SOG';
  /** The wind is the one typed in by hand. */
  windManual: boolean;
}

/**
 * Numbers of the in-session Live (P-034): instruments first, else GPS speed and
 * the wind typed in «Γρήγορη ματιά».
 */
export function useLiveNumbers(): LiveNumbers {
  const { activeBoat: boat, settings } = useApp();
  const inst = useInstruments();
  const fix = useNav().gps.fix;
  const iv = inst.live ? inst.values : {};
  const manual = getManualWind(fix?.cog, settings);
  const tws = iv.tws ?? manual.tws;
  const twa = iv.twa ?? manual.twa;
  const bsp = iv.bsp ?? fix?.sog;
  const result = boat?.polar && tws !== undefined && twa !== undefined ? computeLive(boat, { tws, twa, bsp }) : null;
  return {
    result,
    withInst: inst.live && iv.tws !== undefined,
    bsp,
    bspFrom: iv.bsp !== undefined ? 'BSP' : 'SOG',
    windManual: iv.tws === undefined,
  };
}

/**
 * Keeps the advisor's live snapshot fresh from the in-session Live (training and
 * race), as LiveView does outside a session, so «Σύμβουλος» sees the Live numbers.
 */
export function usePublishLive(n: LiveNumbers) {
  const { activeBoat: boat } = useApp();
  const fix = useNav().gps.fix;
  const r = n.result;
  const key = r ? `${r.tws.toFixed(1)}|${Math.round(r.twa)}|${r.bsp?.toFixed(1)}|${fix?.lat.toFixed(3)}|${fix?.lon.toFixed(3)}` : '';
  useEffect(() => {
    if (!boat || !r) return;
    let sailId: string | undefined;
    try {
      sailId = (JSON.parse(localStorage.getItem('live-state') ?? '{}') as { sailId?: string }).sailId;
    } catch {
      /* ignore */
    }
    const outlook = sailOutlook(boat, r.tws, r.twa);
    const advice = adviceFor(r, { ...outlook, currentSailId: sailId, currentSailName: boat.sails.find((x) => x.id === sailId)?.name });
    const nav: NavSnapshot = {};
    // Rounded to ~100 m (P-030): the advisor needs the area, not the exact spot.
    const r3 = (x: number) => Math.round(x * 1000) / 1000;
    if (fix) nav.position = { lat: r3(fix.lat), lon: r3(fix.lon), sog: fix.sog, cogTrue: fix.cog };
    setLiveSnapshot(buildLiveContext({ boat, result: r, outlook, advice, currentSailId: sailId, nav }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boat?.id, key]);
}

export interface CruiseNav {
  /** Destination name; undefined: no destination. */
  name?: string;
  key?: string;
  marks: Mark[];
  /** Index of the mark we sail to (`marks.length`: all passed). */
  next: number;
  /** Where we are: the GPS now, else the last track point. */
  pos?: LatLon;
  hasFix: boolean;
  /** Distance left along the route (the last known without GPS). */
  leftNm?: number;
  /** Straight distance to the destination once on the last leg (for «άφιξη»). */
  toLastNm?: number;
  /** ETA from the 10′ mean SOG; frozen while paused. */
  eta?: { at: number; sec: number };
}

/**
 * The last live ETA, shared by every view (Live, Χάρτης, bar), so a pause freezes the
 * same value everywhere, whichever tab is open (P-036 «Παύση»).
 */
let liveEta: { id: string; key?: string; eta?: CruiseNav['eta'] } | undefined;

/** Destination, distance left and ETA of the running session (P-036). */
export function useCruiseNav(): CruiseNav {
  const race = useRace();
  const fix = useNav().gps.fix;
  const r = race.session;
  const marks = r?.marks ?? [];
  const trackLen = r?.track.length ?? 0;
  const next = useMemo(
    () => (r && marks.length ? cruiseNext(fix ? [...r.track, fix] : r.track, marks) : 0),
    // The fix moves the next mark on only near a mark; re-checked every point and every fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [r?.id, marks, trackLen, fix?.lat, fix?.lon],
  );
  if (!r || !marks.length) return { marks, next: 0, hasFix: !!fix };
  const last = r.track[r.track.length - 1];
  const pos: LatLon | undefined = fix ?? (last ? { lat: last.lat, lon: last.lon } : undefined);
  const leftNm = pos ? remainingNm(pos, marks, next) : undefined;
  const toLastNm = pos && next >= marks.length - 1 ? distanceNm(pos, marks[marks.length - 1]) : undefined;
  const key = destKey(r);
  let eta: CruiseNav['eta'];
  if (race.paused) {
    // The value shown when the pause began; after a reload (or a new destination) the same
    // ETA again from the track before the pause.
    const from = r.pauses?.[r.pauses.length - 1]?.from ?? Date.now();
    eta = liveEta?.id === r.id && liveEta.key === key ? liveEta.eta : pausedEta(r.track, marks, next, from);
  } else {
    if (fix && leftNm !== undefined) {
      const now = Date.now();
      eta = etaFrom(leftNm, meanSog(r.track, now, undefined, fix.sog), now);
    }
    liveEta = { id: r.id, key, eta };
  }
  return { name: destName(r), key, marks, next, pos, hasFix: !!fix, leftNm, toLastNm, eta };
}

/**
 * Keeps the advisor's live snapshot fresh from the cruise Live (P-036): SOG, COG, depth
 * and the destination's distance and ETA, plus the polar numbers when there are any,
 * so «Σύμβουλος» has «Live» on a cruise as on the other kinds. Position rounded (P-030).
 */
export function usePublishCruise(n: LiveNumbers, depth: { m?: number; from?: 'sounder' | 'chart' }) {
  const { activeBoat: boat } = useApp();
  const fix = useNav().gps.fix;
  const c = useCruiseNav();
  const paused = useRace().paused;
  const r = n.result;
  const r1 = (x?: number) => (x === undefined || !Number.isFinite(x) ? undefined : Math.round(x * 10) / 10);
  const key = [
    fix?.lat.toFixed(3),
    fix?.lon.toFixed(3),
    r1(fix?.sog),
    fix?.cog === undefined ? '' : Math.round(fix.cog),
    c.name,
    r1(c.leftNm),
    c.eta ? Math.round(c.eta.at / 60_000) : '',
    paused,
    r1(depth.m),
    depth.from,
    r ? `${r.tws.toFixed(1)}|${Math.round(r.twa)}|${r.bsp?.toFixed(1)}` : '',
  ].join('|');
  useEffect(() => {
    const r3 = (x: number) => Math.round(x * 1000) / 1000;
    const nav: NavSnapshot = {};
    if (fix) nav.position = { lat: r3(fix.lat), lon: r3(fix.lon), sog: r1(fix.sog), cogTrue: fix.cog === undefined ? undefined : Math.round(fix.cog) };
    nav.cruise = {
      destination: c.name,
      distanceNm: r1(c.leftNm),
      eta: c.eta ? localIso(c.eta.at) : undefined,
      paused: paused || undefined,
      depthM: r1(depth.m),
      depthFrom: depth.m === undefined ? undefined : depth.from,
    };
    const ctx: AdvisorContext =
      boat && r
        ? { ...buildLiveContext({ boat, result: r, outlook: sailOutlook(boat, r.tws, r.twa), advice: [], nav }), nav }
        : { kind: 'live', now: localIso(Date.now()), boat: boat ? boatInfo(boat) : { name: '', performanceFactor: 1, sails: [] }, nav };
    setLiveSnapshot(ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boat?.id, key]);
}
