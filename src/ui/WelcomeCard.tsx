import { useApp } from './AppContext';
import { openTab } from './openTab';

/** Asks the Boats tab to open a blank boat editor once it mounts. */
export const NEW_BOAT_FLAG = 'open-new-boat';

export function startNewBoat() {
  try {
    sessionStorage.setItem(NEW_BOAT_FLAG, '1');
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
        Πρώτα πρόσθεσε <b>το δικό σου σκάφος</b>: όνομα, polars από το πιστοποιητικό ORC και επιλογές βαθμολογίας. Με αυτά
        υπολογίζονται τα targets, η διαδρομή και ο διορθωμένος χρόνος.
      </p>
      <div className="btn-col">
        <button className="btn primary big-btn" onClick={startNewBoat}>
          + Πρόσθεσε το σκάφος σου
        </button>
        <button className="btn" onClick={() => openTab('boats')}>
          Έχω αρχείο σκάφους (Import JSON)
        </button>
        {!account && (
          <button className="btn" onClick={() => openTab('settings')}>
            Έχω ήδη λογαριασμό — Σύνδεση
          </button>
        )}
      </div>
      {account && syncStatus.busy && <p className="muted small">Φέρνω τα σκάφη του λογαριασμού σου…</p>}
      <p className="muted small">
        Με λογαριασμό (⚙ → Λογαριασμός) το σκάφος σου αποθηκεύεται και στο cloud και εμφανίζεται σε όλες τις συσκευές σου.
      </p>
    </section>
  );
}
