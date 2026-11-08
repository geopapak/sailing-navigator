import { lazy, Suspense } from 'react';
import { AppProvider, useApp } from './AppContext';
import { NavProvider } from './NavContext';
import { LiveView } from './LiveView';
import { PolarView } from './PolarView';
import { ScoringView } from './ScoringView';
import { BoatsView } from './BoatsView';
import { SettingsView } from './SettingsView';
import { GuideView } from './GuideView';
import { useStoredState } from './hooks';

// The map (MapLibre) is large: load it only when the tab is opened.
const PlanView = lazy(() => import('./PlanView').then((m) => ({ default: m.PlanView })));

type Tab = 'live' | 'map' | 'polar' | 'scoring' | 'boats' | 'settings' | 'guide';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'live', label: 'Live', icon: '⛵' },
  { id: 'map', label: 'Χάρτης', icon: '🗺' },
  { id: 'polar', label: 'Polar', icon: '◔' },
  { id: 'scoring', label: 'Χρόνος', icon: '⏱' },
  { id: 'boats', label: 'Σκάφη', icon: '☰' },
];

function Shell() {
  const { ready, error, activeBoat, boats, settings, updateSettings } = useApp();
  const [nav, setNav] = useStoredState<{ tab: Tab }>('nav', { tab: 'live' });
  const go = (tab: Tab) => setNav({ tab: nav.tab === tab && (tab === 'guide' || tab === 'settings') ? 'live' : tab });

  return (
    <div className={`app tab-${nav.tab}`}>
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
        <button className={`icon-btn top-btn ${nav.tab === 'guide' ? 'on' : ''}`} aria-label="Οδηγός" onClick={() => go('guide')}>
          ?
        </button>
        <button
          className="icon-btn top-btn"
          aria-label="Αλλαγή θέματος"
          onClick={() => updateSettings({ theme: settings.theme === 'day' ? 'dark' : settings.theme === 'dark' ? 'night' : 'day' })}
        >
          ◐
        </button>
        <button className={`icon-btn top-btn ${nav.tab === 'settings' ? 'on' : ''}`} aria-label="Ρυθμίσεις" onClick={() => go('settings')}>
          ⚙
        </button>
      </header>
      <main className="content">
        {error && <p className="errors">{error}</p>}
        {!ready ? (
          <p className="muted">Φόρτωση…</p>
        ) : (
          <Suspense fallback={<p className="muted">Φόρτωση χάρτη…</p>}>
            {nav.tab === 'live' && <LiveView />}
            {nav.tab === 'map' && <PlanView />}
            {nav.tab === 'polar' && <PolarView />}
            {nav.tab === 'scoring' && <ScoringView />}
            {nav.tab === 'boats' && <BoatsView />}
            {nav.tab === 'settings' && <SettingsView />}
            {nav.tab === 'guide' && <GuideView />}
          </Suspense>
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
      <NavProvider>
        <Shell />
      </NavProvider>
    </AppProvider>
  );
}
