import { AppProvider, useApp } from './AppContext';
import { LiveView } from './LiveView';
import { PolarView } from './PolarView';
import { ScoringView } from './ScoringView';
import { BoatsView } from './BoatsView';
import { SettingsView } from './SettingsView';
import { useStoredState } from './hooks';

type Tab = 'live' | 'polar' | 'scoring' | 'boats' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'live', label: 'Live', icon: '⛵' },
  { id: 'polar', label: 'Polar', icon: '◔' },
  { id: 'scoring', label: 'Χρόνος', icon: '⏱' },
  { id: 'boats', label: 'Σκάφη', icon: '☰' },
  { id: 'settings', label: 'Ρυθμίσεις', icon: '⚙' },
];

function Shell() {
  const { ready, error, activeBoat, boats, settings, updateSettings } = useApp();
  const [nav, setNav] = useStoredState<{ tab: Tab }>('nav', { tab: 'live' });

  return (
    <div className="app">
      <header className="topbar">
        <select
          className="boat-select"
          aria-label="Ενεργό σκάφος"
          value={activeBoat?.id ?? ''}
          onChange={(e) => updateSettings({ activeBoatId: e.target.value })}
        >
          {boats.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {activeBoat && activeBoat.performanceFactor !== 1 && (
          <span className="badge">{Math.round(activeBoat.performanceFactor * 100)}%</span>
        )}
        <button
          className="icon-btn theme-btn"
          aria-label="Αλλαγή θέματος"
          onClick={() => updateSettings({ theme: settings.theme === 'day' ? 'dark' : settings.theme === 'dark' ? 'night' : 'day' })}
        >
          ◐
        </button>
      </header>
      <main className="content">
        {error && <p className="errors">{error}</p>}
        {!ready ? (
          <p className="muted">Φόρτωση…</p>
        ) : nav.tab === 'live' ? (
          <LiveView />
        ) : nav.tab === 'polar' ? (
          <PolarView />
        ) : nav.tab === 'scoring' ? (
          <ScoringView />
        ) : nav.tab === 'boats' ? (
          <BoatsView />
        ) : (
          <SettingsView />
        )}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={nav.tab === t.id ? 'on' : ''} onClick={() => setNav({ tab: t.id })}>
            <span className="tab-icon" aria-hidden>
              {t.icon}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
