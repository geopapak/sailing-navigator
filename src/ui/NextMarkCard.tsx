import { useApp } from './AppContext';
import { useNav } from './NavContext';
import { bearingDeg, distanceNm, vmc } from '../nav/geo';
import { trueToMag } from '../performance/angles';
import type { WindSample } from '../weather/types';
import { meanLabel, meanWind } from '../weather/windAverage';

const f1 = (v: number) => v.toFixed(1);
const f0 = (v: number) => Math.round(v).toString();

/** Next mark: distance, bearing, VMC, ETA and the re-routed recommendation. */
export function NextMarkCard({ observed, fromCog }: { observed?: WindSample; fromCog?: boolean }) {
  const { activeBoat: boat, settings } = useApp();
  const nav = useNav();
  const { course, gps, nextMark } = nav;
  if (!course || course.marks.length < 2) return null;
  const mark = course.marks[nextMark];
  if (!mark) return null;
  const fix = gps.fix;

  const dtw = fix ? distanceNm(fix, mark) : undefined;
  const btwT = fix ? bearingDeg(fix, mark) : undefined;
  const btw = btwT === undefined ? undefined : settings.manualMagnetic ? trueToMag(btwT, settings.declination) : btwT;
  const v = fix?.sog !== undefined && fix.cog !== undefined && btwT !== undefined ? vmc(fix.sog, fix.cog, btwT) : undefined;
  const eta = dtw !== undefined && v !== undefined && v > 0.3 ? Date.now() + (dtw / v) * 3600_000 : undefined;
  const atMark = dtw !== undefined && dtw < 0.05;

  const lr = nav.liveRoute;
  const first = lr?.legs[0]?.track[0];
  const advHeading = first ? (settings.manualMagnetic ? trueToMag(first.heading, settings.declination) : first.heading) : undefined;
  const ageMin = nav.liveStatus.at ? Math.round((Date.now() - nav.liveStatus.at) / 60000) : undefined;
  const unit = settings.manualMagnetic ? '°M' : '°T';

  return (
    <section className="card next-mark">
      <div className="nm-head">
        <button className="icon-btn" aria-label="Προηγούμενη σημαδούρα" disabled={nextMark <= 1} onClick={() => nav.setNextMark(nextMark - 1)}>
          ◀
        </button>
        <div className="nm-title">
          <div className="tile-label">Επόμενη σημαδούρα {nextMark}/{course.marks.length - 1}</div>
          <strong>{mark.name}</strong>
        </div>
        <button
          className="icon-btn"
          aria-label="Επόμενη σημαδούρα"
          disabled={nextMark >= course.marks.length - 1}
          onClick={() => nav.setNextMark(nextMark + 1)}
        >
          ▶
        </button>
      </div>
      {fix ? (
        <div className="nm-grid">
          <div>
            <div className="tile-label">Απόσταση</div>
            <div className="nm-val">{f1(dtw!)} NM</div>
          </div>
          <div>
            <div className="tile-label">Διόπτευση</div>
            <div className="nm-val">
              {f0(btw!)}
              {unit}
            </div>
          </div>
          <div>
            <div className="tile-label">VMC</div>
            <div className="nm-val">{v === undefined ? '—' : `${f1(v)} kt`}</div>
          </div>
          <div>
            <div className="tile-label">ETA</div>
            <div className="nm-val">{eta ? new Date(eta).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }) : '—'}</div>
          </div>
        </div>
      ) : (
        <p className="muted small">Χρειάζεται θέση GPS για απόσταση, διόπτευση και VMC.</p>
      )}
      {atMark && nextMark < course.marks.length - 1 && (
        <button className="btn primary" onClick={() => nav.setNextMark(nextMark + 1)}>
          Στη σημαδούρα → επόμενη
        </button>
      )}

      {first && boat && (
        <div className="nm-route">
          <div className="tile-label">Βέλτιστη πορεία τώρα {ageMin !== undefined && <span className="muted">(πριν {ageMin}′)</span>}</div>
          <div className="nm-val">
            {f0(advHeading!)}
            {unit} · TWA {f0(Math.abs(first.twa))}° {first.twa >= 0 ? 'δεξιές' : 'αριστερές'}
            {first.sailId && ` · ${boat.sails.find((s) => s.id === first.sailId)?.name ?? first.sailId}`}
          </div>
          <div className="muted small">
            Τερματισμός σε {Math.floor(lr!.elapsedSec / 3600)}h {String(Math.round((lr!.elapsedSec % 3600) / 60)).padStart(2, '0')}′ ·{' '}
            {lr!.legs[0].tacks + lr!.legs[0].gybes} μανούβρες ως τη σημαδούρα
          </div>
        </div>
      )}
      <button className="btn" disabled={nav.liveStatus.busy || !fix} onClick={() => {
          // P-018: the mean of the last few minutes, not one reading that may sit on a shift.
          const m = observed ? meanWind() : undefined;
          if (m) nav.rerouteLive({ tws: m.tws, twd: m.twd }, meanLabel(m));
          else nav.rerouteLive(observed, observed && fromCog ? '≈ από την πορεία GPS' : undefined);
        }}>
        {nav.liveStatus.busy ? 'Υπολογισμός…' : observed ? '↻ Ξαναϋπολογισμός με τον τωρινό άνεμο' : '↻ Ξαναϋπολογισμός (πρόγνωση)'}
      </button>
      {nav.liveStatus.note && <p className="muted small">{nav.liveStatus.note}</p>}
      {nav.liveStatus.error && <p className="warn-text">{nav.liveStatus.error}</p>}
    </section>
  );
}
