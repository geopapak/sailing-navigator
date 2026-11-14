import { useState } from 'react';
import { useApp } from './AppContext';
import { AppearancePickers } from './Appearance';
import { InstallHelp } from './InstallHelp';
import { startNewBoat } from './WelcomeCard';
import { openTab } from './openTab';
import { Icon } from './Icons';
import { writeOnboardedMirror } from './onboardingGate';

const STEPS = 5;

/**
 * First run, one thing per screen, in plain words. "Αργότερα" is always there.
 * The boat comes last because adding it leaves this screen for the Boats tab.
 */
export function Onboarding() {
  const { account, settings, updateSettings } = useApp();
  const [step, setStep] = useState(0);
  const firstName = account?.name?.trim().split(/\s+/)[0];

  const finish = (then?: () => void) => {
    // Remember it first (also outside IndexedDB), then leave this screen.
    writeOnboardedMirror();
    updateSettings({ onboarded: true, onboardReplay: false });
    if (then) then();
    else openTab('home');
  };
  const next = () => (step < STEPS - 1 ? setStep(step + 1) : finish());

  const nav = (label = 'Επόμενο', skip = true) => (
    <div className="onboard-nav">
      <button className="btn primary" onClick={next}>
        {label}
      </button>
      <div className="row">
        {step > 0 ? (
          <button className="btn link-like" onClick={() => setStep(step - 1)}>
            ‹ Πίσω
          </button>
        ) : (
          <span />
        )}
        {skip && (
          <button className="btn link-like" onClick={next}>
            Αργότερα
          </button>
        )}
      </div>
    </div>
  );

  return (
    <section className="card onboard" aria-live="polite">
      <div className="dots" role="img" aria-label={`Βήμα ${step + 1} από ${STEPS}`}>
        {Array.from({ length: STEPS }, (_, i) => (
          <span key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>

      {step === 0 && (
        <>
          <div className="big-icon" aria-hidden>
            <Icon name="live" size={64} />
          </div>
          <h2 className="center">Καλώς ήρθες{firstName ? `, ${firstName}` : ''}</h2>
          <p>
            Η εφαρμογή σού λέει <b>πόσο γρήγορα πρέπει να πηγαίνει το σκάφος</b> σε κάθε άνεμο και <b>πώς πάτε σε διορθωμένο
            χρόνο</b>.
          </p>
          <p>Θα σου πάρει 2 λεπτά να τη στήσεις. Μπορείς να σταματήσεις και να συνεχίσεις αργότερα.</p>
          {nav('Ξεκινάμε', false)}
          <p className="center">
            <button className="btn link-like" onClick={() => finish()}>
              Παράλειψη όλων
            </button>
          </p>
        </>
      )}

      {step === 1 && (
        <>
          <h2>1. Να βλέπεις καλά</h2>
          <p className="small">Δοκίμασε. Η αλλαγή φαίνεται αμέσως.</p>
          <AppearancePickers />
          {nav()}
        </>
      )}

      {step === 2 && (
        <>
          <h2>2. Βάλ' την στην αρχική οθόνη</h2>
          <p className="small">Έτσι ανοίγει σαν κανονική εφαρμογή, με ένα άγγιγμα, ακόμα και χωρίς ίντερνετ.</p>
          <InstallHelp />
          {nav('Το έκανα')}
        </>
      )}

      {step === 3 && (
        <>
          <h2>3. Πόσα νούμερα θέλεις;</h2>
          <p className="small">Έχεις εμπειρία με όργανα αγώνων (TWS, TWA, VMG);</p>
          <button className={`opt ${settings.liveMode === 'simple' ? 'on' : ''}`} onClick={() => updateSettings({ liveMode: 'simple' })}>
            <span className="ic" aria-hidden>
              ①
            </span>
            <span>
              <b>Όχι — Απλό</b>
              <span className="small">Τρία μεγάλα νούμερα με απλά ελληνικά.</span>
            </span>
          </button>
          <button className={`opt ${settings.liveMode === 'full' ? 'on' : ''}`} onClick={() => updateSettings({ liveMode: 'full' })}>
            <span className="ic" aria-hidden>
              ⑥
            </span>
            <span>
              <b>Ναι — Πλήρες</b>
              <span className="small">Όλα τα νούμερα: VMG, polar, πανί.</span>
            </span>
          </button>
          <p className="small muted">Το αλλάζεις όποτε θες, πάνω πάνω στην οθόνη Live.</p>
          {nav()}
        </>
      )}

      {step === 4 && (
        <>
          <h2>4. Το σκάφος σου</h2>
          <p className="small">Διάλεξε έναν τρόπο. Μπορείς να το αλλάξεις μετά.</p>
          <button className="opt on" onClick={() => finish(() => startNewBoat('pdf'))}>
            <span className="ic" aria-hidden>
              📄
            </span>
            <span>
              <b>Έχω το πιστοποιητικό ORC (PDF)</b>
              <span className="small">
                Το διαβάζουμε για σένα και συμπληρώνουμε τα πάντα. <b>Προτείνεται.</b>
              </span>
            </span>
          </button>
          <button className="opt" onClick={() => finish(() => startNewBoat('choose'))}>
            <span className="ic" aria-hidden>
              📲
            </span>
            <span>
              <b>Έχω αρχείο σκάφους από άλλο κινητό</b>
              <span className="small">Από το πλήρωμα ή από δεύτερη συσκευή</span>
            </span>
          </button>
          <button className="opt" onClick={() => finish(() => startNewBoat('manual'))}>
            <span className="ic" aria-hidden>
              ✎
            </span>
            <span>
              <b>Θα τα γράψω μόνος μου</b>
              <span className="small">Όνομα, αριθμός πανιού, τύπος. Τα υπόλοιπα αργότερα.</span>
            </span>
          </button>
          <p className="small muted">
            Στην αρχική διαλέγεις <b>Αγώνα</b>, <b>Προπόνηση</b> ή <b>Βόλτα</b>. Μέσα στην έξοδο έχεις <b>Live</b>, <b>Χάρτη</b> και{' '}
            <b>Σύμβουλο</b>. Για βοήθεια: <b>Ρυθμίσεις → Οδηγός</b>.
          </p>
          <div className="onboard-nav">
            <div className="row">
              <button className="btn link-like" onClick={() => setStep(step - 1)}>
                ‹ Πίσω
              </button>
              <button className="btn link-like" onClick={() => finish()}>
                Αργότερα
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
