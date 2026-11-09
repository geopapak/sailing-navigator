import { useEffect, useState } from 'react';
import { useApp } from './AppContext';
import { DEFAULT_SERVER } from './settings';
import { ApiError, accountApi, type AdminUser } from '../sync/api';

const errText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Αποτυχία.');

/** Sign up / sign in, sync status, password, and (for the admin) user approvals. */
export function AccountCard() {
  const { settings, account, syncStatus, signedIn, signOut, sync, refreshAccount } = useApp();
  const server = settings.aiUrl || DEFAULT_SERVER;
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [pw, setPw] = useState<{ open: boolean; cur: string; next: string; msg?: string }>({ open: false, cur: '', next: '' });

  if (!account) {
    return (
      <section className="card form-grid account">
        <h3>Λογαριασμός</h3>
        <p className="small full">
          Με λογαριασμό τα σκάφη και οι διαδρομές σου αποθηκεύονται και στο cloud και συγχρονίζονται σε όλες τις συσκευές σου.
          Ο σύμβουλος AI ενεργοποιείται για τον λογαριασμό σου από τον διαχειριστή.
        </p>
        <div className="seg full">
          <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>
            Σύνδεση
          </button>
          <button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>
            Νέος λογαριασμός
          </button>
        </div>
        <form
          className="full form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(undefined);
            try {
              const r =
                mode === 'login'
                  ? await accountApi.login(server, email, password)
                  : await accountApi.register(server, email, password, name);
              setPassword('');
              await signedIn(r.token, r.user);
            } catch (err) {
              setError(errText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode === 'register' && (
            <label className="full">
              Όνομα
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} />
            </label>
          )}
          <label className="full">
            Email
            <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label className="full">
            Κωδικός {mode === 'register' && <span className="muted small">(τουλάχιστον 8 χαρακτήρες)</span>}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'register' ? 8 : undefined}
              required
            />
          </label>
          <div className="full">
            <button className="btn primary" disabled={busy}>
              {busy ? 'Περίμενε…' : mode === 'login' ? 'Σύνδεση' : 'Δημιουργία λογαριασμού'}
            </button>
            {error && <p className="warn-text">{error}</p>}
            {mode === 'register' && (
              <p className="muted small">
                Τα σκάφη που έχεις ήδη σε αυτή τη συσκευή θα ανέβουν στον νέο λογαριασμό. Ξέχασες τον κωδικό; Ο διαχειριστής μπορεί να
                σου δώσει προσωρινό.
              </p>
            )}
          </div>
        </form>
      </section>
    );
  }

  const ai = account.ai;
  return (
    <>
      <section className="card form-grid account">
        <h3>Λογαριασμός</h3>
        <p className="full">
          <b>{account.name}</b> · {account.email}
          {account.isAdmin && <span className="badge">διαχειριστής</span>}
        </p>
        <p className="small full">
          Συγχρονισμός:{' '}
          {syncStatus.busy
            ? 'σε εξέλιξη…'
            : syncStatus.error
              ? <span className="warn-text">{syncStatus.error}</span>
              : syncStatus.at
                ? `OK, ${new Date(syncStatus.at).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })}`
                : 'αναμονή'}
        </p>
        <p className="small full">
          Σύμβουλος AI:{' '}
          {ai.allowed ? (
            <>
              ενεργός · {ai.used}/{ai.limit} ερωτήσεις αυτόν τον μήνα
            </>
          ) : (
            <span className="warn-text">αναμένει έγκριση από τον διαχειριστή</span>
          )}
        </p>
        <div className="full row wrap">
          <button className="btn" disabled={syncStatus.busy} onClick={() => sync().then(refreshAccount)}>
            ↻ Συγχρονισμός τώρα
          </button>
          <button className="btn" onClick={() => setPw({ open: !pw.open, cur: '', next: '' })}>
            Αλλαγή κωδικού
          </button>
          <button className="btn" onClick={signOut}>
            Αποσύνδεση
          </button>
        </div>
        {pw.open && (
          <form
            className="full form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await accountApi.changePassword(server, settings.authToken, pw.cur, pw.next);
                setPw({ open: false, cur: '', next: '', msg: 'Ο κωδικός άλλαξε.' });
              } catch (err) {
                setPw({ ...pw, msg: errText(err) });
              }
            }}
          >
            <label>
              Τρέχων κωδικός
              <input type="password" autoComplete="current-password" value={pw.cur} onChange={(e) => setPw({ ...pw, cur: e.target.value })} required />
            </label>
            <label>
              Νέος κωδικός
              <input type="password" autoComplete="new-password" minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />
            </label>
            <div className="full">
              <button className="btn primary">Αποθήκευση</button>
            </div>
          </form>
        )}
        {pw.msg && <p className="small full">{pw.msg}</p>}
        <details className="full">
          <summary>Διαγραφή λογαριασμού</summary>
          <p className="small">
            Σβήνει οριστικά τον λογαριασμό και ό,τι είναι αποθηκευμένο στο cloud. Τα δεδομένα σε αυτή τη συσκευή μένουν.
          </p>
          <button
            className="btn danger"
            onClick={async () => {
              if (!window.confirm('Οριστική διαγραφή του λογαριασμού και των δεδομένων του στο cloud; Δεν αναιρείται.')) return;
              try {
                await accountApi.deleteAccount(server, settings.authToken);
                await signOut();
              } catch (err) {
                window.alert(errText(err));
              }
            }}
          >
            Διαγραφή λογαριασμού
          </button>
        </details>
      </section>
      {account.isAdmin && <AdminCard server={server} token={settings.authToken} />}
    </>
  );
}

