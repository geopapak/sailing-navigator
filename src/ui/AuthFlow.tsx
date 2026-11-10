import { useState, type ReactNode } from 'react';
import { useApp } from './AppContext';
import { DEFAULT_SERVER } from './settings';
import { ApiError, accountApi } from '../sync/api';
import { PrivacyText, TERMS_VERSION, TermsText, useServerConfig } from './legal';

const errText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Αποτυχία. Δοκίμασε ξανά.');

function Logo() {
  return (
    <div className="auth-logo">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v15M12 3l7 13H12M12 6 6 16h6M4 19h16l-2 2H6z" />
      </svg>
      <h1>Sailing Navigator</h1>
      <p className="muted">Ψηφιακός τακτικός για αγώνες ORC</p>
    </div>
  );
}

function Back({ onClick, label = 'Πίσω' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="auth-back" onClick={onClick}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {label}
    </button>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return <div className="auth">{children}</div>;
}

type View = 'login' | 'signup' | 'forgot' | 'forgotSent' | 'terms' | 'privacy';

/** First screen when nobody is signed in: sign in, sign up, forgot password, terms. */
export function AuthFlow() {
  const { settings, signedIn } = useApp();
  const server = settings.aiUrl || DEFAULT_SERVER;
  const cfg = useServerConfig(server);
  const [view, setView] = useState<View>('login');
  const [back, setBack] = useState<View>('login');
  const [f, setF] = useState({ name: '', email: '', password: '', terms: false, privacy: false, marketing: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const go = (v: View) => {
    setError(undefined);
    if (v === 'terms' || v === 'privacy') setBack(view === 'terms' || view === 'privacy' ? back : view);
    setView(v);
    window.scrollTo({ top: 0 });
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  if (view === 'terms' || view === 'privacy') {
    return (
      <Screen>
        <Back onClick={() => go(back)} />
        <h1 className="auth-title">{view === 'terms' ? 'Όροι χρήσης' : 'Πολιτική απορρήτου'}</h1>
        {view === 'terms' ? <TermsText cfg={cfg} onPrivacy={() => setView('privacy')} /> : <PrivacyText cfg={cfg} />}
      </Screen>
    );
  }

  if (view === 'forgot' || view === 'forgotSent') {
    return (
      <Screen>
        <Back onClick={() => go('login')} />
        <h1 className="auth-title">Ξέχασα τον κωδικό</h1>
        {view === 'forgot' ? (
          <form
            className="auth-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await accountApi.forgot(server, f.email);
                setView('forgotSent');
              });
            }}
          >
            <p>Γράψε το email του λογαριασμού σου. Ο διαχειριστής θα σου δώσει προσωρινό κωδικό.</p>
            <label>
              Email
              <input type="email" inputMode="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@example.gr" />
            </label>
            {error && <p className="warn-text">{error}</p>}
            <button className="btn primary auth-cta" disabled={busy}>
              {busy ? 'Περίμενε…' : 'Ζήτα νέο κωδικό'}
            </button>
          </form>
        ) : (
          <div className="auth-done">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--good)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12.5l2.5 2.5L16 9.5" />
            </svg>
            <h2>Το αίτημα στάλθηκε</h2>
            <p>Ο διαχειριστής βλέπει το αίτημα στη λίστα χρηστών και θα σου δώσει προσωρινό κωδικό, από τηλέφωνο ή μήνυμα.</p>
            <p>Με τον προσωρινό κωδικό συνδέεσαι και βάζεις αμέσως δικό σου.</p>
            <button className="btn primary auth-cta" onClick={() => go('login')}>
              Πίσω στη σύνδεση
            </button>
          </div>
        )}
        <p className="auth-note muted small">Σύντομα: σύνδεσμος επαναφοράς με email.</p>
      </Screen>
    );
  }

  if (view === 'signup') {
    const ready = f.terms && f.privacy;
    return (
      <Screen>
        <Back onClick={() => go('login')} />
        <h1 className="auth-title">Νέος λογαριασμός</h1>
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready) {
              setError('Τσέκαρε τους όρους και την πολιτική απορρήτου για να συνεχίσεις.');
              return;
            }
            run(async () => {
              const r = await accountApi.register(server, {
                email: f.email,
                password: f.password,
                name: f.name,
                acceptTerms: f.terms,
                acceptPrivacy: f.privacy,
                marketing: f.marketing,
              });
              setF({ ...f, password: '' });
              await signedIn(r.token, r.user);
            });
          }}
        >
          <label>
            Όνομα
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" maxLength={60} placeholder="Γιώργος" />
          </label>
          <label>
            Email
            <input type="email" inputMode="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@example.gr" />
          </label>
          <label>
            Κωδικός
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
              placeholder="Τουλάχιστον 8 χαρακτήρες"
            />
          </label>
          <div className="consents">
            <label className="consent">
              <input type="checkbox" checked={f.terms} onChange={(e) => setF({ ...f, terms: e.target.checked })} />
              <span>
                Αποδέχομαι τους{' '}
                <button type="button" className="link inline" onClick={() => go('terms')}>
                  Όρους χρήσης
                </button>{' '}
                <span className="req">*</span>
              </span>
            </label>
            <label className="consent">
              <input type="checkbox" checked={f.privacy} onChange={(e) => setF({ ...f, privacy: e.target.checked })} />
              <span>
                Διάβασα την{' '}
                <button type="button" className="link inline" onClick={() => go('privacy')}>
                  Πολιτική απορρήτου
                </button>{' '}
                και συναινώ στην επεξεργασία των δεδομένων μου (GDPR) <span className="req">*</span>
              </span>
            </label>
            <label className="consent">
              <input type="checkbox" checked={f.marketing} onChange={(e) => setF({ ...f, marketing: e.target.checked })} />
              <span className="muted">Θέλω email για νέες λειτουργίες (προαιρετικό)</span>
            </label>
          </div>
          <p className="muted small">
            <span className="req">*</span> υποχρεωτικό
          </p>
          {error && <p className="warn-text">{error}</p>}
          <button className="btn primary auth-cta" disabled={busy} aria-disabled={!ready}>
            {busy ? 'Περίμενε…' : 'Δημιουργία λογαριασμού'}
          </button>
        </form>
        <p className="auth-switch">
          Έχεις λογαριασμό;{' '}
          <button type="button" className="link inline" onClick={() => go('login')}>
            Σύνδεση
          </button>
        </p>
      </Screen>
    );
  }

  return (
    <Screen>
      <Logo />
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const r = await accountApi.login(server, f.email, f.password);
            setF({ ...f, password: '' });
            await signedIn(r.token, r.user);
          });
        }}
      >
        <label>
          Email
          <input type="email" inputMode="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@example.gr" />
        </label>
        <label>
          Κωδικός
          <input type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="••••••••" />
        </label>
        <div className="auth-forgot">
          <button type="button" className="link inline" onClick={() => go('forgot')}>
            Ξέχασα τον κωδικό
          </button>
        </div>
        {error && <p className="warn-text">{error}</p>}
        <button className="btn primary auth-cta" disabled={busy}>
          {busy ? 'Σύνδεση…' : 'Σύνδεση'}
        </button>
      </form>
      <div className="auth-or">
        <span />ή<span />
      </div>
      <button type="button" className="btn auth-cta outline" onClick={() => go('signup')}>
        Νέος λογαριασμός
      </button>
      <p className="auth-legal muted small">
        <button type="button" className="link inline" onClick={() => go('terms')}>
          Όροι χρήσης
        </button>{' '}
        ·{' '}
        <button type="button" className="link inline" onClick={() => go('privacy')}>
          Πολιτική απορρήτου
        </button>
      </p>
    </Screen>
  );
}

