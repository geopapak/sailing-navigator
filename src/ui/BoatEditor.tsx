import { useState } from 'react';
import { useHoldUpdate } from './useHoldUpdate';
import type { BoatProfile, PolarTable, Sail, SailKind, SailRule } from '../boat/types';
import { STANDARD_SCORING_OPTIONS } from '../boat/scoringOptions';
import { validateBoat } from '../boat/validate';
import { NumField } from './NumberStepper';
import { offerUndo } from './Dialogs';

interface Props {
  initial: BoatProfile;
  isNew: boolean;
  onSave: (b: BoatProfile) => Promise<void>;
  onCancel: () => void;
}

const KIND_LABEL: Record<SailKind, string> = {
  main: 'Μαΐστρα',
  headsail: 'Πανί πλώρης (τζένοα/φλόκος)',
  spinnaker: 'Μπαλόνι (spinnaker)',
  reaching: 'Ανοιχτών (Code 0 κ.λπ.)',
  other: 'Άλλο',
};

const EMPTY_POLAR: PolarTable = {
  tws: [6, 8, 10, 12, 14, 16, 20],
  beatAngle: Array(7).fill(42),
  beatVMG: Array(7).fill(0),
  speeds: { '52': Array(7).fill(0), '60': Array(7).fill(0), '75': Array(7).fill(0), '90': Array(7).fill(0), '110': Array(7).fill(0), '120': Array(7).fill(0), '135': Array(7).fill(0), '150': Array(7).fill(0) },
  runVMG: Array(7).fill(0),
  gybeAngle: Array(7).fill(150),
};

