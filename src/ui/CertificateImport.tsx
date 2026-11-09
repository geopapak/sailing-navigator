import { useEffect, useRef, useState } from 'react';
import { useApp } from './AppContext';
import { DEFAULT_SERVER } from './settings';
import { ApiError, accountApi } from '../sync/api';
import { checkExtract, extractToBoat, type Flag } from '../boat/certificate';
import type { BoatProfile } from '../boat/types';

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const STEPS = ['Στοιχεία σκάφους και GPH', 'Πίνακας ταχυτήτων (polars)', 'Γωνίες όρτσας και πρίμα', 'Επιλογές βαθμολογίας ToT / ToD', 'Έλεγχος συνέπειας τιμών'];

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(new Error('Δεν διαβάστηκε το αρχείο.'));
    r.readAsDataURL(file);
  });
}

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

/** Upload an ORC certificate (PDF or photo); the AI reads it into a boat the user then reviews. */
export function CertificateImport({ isOwn, onCancel, onRead }: { isOwn: boolean; onCancel: () => void; onRead: (boat: BoatProfile, flags: Flag[]) => void }) {
  const { settings, account, refreshAccount } = useApp();
  const server = settings.aiUrl || DEFAULT_SERVER;
  const [file, setFile] = useState<File>();
  const [error, setError] = useState<string>();
  const [reading, setReading] = useState(false);
  const [step, setStep] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);
  const left = account?.pdf?.left;
  const noneLeft = left === 0;

  // Progress shown while the AI works (it answers in one go; the steps pace the wait).
  useEffect(() => {
    if (!reading) return;
    setStep(0);
    const t = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 6000);
    return () => window.clearInterval(t);
  }, [reading]);

  const read = async () => {
    if (!file) return;
    if (navigator.onLine === false) {
      setError('Χρειάζεται internet για την ανάγνωση.');
      return;
    }
    setReading(true);
    setError(undefined);
    cancelled.current = false;
    try {
      const data = await toBase64(file);
      const r = await accountApi.certificate(server, settings.authToken, data, file.type);
      refreshAccount();
      if (cancelled.current) return;
      onRead(extractToBoat(r.extract, isOwn), checkExtract(r.extract));
    } catch (e) {
      if (!cancelled.current) setError(e instanceof ApiError || e instanceof Error ? e.message : 'Αποτυχία ανάγνωσης.');
    } finally {
      setReading(false);
    }
  };

  if (reading) {
    return (
      <section className="card cert">
        <h2>Διαβάζω το πιστοποιητικό</h2>
        <p className="muted small">
          {file?.name} · {file && kb(file.size)}
        </p>
        <ol className="cert-steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step ? 'done' : i === step ? 'active' : ''}>
              <span className="cert-mark" aria-hidden="true">
                {i < step ? '✓' : i === step ? '…' : ''}
              </span>
              {s}
            </li>
          ))}
        </ol>
        <p className="muted small">Συνήθως 20–60 δευτερόλεπτα. Κράτα την οθόνη ανοιχτή.</p>
        <button
          className="btn"
          onClick={() => {
            cancelled.current = true;
            setReading(false);
          }}
        >
          Ακύρωση
        </button>
      </section>
    );
  }

  return (
    <section className="card cert">
      <button type="button" className="auth-back" onClick={onCancel}>
        ‹ Πίσω
      </button>
      <h2>Πιστοποιητικό ORC</h2>
      <p className="small">ORC International ή ORC Club, όπως το κατεβάζεις από το ORC ή την ομοσπονδία.</p>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp,.pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          setError(undefined);
          if (!f) return;
          if (!TYPES.includes(f.type)) return setError('Δέχομαι PDF ή φωτογραφία (JPG/PNG).');
          if (f.size > MAX_BYTES) return setError('Το αρχείο είναι πάνω από 10 MB.');
          setFile(f);
        }}
      />
      {file ? (
        <div className="cert-file">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 3v5h5" />
          </svg>
          <div>
            <b>{file.name}</b>
            <div className="muted small">{kb(file.size)}</div>
          </div>
          <button className="icon-btn" aria-label="Αφαίρεση αρχείου" onClick={() => setFile(undefined)}>
            ×
          </button>
        </div>
      ) : (
        <button type="button" className="cert-drop" onClick={() => input.current?.click()}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 16V4M7 9l5-5 5 5" />
            <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
          </svg>
          <b>Διάλεξε PDF</b>
          <span className="muted small">ή φωτογραφία του χαρτιού · έως 10 MB</span>
        </button>
      )}
      <ol className="cert-how small">
        <li>Το AI διαβάζει στοιχεία σκάφους, polars και τις επιλογές βαθμολογίας.</li>
        <li>Ελέγχεις τα στοιχεία· ό,τι είναι αμφίβολο σημειώνεται κίτρινο.</li>
        <li>Αποθηκεύεις. Το αρχείο δεν κρατιέται στον server.</li>
      </ol>
      {left !== null && left !== undefined && (
        <p className="small cert-quota">
          Σου μένουν <b>{left} από 3</b> αναγνώσεις με AI
        </p>
      )}
      {noneLeft && <p className="warn-text">Τελείωσαν οι δωρεάν αναγνώσεις. Ζήτα από τον διαχειριστή να σου ενεργοποιήσει το AI.</p>}
      {error && <p className="warn-text">{error}</p>}
      <button className="btn primary big-btn" disabled={!file || noneLeft} onClick={read}>
        Ανάγνωση με AI
      </button>
    </section>
  );
}

/** What the AI was unsure about, shown above the boat editor until confirmed. */
export function ReviewFlags({ flags, onConfirm }: { flags: Flag[]; onConfirm: (i: number) => void }) {
  if (!flags.length) {
    return (
      <p className="card ok-box small">
        <b>Όλα ελέγχθηκαν.</b> Κοίτα τα στοιχεία και πάτα «Αποθήκευση».
      </p>
    );
  }
  return (
    <section className="card review-flags">
      <p className="small">
        <b>{flags.length === 1 ? '1 τιμή για έλεγχο.' : `${flags.length} τιμές για έλεγχο.`}</b> Ήταν δυσανάγνωστες ή δεν στέκουν. Διόρθωσέ τες
        παρακάτω αν χρειάζεται και πάτα «Σωστό».
      </p>
      <ul>
        {flags.map((f, i) => (
          <li key={`${f.field}-${i}`}>
            <div>
              <b>{f.field}</b>
              <div className="small">{f.reason}</div>
            </div>
            <button className="btn small-btn" onClick={() => onConfirm(i)}>
              Σωστό
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
