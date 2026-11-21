import type { InstrumentsState } from './InstrumentsContext';
import { openTab } from './openTab';
import { num } from '../format';

export type LockField = 'tws' | 'twa' | 'bsp';

const f1 = (v?: number) => num(v);
const twaText = (v?: number) => (v === undefined ? '—' : `${Math.round(Math.abs(v))}° ${v < 0 ? 'αριστ.' : 'δεξ.'}`);

/**
 * Where each Live input comes from: the instruments (auto) or the user (locked).
 * Tapping a row switches it. When the instruments drop out, everything stays
 * manual with the last values — the Live screen keeps working as before.
 */
export function InstrumentBar({
  inst,
  locks,
  manual,
  onToggle,
}: {
  inst: InstrumentsState;
  locks: Record<LockField, boolean>;
  /** The values the user set (shown for locked rows). */
  manual: { tws?: number; twa?: number; bsp?: number };
  onToggle: (f: LockField) => void;
}) {
  const v = inst.values;
  const pick = (f: LockField) => (locks[f] ? manual[f] : v[f]);
  const rows: { f: LockField; label: string; value: string }[] = [
    { f: 'tws', label: 'TWS', value: `${f1(pick('tws'))} kt` },
    { f: 'twa', label: 'TWA', value: twaText(pick('twa')) },
    { f: 'bsp', label: 'BSP', value: `${f1(pick('bsp'))} kt` },
  ];
  return (
    <section className="inst-bar" aria-label="Πηγή τιμών">
      {!inst.live && (
        <div className="inst-lost">
          <b>{inst.status === 'off' ? 'Όργανα: ανενεργά' : 'Χάθηκε η σύνδεση με τα όργανα'}</b>
          <span>
            Συνεχίζεις χειροκίνητα από τις τελευταίες τιμές.{' '}
            {inst.message ?? (inst.status === 'connecting' ? 'Σύνδεση…' : '')}{' '}
            <button type="button" className="link inline" onClick={() => openTab('settings')}>
              Ρυθμίσεις
            </button>
          </span>
        </div>
      )}
      {inst.live && (
        <div className="inst-rows">
          {rows.map((r) => {
            const manual = locks[r.f] || v[r.f] === undefined;
            return (
              <button key={r.f} type="button" className={`inst-row ${manual ? 'manual' : 'auto'}`} onClick={() => onToggle(r.f)}>
                <span className="inst-label">{r.label}</span>
                <b>{r.value}</b>
                <span className="inst-badge">{manual ? 'ΧΕΙΡΟΚΙΝΗΤΑ' : 'ΟΡΓΑΝΑ'}</span>
              </button>
            );
          })}
          <p className="muted small">ΟΡΓΑΝΑ: η τιμή έρχεται από το σκάφος. Πάτα για χειροκίνητη τιμή (ή άλλαξέ τη με +/−). Πάτα ξανά για να γυρίσεις στα όργανα.</p>
        </div>
      )}
    </section>
  );
}
