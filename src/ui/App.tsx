import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { isSessionTab, normalizeTab, onOpenTab, type AppTab } from './openTab';
import { AppProvider, useApp } from './AppContext';
import { NavProvider } from './NavContext';
import { InstrumentsProvider, useInstruments } from './InstrumentsContext';
import { RaceLive, RaceSetup, OpponentPosition } from './RaceView';
import { RaceProvider, useRace } from './RaceContext';
import { AlertBanner, AlertsProvider } from './RaceAlerts';
import { InviteScreen } from './CrewViews';
import { pendingInvite } from '../crew/api';
import { KnowledgeProvider } from './KnowledgeContext';
import { ChatView } from './ChatView';
import { AcceptTermsScreen, AuthFlow, SetPasswordScreen } from './AuthFlow';
import { Icon, type IconName } from './Icons';
import { Dialogs } from './Dialogs';
import { Onboarding } from './Onboarding';
import { HomeView, QuickLook, SessionLive, SessionSetup } from './HomeView';
import { EndedScreen, HistoryView } from './HistoryView';
import { BoatsHub, SettingsHub } from './HubViews';
import { SessionBar, requestSessionEnd, type Ended } from './SessionBar';
import type { SessionKind } from '../race/types';
import { AppUpdater } from './AppUpdater';
import { TestBadge } from './TestBadge';

// The map (MapLibre) is large: load it only when the tab is opened.
const PlanView = lazy(() => import('./PlanView').then((m) => ({ default: m.PlanView })));

/** Outside a session (P-033). */
const TABS_OUT: { id: AppTab; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Αρχική', icon: 'home' },
  { id: 'history', label: 'Ιστορικό', icon: 'history' },
  { id: 'boats', label: 'Σκάφη', icon: 'boats' },
  { id: 'settings', label: 'Ρυθμίσεις', icon: 'gear' },
];
/** Inside a session: only what is needed at sea. */
const TABS_IN: { id: AppTab; label: string; icon: IconName }[] = [
  { id: 'session:live', label: 'Live', icon: 'live' },
  { id: 'session:map', label: 'Χάρτης', icon: 'map' },
  { id: 'session:chat', label: 'Σύμβουλος', icon: 'chat' },
];

const TITLE: Partial<Record<AppTab, string>> = {
  home: 'Νέα έξοδος',
  history: 'Οι έξοδοί μου',
  boats: 'Σκάφη',
  settings: 'Ρυθμίσεις',
  quick: 'Γρήγορη ματιά',
};

/** Screens over the tabs: a session's setup (no tab bar, «←») or the end of a session. */
type Screen = { s: 'setup'; kind: SessionKind; id?: string } | { s: 'ended'; e: Ended };

