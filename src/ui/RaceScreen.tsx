import { useApp } from './AppContext';
import { useNav } from './NavContext';
import { useRace } from './RaceContext';
import { getSessionSnapshot } from '../ai/snapshot';
import { distanceNm } from '../nav/geo';
import { words } from '../race/alerts';
import { fmtGap } from '../race/estimate';
import { useAlerts } from './RaceAlerts';
import { clock, clockWords, inTime, inTimeWords, num, qty } from '../format';
import { useLiveNumbers, usePublishLive, useSessionMarks } from './useSession';
import { LIVE_TEXT, WIND_TEXT as WT } from './sessionText';
import { BtnIcon, Icon } from './Icons';
import { NoWindPrompt, WindReading, useSessionWindSheet } from './WindReading';
import { fmtAge } from '../race/manualWind';

const f1 = (v: number) => num(v);

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
  const wind = useSessionWindSheet(nb);
  // Never the «Γρήγορη ματιά» defaults nobody typed (P-053 AC 50); with the manual wind on, its own numbers only.
  const snap = nb.windFrom === 'manual' ? undefined : getSessionSnapshot(2)?.ctx.live;
  const fix = nav.gps.fix;

  // Targets from the polar for the wind now; the advisor's last snapshot only as a fallback.
  const bsp = nb.bsp ?? snap?.bsp;
  const bspFrom = nb.bsp !== undefined ? nb.bspFrom : 'BSP';
  const target = nb.result?.targetBsp ?? snap?.targetBsp;
  const pct = bsp !== undefined && target ? Math.round((bsp / target) * 100) : undefined;
  const twa = nb.result
    ? nb.result.tack === 'port'
      ? -nb.result.twa
      : nb.result.twa
    : nb.windFrom === 'manual'
      ? nb.twa
      : snap
        ? snap.tack === 'port'
          ? -snap.twa
          : snap.twa
        : undefined;
  const targetTwa = nb.result?.targetTwa;

  const lay = al.lay?.result;
  const up = lay ? lay.leg !== 'down' : true;
  const man = up ? w.tack : w.gybe;
  const laySide = lay?.board === 'stbd' ? 'αριστερών' : 'δεξιών';
  let nextVal = '—';
  let nextIn: number | undefined;
  let nextSub = 'χρειάζεται άνεμο, θέση και διαδρομή';
  if (lay) {
    if (lay.overstood) [nextVal, nextSub] = ['ΤΩΡΑ', 'πέρασες τη layline'];
    else if (al.layInSec !== undefined) [nextIn, nextVal, nextSub] = [al.layInSec, inTime(al.layInSec), `στη layline ${laySide}`];
    else if (lay.leg === 'reach') nextSub = 'φτάνεις τη σημαδούρα χωρίς μανούβρα';
    else nextSub = 'η layline δεν είναι μπροστά';
  }
  // The laylines' wind (AC 21, 26): manual (with its age when old) or the forecast.
  const layNote =
    lay && al.lay?.wind === 'manual' ? (
      nb.stale && nb.manualAgeMin !== undefined ? (
        <span className="sub lay-note stale">
          <Icon name="warn" size="1em" stroke={2.2} className="wi" />
          {WT.layStale(fmtAge(nb.manualAgeMin))}
        </span>
      ) : (
        <span className="sub lay-note">{WT.layManual}</span>
      )
    ) : lay && al.lay?.wind === 'forecast' ? (
      <span className="sub lay-note">{WT.layForecast}</span>
    ) : null;
  const twaSub = nb.windFrom === 'none' ? WT.needsWind : nb.windFrom === 'manual' && twa === undefined ? WT.needsSog : undefined;
  const idle = !al.banner && lay && !lay.overstood && al.layInSec !== undefined ? `${LIVE_TEXT.next}: ${man} στη layline ${laySide} ${inTime(al.layInSec)}` : undefined;

  const mark = sm.mark;
  const markLine =
    mark && fix ? `${sm.isFinish ? `${LIVE_TEXT.finish} · ${mark.name}` : `${LIVE_TEXT.markShort(sm.index)} · ${mark.name}`} · ${qty(distanceNm(fix, mark), 'NM')}` : undefined;

  // «2ος · +0:42»: behind the boat ahead; first: ahead of the second (negative).
  const own = race.rows.find((x) => x.own);
  const ranked = race.rows.filter((x) => x.rank !== undefined);
  const ref = own?.rank ? (own.rank > 1 ? ranked[own.rank - 2] : ranked[1]) : undefined;
  const rankLine = own?.rank ? `${own.rank}ος${ref?.gap !== undefined ? ` · ${fmtGap(-ref.gap)}` : ''}` : undefined;

  return (
    <section className="card race-screen" aria-label="Οθόνη αγώνα">
      {nb.windFrom === 'manual' ? <p className="msg info">{WT.manualStrip}</p> : nb.windFrom === 'quick' && <p className="msg warn">{LIVE_TEXT.noInstRace}</p>}
      {idle ? (
        // P-056 §Ι: the band takes the place of the «Οθόνη αγώνα» row, with its own mute button.
        <div className="rs-band" role="status" data-testid="rs-band">
          <span className="big">{idle}</span>
          <button
            type="button"
            className={`mute ${al.muteLeft ? 'on' : ''}`}
            aria-pressed={al.muteLeft > 0}
            aria-label={al.muteLeft ? `Σίγαση ${clockWords(al.muteLeft)}` : 'Σίγαση ειδοποιήσεων για 5 λεπτά'}
            onClick={al.toggleMute}
          >
            <BtnIcon name="mute" />
            <span aria-hidden="true">{al.muteLeft ? clock(al.muteLeft) : '5′'}</span>
          </button>
        </div>
      ) : (
        <div className="rs-top">
          <h3>Οθόνη αγώνα</h3>
          <button type="button" className={`btn small-btn ${al.muteLeft ? 'on' : ''}`} aria-pressed={al.muteLeft > 0} onClick={al.toggleMute}>
            <BtnIcon name="mute" />
            {al.muteLeft ? <span aria-label={`Σίγαση ${clockWords(al.muteLeft)}`}>Σίγαση {clock(al.muteLeft)}</span> : 'Σίγαση 5′'}
          </button>
        </div>
      )}
      {!al.audioOk && settings.alerts.sound !== 'off' && (
        <p className="rs-audio">
          <BtnIcon name="sound" />
          Για να ακούγονται οι ειδοποιήσεις, το κινητό θέλει ένα πάτημα.{' '}
          <button type="button" className="btn primary small-btn" onClick={al.enableAudio}>
            Ενεργοποίηση ήχου
          </button>
        </p>
      )}
      <div className="rs-tile">
        <span>
          <span className="lab">{LIVE_TEXT.speed}</span>
          <span className="ab">{bspFrom === 'SOG' ? LIVE_TEXT.sogFromGps : 'BSP'} · kt</span>
          {pct !== undefined && (
            <span className={`sub ${pct >= 95 ? 'good' : 'fair'}`}>
              {LIVE_TEXT.target} {f1(target!)} · {pct}%
            </span>
          )}
        </span>
        <span className="val">{bsp === undefined ? '—' : f1(bsp)}</span>
      </div>
      {nb.windFrom === 'none' && <NoWindPrompt onOpen={wind.openSheet} />}
      <div className="rs-tile">
        <span>
          <span className="lab">{LIVE_TEXT.windAngle}</span>
          <span className="ab">
            TWA
            {twa !== undefined && ` · ${twa >= 0 ? 'δεξιές' : 'αριστερές'} μούρες`}
          </span>
          {targetTwa !== undefined && (
            <span className="sub">
              {LIVE_TEXT.target} {Math.round(targetTwa)}°
            </span>
          )}
          {twaSub && <span className="sub">{twaSub}</span>}
        </span>
        <span className="val">{twa === undefined ? '—' : `${Math.round(Math.abs(twa))}°`}</span>
      </div>
      <div className="rs-tile" data-fit-end>
        <span>
          <span className="lab">Επόμενη {man}</span>
          <span className="ab">{up ? 'αναστροφή (τακ)' : 'υποσταύρωση (τζάιμπ)'}</span>
          <span className="sub">{nextSub}</span>
          {layNote}
        </span>
        {nextIn !== undefined && Math.round(nextIn) > 0 ? (
          <span className="val in-time" aria-label={inTimeWords(nextIn)} data-testid="next-in">
            <span className="in" aria-hidden="true">
              σε
            </span>
            <span aria-hidden="true">{clock(nextIn)}</span>
          </span>
        ) : (
          <span className={`val ${nextVal === 'ΤΩΡΑ' ? 'now' : ''}`}>{nextVal}</span>
        )}
      </div>
      <WindReading w={wind.view} dir={settings} onOpen={wind.openSheet} />
      {markLine && (
        <div className="rs-next" data-fit-end>
          <span>{markLine}</span>
          <span>{al.markInSec !== undefined ? approx(al.markInSec) : ''}</span>
        </div>
      )}
      {rankLine && (
        <div className="rs-next" data-fit-end>
          <span>{LIVE_TEXT.ranking}</span>
          <span>{rankLine}</span>
        </div>
      )}
      <p className="muted small">
        Ενδεικτικό, όχι για ναυσιπλοΐα. Οι ειδοποιήσεις είναι προτάσεις και ακούγονται μόνο με την οθόνη ανοιχτή. Η απόφαση είναι του κυβερνήτη.
      </p>
      {wind.sheet}
    </section>
  );
}