function AdminCard({ server, token }: { server: string; token: string }) {
  const [users, setUsers] = useState<AdminUser[]>();
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();

  const load = () =>
    accountApi
      .users(server, token)
      .then((r) => setUsers(r.users))
      .catch((e) => setError(errText(e)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, token]);

  const patch = async (u: AdminUser, p: { aiAllowed?: boolean; aiLimit?: number; resetPassword?: boolean }) => {
    try {
      const r = await accountApi.updateUser(server, token, u.id, p);
      if (r.tempPassword) setNote(`Προσωρινός κωδικός για ${u.email}: ${r.tempPassword} — δώσ' τον στον χρήστη να τον αλλάξει.`);
      await load();
    } catch (e) {
      setError(errText(e));
    }
  };

  const pending = users?.filter((u) => !u.ai.allowed).length ?? 0;
  return (
    <section className="card admin">
      <div className="advisor-head">
        <h3>Χρήστες</h3>
        <button className="link inline" onClick={load}>
          ↻
        </button>
      </div>
      <p className="muted small">
        Ενεργοποίησε τον σύμβουλο AI μόνο για όσους εμπιστεύεσαι — κάθε ερώτηση χρεώνεται στο δικό σου Claude API.
        {pending > 0 && ` ${pending} χωρίς έγκριση.`}
      </p>
      {error && <p className="warn-text">{error}</p>}
      {note && <p className="small advisor-caution">{note}</p>}
      {!users ? (
        <p className="muted small">Φόρτωση…</p>
      ) : (
        <ul className="user-list">
          {users.map((u) => (
            <li key={u.id}>
              <div>
                <b>{u.name}</b> <span className="muted small">{u.email}</span>
                {u.isAdmin && <span className="badge">διαχ.</span>}
                <div className="muted small">
                  από {new Date(u.createdAt).toLocaleDateString('el-GR')} · AI {u.ai.used}/{u.ai.limit} τον μήνα
                </div>
              </div>
              <div className="row wrap">
                <label className="check">
                  <input type="checkbox" checked={u.ai.allowed} disabled={u.isAdmin} onChange={(e) => patch(u, { aiAllowed: e.target.checked })} /> AI
                </label>
                <label className="small">
                  Όριο/μήνα{' '}
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    defaultValue={u.ai.limit}
                    style={{ width: '5em' }}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v !== u.ai.limit) patch(u, { aiLimit: v });
                    }}
                  />
                </label>
                {!u.isAdmin && (
                  <button
                    className="btn small-btn"
                    onClick={() => window.confirm(`Νέος προσωρινός κωδικός για ${u.email};`) && patch(u, { resetPassword: true })}
                  >
                    Νέος κωδικός
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
