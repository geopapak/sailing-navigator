import { useMemo } from 'react';
import { useApp } from './AppContext';
import { useNav } from './NavContext';
import { useInstruments } from './InstrumentsContext';
import { useRace } from './RaceContext';
import { laylines, type LaylineResult } from '../nav/laylines';
import { optimums } from '../performance/polar';
import { gridField } from '../weather/field';
import { meanWind } from '../weather/windAverage';
import { laylineWind } from '../race/manualWind';
import { readLiveState, useSessionMarks } from './useSession';

export interface LaylineView {
  result: LaylineResult;
  /** Where the wind came from: the measured mean (P-018), the forecast here, or the session's manual wind (P-053). */
  wind: 'measured' | 'forecast' | 'manual';
  tws: number;
  twd: number;
}

/**
 * Laylines to the next mark (P-019; the session's mark, P-034): the session's manual wind as
 * it is now (P-053, never the 4′ mean), else the measured mean wind (P-018), else the
 * instruments now, else the forecast. A session without any wind: the forecast only.
 */
export function useLaylines(): LaylineView | undefined {
  const { activeBoat: boat } = useApp();
  const nav = useNav();
  const inst = useInstruments();
  const session = useRace().session;
  const fix = nav.gps.fix;
  // P-034: the running session's marks; the Χάρτης course only outside a session.
  const { mark } = useSessionMarks();
  const field = useMemo(() => (nav.forecast ? gridField(nav.forecast) : undefined), [nav.forecast]);
  if (!boat?.polar || !fix || !mark) return undefined;
  const iv = inst.live ? inst.values : {};
  const manual = session?.manualWind;
  // P-053 AC 47: no instruments, manual off, never typed in «Γρήγορη ματιά» → the forecast only.
  const noWind = !!session && !manual?.on && iv.tws === undefined && typeof readLiveState()?.windTypedAt !== 'number';
  const fw = field?.at(fix.lat, fix.lon, Date.now());
  const wind = laylineWind({ manual, mean: meanWind(), inst: iv, forecast: fw, noWind });
  if (!wind || wind.tws < 1) return undefined;
  const o = optimums(boat.polar, wind.tws);
  const moving = fix.cog !== undefined && (fix.sog ?? 0) >= 1;
  const result = laylines({
    pos: fix,
    mark,
    twd: wind.twd,
    beatAngle: o.beat.angle,
    gybeAngle: o.run.angle,
    course: moving ? fix.cog : undefined,
    speed: moving ? fix.sog : undefined,
  });
  return { result, ...wind };
}
