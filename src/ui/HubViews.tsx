import { lazy, useState } from 'react';
import { useApp } from './AppContext';
import { BoatsView } from './BoatsView';
import { PolarView } from './PolarView';
import { CrewCard } from './CrewViews';
import { KnowledgeView } from './KnowledgeView';
import { SettingsView } from './SettingsView';
import { GuideView } from './GuideView';
import { NEW_BOAT_FLAG } from './WelcomeCard';

// The map (MapLibre) is large: load it only when it is opened.
const PlanView = lazy(() => import('./PlanView').then((m) => ({ default: m.PlanView })));

type BoatsSub = 'list' | 'polar' | 'cert' | 'crew' | 'courses' | 'knowledge';

const BOAT_LINKS: [Exclude<BoatsSub, 'list'>, string][] = [
  ['polar', 'Polar και στόχοι'],
  ['cert', 'Πιστοποιητικό ORC'],
  ['crew', 'Πλήρωμα'],
  ['courses', 'Διαδρομές μου'],
  ['knowledge', 'Τοπική γνώση'],
];

function Back({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="btn back-btn" onClick={onClick}>
      ← {label}
    </button>
  );
}

/** «Σκάφη» (AC 10): the boats, plus Polar, certificate, crew, courses and local knowledge. */
export function BoatsHub() {
  const { boats, activeBoat } = useApp();
  const [sub, setSub] = useState<BoatsSub>('list');
  const back = <Back label="Σκάφη" onClick={() => setSub('list')} />;
  if (sub !== 'list')
    return (
      <>
        {back}
        {sub === 'polar' && <PolarView />}
        {sub === 'cert' && <BoatsView key="cert" />}
        {sub === 'crew' && <CrewCard boats={boats} />}
        {sub === 'courses' && <PlanView />}
        {sub === 'knowledge' && <KnowledgeView />}
      </>
    );
  return (
    <>
      {boats.length > 0 && (
        <section className="card hub">
          <h3>{activeBoat?.name ?? 'Σκάφη'}</h3>
          <div className="hub-links">
            {BOAT_LINKS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="btn"
                onClick={() => {
                  if (id === 'cert') {
                    try {
                      sessionStorage.setItem(NEW_BOAT_FLAG, 'pdf');
                    } catch {
                      /* ignore */
                    }
                  }
                  setSub(id);
                  window.scrollTo({ top: 0 });
                }}
              >
                {label} <span aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <BoatsView />
    </>
  );
}

/** «Ρυθμίσεις» (AC 11): today's settings, plus the guide. */
export function SettingsHub() {
  const [guide, setGuide] = useState(false);
  if (guide)
    return (
      <>
        <Back label="Ρυθμίσεις" onClick={() => setGuide(false)} />
        <GuideView />
      </>
    );
  return (
    <>
      <section className="card hub">
        <div className="hub-links">
          <button type="button" className="btn" onClick={() => setGuide(true)}>
            Οδηγός <span aria-hidden="true">›</span>
          </button>
        </div>
      </section>
      <SettingsView />
    </>
  );
}
