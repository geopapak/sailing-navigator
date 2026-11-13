import { useMemo } from 'react';
import { useApp } from './AppContext';
import { useNav } from './NavContext';
import { useInstruments } from './InstrumentsContext';
import { laylines, type LaylineResult } from '../nav/laylines';
import { optimums } from '../performance/polar';
import { gridField } from '../weather/field';
import { meanWind } from '../weather/windAverage';
import { useSessionMarks } from './useSession';

export interface LaylineView {
  result: LaylineResult;
  /** Where the wind came from: the measured mean (P-018) or the forecast here. */
  wind: 'measured' | 'forecast';
  tws: number;
  twd: number;
}

/** Laylines to the next mark (P-019; the session's mark, P-034): measured mean wind (P-018), else the instruments now, else the forecast. */
export function useLaylines(): LaylineView | undefined {
  const { activeBoat: boat } = useApp();
  const nav = useNav();
  const inst = useInstruments();
  const fix = nav.gps.fix;
  // P-034: the running session's marks; the Χάρτης course only outside a session.
  const { mark } = useSessionMarks();
  const field = useMemo(() => (nav.forecast ? gridField(nav.forecast) : undefined), [nav.forecast]);
  if (!boat?.polar || !fix || !mark) return undefined;
  const m = meanWind();
  let wind: Pick<LaylineView, 'wind' | 'tws' | 'twd'> | undefined;
  const iv = inst.live ? inst.values : {};
  if (m) wind = { wind: 'measured', tws: m.tws, twd: m.twd };
  else if (iv.tws !== undefined && iv.twd !== undefined) wind = { wind: 'measured', tws: iv.tws, twd: iv.twd };
  else if (field) {
    const w = field.at(fix.lat, fix.lon, Date.now());
    wind = { wind: 'forecast', tws: w.tws, twd: w.twd };
  }
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
