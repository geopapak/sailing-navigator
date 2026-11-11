import { useApp } from './AppContext';
import { Icon, type IconName } from './Icons';
import type { TextSize, Theme } from './settings';

export const THEME_INFO: Record<Theme, { label: string; icon: IconName }> = {
  day: { label: 'Μέρα', icon: 'sun' },
  dark: { label: 'Σούρουπο', icon: 'dusk' },
  night: { label: 'Νύχτα', icon: 'moon' },
};

const SIZES: { id: TextSize; label: string; px: number }[] = [
  { id: 'n', label: 'Κανονικά', px: 17 },
  { id: 'l', label: 'Μεγάλα', px: 20 },
  { id: 'xl', label: 'Πολύ μεγάλα', px: 23 },
];

/** Text size and theme pickers with big, labelled buttons (Settings and first run). */
export function AppearancePickers() {
  const { settings, updateSettings } = useApp();
  return (
    <>
      <div className="settings-sub">Γράμματα</div>
      <div className="pick-grid" role="group" aria-label="Μέγεθος γραμμάτων">
        {SIZES.map((s) => (
          <button key={s.id} className={settings.textSize === s.id ? 'on' : ''} aria-pressed={settings.textSize === s.id} onClick={() => updateSettings({ textSize: s.id })}>
            <span style={{ fontSize: `${s.px}px` }} aria-hidden>
              Α
            </span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>
      <div className="settings-sub">Θέμα</div>
      <div className="pick-grid" role="group" aria-label="Θέμα">
        {(Object.keys(THEME_INFO) as Theme[]).map((t) => (
          <button key={t} className={settings.theme === t ? 'on' : ''} aria-pressed={settings.theme === t} onClick={() => updateSettings({ theme: t })}>
            <Icon name={THEME_INFO[t].icon} size={26} />
            <span>{THEME_INFO[t].label}</span>
          </button>
        ))}
      </div>
      {settings.theme === 'night' && <p className="small">💡 Τη νύχτα χαμήλωσε και τη φωτεινότητα του κινητού στο ελάχιστο.</p>}
    </>
  );
}