/** After a temporary password: choose your own before anything else. */
export function SetPasswordScreen() {
  const { settings, updateSettings, signOut } = useApp();
  const server = settings.aiUrl || DEFAULT_SERVER;
  const [p, setP] = useState({ a: '', b: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <Screen>
      <div className="auth-icon" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </div>
      <h1 className="auth-title">Βάλε δικό σου κωδικό</h1>
      <p>Μπήκες με προσωρινό κωδικό. Διάλεξε νέο για να συνεχίσεις.</p>
      <form
        className="auth-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (p.a !== p.b) {
            setError('Οι δύο κωδικοί δεν ταιριάζουν.');
            return;
          }
          setBusy(true);
          setError(undefined);
          try {
            const r = await accountApi.changePassword(server, settings.authToken, '', p.a);
            updateSettings({ account: r.user });
          } catch (err) {
            setError(errText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Νέος κωδικός
          <input type="password" autoComplete="new-password" required minLength={8} value={p.a} onChange={(e) => setP({ ...p, a: e.target.value })} placeholder="Τουλάχιστον 8 χαρακτήρες" />
        </label>
        <label>
          Ξανά ο νέος κωδικός
          <input type="password" autoComplete="new-password" required minLength={8} value={p.b} onChange={(e) => setP({ ...p, b: e.target.value })} />
        </label>
        <p className="muted small">Οι άλλες συσκευές σου αποσυνδέονται και θα χρειαστεί να συνδεθείς ξανά.</p>
        {error && <p className="warn-text">{error}</p>}
        <button className="btn primary auth-cta" disabled={busy}>
          {busy ? 'Αποθήκευση…' : 'Αποθήκευση και συνέχεια'}
        </button>
      </form>
      <button type="button" className="link inline auth-switch" onClick={signOut}>
        Αποσύνδεση
      </button>
    </Screen>
  );
}

/** Existing users (or new terms): accept once before continuing. */
export function AcceptTermsScreen() {
  const { settings, updateSettings, signOut } = useApp();
  const server = settings.aiUrl || DEFAULT_SERVER;
  const cfg = useServerConfig(server);
  const [c, setC] = useState({ terms: false, privacy: false });
  const [show, setShow] = useState<'terms' | 'privacy'>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (show) {
    return (
      <Screen>
        <Back onClick={() => setShow(undefined)} />
        <h1 className="auth-title">{show === 'terms' ? 'Όροι χρήσης' : 'Πολιτική απορρήτου'}</h1>
        {show === 'terms' ? <TermsText cfg={cfg} onPrivacy={() => setShow('privacy')} /> : <PrivacyText cfg={cfg} />}
      </Screen>
    );
  }
  const ready = c.terms && c.privacy;
  return (
    <Screen>
      <h1 className="auth-title">Νέοι όροι χρήσης</h1>
      <p>Για να συνεχίσεις να χρησιμοποιείς την εφαρμογή, διάβασε και αποδέξου τους όρους. Τι άλλαξε:</p>
      <ul className="auth-list">
        <li>Σημειώσεις τοπικής γνώσης: όσες βάζεις «Πλήρωμα» τις βλέπουν όσοι έχουν το ίδιο σκάφος, με το μικρό σου όνομα.</li>
        <li>Αναζήτηση σκαφών στο ORC και θέσεις αντιπάλων από AIS (aisstream.io) μέσω του server.</li>
        <li>Η πορεία των αγώνων σου μένει μόνο στη συσκευή σου.</li>
      </ul>
      <div className="consents">
        <label className="consent">
          <input type="checkbox" checked={c.terms} onChange={(e) => setC({ ...c, terms: e.target.checked })} />
          <span>
            Αποδέχομαι τους{' '}
            <button type="button" className="link inline" onClick={() => setShow('terms')}>
              Όρους χρήσης
            </button>
          </span>
        </label>
        <label className="consent">
          <input type="checkbox" checked={c.privacy} onChange={(e) => setC({ ...c, privacy: e.target.checked })} />
          <span>
            Συναινώ στην{' '}
            <button type="button" className="link inline" onClick={() => setShow('privacy')}>
              Πολιτική απορρήτου
            </button>
          </span>
        </label>
      </div>
      {error && <p className="warn-text">{error}</p>}
      <button
        className="btn primary auth-cta"
        disabled={!ready || busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          try {
            const r = await accountApi.acceptTerms(server, settings.authToken, TERMS_VERSION);
            updateSettings({ account: r.user });
          } catch (e) {
            setError(errText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Περίμενε…' : 'Συνέχεια'}
      </button>
      <button type="button" className="link inline auth-switch" onClick={signOut}>
        Δεν συμφωνώ — αποσύνδεση
      </button>
    </Screen>
  );
}
