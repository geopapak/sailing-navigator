import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { isSessionTab, normalizeTab, onOpenTab, type AppTab } from './openTab';
import { AppProvider, useApp } from './AppContext';
import { NavProvider } from './NavContext';
import { InstrumentsProvider, useInstruments } from './InstrumentsContext';
import { RaceLive, RaceSetup, OpponentPosition } from './RaceView';
import { RaceProvider, useRace } from './RaceContext';
import { AlertBanner, AlertsProvider } from './RaceAlerts';
import { TrainingProvider } from './TrainingContext';
import { useShareRetry } from './crewShare';
import { InviteScreen } from './CrewViews';
import { markHadAccount, pendingInvite } from '../crew/api';
import { runBackOverride } from './backStack';
import { KnowledgeProvider } from './KnowledgeContext';
import { ChatView } from './ChatView';
import { AcceptTermsScreen, AuthFlow, SetPasswordScreen } from './AuthFlow';
import { BtnIcon, Icon, type IconName } from './Icons';
import { BoatChip } from './BoatChip';
import { useNavMode } from './hooks';
import { themeColor } from './themeColor';
import { Dialogs } from './Dialogs';
import { Onboarding } from './Onboarding';
import { onboardingDecision, readOnboardedMirror, writeOnboardedMirror } from './onboardingGate';
import { HomeView, QuickLook, SessionLive, SessionSetup } from './HomeView';
import { EndedScreen, HistoryView } from './HistoryView';
import { BoatsHub, SettingsHub } from './HubViews';
import { SessionBar, requestSessionEnd, type Ended } from './SessionBar';
import type { SessionKind } from '../race/types';
import { EVENT_TEXT } from './eventText';
import { AppUpdater } from './AppUpdater';
import { TestBadge } from './TestBadge';

// The map (MapLibre) is large: load it only when the tab is opened.
const PlanView = lazy(() => import('./PlanView').then((m) => ({ default: m.PlanView })));
const CruiseMap = lazy(() => import('./CruiseMap').then((m) => ({ default: m.CruiseMap })));

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
type Screen = { s: 'setup'; kind: SessionKind; id?: string; eventId?: string } | { s: 'ended'; e: Ended };

