import { useApp } from './AppContext';
import { openTab } from './openTab';

/** Asks the Boats tab to open a blank boat editor once it mounts. */
export const NEW_BOAT_FLAG = 'open-new-boat';

export function startNewBoat(how: 'choose' | 'pdf' | 'manual' = 'choose') {
  try {
    sessionStorage.setItem(NEW_BOAT_FLAG, how);
  } catch {
    /* ignore */
  }
  openTab('boats');
}

/** Shown instead of Live / Map / Polar until the user has a boat. */
export function WelcomeCard() {
  const { account, syncStatus } = useApp();
  return (
    <section className="card welcome">
      <h2>Καλώς ήρθες</h2>
      <p>
        Πρώτα πρόσθεσε <b>το δικό σου σκάφος</b>. Αν έχεις το πιστοποιητικό ORC σε PDF, το διαβάζουμε για σένα. Με αυτό η
        εφαρμογή ξέρει πόσο γρήγορα πρέπει να πηγαίνεις και πώς πάτε σε διορθωμένο χρόνο.
      </p>
      <div className="btn-col">
        <button className="btn primary big-btn" onClick={() => startNewBoat()}>
          + Πρόσθεσε το σκάφος σου
        </button>
        <button className="btn" onClick={() => openTab('boats')}>
          Έχω αρχείο σκάφους από άλλο κινητό
        </button>
        {!account && (
          <button className="btn" onClick={() => openTab('settings')}>
            Έχω ήδη λογαριασμό — Σύνδεση
          </button>
        )}
      </div>
      {account && syncStatus.busy && <p className="muted small">Φέρνω τα σκάφη του λογαριασμού σου…</p>}
      <p className="muted small">
        Το σκάφος σου αποθηκεύεται στον λογαριασμό σου και φαίνεται σε όλα σου τα κινητά.
      </p>
    </section>
  );
}
