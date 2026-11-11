import { useEffect, useState } from 'react';

/** Chrome/Android "install app" prompt, captured once for the whole session. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | undefined;
const subs = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    subs.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => {
    deferred = undefined;
    subs.forEach((f) => f());
  });
}

/** True when the app already runs from the home screen. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function useInstallPrompt() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  return deferred;
}

/** Step-by-step help to put the app on the home screen (iPhone: manual; Android: install button). */
export function InstallHelp() {
  const prompt = useInstallPrompt();
  const [os, setOs] = useState<'ios' | 'android'>(() => (isIos() ? 'ios' : 'android'));
  const [done, setDone] = useState(false);

  if (isStandalone()) return <p className="small">✓ Η εφαρμογή είναι ήδη στην αρχική οθόνη σου.</p>;

  return (
    <div>
      <div className="seg" role="group" aria-label="Τύπος κινητού">
        <button className={os === 'ios' ? 'on' : ''} onClick={() => setOs('ios')}>
          iPhone
        </button>
        <button className={os === 'android' ? 'on' : ''} onClick={() => setOs('android')}>
          Android
        </button>
      </div>
      {os === 'ios' ? (
        <ol className="how">
          <li>
            Άνοιξε την εφαρμογή στο <b>Safari</b>.
          </li>
          <li>
            Πάτα <span className="kbd">⬆︎</span> <b>Κοινοποίηση</b> (κάτω στη μέση).
          </li>
          <li>
            Κατέβα και πάτα <b>«Προσθήκη στην οθόνη Αφετηρίας»</b> και μετά <b>Προσθήκη</b>.
          </li>
        </ol>
      ) : prompt && !done ? (
        <>
          <p className="small">Πάτα το κουμπί και μετά «Εγκατάσταση».</p>
          <button
            className="btn primary big-btn"
            onClick={async () => {
              await prompt.prompt();
              const r = await prompt.userChoice;
              if (r.outcome === 'accepted') setDone(true);
            }}
          >
            ⬇ Εγκατάσταση εφαρμογής
          </button>
        </>
      ) : done ? (
        <p className="small">✓ Έγινε. Θα τη βρεις στην αρχική οθόνη.</p>
      ) : (
        <ol className="how">
          <li>
            Άνοιξε την εφαρμογή στο <b>Chrome</b>.
          </li>
          <li>
            Πάτα <span className="kbd">⋮</span> πάνω δεξιά.
          </li>
          <li>
            Πάτα <b>«Εγκατάσταση εφαρμογής»</b> ή <b>«Προσθήκη στην αρχική οθόνη»</b>.
          </li>
        </ol>
      )}
    </div>
  );
}
