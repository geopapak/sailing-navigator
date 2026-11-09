import { useState } from 'react';
import { useApp } from './AppContext';
import { checkAdvisor, AdvisorError } from '../ai/client';
import { NumField } from './NumberStepper';
import type { Theme } from './settings';

const THEMES: { id: Theme; label: string }[] = [
  { id: 'day', label: 'Ήλιος' },
  { id: 'dark', label: 'Σκούρο' },
  { id: 'night', label: 'Νύχτα (κόκκινο)' },
];

export function SettingsView() {
  const { settings, updateSettings } = useApp();
  const [check, setCheck] = useState<string>();
  const [checking, setChecking] = useState(false);
  return (
    <div className="settings">
      <section className="card form-grid">
        <label>
          Θέμα
          <div className="seg">
            {THEMES.map((t) => (
              <button key={t.id} className={settings.theme === t.id ? 'on' : ''} onClick={() => updateSettings({ theme: t.id })}>
                {t.label}
              </button>
            ))}
          </div>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.manualMagnetic}
            onChange={(e) => updateSettings({ manualMagnetic: e.target.checked })}
          />
          Οι χειροκίνητες τιμές TWD και πορείας είναι μαγνητικές (πυξίδα)
        </label>
        <label>
          Απόκλιση (°, ανατολική +)
          <NumField value={settings.declination} onChange={(v) => updateSettings({ declination: v ?? 0 })} width="5em" />
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.keepAwake} onChange={(e) => updateSettings({ keepAwake: e.target.checked })} />
          Η οθόνη να μένει αναμμένη
        </label>
      </section>
      <section className="card form-grid">
        <h3>Σύμβουλος AI</h3>
        <p className="small full">
          Ο σύμβουλος στέλνει τα νούμερα που υπολογίζει η εφαρμογή (targets, πανί, σημαδούρα, διαδρομή) σε έναν δικό σου
          server, που ρωτά το Claude και επιστρέφει σύντομη συμβουλή. Χρειάζεται internet. Το κλειδί του Claude API μένει
          στον server, όχι στο κινητό.
        </p>
        <label className="full">
          Διεύθυνση server
          <input
            type="url"
            inputMode="url"
            placeholder="https://sailing-navigator-ai.….workers.dev"
            value={settings.aiUrl}
            onChange={(e) => updateSettings({ aiUrl: e.target.value.trim() })}
          />
        </label>
        <label>
          Κωδικός πρόσβασης
          <input type="password" autoComplete="off" value={settings.aiCode} onChange={(e) => updateSettings({ aiCode: e.target.value })} />
        </label>
        <div className="full">
          <button
            className="btn"
            disabled={checking || !settings.aiUrl}
            onClick={async () => {
              setChecking(true);
              try {
                setCheck(await checkAdvisor({ url: settings.aiUrl, code: settings.aiCode }));
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
      <section className="card">
        <h3>Σχετικά</h3>
        <p className="small">
          Οι υπολογισμοί γίνονται τοπικά από τα polars του πιστοποιητικού ORC. Η εφαρμογή λειτουργεί χωρίς σύνδεση αφού
          φορτωθεί μία φορά. Τα δεδομένα αποθηκεύονται μόνο σε αυτή τη συσκευή. Μεταφορά σε άλλη συσκευή γίνεται με
          Export/Import από την καρτέλα «Σκάφη».
        </p>
        <p className="muted small">Έκδοση {__APP_VERSION__}</p>
      </section>
    </div>
  );
}
