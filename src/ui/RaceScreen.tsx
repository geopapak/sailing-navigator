import { useApp } from './AppContext';
import { useNav } from './NavContext';
import { useRace } from './RaceContext';
import { getLiveSnapshot } from '../ai/snapshot';
import { distanceNm } from '../nav/geo';
import { words } from '../race/alerts';
import { fmtGap } from '../race/estimate';
import { mmss, useAlerts } from './RaceAlerts';
import { useLiveNumbers, usePublishLive, useSessionMarks } from './useSession';
import { LIVE_TEXT } from './sessionText';

const f1 = (v: number) => v.toFixed(1).replace('.', ',');

/** «~11′» / «~1 ώ 40′» */
const approx = (sec: number) => {
  const m = Math.max(1, Math.round(sec / 60));
  return m >= 60 ? `~${Math.floor(m / 60)} ώ ${String(m % 60).padStart(2, '0')}′` : `~${m}′`;
};

/**
 * Race screen (P-026), the race's Live inside a session (P-034): the next alert,
 * three big numbers for sun and one hand (speed against target, wind angle with
 * the board, when the next manoeuvre is), then the mark and the ranking.
 */
export function RaceScreen() {
  const { settings } = useApp();
  const nav = useNav();
  const race = useRace();
  const al = useAlerts();
  const nb = useLiveNumbers();
  usePublishLive(nb);
  const sm = useSessionMarks();
  const w = words(settings.alerts);
  const snap = getLiveSnapshot(2)?.ctx.live;
  const fix = nav.gps.fix;

  // Targets from the polar for the wind now; the advisor's last snapshot only as a fallback.
  const bsp = nb.bsp ?? snap?.bsp;
  const bspFrom = nb.bsp !== undefined ? nb.bspFrom : 'BSP';
  const target = nb.result?.targetBsp ?? snap?.targetBsp;
  const pct = bsp !== undefined && target ? Math.round((bsp / target) * 100) : undefined;
  const twa = nb.result ? (nb.result.tack === 'port' ? -nb.result.twa : nb.result.twa) : snap ? (snap.tack === 'port' ? -snap.twa : snap.twa) : undefined;
  const targetTwa = nb.result?.targetTwa;

  const lay = al.lay?.result;
  const up = lay ? lay.leg !== 'down' : true;
  const man = up ? w.tack : w.gybe;
  const laySide = lay?.board === 'stbd' ? 'αριστερών' : 'δεξιών';
  let nextVal = '—';
  let nextSub = 'χρειάζεται άνεμο, θέση και διαδρομή';
  if (lay) {
    if (lay.overstood) [nextVal, nextSub] = ['ΤΩΡΑ', 'πέρασες τη layline'];
    else if (al.layInSec !== undefined) [nextVal, nextSub] = [mmss(al.layInSec), `στη layline ${laySide}`];
    else if (lay.leg === 'reach') nextSub = 'φτάνεις τη σημαδούρα χωρίς άλλη';
    else nextSub = 'η layline δεν είναι μπροστά';
  }
  const idle = !al.banner && lay && !lay.overstood && al.layInSec !== undefined ? `${LIVE_TEXT.next}: ${man} στη layline ${laySide} σε ${mmss(al.layInSec)}` : undefined;

  const mark = sm.mark;
  const markLine = mark && fix ? `${sm.isFinish ? `${LIVE_TEXT.finish} · ${mark.name}` : `${LIVE_TEXT.markShort(sm.index)} · ${mark.name}`} · ${f1(distanceNm(fix, mark))} νμ` : undefined;

  // «2ος · +0:42»: behind the boat ahead; first: ahead of the second (negative).
  const own = race.rows.find((x) => x.own);
  const ranked = race.rows.filter((x) => x.rank !== undefined);
  const ref = own?.rank ? (own.rank > 1 ? ranked[own.rank - 2] : ranked[1]) : undefined;
  const rankLine = own?.rank ? `${own.rank}ος${ref?.gap !== undefined ? ` · ${fmtGap(-ref.gap)}` : ''}` : undefined;

  return (
    <section className="card race-screen" aria-label="Οθόνη αγώνα">
      {idle && (
        <div className="alert-band idle" role="status">
          <span className="sub">{idle}</span>
        </div>
      )}
      {!nb.withInst && <p className="msg warn">{LIVE_TEXT.noInstRace}</p>}
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
          <span className="lab">{LIVE_TEXT.speed}</span>
          <span className="ab">{bspFrom === 'SOG' ? LIVE_TEXT.sogFromGps : 'BSP'} · κν</span>
          {pct !== undefined && (
            <span className={`sub ${pct >= 95 ? 'good' : 'fair'}`}>
              {LIVE_TEXT.target} {f1(target!)} · {pct}%
            </span>
          )}
        </span>
        <span className="val">{bsp === undefined ? '—' : f1(bsp)}</span>
      </div>
      <div className="rs-tile">
        <span>
          <span className="lab">{LIVE_TEXT.windAngle}</span>
          <span className="ab">
            TWA{twa !== undefined && ` · ${twa >= 0 ? 'δεξιές' : 'αριστερές'} μούρες`}
          </span>
          {targetTwa !== undefined && (
            <span className="sub">
              {LIVE_TEXT.target} {Math.round(targetTwa)}°
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
      {markLine && (
        <div className="rs-next">
          <span>{markLine}</span>
          <span>{al.markInSec !== undefined ? approx(al.markInSec) : ''}</span>
        </div>
      )}
      {rankLine && (
        <div className="rs-next">
          <span>{LIVE_TEXT.ranking}</span>
          <span>{rankLine}</span>
        </div>
      )}
      <p className="muted small">
        Ενδεικτικό, όχι για ναυσιπλοΐα. Οι ειδοποιήσεις είναι προτάσεις και ακούγονται μόνο με την οθόνη ανοιχτή. Η απόφαση είναι του κυβερνήτη.
      </p>
    </section>
  );
}
