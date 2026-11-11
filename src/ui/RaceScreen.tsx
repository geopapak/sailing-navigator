import { useApp } from './AppContext';
import { useNav } from './NavContext';
import { useInstruments } from './InstrumentsContext';
import { getLiveSnapshot } from '../ai/snapshot';
import { bearingDeg, distanceNm } from '../nav/geo';
import { trueToMag } from '../performance/angles';
import { words } from '../race/alerts';
import { mmss, useAlerts } from './RaceAlerts';

const f1 = (v: number) => v.toFixed(1).replace('.', ',');
const f2 = (v: number) => v.toFixed(2).replace('.', ',');

/**
 * Race screen (P-026): three big numbers for sun and one hand: speed against
 * target, wind angle with the board, and when the next manoeuvre is.
 */
export function RaceScreen() {
  const { settings } = useApp();
  const nav = useNav();
  const inst = useInstruments();
  const al = useAlerts();
  const w = words(settings.alerts);
  const snap = getLiveSnapshot(2)?.ctx.live;
  const iv = inst.live ? inst.values : {};
  const fix = nav.gps.fix;

  const bsp = iv.bsp ?? snap?.bsp ?? fix?.sog;
  const bspFrom = iv.bsp !== undefined ? 'BSP' : snap?.bsp !== undefined ? 'BSP' : 'SOG';
  const target = snap?.targetBsp;
  const pct = bsp !== undefined && target ? Math.round((bsp / target) * 100) : undefined;
  const twa = iv.twa ?? (snap ? (snap.tack === 'port' ? -snap.twa : snap.twa) : undefined);

  const lay = al.lay?.result;
  const up = lay ? lay.leg !== 'down' : true;
  const man = up ? w.tack : w.gybe;
  let nextVal = '—';
  let nextSub = 'χρειάζεται άνεμο, θέση και διαδρομή';
  if (lay) {
    if (lay.overstood) [nextVal, nextSub] = ['ΤΩΡΑ', 'πέρασες τη layline'];
    else if (al.layInSec !== undefined) [nextVal, nextSub] = [mmss(al.layInSec), `στη layline ${lay.board === 'stbd' ? 'αριστερών' : 'δεξιών'}`];
    else if (lay.leg === 'reach') nextSub = 'φτάνεις τη σημαδούρα χωρίς άλλη';
    else nextSub = 'η layline δεν είναι μπροστά';
  }

  const marks = nav.course?.marks ?? [];
  const mark = marks[nav.nextMark];
  const unit = settings.manualMagnetic ? '°M' : '°T';
  const brg = fix && mark ? bearingDeg(fix, mark) : undefined;

  return (
    <section className="card race-screen" aria-label="Οθόνη αγώνα">
      <div className="rs-top">
        <h3>Οθόνη αγώνα</h3>
        <button type="button" className={`btn small-btn ${al.muteLeft ? 'on' : ''}`} aria-pressed={al.muteLeft > 0} onClick={al.toggleMute}>
          {al.muteLeft ? `🔕 ${mmss(al.muteLeft)}` : '🔕 Σίγαση 5′'}
        </button>
      </div>
      {!al.audioOk && settings.alerts.sound !== 'off' && (
        <p className="rs-audio">
          🔊 Για να ακούγονται οι ειδοποιήσεις, το κινητό θέλει ένα πάτημα.{' '}
          <button type="button" className="btn primary small-btn" onClick={al.enableAudio}>
            Ενεργοποίηση ήχου
          </button>
        </p>
      )}
      <div className="rs-tile">
        <span>
          <span className="lab">Ταχύτητα</span>
          <span className="ab">{bspFrom} · kt</span>
          {pct !== undefined && <span className={`sub ${pct >= 95 ? 'good' : 'fair'}`}>στόχος {f1(target!)} · {pct}%</span>}
        </span>
        <span className="val">{bsp === undefined ? '—' : f1(bsp)}</span>
      </div>
      <div className="rs-tile">
        <span>
          <span className="lab">Γωνία ανέμου</span>
          <span className="ab">TWA</span>
          {twa !== undefined && (
            <span className="sub">
              {twa >= 0 ? 'Δεξιές' : 'Αριστερές'} · {Math.abs(twa) < 70 ? 'όρτσα' : Math.abs(twa) > 120 ? 'πρίμα' : 'ανοιχτά'}
            </span>
          )}
        </span>
        <span className="val">{twa === undefined ? '—' : `${Math.round(Math.abs(twa))}°`}</span>
      </div>
      <div className="rs-tile">
        <span>
          <span className="lab">Επόμενη {man}</span>
          <span className="ab">{up ? 'αναστροφή (τακ)' : 'υποσταύρωση (τζάιμπ)'}</span>
          <span className="sub">{nextSub}</span>
        </span>
        <span className={`val ${nextVal === 'ΤΩΡΑ' ? 'now' : ''}`}>{nextVal}</span>
      </div>
      {mark && fix && (
        <div className="rs-next">
          <span>→ {mark.name}</span>
          <span>
            {f2(distanceNm(fix, mark))} NM · {Math.round(settings.manualMagnetic ? trueToMag(brg!, settings.declination) : brg!)}
            {unit}
            {al.markInSec !== undefined && ` · ${mmss(al.markInSec)}`}
          </span>
        </div>
      )}
      <p className="muted small">
        Ενδεικτικό, όχι για ναυσιπλοΐα. Οι ειδοποιήσεις είναι προτάσεις και ακούγονται μόνο με την οθόνη ανοιχτή. Η απόφαση είναι του κυβερνήτη.
      </p>
    </section>
  );
}
