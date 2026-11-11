import { useApp } from './AppContext';
import type { AlertSettings, Lead } from '../race/alerts';
import { beep, canVibrate, notify, speak, unlockAudio } from './sound';

/** Settings → race alerts (P-023). Defaults follow the prototype: everything on, beep only. */
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
    <section className="card alerts-card">
      <h3>Ειδοποιήσεις αγώνα</h3>
      <p className="small muted">
        Ακούγονται μόνο όσο τρέχει αγώνας και η οθόνη είναι ανοιχτή. Με κλειδωμένο κινητό δεν ακούγονται. Είναι προτάσεις: η απόφαση είναι του
        κυβερνήτη.
      </p>
      <div className="settings-sub">Τι σε ειδοποιεί</div>
      <label className="check">
        <input type="checkbox" checked={a.on.lay} onChange={(e) => set({ on: { ...a.on, lay: e.target.checked } })} />
        Layline · {w.tack} / {w.gybe}
      </label>
      <label className="check">
        <input type="checkbox" checked={a.on.shift} onChange={(e) => set({ on: { ...a.on, shift: e.target.checked } })} />
        Στροφή ανέμου πάνω από 7° (μόνο με όργανα)
      </label>
      <label className="check">
        <input type="checkbox" checked={a.on.mark} onChange={(e) => set({ on: { ...a.on, mark: e.target.checked } })} />
        Σημαδούρα ή τερματισμός σε 1′
      </label>
      <div className="settings-sub">Πόσο νωρίς</div>
      <div className="seg" role="group" aria-label="Πόσο νωρίς">
        {leads.map(([l, label]) => (
          <button key={l} className={a.leads[l] ? 'on' : ''} aria-pressed={a.leads[l]} onClick={() => set({ leads: { ...a.leads, [l]: !a.leads[l] } })}>
            {a.leads[l] ? '✓ ' : ''}
            {label}
          </button>
        ))}
      </div>
      <div className="settings-sub">Πώς</div>
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
  );
}
