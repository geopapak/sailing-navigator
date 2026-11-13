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
import { buildLiveContext } from '../ai/context';
import { setLiveSnapshot } from '../ai/snapshot';
import type { NavSnapshot } from '../ai/types';

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
