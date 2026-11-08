import { useApp } from './AppContext';
import { NumField } from './NumberStepper';
import type { Theme } from './settings';

const THEMES: { id: Theme; label: string }[] = [
  { id: 'day', label: 'Ήλιος' },
  { id: 'dark', label: 'Σκούρο' },
  { id: 'night', label: 'Νύχτα (κόκκινο)' },
];

export function SettingsView() {
  const { settings, updateSettings } = useApp();
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
