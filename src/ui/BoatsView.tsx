import { useRef, useState } from 'react';
import { useApp } from './AppContext';
import { BoatEditor } from './BoatEditor';
import type { BoatProfile } from '../boat/types';
import { newBoatId, parseBoatJson } from '../boat/store';

function blankBoat(): BoatProfile {
  return {
    id: newBoatId('boat'),
    name: '',
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
  const [editing, setEditing] = useState<{ boat: BoatProfile; isNew: boolean }>();
  const [msg, setMsg] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);

  if (editing) {
    return (
      <BoatEditor
        initial={editing.boat}
        isNew={editing.isNew}
        onCancel={() => setEditing(undefined)}
        onSave={async (b) => {
          await saveBoat(b);
          setEditing(undefined);
          setMsg(`Αποθηκεύτηκε: ${b.name}`);
        }}
      />
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
              {boats.length > 1 && (
                <button
                  className="btn danger"
                  onClick={async () => {
                    if (!confirm(`Διαγραφή του «${b.name}»;`)) return;
                    await deleteBoat(b.id);
                    if (settings.activeBoatId === b.id) updateSettings({ activeBoatId: boats.find((x) => x.id !== b.id)!.id });
                  }}
                >
                  Διαγραφή
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="btn-row">
        <button className="btn primary" onClick={() => setEditing({ boat: blankBoat(), isNew: true })}>
          + Νέο σκάφος
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Import JSON
        </button>
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
              await saveBoat(b);
              setMsg(`Εισήχθη: ${b.name}`);
            } catch (err) {
              setMsg((err as Error).message);
            }
          }}
        />
      </div>
    </div>
  );
}