export function BoatEditor({ initial, isNew, onSave, onCancel }: Props) {
  const [b, setB] = useState<BoatProfile>(initial);
  useHoldUpdate(true); // unsaved boat form (P-043)
  const [errors, setErrors] = useState<string[]>([]);
  const [polarJson, setPolarJson] = useState<string>();
  const set = (patch: Partial<BoatProfile>) => setB((p) => ({ ...p, ...patch }));

  const updateSail = (i: number, patch: Partial<Sail>) =>
    set({ sails: b.sails.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const updateRule = (i: number, patch: Partial<SailRule>) =>
    set({ sailRules: b.sailRules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const setScoring = (id: string, field: 'tod' | 'tot', v: number | undefined) => {
    const label = STANDARD_SCORING_OPTIONS.find((o) => o.id === id)!.label;
    const existing = b.scoring.find((o) => o.id === id);
    const next = { id, label, tod: existing?.tod ?? NaN, tot: existing?.tot ?? NaN, [field]: v ?? NaN };
    const others = b.scoring.filter((o) => o.id !== id);
    const keep = Number.isFinite(next.tod) || Number.isFinite(next.tot);
    const order = STANDARD_SCORING_OPTIONS.map((o) => o.id);
    set({ scoring: (keep ? [...others, next] : others).sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id)) });
  };

  const p = b.polar;
  const setPolar = (np: PolarTable | undefined) => set({ polar: np });
  const setPolarRow = (key: string, i: number, v: number | undefined) => {
    if (!p) return;
    const val = v ?? 0;
    if (key.startsWith('twa:')) {
      const a = key.slice(4);
      setPolar({ ...p, speeds: { ...p.speeds, [a]: p.speeds[a].map((x, j) => (j === i ? val : x)) } });
    } else {
      const k = key as 'tws' | 'beatAngle' | 'beatVMG' | 'runVMG' | 'gybeAngle';
      setPolar({ ...p, [k]: p[k].map((x, j) => (j === i ? val : x)) });
    }
  };

  const save = async () => {
    const clean: BoatProfile = {
      ...b,
      scoring: b.scoring.filter((o) => Number.isFinite(o.tod) && Number.isFinite(o.tot)),
    };
    const errs = validateBoat(clean);
    const half = b.scoring.filter((o) => !(Number.isFinite(o.tod) && Number.isFinite(o.tot)));
    if (half.length) errs.push(`Λείπει ToD ή ToT για: ${half.map((o) => o.label).join(', ')}.`);
    setErrors(errs);
    if (errs.length) return;
    await onSave(clean);
  };

  const polarRows: { key: string; label: string; values: number[] }[] = p
    ? [
        { key: 'beatAngle', label: 'Beat °', values: p.beatAngle },
        { key: 'beatVMG', label: 'Beat VMG', values: p.beatVMG },
        ...Object.keys(p.speeds)
          .sort((x, y) => Number(x) - Number(y))
          .map((a) => ({ key: `twa:${a}`, label: `${a}°`, values: p.speeds[a] })),
        { key: 'runVMG', label: 'Run VMG', values: p.runVMG },
        { key: 'gybeAngle', label: 'Gybe °', values: p.gybeAngle },
      ]
    : [];

  return (
    <div className="editor">
      <h2>{isNew ? 'Νέο σκάφος' : `Επεξεργασία: ${initial.name}`}</h2>

      <section className="card form-grid">
        <h3>Στοιχεία</h3>
        <label>
          Όνομα
          <input value={b.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label>
          Αριθμός πανιού
          <input value={b.sailNumber ?? ''} onChange={(e) => set({ sailNumber: e.target.value || undefined })} />
        </label>
        <label>
          Τύπος / σχέδιο
          <input value={b.design ?? ''} onChange={(e) => set({ design: e.target.value || undefined })} />
        </label>
        <label>
          GPH
          <NumField value={b.gph} onChange={(v) => set({ gph: v })} />
        </label>
        <label>
          CDL
          <NumField value={b.cdl} onChange={(v) => set({ cdl: v })} />
        </label>
        <label>
          Λήξη πιστοποιητικού
          <input type="date" value={b.certificateValidUntil ?? ''} onChange={(e) => set({ certificateValidUntil: e.target.value || undefined })} />
        </label>
        <label>
          Συντελεστής απόδοσης (% των polars)
          <NumField
            value={Math.round(b.performanceFactor * 1000) / 10}
            onChange={(v) => set({ performanceFactor: v === undefined ? 1 : v / 100 })}
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={!!b.isOwn} onChange={(e) => set({ isOwn: e.target.checked })} /> Δικό μας σκάφος
        </label>
        <label className="full">
          Σημειώσεις
          <textarea rows={2} value={b.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} />
        </label>
      </section>

      <section className="card">
        <h3>Πανιά</h3>
        <table className="data edit">
          <thead>
            <tr>
              <th>Κωδικός</th>
              <th>Όνομα</th>
              <th>Τύπος</th>
              <th>m²</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {b.sails.map((s, i) => (
              <tr key={i}>
                <td>
                  <input
                    value={s.id}
                    onChange={(e) => {
                      const old = s.id;
                      const id = e.target.value;
                      setB((prev) => ({
                        ...prev,
                        sails: prev.sails.map((x, j) => (j === i ? { ...x, id } : x)),
                        sailRules: prev.sailRules.map((r) => (r.sailId === old ? { ...r, sailId: id } : r)),
                      }));
                    }}
                  />
                </td>
                <td>
                  <input value={s.name} onChange={(e) => updateSail(i, { name: e.target.value })} />
                </td>
                <td>
                  <select value={s.kind} onChange={(e) => updateSail(i, { kind: e.target.value as SailKind })}>
                    {Object.entries(KIND_LABEL).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <NumField value={s.area} onChange={(v) => updateSail(i, { area: v })} width="5em" />
                </td>
                <td>
                  <button
                    className="icon-btn"
                    aria-label="Αφαίρεση"
                    onClick={() => set({ sails: b.sails.filter((_, j) => j !== i), sailRules: b.sailRules.filter((r) => r.sailId !== s.id) })}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn" onClick={() => set({ sails: [...b.sails, { id: `sail${b.sails.length + 1}`, name: '', kind: 'headsail' }] })}>
          + Πανί
        </button>
      </section>

      <section className="card">
        <h3>Κανόνες επιλογής πανιών</h3>
        <p className="muted small">
          Το πανί προτείνεται όταν TWA και TWS είναι μέσα στα όρια (από ≤ τιμή &lt; έως). Ισχύει ο πρώτος κανόνας που ταιριάζει.
        </p>
        <table className="data edit">
          <thead>
            <tr>
              <th>Πανί</th>
              <th>TWA από</th>
              <th>TWA έως</th>
              <th>TWS από</th>
              <th>TWS έως</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {b.sailRules.map((r, i) => (
              <tr key={i}>
                <td>
                  <select value={r.sailId} onChange={(e) => updateRule(i, { sailId: e.target.value })}>
                    {b.sails
                      .filter((s) => s.kind !== 'main')
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name || s.id}
                        </option>
                      ))}
                  </select>
                </td>
                {(['twaMin', 'twaMax', 'twsMin', 'twsMax'] as const).map((k) => (
                  <td key={k}>
                    <NumField value={r[k]} onChange={(v) => updateRule(i, { [k]: v ?? 0 })} width="4em" />
                  </td>
                ))}
                <td className="nowrap">
                  <button
                    className="icon-btn"
                    aria-label="Πάνω"
                    disabled={i === 0}
                    onClick={() => {
                      const rs = [...b.sailRules];
                      [rs[i - 1], rs[i]] = [rs[i], rs[i - 1]];
                      set({ sailRules: rs });
                    }}
                  >
                    ↑
                  </button>
                  <button className="icon-btn" aria-label="Αφαίρεση" onClick={() => set({ sailRules: b.sailRules.filter((_, j) => j !== i) })}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          className="btn"
          disabled={!b.sails.some((s) => s.kind !== 'main')}
          onClick={() =>
            set({
              sailRules: [
                ...b.sailRules,
                { sailId: b.sails.find((s) => s.kind !== 'main')!.id, twaMin: 0, twaMax: 181, twsMin: 0, twsMax: 99 },
              ],
            })
          }
        >
          + Κανόνας
        </button>
      </section>

      <section className="card">
        <h3>Συντελεστές διορθωμένου χρόνου</h3>
        <table className="data edit">
          <thead>
            <tr>
              <th>Επιλογή</th>
              <th>ToD (s/NM)</th>
              <th>ToT</th>
            </tr>
          </thead>
          <tbody>
            {STANDARD_SCORING_OPTIONS.map((o) => {
              const cur = b.scoring.find((x) => x.id === o.id);
              const val = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? v : undefined);
              return (
                <tr key={o.id}>
                  <td>{o.label}</td>
                  <td>
                    <NumField value={val(cur?.tod)} onChange={(v) => setScoring(o.id, 'tod', v)} width="5.5em" ariaLabel={`${o.label} ToD`} />
                  </td>
                  <td>
                    <NumField value={val(cur?.tot)} onChange={(v) => setScoring(o.id, 'tot', v)} width="5.5em" ariaLabel={`${o.label} ToT`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>Polars</h3>
        {!p ? (
          <>
            <p className="muted small">Χωρίς polars το σκάφος χρησιμοποιείται μόνο για διορθωμένο χρόνο.</p>
            <button className="btn" onClick={() => setPolar(structuredClone(EMPTY_POLAR))}>
              + Πίνακας polars
            </button>
          </>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data edit polar-edit">
                <thead>
                  <tr>
                    <th>TWS</th>
                    {p.tws.map((t, i) => (
                      <th key={i}>
                        <NumField value={t} onChange={(v) => setPolarRow('tws', i, v)} width="3.5em" />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {polarRows.map((row) => (
                    <tr key={row.key}>
                      <th>{row.label}</th>
                      {row.values.map((v, i) => (
                        <td key={i}>
                          <NumField value={v} onChange={(nv) => setPolarRow(row.key, i, nv)} width="3.5em" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="btn-row">
              <button className="btn" onClick={() => setPolarJson(JSON.stringify(p, null, 1))}>
                Επεξεργασία ως JSON
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  const prev = p;
                  setPolar(undefined);
                  offerUndo('Αφαιρέθηκαν τα polars', () => setPolar(prev));
                }}
              >
                Αφαίρεση polars
              </button>
            </div>
          </>
        )}
        {polarJson !== undefined && (
          <div className="json-edit">
            <p className="muted small">Μορφή: tws, beatAngle, beatVMG, speeds {'{ "52": [...] }'}, runVMG, gybeAngle.</p>
            <textarea rows={12} value={polarJson} onChange={(e) => setPolarJson(e.target.value)} />
            <div className="btn-row">
              <button
                className="btn primary"
                onClick={() => {
                  try {
                    setPolar(JSON.parse(polarJson));
                    setPolarJson(undefined);
                  } catch {
                    setErrors(['Μη έγκυρο JSON στα polars.']);
                  }
                }}
              >
                Εφαρμογή
              </button>
              <button className="btn" onClick={() => setPolarJson(undefined)}>
                Άκυρο
              </button>
            </div>
          </div>
        )}
      </section>

      {errors.length > 0 && (
        <ul className="errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="btn-row sticky-actions">
        <button className="btn primary" onClick={save}>
          Αποθήκευση
        </button>
        <button className="btn" onClick={onCancel}>
          Άκυρο
        </button>
      </div>
    </div>
  );
}