function Shell() {
  const { ready, error, boats, settings, updateSettings, account, syncStatus } = useApp();
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
  // Training summaries for the crew that waited for the internet (P-035).
  useShareRetry();

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
  // Inside a session only Ρυθμίσεις / Σκάφη stay from the outside tabs; anything else (e.g. a tab set
  // by a screen that was still finishing when the session started) goes to Live, never to an empty page.
  useEffect(() => {
    if (inSession && !isSessionTab(tab) && tab !== 'settings' && tab !== 'boats') setTab('session:live');
  }, [inSession, tab]);
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
  // P-056 §Δ: a device that once had an account opens an invite on «Σύνδεση», not «Νέος λογαριασμός».
  useEffect(() => {
    if (account?.id) markHadAccount();
  }, [account?.id]);
  // A11: a side rail on a low landscape screen (computed in JS: em of the text size setting).
  const navMode = useNavMode();
  // The browser bar follows the top bar: light outside a session, the session bar's colour inside.
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = themeColor(settings.theme, inSession);
  }, [inSession, settings.theme]);
  // The tab «pill» fades only between tabs: no colour fade on the first paint or a theme change.
  // Decided in the render (not in an effect), so the class is gone in the same commit as the new theme.
  const [readyTheme, setReadyTheme] = useState<string>();
  const navReady = readyTheme === settings.theme;
  useEffect(() => {
    const t = settings.theme;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => (r2 = requestAnimationFrame(() => setReadyTheme(t))));
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [settings.theme]);

  // First-run steps: once per device, never for someone with boats or sessions.
  const onboarding = onboardingDecision({
    ready,
    onboarded: settings.onboarded,
    replay: !!settings.onboardReplay,
    doneMirror: readOnboardedMirror(),
    boatCount: boats.length,
    sessionCount: race.loaded ? race.races.length : undefined,
    syncPending: !!account && syncStatus.at === undefined && !syncStatus.error,
  });
  useEffect(() => {
    if (onboarding !== 'mark-done') return;
    writeOnboardedMirror();
    updateSettings({ onboarded: true });
  }, [onboarding, updateSettings]);

  // Sign-in comes first; then a new password after a temporary one; then the terms.
  if (ready && !account) return <AuthFlow />;
  if (ready && account?.mustChangePassword) return <SetPasswordScreen />;
  if (ready && account && account.termsOk === false) return <AcceptTermsScreen />;
  if (ready && account && account.termsOk === undefined) return <AcceptTermsScreen />;

  const setup = !inSession && screen?.s === 'setup' ? screen : undefined;
  const ended = !inSession && screen?.s === 'ended' ? screen.e : undefined;
  const showOnboarding = onboarding === 'show' && !inSession && !screen && !(['boats', 'settings'] as AppTab[]).includes(tab);
  // Setup and «Γρήγορη ματιά» hide the tab bar and get «←».
  const hasBack = !inSession && (!!setup || tab === 'quick');
  const goHome = () => {
    setScreen(undefined);
    setTab('home');
  };
  const openSetup = (kind: SessionKind, id?: string, eventId?: string) => {
    if (id) race.setActiveId(id);
    setScreen({ s: 'setup', kind, id, eventId });
    window.scrollTo({ top: 0 });
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
        : 'Νέα έξοδος αναψυχής'
    : ended
      ? race.races.find((x) => x.id === ended.id)?.eventId
        ? EVENT_TEXT.ended
        : 'Η έξοδος τελείωσε'
      : (TITLE[tab] ?? 'Νέα έξοδος');
  const tabs = inSession ? TABS_IN : TABS_OUT;
  const tabClass = tab === 'session:map' ? 'map' : tab.replace(':', '-');

  return (
    <div className={`app tab-${tabClass}${inSession ? ' in-session' : ''}${navReady ? ' nav-ready' : ''}`} data-nav={hasBack ? undefined : navMode}>
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
            <button type="button" className="icon-btn top-btn back" aria-label="Πίσω" onClick={() => runBackOverride() || goHome()}>
              <Icon name="back" stroke={2.4} />
            </button>
          ) : tab === 'home' && !screen ? (
            <BoatChip />
          ) : (
            <span className="top-gap" />
          )}
          {/* Home keeps «Νέα έξοδος» for screen readers (and the E2E) until the greeting of Φ-C. */}
          <b className={`top-title${tab === 'home' && !screen && !hasBack ? ' sr-only' : ''}`} data-testid="screen-title">
            {title}
          </b>
          {tab === 'home' && !screen && !hasBack && <span className="top-fill" />}
          <TestBadge />
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
                    <BtnIcon name="back" />
                    Πίσω στην έξοδο
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
                {tab === 'session:map' && (race.kind === 'cruise' ? <CruiseMap /> : <PlanView />)}
                {tab === 'session:chat' && <ChatView />}
              </>
            ) : setup ? (
              setup.kind === 'race' ? (
                <RaceSetup id={setup.id} eventId={setup.eventId} onDone={(started) => !started && goHome()} onCancel={goHome} />
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
                    onSetup={openSetup}
                    onEvent={(id) => {
                      setHistOpen(`event:${id}`);
                      setTab('history');
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
                {tab === 'history' && <HistoryView onHome={goHome} openId={histOpen} onSetup={openSetup} />}
                {tab === 'boats' && <BoatsHub />}
                {tab === 'settings' && <SettingsHub />}
              </>
            )}
          </Suspense>
        )}
      </main>
      {!hasBack && (
        <nav className={`tabbar tabs-${tabs.length}`} style={{ '--n': tabs.length } as React.CSSProperties} aria-label={inSession ? 'Οθόνες εξόδου' : 'Κύριες οθόνες'}>
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
    <div data-testid="net-strip" className={`net-strip ${online ? 'ok' : ''}`} role="status">
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
    <button type="button" data-testid="inst-pill" className={`inst-pill ${inst.live ? 'ok' : 'bad'}`} onClick={() => onOpenSettings()} aria-label={inst.live ? 'Όργανα: συνδεδεμένα' : 'Όργανα: χωρίς σύνδεση'}>
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
              <TrainingProvider>
                <Shell />
                <AppUpdater />
              </TrainingProvider>
            </AlertsProvider>
          </RaceProvider>
        </KnowledgeProvider>
      </NavProvider>
      </InstrumentsProvider>
    </AppProvider>
  );
}
