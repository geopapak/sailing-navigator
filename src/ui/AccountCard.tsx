import { useEffect, useState } from 'react';
import { useApp } from './AppContext';
import { askConfirm, showAlert } from './Dialogs';
import { DEFAULT_SERVER } from './settings';
import { ApiError, accountApi, type AdminUser } from '../sync/api';
import { PrivacyText, TermsText, useServerConfig } from './legal';

const errText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Αποτυχία.');
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('el-GR');

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The signed-in account: status, password, data export, terms, sign out, delete; admin user list. */
export function AccountCard() {
  const { settings, account, syncStatus, signOut, sync, refreshAccount, updateSettings } = useApp();
  const server = settings.aiUrl || DEFAULT_SERVER;
  const cfg = useServerConfig(server);
  const [pw, setPw] = useState<{ open: boolean; cur: string; next: string; msg?: string }>({ open: false, cur: '', next: '' });
  const [legal, setLegal] = useState<'terms' | 'privacy'>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  if (!account) return null;
  const ai = account.ai;
  const pdf = account.pdf;

  return (
    <>
      <section className="card account">
        <div className="account-head">
          <div className="avatar" aria-hidden="true">
            {(account.name || account.email).slice(0, 1).toUpperCase()}
          </div>
          <div>
            <b>{account.name}</b>
            {account.isAdmin && <span className="badge">διαχειριστής</span>}
            <div className="muted small">{account.email}</div>
          </div>
        </div>
        <ul className="rows">
          <li>
            <span>Συγχρονισμός</span>
            <span className={syncStatus.error ? 'warn-text' : 'ok-text'}>
              {syncStatus.busy
                ? 'σε εξέλιξη…'
                : syncStatus.error
                  ? syncStatus.error
                  : syncStatus.at
                    ? `OK · ${new Date(syncStatus.at).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })}`
                    : 'αναμονή'}
            </span>
          </li>
          <li>
            <span>Σύμβουλος AI</span>
            {ai.allowed ? (
              <b>
                {ai.used} / {ai.limit} τον μήνα
              </b>
            ) : (
              <span className="warn-text">αναμένει έγκριση</span>
            )}
          </li>
          <li>
            <span>Αναγνώσεις πιστοποιητικών</span>
            <b>{pdf?.left === null || pdf?.left === undefined ? 'χωρίς όριο' : `${pdf.left} από 3 έμειναν`}</b>
          </li>
        </ul>
        <button className="btn" disabled={syncStatus.busy} onClick={() => sync().then(refreshAccount)}>
          ↻ Συγχρονισμός τώρα
        </button>

        <h4>Ασφάλεια</h4>
        <ul className="rows">
          <li>
            <button className="row-btn" onClick={() => setPw({ open: !pw.open, cur: '', next: '' })}>
              Αλλαγή κωδικού <span aria-hidden="true">›</span>
            </button>
          </li>
          <li>
            <button className="row-btn" onClick={signOut}>
              Αποσύνδεση <span aria-hidden="true">›</span>
            </button>
          </li>
        </ul>
        {pw.open && (
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const r = await accountApi.changePassword(server, settings.authToken, pw.cur, pw.next);
                updateSettings({ account: r.user });
                setPw({ open: false, cur: '', next: '', msg: 'Ο κωδικός άλλαξε. Οι άλλες συσκευές αποσυνδέθηκαν.' });
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
        {pw.msg && <p className="small">{pw.msg}</p>}

        <h4>Τα δεδομένα μου</h4>
        <ul className="rows">
          <li>
            <button
              className="row-btn"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setMsg(undefined);
                try {
                  const data = await accountApi.exportData(server, settings.authToken);
                  download(`sailing-navigator-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
                } catch (e) {
                  setMsg(errText(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <span>
                Κατέβασε τα δεδομένα μου
                <span className="muted small block">Όλα σε ένα αρχείο JSON</span>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          </li>
          <li>
            <button className="row-btn" onClick={() => setLegal(legal === 'terms' ? undefined : 'terms')}>
              Όροι χρήσης {account.termsAt ? `(αποδεκτοί ${fmtDate(account.termsAt)})` : ''} <span aria-hidden="true">›</span>
            </button>
          </li>
          <li>
            <button className="row-btn" onClick={() => setLegal(legal === 'privacy' ? undefined : 'privacy')}>
              Πολιτική απορρήτου <span aria-hidden="true">›</span>
            </button>
          </li>
        </ul>
        {msg && <p className="warn-text">{msg}</p>}
        {legal && (
          <div className="legal-box">{legal === 'terms' ? <TermsText cfg={cfg} onPrivacy={() => setLegal('privacy')} /> : <PrivacyText cfg={cfg} />}</div>
        )}

        <details>
          <summary className="danger-text">Διαγραφή λογαριασμού</summary>
          <p className="small">
            Σβήνονται οριστικά ο λογαριασμός, τα σκάφη και οι διαδρομές από τον server. Δεν αναιρείται. Κατέβασε πρώτα τα
            δεδομένα σου αν τα θες. Τα δεδομένα σε αυτή τη συσκευή μένουν.
          </p>
          <button
            className="btn danger"
            onClick={async () => {
              if (!(await askConfirm('Οριστική διαγραφή του λογαριασμού και των δεδομένων του στο cloud; Δεν αναιρείται.', { ok: 'Διαγραφή λογαριασμού', danger: true }))) return;
              try {
                await accountApi.deleteAccount(server, settings.authToken);
                await signOut();
              } catch (err) {
                await showAlert(errText(err));
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
      if (r.tempPassword) setNote(`Προσωρινός κωδικός για ${u.email}: ${r.tempPassword} — δώσ' τον στον χρήστη· στη σύνδεση θα βάλει δικό του.`);
      await load();
    } catch (e) {
      setError(errText(e));
    }
  };

  const pending = users?.filter((u) => !u.ai.allowed).length ?? 0;
  const resets = users?.filter((u) => u.resetRequestedAt) ?? [];
  return (
    <section className="card admin">
      <div className="advisor-head">
        <h3>Χρήστες</h3>
        <button className="link inline" onClick={load} aria-label="Ανανέωση λίστας">
          ↻
        </button>
      </div>
      {resets.length > 0 && (
        <p className="advisor-caution small">
          {resets.length === 1 ? '1 χρήστης ζητά' : `${resets.length} χρήστες ζητούν`} νέο κωδικό: πάτα «Νέος κωδικός» και δώσ' τον του.
        </p>
      )}
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
            <li key={u.id} className={u.resetRequestedAt ? 'reset-req' : ''}>
              <div>
                <b>{u.name}</b> <span className="muted small">{u.email}</span>
                {u.isAdmin && <span className="badge">διαχ.</span>}
                <div className="muted small">
                  από {fmtDate(u.createdAt)} · AI {u.ai.used}/{u.ai.limit} τον μήνα · PDF {u.pdf?.used ?? 0}
                  {u.termsOk ? '' : ' · όροι εκκρεμούν'}
                </div>
                {u.resetRequestedAt && <div className="warn-text small">Ζήτησε νέο κωδικό στις {fmtDate(u.resetRequestedAt)}</div>}
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
                    className={`btn small-btn ${u.resetRequestedAt ? 'primary' : ''}`}
                    onClick={async () => (await askConfirm(`Νέος προσωρινός κωδικός για ${u.email};`, { ok: 'Νέος κωδικός' })) && patch(u, { resetPassword: true })}
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
