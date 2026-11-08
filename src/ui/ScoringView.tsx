import { useMemo } from 'react';
import { useApp } from './AppContext';
import { useStoredState } from './hooks';
import { STANDARD_SCORING_OPTIONS } from '../boat/scoringOptions';
import {
  elapsedToTie,
  formatDuration,
  parseDuration,
  rank,
  requiredSpeed,
  type ScoringMethod,
} from '../scoring/corrected';

interface ScoringState {
  method: ScoringMethod;
  optionId: string;
  distance: string;
  elapsed: Record<string, string>;
  included: Record<string, boolean>;
  opponentId?: string;
}

const INITIAL: ScoringState = {
  method: 'ToT',
  optionId: 'coastal',
  distance: '',
  elapsed: {},
  included: {},
};

export function ScoringView() {
  const { boats, activeBoat } = useApp();
  const [s, setS] = useStoredState<ScoringState>('scoring-state', INITIAL);
  const set = (patch: Partial<ScoringState>) => setS((p) => ({ ...p, ...patch }));

  const distance = Number(s.distance.replace(',', '.'));
  const needsDistance = s.method === 'ToD';
  const distanceOk = Number.isFinite(distance) && distance > 0;

  const optionFor = (boatId: string) =>
    boats.find((b) => b.id === boatId)?.scoring.find((o) => o.id === s.optionId);

  const isIncluded = (id: string) => s.included[id] ?? (id === activeBoat?.id);

  const ranked = useMemo(() => {
    if (needsDistance && !distanceOk) return [];
    const entries = boats
      .filter((b) => isIncluded(b.id) && optionFor(b.id))
      .map((b) => ({
        id: b.id,
        name: b.name,
        elapsedSec: parseDuration(s.elapsed[b.id] ?? ''),
        option: optionFor(b.id)!,
      }));
    return rank(s.method, entries, distanceOk ? distance : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boats, s, distance, distanceOk, needsDistance]);

  const me = activeBoat;
  const myOpt = me ? optionFor(me.id) : undefined;
  const opp = boats.find((b) => b.id === s.opponentId && b.id !== me?.id);
  const oppOpt = opp ? optionFor(opp.id) : undefined;
  const oppElapsed = opp ? parseDuration(s.elapsed[opp.id] ?? '') : NaN;
  const canCompare = me && myOpt && opp && oppOpt && (!needsDistance || distanceOk);
  const tie =
    canCompare && Number.isFinite(oppElapsed)
      ? elapsedToTie(s.method, oppElapsed, myOpt, oppOpt, distanceOk ? distance : 0)
      : undefined;

  // Time given/received per hour (ToT) or per NM (ToD), from my point of view.
  const perUnit =
    canCompare && myOpt && oppOpt
      ? s.method === 'ToT'
        ? 3600 * (oppOpt.tot / myOpt.tot - 1)
        : myOpt.tod - oppOpt.tod
      : undefined;

  return (
    <div className="scoring">
      <section className="card form-grid">
        <label>
          Μέθοδος
          <div className="seg">
            {(['ToT', 'ToD'] as const).map((m) => (
              <button key={m} className={s.method === m ? 'on' : ''} onClick={() => set({ method: m })}>
                {m}
              </button>
            ))}
          </div>
        </label>
        <label>
          Επιλογή πιστοποιητικού
          <select value={s.optionId} onChange={(e) => set({ optionId: e.target.value })}>
            {STANDARD_SCORING_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Απόσταση (NM){needsDistance ? '' : ' — προαιρετική'}
          <input inputMode="decimal" value={s.distance} placeholder="π.χ. 18.5" onChange={(e) => set({ distance: e.target.value })} />
        </label>
        {myOpt && (
          <p className="muted small">
            {me?.name}: ToD {myOpt.tod.toFixed(1)} s/NM · ToT {myOpt.tot.toFixed(4)}
          </p>
        )}
      </section>

      <section className="card">
        <h3>Χρόνοι (h:mm:ss)</h3>
        <ul className="entries">
          {boats.map((b) => {
            const opt = optionFor(b.id);
            return (
              <li key={b.id}>
                <label className="entry-name">
                  <input type="checkbox" checked={isIncluded(b.id)} onChange={(e) => set({ included: { ...s.included, [b.id]: e.target.checked } })} />
                  {b.name}
                  {!opt && <span className="muted small"> (χωρίς συντελεστή)</span>}
                </label>
                <input
                  className="elapsed"
                  placeholder="0:00:00"
                  inputMode="numeric"
                  value={s.elapsed[b.id] ?? ''}
                  onChange={(e) => set({ elapsed: { ...s.elapsed, [b.id]: e.target.value } })}
                />
              </li>
            );
          })}
        </ul>
        {needsDistance && !distanceOk && <p className="warn-text">Για ToD χρειάζεται απόσταση.</p>}
        {ranked.length > 0 && (
          <table className="data">
            <thead>
              <tr>
                <th>#</th>
                <th>Σκάφος</th>
                <th>Elapsed</th>
                <th>Διορθωμένος</th>
                <th>Διαφορά</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr key={r.id} className={r.id === me?.id ? 'hl' : ''}>
                  <td>{r.rank}</td>
                  <td>{r.name}</td>
                  <td>{formatDuration(r.elapsedSec)}</td>
                  <td>{formatDuration(r.correctedSec)}</td>
                  <td>{r.gapSec ? `+${formatDuration(r.gapSec)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h3>Σύγκριση με αντίπαλο</h3>
        <label>
          Αντίπαλος
          <select value={s.opponentId ?? ''} onChange={(e) => set({ opponentId: e.target.value || undefined })}>
            <option value="">—</option>
            {boats
              .filter((b) => b.id !== me?.id)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        </label>
        {boats.length < 2 && <p className="muted small">Πρόσθεσε αντιπάλους στην καρτέλα «Σκάφη» (αρκούν οι συντελεστές ToD/ToT).</p>}
        {opp && !oppOpt && <p className="warn-text">Ο αντίπαλος δεν έχει συντελεστή για αυτή την επιλογή.</p>}
        {canCompare && perUnit !== undefined && (
          <div className="compare">
            <p>
              {perUnit >= 0 ? 'Παίρνω' : 'Δίνω'} <strong>{Math.abs(perUnit).toFixed(1)} s</strong>
              {s.method === 'ToT' ? ' ανά ώρα του αντιπάλου' : ' ανά NM'}
              {s.method === 'ToD' && distanceOk && <> · σύνολο <strong>{formatDuration(Math.abs(perUnit * distance))}</strong></>}
            </p>
            {tie !== undefined ? (
              <p>
                Για να κερδίσω πρέπει να τερματίσω σε λιγότερο από <strong>{formatDuration(tie)}</strong>
                {distanceOk && <> (μέση ταχύτητα ≥ <strong>{requiredSpeed(distance, tie).toFixed(2)} kt</strong>)</>}.
              </p>
            ) : (
              <p className="muted small">Βάλε χρόνο (ή εκτίμηση) του αντιπάλου για να δεις τι χρειάζεσαι.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
