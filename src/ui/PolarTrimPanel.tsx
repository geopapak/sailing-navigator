import { useState } from 'react';
import { useApp } from './AppContext';
import { openTab } from './openTab';
import { useLiveNumbers } from './useSession';
import { LIVE_TEXT } from './sessionText';
import { polarSpeed } from '../performance/polar';
import { sailOutlook } from '../performance/sails';
import { adviceFor } from '../performance/advice';

const f1 = (v: number) => v.toFixed(1).replace('.', ',');
/** Reaching target shown in the panel (prototype: «ανοιχτά · 110°»). */
const REACH_TWA = 110;

/** «Polar και τριμάρισμα ▾» inside a session (P-034): targets for the wind now, head sail and trim. */
export function PolarTrimPanel() {
  const { activeBoat: boat } = useApp();
  const n = useLiveNumbers();
  const [open, setOpen] = useState(false);
  const r = n.result;
  const outlook = open && boat && r ? sailOutlook(boat, r.tws, r.twa) : undefined;
  const trim = open && r && outlook ? adviceFor(r, outlook).find((a) => a.level !== 'ok')?.text ?? adviceFor(r, outlook)[0]?.text : undefined;
  const reach = boat?.polar && r ? polarSpeed(boat.polar, r.tws, REACH_TWA) * (boat.performanceFactor || 1) : undefined;
  return (
    <>
      <button type="button" className="exp-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{LIVE_TEXT.polarTrim}</span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <section className="card exp-body">
          {!boat?.polar ? (
            <p className="small">{LIVE_TEXT.noPolar}</p>
          ) : !r ? (
            <p className="small">{LIVE_TEXT.noWind}</p>
          ) : (
            <>
              <b>{LIVE_TEXT.targetsFor(String(Math.round(r.tws)))}</b>
              <div className="bl-mini">
                <div>
                  <b>{f1(r.beat.bsp)}</b>
                  <span className="small muted">όρτσα κν · {Math.round(r.beat.angle)}°</span>
                </div>
                <div>
                  <b>{reach === undefined ? '—' : f1(reach)}</b>
                  <span className="small muted">ανοιχτά κν · {REACH_TWA}°</span>
                </div>
                <div>
                  <b>{f1(r.run.bsp)}</b>
                  <span className="small muted">πρίμα κν · {Math.round(r.run.angle)}°</span>
                </div>
              </div>
              <p className="small">
                <b>{LIVE_TEXT.sail}:</b> {outlook?.recommended?.name ?? '—'}
                {trim && (
                  <>
                    {' · '}
                    <b>{LIVE_TEXT.trim}:</b> {trim}
                  </>
                )}
              </p>
            </>
          )}
          <button type="button" className="btn" onClick={() => openTab('polar')}>
            {LIVE_TEXT.wholePolar}
          </button>
        </section>
      )}
    </>
  );
}
