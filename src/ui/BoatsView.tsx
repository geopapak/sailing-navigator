import { useEffect, useRef, useState } from 'react';
import { NEW_BOAT_FLAG } from './WelcomeCard';
import { useApp } from './AppContext';
import { BoatEditor } from './BoatEditor';
import type { BoatProfile } from '../boat/types';
import { newBoatId, parseBoatJson } from '../boat/store';
import { CertificateImport, ReviewFlags } from './CertificateImport';
import type { Flag } from '../boat/certificate';

function blankBoat(isOwn = false): BoatProfile {
  return {
    id: newBoatId('boat'),
    name: '',
    isOwn,
    performanceFactor: 1,
    sails: [{ id: 'main', name: 'Μεγίστη', kind: 'main' }],
    sailRules: [],
    scoring: [],
    updatedAt: 0,
  };
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BoatsView() {
  const { boats, activeBoat, settings, updateSettings, saveBoat, deleteBoat } = useApp();
  const [editing, setEditing] = useState<{ boat: BoatProfile; isNew: boolean; flags?: Flag[] }>();
  const [mode, setMode] = useState<'list' | 'add' | 'pdf'>('list');
  const hasOwn = boats.some((b) => b.isOwn);
  // Opened from the welcome screen: show the ways to add a boat.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(NEW_BOAT_FLAG)) {
        sessionStorage.removeItem(NEW_BOAT_FLAG);
        setMode('add');
      }
    } catch {
      /* ignore */
    }
  }, []);
  const [msg, setMsg] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);

  const saved = async (b: BoatProfile) => {
    await saveBoat(b);
    // The first boat, or a new own boat when none was active, becomes the active one.
    const becomesActive = !activeBoat || (!!b.isOwn && !activeBoat.isOwn);
    if (becomesActive) updateSettings({ activeBoatId: b.id });
    setEditing(undefined);
    setMode('list');
    setMsg(becomesActive || activeBoat?.id === b.id ? `Αποθηκεύτηκε: ${b.name}. Είναι το ενεργό σκάφος σε Live, Χάρτη και Σύμβουλο.` : `Αποθηκεύτηκε: ${b.name}`);
  };

  const jsonInput = (
    <input
      ref={fileRef}
      type="file"
      accept="application/json,.json"
      hidden
      onChange={async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
          const b = parseBoatJson(await file.text());
          if (boats.some((x) => x.id === b.id) && !confirm(`Υπάρχει ήδη «${b.name}». Αντικατάσταση;`)) return;
          await saved(b);
          setMsg(`Εισήχθη: ${b.name}`);
        } catch (err) {
          setMsg((err as Error).message);
        }
      }}
    />
  );

  if (editing) {
    return (
      <>
        {editing.flags && (
          <ReviewFlags flags={editing.flags} onConfirm={(i) => setEditing({ ...editing, flags: editing.flags!.filter((_, j) => j !== i) })} />
        )}
        <BoatEditor initial={editing.boat} isNew={editing.isNew} onCancel={() => setEditing(undefined)} onSave={saved} />
      </>
    );
  }

  if (mode === 'pdf') {
    return (
      <CertificateImport
        isOwn={!hasOwn}
        onCancel={() => setMode(boats.length ? 'add' : 'list')}
        onRead={(boat, flags) => setEditing({ boat, isNew: true, flags })}
      />
    );
  }

  const chooser = (
    <section className="add-boat">
      <div className="add-boat-head">
        <h2>{boats.length === 0 ? 'Πρόσθεσε το σκάφος σου' : 'Προσθήκη σκάφους'}</h2>
        <p className="muted small">Με τα polars και τους συντελεστές του υπολογίζονται targets, διαδρομή και διορθωμένος χρόνος.</p>
      </div>
      <button className="add-opt recommended" onClick={() => setMode('pdf')}>
        <span className="add-ico" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 3v5h5M9 15h6M9 18h4" />
          </svg>
        </span>
        <span>
          <b>Πιστοποιητικό ORC (PDF)</b>
          <span className="small">Το AI το διαβάζει και τα συμπληρώνει όλα</span>
          <span className="add-tag">ΠΡΟΤΕΙΝΕΤΑΙ</span>
        </span>
      </button>
      <button className="add-opt" onClick={() => fileRef.current?.click()}>
        <span className="add-ico" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 4H6a2 2 0 0 0-2 2v4l-2 2 2 2v4a2 2 0 0 0 2 2h2M16 4h2a2 2 0 0 1 2 2v4l2 2-2 2v4a2 2 0 0 1-2 2h-2" />
          </svg>
        </span>
        <span>
          <b>Αρχείο JSON</b>
          <span className="small">Από «Export» άλλης συσκευής ή πληρώματος</span>
        </span>
      </button>
      <button className="add-opt" onClick={() => setEditing({ boat: blankBoat(!hasOwn), isNew: true })}>
        <span className="add-ico" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20h4L19 9l-4-4L4 16z" />
            <path d="M13.5 6.5l4 4" />
          </svg>
        </span>
        <span>
          <b>Χειροκίνητα</b>
          <span className="small">Γράφεις μόνος σου στοιχεία και polars</span>
        </span>
      </button>
      {boats.length > 0 && (
        <button className="btn" onClick={() => setMode('list')}>
          Άκυρο
        </button>
      )}
      {jsonInput}
    </section>
  );

  if (boats.length === 0 || mode === 'add') {
    return (
      <div className="boats">
        {msg && <p className="toast">{msg}</p>}
        {chooser}
      </div>
    );
  }

  return (
    <div className="boats">
      {msg && <p className="toast">{msg}</p>}
      <ul className="boat-list">
        {boats.map((b) => (
          <li key={b.id} className={`card ${b.id === activeBoat?.id ? 'active' : ''}`}>
            <div className="boat-head">
              <div>
                <strong>{b.name}</strong> {b.sailNumber && <span className="muted">{b.sailNumber}</span>}
                <div className="muted small">
                  {b.design ?? ''}
                  {b.gph ? ` · GPH ${b.gph}` : ''}
                  {b.polar ? ' · polars' : ' · μόνο συντελεστές'}
                  {b.isOwn ? ' · δικό μας' : ''}
                </div>
              </div>
              {b.id === activeBoat?.id ? (
                <span className="badge">Ενεργό</span>
              ) : (
                <button className="btn" onClick={() => updateSettings({ activeBoatId: b.id })}>
                  Επιλογή
                </button>
              )}
            </div>
            <div className="btn-row">
              <button className="btn" onClick={() => setEditing({ boat: structuredClone(b), isNew: false })}>
                Επεξεργασία
              </button>
              <button
                className="btn"
                onClick={() => setEditing({ boat: { ...structuredClone(b), id: newBoatId(b.name), name: `${b.name} (αντίγραφο)`, isOwn: false }, isNew: true })}
              >
                Αντίγραφο
              </button>
              <button className="btn" onClick={() => download(`${b.id}.json`, JSON.stringify(b, null, 2))}>
                Export
              </button>
              <button
                className="btn danger"
                onClick={async () => {
                  if (!confirm(`Διαγραφή του «${b.name}»;`)) return;
                  await deleteBoat(b.id);
                  if (settings.activeBoatId === b.id) updateSettings({ activeBoatId: boats.find((x) => x.id !== b.id)?.id ?? '' });
                }}
              >
                Διαγραφή
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button className="btn add-more" onClick={() => setMode('add')}>
        + Προσθήκη σκάφους
      </button>
    </div>
  );
}
