import { lazy, Suspense, useEffect } from 'react';
import { onOpenTab, type AppTab } from './openTab';
import { AppProvider, useApp } from './AppContext';
import { NavProvider } from './NavContext';
import { LiveView } from './LiveView';
import { PolarView } from './PolarView';
import { ScoringView } from './ScoringView';
import { BoatsView } from './BoatsView';
import { SettingsView } from './SettingsView';
import { GuideView } from './GuideView';
import { useStoredState } from './hooks';
import { Icon, type IconName } from './Icons';

// The map (MapLibre) is large: load it only when the tab is opened.
const PlanView = lazy(() => import('./PlanView').then((m) => ({ default: m.PlanView })));

type Tab = AppTab;

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'live', label: 'Live', icon: 'live' },
  { id: 'map', label: 'Χάρτης', icon: 'map' },
  { id: 'polar', label: 'Polar', icon: 'polar' },
  { id: 'scoring', label: 'Χρόνος', icon: 'clock' },
  { id: 'boats', label: 'Σκάφη', icon: 'boats' },
];

const THEMES = {
  day: { icon: 'sun', label: 'Μέρα' },
  dark: { icon: 'dusk', label: 'Σούρουπο' },
  night: { icon: 'moon', label: 'Νύχτα (κόκκινο)' },
} as const;

function Shell() {
  const { ready, error, activeBoat, boats, settings, updateSettings } = useApp();
  const [nav, setNav] = useStoredState<{ tab: Tab }>('nav', { tab: 'live' });
  useEffect(() => onOpenTab((tab) => setNav({ tab })), [setNav]);
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
        <button className={`icon-btn top-btn ${nav.tab === 'guide' ? 'on' : ''}`} aria-label="Οδηγός" title="Οδηγός" onClick={() => go('guide')}>
          <Icon name="help" />
        </button>
        <button
          className="icon-btn top-btn"
          aria-label={`Θέμα: ${THEMES[settings.theme].label}. Πάτα για αλλαγή`}
          title={`Θέμα: ${THEMES[settings.theme].label}`}
          onClick={() => updateSettings({ theme: settings.theme === 'day' ? 'dark' : settings.theme === 'dark' ? 'night' : 'day' })}
        >
          <Icon name={THEMES[settings.theme].icon} />
        </button>
        <button className={`icon-btn top-btn ${nav.tab === 'settings' ? 'on' : ''}`} aria-label="Ρυθμίσεις" title="Ρυθμίσεις" onClick={() => go('settings')}>
          <Icon name="gear" />
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
          <button key={t.id} className={nav.tab === t.id ? 'on' : ''} aria-current={nav.tab === t.id ? 'page' : undefined} onClick={() => setNav({ tab: t.id })}>
            <span className="tab-icon">
              <Icon name={t.icon} />
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
