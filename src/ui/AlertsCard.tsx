import { useApp } from './AppContext';
import { useInstruments } from './InstrumentsContext';
import {
  RACE_SHIFT_DEGS,
  TRAINING_SHIFT_DEGS,
  type AlertSettings,
  type CruiseAlerts,
  type Lead,
  type TrainingAlerts,
} from '../race/alerts';
import type { SessionKind } from '../race/types';
import { ALERT_SETTINGS_TEXT as T } from './sessionText';
import { beep, canVibrate, notify, speak, unlockAudio } from './sound';
import { useOnline } from './hooks';

export function Toggle({
  on,
  label,
  sub,
  disabled = false,
  onChange,
}: {
  on: boolean;
  label: string;
  sub?: string;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <span className="tx">
        {label}
        {sub && <span className="small muted">{sub}</span>}
      </span>
      <span className="knob" aria-hidden="true" />
    </button>
  );
}

function Degrees<D extends number>({ list, value, onPick }: { list: readonly D[]; value: D; onPick: (d: D) => void }) {
  return (
    <div className="seg degs" role="group" aria-label={T.shiftDegs}>
      {list.map((d) => (
        <button key={d} type="button" className={value === d ? 'on' : ''} aria-pressed={value === d} onClick={() => onPick(d)}>
          {d}°
        </button>
      ))}
    </div>
  );
}

/**
 * The alert switches of one kind (P-034). Used by Ρυθμίσεις (with sub-lines) and
 * by the session's ⚙ quick settings (`quick`): both change the same settings.
 */
export function KindAlertToggles({ kind, quick = false }: { kind: SessionKind; quick?: boolean }) {
  const { settings, updateSettings } = useApp();
  const inst = useInstruments();
  const a = settings.alerts;
  const t = settings.training;
  // «Κάτω από 90%» needs instruments: in a session they must be live, in Ρυθμίσεις switched on.
  const hasInst = quick ? inst.live : !!settings.instruments?.enabled;
  const setA = (p: Partial<AlertSettings>) => updateSettings({ alerts: { ...a, ...p } });
  const setT = (p: Partial<TrainingAlerts>) => updateSettings({ training: { ...t, ...p } });
  const c = settings.cruiseAlerts;
  const setC = (p: Partial<CruiseAlerts>) => updateSettings({ cruiseAlerts: { ...c, ...p } });
  const online = useOnline();
  // Offline the chart cannot be asked: only the sounder can warn (P-036 edge cases).
  const sounder = quick ? inst.live && inst.values.depth !== undefined : !!settings.instruments?.enabled;
  const w = a.words === 'slang' ? { tack: 'τακ', gybe: 'τζάιμπ' } : { tack: 'αναστροφή', gybe: 'υποσταύρωση' };
  const sub = (x: string) => (quick ? undefined : x);
  if (kind === 'race')
    return (
      <>
        <Toggle on={a.on.lay} label={T.layline} sub={sub(T.laylineSub(w.tack, w.gybe))} onChange={(v) => setA({ on: { ...a.on, lay: v } })} />
        <Toggle
          on={a.on.shift}
          label={quick ? T.shiftQuick(settings.raceShiftDeg) : T.shift}
          sub={sub(T.shiftSub(settings.raceShiftDeg))}
          onChange={(v) => setA({ on: { ...a.on, shift: v } })}
        />
        <Degrees list={RACE_SHIFT_DEGS} value={settings.raceShiftDeg} onPick={(d) => updateSettings({ raceShiftDeg: d })} />
        <Toggle on={a.on.mark} label={T.mark} sub={sub(T.markSub)} onChange={(v) => setA({ on: { ...a.on, mark: v } })} />
      </>
    );
  if (kind === 'training')
    return (
      <>
        <Toggle on={t.shift} label={quick ? T.shiftQuick(t.shiftDeg) : T.shift} sub={sub(T.shiftSub(t.shiftDeg))} onChange={(v) => setT({ shift: v })} />
        <Degrees list={TRAINING_SHIFT_DEGS} value={t.shiftDeg} onPick={(d) => setT({ shiftDeg: d })} />
        <Toggle on={t.gps} label={quick ? T.gpsQuick : T.gps} sub={sub(T.gpsSub)} onChange={(v) => setT({ gps: v })} />
        <Toggle
          on={t.below90 && hasInst}
          label={T.below}
          sub={hasInst ? sub(T.belowSub) : T.belowNoInst}
          disabled={!hasInst}
          onChange={(v) => setT({ below90: v })}
        />
        <Toggle on={t.layNow} label={T.layNow} sub={sub(T.layNowSub)} onChange={(v) => setT({ layNow: v })} />
        <Toggle on={t.startCountdown} label={T.startCd} sub={sub(T.startCdSub)} onChange={(v) => setT({ startCountdown: v })} />
        <p className="small muted">{T.trainingNote}</p>
      </>
    );
  const shallowSub = [quick ? undefined : `${T.shallowSub}. ${T.shallowPrivacy}`, !online && !sounder ? T.shallowOffline : undefined]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      <Toggle on={c.shallow} label={T.shallow} sub={shallowSub || undefined} onChange={(v) => setC({ shallow: v })} />
      <Toggle on={c.arrive} label={T.arrive} sub={sub(T.arriveSub)} onChange={(v) => setC({ arrive: v })} />
      {!quick && <p className="small muted">{T.cruiseNote}</p>}
    </>
  );
}