function Shell() {
  const { ready, error, activeBoat, boats, settings, updateSettings, account } = useApp();
  const race = useRace();
  const inSession = !!race.session;
  // The app always opens at «Νέα έξοδος», or inside the running session (never at the last tab).
  const [tab, setTab] = useState<AppTab>('home');
  const [screen, setScreen] = useState<Screen>();
  const [histOpen, setHistOpen] = useState<string>();
  const [opponent, setOpponent] = useState<{ entryId?: string }>();
  const [flash, setFlash] = useState<string>();
  const inSessionRef = useRef(inSession);
  inSessionRef.current = inSession;

  useEffect(
    () =>
      onOpenTab((t) => {
        setScreen(undefined);
        setHistOpen(undefined);
        setTab(normalizeTab(t, inSessionRef.current));
      }),
    [],
  );
  // Into the session as soon as one runs (also after a reload); back home when it ends.
  useEffect(() => {
    if (!race.loaded) return;
    if (inSession) {
      setScreen((s) => (s?.s === 'setup' ? undefined : s));
      setTab((t) => (isSessionTab(t) ? t : 'session:live'));
    } else setTab((t) => (isSessionTab(t) ? 'home' : t));
    setOpponent(undefined);
  }, [inSession, race.loaded]);
  // Right after signing in, start at «Νέα έξοδος».
  const prevAccount = useRef(account?.id);
  useEffect(() => {
    if (account?.id && !prevAccount.current) setTab(inSessionRef.current ? 'session:live' : 'home');
    prevAccount.current = account?.id;
  }, [account?.id]);
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(undefined), 4000);
    return () => window.clearTimeout(t);
  }, [flash]);

  // All hooks must run before the early returns below (else React throws and the page is blank).
  const [invite, setInvite] = useState(() => pendingInvite());

  // Sign-in comes first; then a new password after a temporary one; then the terms.
  if (ready && !account) return <AuthFlow />;
  if (ready && account?.mustChangePassword) return <SetPasswordScreen />;
  if (ready && account && account.termsOk === false) return <AcceptTermsScreen />;
  if (ready && account && account.termsOk === undefined) return <AcceptTermsScreen />;

  const setup = !inSession && screen?.s === 'setup' ? screen : undefined;
  const ended = !inSession && screen?.s === 'ended' ? screen.e : undefined;
  const showOnboarding = ready && !settings.onboarded && !inSession && !screen && !(['boats', 'settings'] as AppTab[]).includes(tab);
  // Setup and «Γρήγορη ματιά» hide the tab bar and get «←».
  const hasBack = !inSession && (!!setup || tab === 'quick');
  const goHome = () => {
    setScreen(undefined);
    setTab('home');
  };
  const pick = (t: AppTab) => {
    setScreen(undefined);
    setHistOpen(undefined);
    setOpponent(undefined);
    setTab(t);
    window.scrollTo({ top: 0 });
  };
  const title = setup
    ? setup.kind === 'race'
      ? setup.id
        ? 'Αγώνας'
        : 'Νέος αγώνας'
      : setup.kind === 'training'
        ? 'Νέα προπόνηση'
        : 'Νέα βόλτα'
    : ended
      ? 'Η έξοδος τελείωσε'
      : (TITLE[tab] ?? 'Νέα έξοδος');
  const tabs = inSession ? TABS_IN : TABS_OUT;
  const tabClass = tab === 'session:map' ? 'map' : tab.replace(':', '-');

  return (
    <div className={`app tab-${tabClass} ${inSession ? 'in-session' : ''}`}>
      {inSession ? (
        <SessionBar
          onEnded={(e) => {
            setScreen({ s: 'ended', e });
            setTab('home');
          }}
        />
      ) : (
        <header className="topbar">
          {hasBack ? (
            <button type="button" className="icon-btn top-btn back" aria-label="Πίσω" onClick={goHome}>
              ←
            </button>
          ) : (
            <span className="top-gap" />
          )}
          <b className="top-title">{title}</b>
          <TestBadge />
          {tab === 'home' && !screen && (
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
          )}
          <InstrumentPill />
        </header>
      )}
      <NetStrip where={inSession ? 'session' : tab === 'home' && !screen ? 'home' : 'other'} />
      {flash && (
        <div className="net-strip ok" role="status">
          <span className="dot" aria-hidden="true" />
          <span>{flash}</span>
        </div>
      )}
      <AlertBanner />
      <main className="content">
        {error && <p className="errors">{error}</p>}
        {!ready ? (
          <p className="muted">Φόρτωση…</p>
        ) : (
          <Suspense fallback={<p className="muted">Φόρτωση χάρτη…</p>}>
            {invite && account ? (
              <InviteScreen token={invite} onDone={() => setInvite(undefined)} />
            ) : showOnboarding ? (
              <Onboarding />
            ) : inSession ? (
              <>
                {!isSessionTab(tab) && (
                  <button type="button" className="btn back-btn" onClick={() => pick('session:live')}>
                    ← Πίσω στην έξοδο
                  </button>
                )}
                {tab === 'settings' && <SettingsHub />}
                {tab === 'boats' && <BoatsHub />}
                {tab === 'session:live' &&
                  (race.kind === 'race' ? (
                    opponent ? (
                      <OpponentPosition entryId={opponent.entryId} onDone={() => setOpponent(undefined)} />
                    ) : (
                      <RaceLive onOpponent={(entryId) => setOpponent({ entryId })} onEnd={requestSessionEnd} />
                    )
                  ) : (
                    <SessionLive />
                  ))}
                {tab === 'session:map' && <PlanView />}
                {tab === 'session:chat' && <ChatView />}
              </>
            ) : setup ? (
              setup.kind === 'race' ? (
                <RaceSetup id={setup.id} onDone={(started) => !started && goHome()} onCancel={goHome} />
              ) : (
                <SessionSetup kind={setup.kind} onStarted={() => undefined} />
              )
            ) : ended ? (
              <EndedScreen
                ended={ended}
                onUndone={() => {
                  setScreen(undefined);
                  setFlash('Η έξοδος συνεχίζει');
                }}
                onHistory={(id) => {
                  setScreen(undefined);
                  setHistOpen(id);
                  setTab('history');
                }}
              />
            ) : (
              <>
                {tab === 'home' && (
                  <HomeView
                    onSetup={(kind, id) => {
                      if (id) race.setActiveId(id);
                      setScreen({ s: 'setup', kind, id });
                      window.scrollTo({ top: 0 });
                    }}
                    onQuick={() => pick('quick')}
                    onHistory={() => pick('history')}
                    onOpen={(r) => {
                      setHistOpen(r.id);
                      setTab('history');
                    }}
                  />
                )}
                {tab === 'quick' && <QuickLook onHome={goHome} />}
                {tab === 'history' && <HistoryView onHome={goHome} openId={histOpen} />}
                {tab === 'boats' && <BoatsHub />}
                {tab === 'settings' && <SettingsHub />}
              </>
            )}
          </Suspense>
        )}
      </main>
      {!hasBack && (
        <nav className={`tabbar tabs-${tabs.length}`} aria-label={inSession ? 'Οθόνες εξόδου' : 'Κύριες οθόνες'}>
          {tabs.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => pick(t.id)}>
              <span className="tab-icon">
                <Icon name={t.icon} />
              </span>
              <span className="tab-label">{t.label}</span>
            </button>
          ))}
        </nav>
      )}
      <Dialogs />
    </div>
  );
}

/** Thin strip under the top bar: shown only while offline, then «Συνδέθηκε ξανά ✓» for 3 seconds. */
function NetStrip({ where }: { where: 'home' | 'session' | 'other' }) {
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
      <span>
        {online
          ? 'Συνδέθηκε ξανά ✓'
          : where === 'session'
            ? 'Χωρίς ίντερνετ. Η καταγραφή και το Live δουλεύουν κανονικά.'
            : where === 'home'
              ? 'Χωρίς ίντερνετ. Μπορείς να ξεκινήσεις έξοδο κανονικά.'
              : 'Χωρίς ίντερνετ. Οι υπολογισμοί δουλεύουν· οι αλλαγές θα σωθούν μόλις επιστρέψει.'}
      </span>
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
            <AlertsProvider>
              <Shell />
              <AppUpdater />
            </AlertsProvider>
          </RaceProvider>
        </KnowledgeProvider>
      </NavProvider>
      </InstrumentsProvider>
    </AppProvider>
  );
}
