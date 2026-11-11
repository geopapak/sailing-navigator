import { useState } from 'react';
import { useApp } from './AppContext';
import { advisorConfig, checkAdvisor, AdvisorError } from '../ai/client';
import { AccountCard } from './AccountCard';
import { InstrumentsCard } from './InstrumentsCard';
import { DEFAULT_SERVER } from './settings';
import { NumField } from './NumberStepper';
import { AppearancePickers } from './Appearance';
import { openTab } from './openTab';
import { InstallHelp, isStandalone } from './InstallHelp';

export function SettingsView() {
  const { settings, updateSettings } = useApp();
  const [check, setCheck] = useState<string>();
  const [checking, setChecking] = useState(false);
  return (
    <div className="settings">
      <section className="card">
        <h3>Εμφάνιση</h3>
        <AppearancePickers />
        <div className="settings-sub">Live</div>
        <div className="seg" role="group" aria-label="Προβολή Live">
          <button className={settings.liveMode === 'simple' ? 'on' : ''} onClick={() => updateSettings({ liveMode: 'simple' })}>
            Απλό
          </button>
          <button className={settings.liveMode === 'full' ? 'on' : ''} onClick={() => updateSettings({ liveMode: 'full' })}>
            Πλήρες
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={settings.keepAwake} onChange={(e) => updateSettings({ keepAwake: e.target.checked })} />
          Η οθόνη να μένει αναμμένη
        </label>
        <p>
          <button className="btn" onClick={() => {
              updateSettings({ onboarded: false });
              openTab('live');
            }}>
            Δείξε ξανά τα πρώτα βήματα
          </button>
        </p>
      </section>
      {!isStandalone() && (
        <section className="card">
          <h3>Η εφαρμογή στο κινητό</h3>
          <p className="small">Βάλε την εφαρμογή στην αρχική οθόνη, για να ανοίγει με ένα άγγιγμα και χωρίς ίντερνετ.</p>
          <InstallHelp />
        </section>
      )}
      <AccountCard />
      <InstrumentsCard />
      <details className="card">
        <summary>
          <b>Για προχωρημένους</b> <span className="small muted">— μαγνητική απόκλιση, server</span>
        </summary>
      <section className="form-grid">
        <label className="check">
          <input
            type="checkbox"
            checked={settings.manualMagnetic}
            onChange={(e) => updateSettings({ manualMagnetic: e.target.checked })}
          />
          Οι χειροκίνητες τιμές TWD και πορείας είναι μαγνητικές (πυξίδα)
        </label>
        <label>
          Μαγνητική απόκλιση (°, ανατολική +)
          <NumField value={settings.declination} onChange={(v) => updateSettings({ declination: v ?? 0 })} width="5em" />
        </label>
      </section>
      <section className="form-grid">
        <h3>Server & σύμβουλος AI</h3>
        <p className="small full">
          Ο server κρατά τους λογαριασμούς και ρωτά το Claude για τον σύμβουλο. Το κλειδί του Claude API μένει στον server,
          όχι στο κινητό. Ο κωδικός ιδιοκτήτη χρειάζεται μόνο αν δεν χρησιμοποιείς λογαριασμό.
        </p>
        <label className="full">
          Διεύθυνση server
          <input
            type="url"
            inputMode="url"
            placeholder={DEFAULT_SERVER}
            value={settings.aiUrl}
            onChange={(e) => updateSettings({ aiUrl: e.target.value.trim() })}
          />
        </label>
        <label>
          Κωδικός ιδιοκτήτη (προαιρετικό)
          <input type="password" autoComplete="off" value={settings.aiCode} onChange={(e) => updateSettings({ aiCode: e.target.value })} />
        </label>
        <div className="full">
          <button
            className="btn"
            disabled={checking || !settings.aiUrl}
            onClick={async () => {
              setChecking(true);
              try {
                setCheck(await checkAdvisor(advisorConfig(settings)));
              } catch (e) {
                setCheck(e instanceof AdvisorError ? e.message : 'Αποτυχία ελέγχου.');
              } finally {
                setChecking(false);
              }
            }}
          >
            {checking ? 'Έλεγχος…' : 'Δοκιμή σύνδεσης'}
          </button>
          {check && <p className="small">{check}</p>}
        </div>
      </section>
      </details>
      <section className="card">
        <h3>Σχετικά</h3>
        <p className="small">
          Οι υπολογισμοί γίνονται τοπικά από τα polars του πιστοποιητικού ORC. Η εφαρμογή λειτουργεί χωρίς σύνδεση αφού
          φορτωθεί μία φορά. Τα δεδομένα αποθηκεύονται στη συσκευή και, αν είσαι συνδεδεμένος, συγχρονίζονται με τον
          λογαριασμό σου. Χωρίς λογαριασμό, μεταφορά γίνεται με Export/Import από την καρτέλα «Σκάφη».
        </p>
        <p className="muted small">Έκδοση {__APP_VERSION__}</p>
      </section>
    </div>
  );
}
