import { lazy, Suspense, useEffect, useRef } from 'react';
import { onOpenTab, type AppTab } from './openTab';
import { AppProvider, useApp } from './AppContext';
import { NavProvider } from './NavContext';
import { InstrumentsProvider, useInstruments } from './InstrumentsContext';
import { LiveView } from './LiveView';
import { PolarView } from './PolarView';
import { RaceView } from './RaceView';
import { RaceProvider } from './RaceContext';
import { KnowledgeProvider } from './KnowledgeContext';
import { BoatsView } from './BoatsView';
import { SettingsView } from './SettingsView';
import { GuideView } from './GuideView';
import { ChatView } from './ChatView';
import { WelcomeCard } from './WelcomeCard';
import { WhatsNew } from './WhatsNew';
import { AcceptTermsScreen, AuthFlow, SetPasswordScreen } from './AuthFlow';
import { useStoredState } from './hooks';
import { Icon, type IconName } from './Icons';

// The map (MapLibre) is large: load it only when the tab is opened.
const PlanView = lazy(() => import('./PlanView').then((m) => ({ default: m.PlanView })));

type Tab = AppTab;

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'live', label: 'Live', icon: 'live' },
  { id: 'map', label: 'Χάρτης', icon: 'map' },
  { id: 'scoring', label: 'Αγώνας', icon: 'clock' },
  { id: 'chat', label: 'Σύμβουλος', icon: 'chat' },
  { id: 'polar', label: 'Polar', icon: 'polar' },
  { id: 'boats', label: 'Σκάφη', icon: 'boats' },
];

const THEMES = {
  day: { icon: 'sun', label: 'Μέρα' },
  dark: { icon: 'dusk', label: 'Σούρουπο' },
  night: { icon: 'moon', label: 'Νύχτα (κόκκινο)' },
} as const;

function Shell() {
  const { ready, error, activeBoat, boats, settings, updateSettings, account } = useApp();
  const [nav, setNav] = useStoredState<{ tab: Tab }>('nav', { tab: 'live' });
  useEffect(() => onOpenTab((tab) => setNav({ tab })), [setNav]);
  // Right after signing in, start at "Τα σκάφη μου".
  const prevAccount = useRef(account?.id);
  useEffect(() => {
    if (account?.id && !prevAccount.current) setNav({ tab: 'boats' });
    prevAccount.current = account?.id;
  }, [account?.id, setNav]);

  // Sign-in comes first; then a new password after a temporary one; then the terms.
  if (ready && !account) return <AuthFlow />;
  if (ready && account?.mustChangePassword) return <SetPasswordScreen />;
  if (ready && account && account.termsOk === false) return <AcceptTermsScreen />;
  if (ready && account && account.termsOk === undefined) return <AcceptTermsScreen />;
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
          {boats.length === 0 && <option value="">Χωρίς σκάφος</option>}
          {boats.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <InstrumentPill />
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
        {ready && <WhatsNew />}
        {!ready ? (
          <p className="muted">Φόρτωση…</p>
        ) : (
          <Suspense fallback={<p className="muted">Φόρτωση χάρτη…</p>}>
            {boats.length === 0 && (nav.tab === 'live' || nav.tab === 'map' || nav.tab === 'polar') ? (
              <WelcomeCard />
            ) : (
              <>
                {nav.tab === 'live' && <LiveView />}
                {nav.tab === 'map' && <PlanView />}
                {nav.tab === 'polar' && <PolarView />}
              </>
            )}
            {nav.tab === 'chat' && <ChatView />}
            {nav.tab === 'scoring' && <RaceView />}
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
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

/** Header pill: instruments OK / lost (only when instruments are switched on). */
function InstrumentPill() {
  const { settings } = useApp();
  const inst = useInstruments();
  if (!settings.instruments?.enabled) return null;
  return (
    <button type="button" className={`inst-pill ${inst.live ? 'ok' : 'bad'}`} onClick={() => onOpenSettings()} aria-label="Κατάσταση οργάνων">
      <span className="dot" aria-hidden="true" />
      {inst.live ? 'Όργανα' : 'Όργανα ✕'}
    </button>
  );
}

const onOpenSettings = () => window.dispatchEvent(new CustomEvent('nav-open-tab', { detail: 'settings' }));

export function App() {
  return (
    <AppProvider>
      <InstrumentsProvider>
      <NavProvider>
        <KnowledgeProvider>
          <RaceProvider>
            <Shell />
          </RaceProvider>
        </KnowledgeProvider>
      </NavProvider>
      </InstrumentsProvider>
    </AppProvider>
  );
}
