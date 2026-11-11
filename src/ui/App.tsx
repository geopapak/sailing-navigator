import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { onOpenTab, type AppTab } from './openTab';
import { AppProvider, useApp } from './AppContext';
import { NavProvider } from './NavContext';
import { InstrumentsProvider, useInstruments } from './InstrumentsContext';
import { LiveView } from './LiveView';
import { PolarView } from './PolarView';
import { RaceView } from './RaceView';
import { RaceProvider, useRace } from './RaceContext';
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
import { Dialogs } from './Dialogs';
import { Onboarding } from './Onboarding';
import { THEME_INFO } from './Appearance';
import type { Theme } from './settings';

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

  // All hooks must run before the early returns below (else React throws and the page is blank).
  const [themeOpen, setThemeOpen] = useState(false);

  // Sign-in comes first; then a new password after a temporary one; then the terms.
  if (ready && !account) return <AuthFlow />;
  if (ready && account?.mustChangePassword) return <SetPasswordScreen />;
  if (ready && account && account.termsOk === false) return <AcceptTermsScreen />;
  if (ready && account && account.termsOk === undefined) return <AcceptTermsScreen />;
  const showOnboarding = ready && !settings.onboarded && !(['boats', 'settings', 'guide'] as Tab[]).includes(nav.tab);
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
        <button className={`icon-btn top-btn ${nav.tab === 'guide' ? 'on' : ''}`} onClick={() => go('guide')}>
          <Icon name="help" />
          <small>Οδηγός</small>
        </button>
        <button
          className={`icon-btn top-btn ${themeOpen ? 'on' : ''}`}
          aria-haspopup="true"
          aria-expanded={themeOpen}
          aria-label={`Θέμα: ${THEME_INFO[settings.theme].label}. Πάτα για να διαλέξεις`}
          onClick={() => setThemeOpen((o) => !o)}
        >
          <Icon name={THEME_INFO[settings.theme].icon} />
          <small>{THEME_INFO[settings.theme].label}</small>
        </button>
        <button className={`icon-btn top-btn ${nav.tab === 'settings' ? 'on' : ''}`} onClick={() => go('settings')}>
          <Icon name="gear" />
          <small>Ρυθμίσεις</small>
        </button>
        {themeOpen && (
          <div className="theme-menu" role="menu" aria-label="Θέμα">
            {(Object.keys(THEME_INFO) as Theme[]).map((t) => (
              <button
                key={t}
                role="menuitemradio"
                aria-checked={settings.theme === t}
                className={settings.theme === t ? 'on' : ''}
                onClick={() => {
                  updateSettings({ theme: t });
                  setThemeOpen(false);
                }}
              >
                <Icon name={THEME_INFO[t].icon} />
                {THEME_INFO[t].label}
              </button>
            ))}
          </div>
        )}
      </header>
      <NetStrip />
      <RaceStrip />
      <main className="content">
        {error && <p className="errors">{error}</p>}
        {ready && <WhatsNew />}
        {!ready ? (
          <p className="muted">Φόρτωση…</p>
        ) : (
          <Suspense fallback={<p className="muted">Φόρτωση χάρτη…</p>}>
            {showOnboarding ? (
              <Onboarding />
            ) : (
            <>
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
            </>
            )}
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
      <Dialogs />
    </div>
  );
}

/** Thin strip under the top bar: shown only while offline, then «Συνδέθηκε ξανά ✓» for 3 seconds. */
/** Race mode (P-013): screen kept on while recording; warns when the track has holes. */
function RaceStrip() {
  const race = useRace();
  if (!race.recording) return null;
  if (race.gap)
    return (
      <div className="net-strip race-strip" role="alert">
        <span className="dot" aria-hidden="true" />
        <span>
          Κενό {race.gap.minutes}′ στο ίχνος: η οθόνη έκλεισε ή η εφαρμογή πήγε στο παρασκήνιο. Άφησε την εφαρμογή ανοιχτή στον αγώνα.
        </span>
        <button type="button" className="link" onClick={race.dismissGap}>
          Εντάξει
        </button>
      </div>
    );
  if (race.waitingGps)
    return (
      <div className="net-strip race-strip" role="status">
        <span className="dot" aria-hidden="true" />
        <span>Αγώνας: η καταγραφή περιμένει θέση GPS (ή όργανα).</span>
      </div>
    );
  if (race.stalledMin)
    return (
      <div className="net-strip race-strip" role="alert">
        <span className="dot" aria-hidden="true" />
        <span>Η καταγραφή σταμάτησε πριν από {race.stalledMin}′: δεν έρχεται θέση GPS.</span>
      </div>
    );
  return (
    <div className="net-strip ok race-strip quiet" role="status">
      <span className="dot" aria-hidden="true" />
      <span>Αγώνας: καταγραφή{race.wakeOn ? ' · η οθόνη μένει ανοιχτή' : ' · κράτα την οθόνη ανοιχτή'}</span>
    </div>
  );
}

function NetStrip() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [back, setBack] = useState(false);
  useEffect(() => {
    let t: number | undefined;
    const on = () => {
      setOnline(true);
      setBack(true);
      window.clearTimeout(t);
      t = window.setTimeout(() => setBack(false), 3000);
    };
    const off = () => {
      setOnline(false);
      setBack(false);
    };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.clearTimeout(t);
    };
  }, []);
  if (online && !back) return null;
  return (
    <div className={`net-strip ${online ? 'ok' : ''}`} role="status">
      <span className="dot" aria-hidden="true" />
      <span>{online ? 'Συνδέθηκε ξανά ✓' : 'Χωρίς ίντερνετ. Οι υπολογισμοί δουλεύουν· οι αλλαγές θα σωθούν μόλις επιστρέψει.'}</span>
    </div>
  );
}

/** Header pill: instruments OK / lost (only when instruments are switched on). */
function InstrumentPill() {
  const { settings } = useApp();
  const inst = useInstruments();
  if (!settings.instruments?.enabled) return null;
  return (
    <button type="button" className={`inst-pill ${inst.live ? 'ok' : 'bad'}`} onClick={() => onOpenSettings()} aria-label={inst.live ? 'Όργανα: συνδεδεμένα' : 'Όργανα: χωρίς σύνδεση'}>
      <span className="dot" aria-hidden="true" />
      <span className="inst-text">{inst.live ? 'Όργανα' : 'Όργανα ✕'}</span>
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