/** Settings → alerts per kind (P-023, P-034). Defaults follow the prototype: everything on, beep only. */
export function AlertsCard() {
  const { settings, updateSettings } = useApp();
  const a = settings.alerts;
  const set = (p: Partial<AlertSettings>) => updateSettings({ alerts: { ...a, ...p } });
  const w = a.words === 'slang' ? { tack: 'τακ', gybe: 'τζάιμπ' } : { tack: 'αναστροφή', gybe: 'υποσταύρωση' };
  const test = () => {
    unlockAudio();
    window.setTimeout(() => {
      notify({ key: 'test', type: 'lay', kind: 'warn', big: '', sub: '', say: `${w.tack} σε ένα λεπτό`, at: Date.now() }, a);
      if (a.sound === 'off') beep({ kind: 'warn', type: 'lay' });
    }, 60);
  };
  const leads: [Lead, string][] = [
    [120, '2′ πριν'],
    [60, '1′ πριν'],
    [6, 'Τώρα'],
  ];
  return (
    <>
      <section className="card alerts-card">
        <h3>{T.raceTitle}</h3>
        <p className="small muted">
          Ακούγονται μόνο όσο τρέχει έξοδος και η οθόνη είναι ανοιχτή. Με κλειδωμένο κινητό δεν ακούγονται. Είναι προτάσεις: η απόφαση είναι του
          κυβερνήτη.
        </p>
        <KindAlertToggles kind="race" />
        <div className="settings-sub">Πόσο νωρίς</div>
        <div className="seg" role="group" aria-label="Πόσο νωρίς">
          {leads.map(([l, label]) => (
            <button key={l} className={a.leads[l] ? 'on' : ''} aria-pressed={a.leads[l]} onClick={() => set({ leads: { ...a.leads, [l]: !a.leads[l] } })}>
              {a.leads[l] ? '✓ ' : ''}
              {label}
            </button>
          ))}
        </div>
        <div className="settings-sub">Όχι πολύ συχνά</div>
        <p className="small muted">Ελάχιστο κενό ανάμεσα σε δύο ειδοποιήσεις. Το «Τώρα» και η σημαδούρα ακούγονται πάντα.</p>
        <div className="seg" role="group" aria-label="Ελάχιστο κενό">
          {([20, 30, 60] as const).map((g) => (
            <button key={g} className={a.gapSec === g ? 'on' : ''} aria-pressed={a.gapSec === g} onClick={() => set({ gapSec: g })}>
              {g}″
            </button>
          ))}
        </div>
        <div className="settings-sub">Λέξεις</div>
        <div className="seg" role="group" aria-label="Λέξεις">
          <button className={a.words === 'gr' ? 'on' : ''} onClick={() => set({ words: 'gr' })}>
            Αναστροφή / Υποσταύρωση
          </button>
          <button className={a.words === 'slang' ? 'on' : ''} onClick={() => set({ words: 'slang' })}>
            Τακ / Τζάιμπ
          </button>
        </div>
      </section>
      <section className="card alerts-card">
        <h3>{T.trainingTitle}</h3>
        <KindAlertToggles kind="training" />
      </section>
      <section className="card alerts-card">
        <h3>{T.cruiseTitle}</h3>
        <KindAlertToggles kind="cruise" />
      </section>
      <section className="card alerts-card">
        <h3>{T.soundTitle}</h3>
        <div className="seg" role="group" aria-label="Ήχος">
          {(
            [
              ['beep', 'Μπιπ'],
              ['voice', 'Μπιπ + φωνή'],
              ['off', 'Μόνο οθόνη'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} className={a.sound === v ? 'on' : ''} aria-pressed={a.sound === v} onClick={() => set({ sound: v })}>
              {l}
            </button>
          ))}
        </div>
        <p className="small muted">{T.trainingBeepOnly}</p>
        <label className="check">
          <input type="checkbox" checked={a.vibrate && canVibrate()} disabled={!canVibrate()} onChange={(e) => set({ vibrate: e.target.checked })} />
          Δόνηση {canVibrate() ? '' : '(το iPhone δεν δονείται από εφαρμογή web)'}
        </label>
        <p>
          <button className="btn" onClick={test}>
            🔊 Δοκιμή ήχου
          </button>
          {a.sound === 'voice' && (
            <button className="btn" onClick={() => speak(`${w.tack} τώρα`)}>
              Δοκιμή φωνής
            </button>
          )}
        </p>
      </section>
    </>
  );
}

/** Settings → «Ίχνος» (cruise 15″ / 30″) and «Ξεχασμένη έξοδος» (P-036 AC 8). */
export function TrackCards() {
  const { settings, updateSettings } = useApp();
  return (
    <>
      <section className="card">
        <h3>{T.trackTitle}</h3>
        <p className="small">{T.trackFixed}</p>
        <div className="settings-sub">{T.trackCruise}</div>
        <div className="seg" role="group" aria-label={`${T.trackTitle} · ${T.trackCruise}`}>
          {([15, 30] as const).map((v) => (
            <button key={v} type="button" className={settings.cruiseTrackSec === v ? 'on' : ''} aria-pressed={settings.cruiseTrackSec === v} onClick={() => updateSettings({ cruiseTrackSec: v })}>
              {T.every(v)}
            </button>
          ))}
        </div>
      </section>
      <section className="card">
        <h3>{T.forgottenTitle}</h3>
        <p className="small">{T.forgottenText}</p>
      </section>
    </>
  );
}
