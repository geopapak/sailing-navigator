import { useApp } from './AppContext';
import { useInstruments } from './InstrumentsContext';
import { mixedContentProblem } from '../instruments/client';
import type { InstrumentField, InstrumentSettings, InstrumentSource } from '../instruments/types';

const ROWS: { k: InstrumentField; label: string; fmt: (v: number) => string }[] = [
  { k: 'tws', label: 'Αληθής άνεμος TWS', fmt: (v) => `${v.toFixed(1)} kt` },
  { k: 'twa', label: 'Αληθής γωνία TWA', fmt: (v) => `${Math.round(Math.abs(v))}° ${v < 0 ? 'αριστερές' : 'δεξιές'}` },
  { k: 'twd', label: 'Κατεύθυνση TWD', fmt: (v) => `${Math.round(v).toString().padStart(3, '0')}°` },
  { k: 'bsp', label: 'Ταχύτητα BSP', fmt: (v) => `${v.toFixed(2)} kt` },
  { k: 'hdgTrue', label: 'Πλώρη (αληθής)', fmt: (v) => `${Math.round(v)}°` },
  { k: 'sog', label: 'SOG', fmt: (v) => `${v.toFixed(1)} kt` },
  { k: 'lat', label: 'Θέση', fmt: (v) => v.toFixed(4) },
  { k: 'depth', label: 'Βάθος', fmt: (v) => `${v.toFixed(1)} m` },
];

const SOURCES: { id: InstrumentSource; label: string; hint: string }[] = [
  { id: 'signalk', label: 'Signal K (WebSocket)', hint: 'ws(s)://<gateway>:3000/signalk/v1/stream?subscribe=all' },
  { id: 'nmea0183', label: 'NMEA 0183 μέσω WebSocket', hint: 'ws(s)://<gateway>:<port>' },
  { id: 'simulator', label: 'Προσομοίωση (για δοκιμή)', hint: '' },
];

/** Settings → boat instruments: connect, see what arrives, choose what it is used for. */
export function InstrumentsCard() {
  const { settings, updateSettings } = useApp();
  const inst = useInstruments();
  const cfg = settings.instruments;
  const set = (p: Partial<InstrumentSettings>) => updateSettings({ instruments: { ...cfg, ...p } });
  const warn = cfg.source !== 'simulator' ? mixedContentProblem(cfg.url) : undefined;
  const now = Date.now();
  const statusText = !cfg.enabled
    ? 'Χωρίς σύνδεση οργάνων — όλα δουλεύουν χειροκίνητα, όπως πάντα.'
    : inst.live
      ? `Συνδεδεμένο · τελευταία τιμή πριν ${(inst.ageSec ?? 0).toFixed(1).replace('.', ',')} s`
      : inst.message ?? (inst.status === 'connecting' ? 'Σύνδεση…' : 'Δεν έρχονται δεδομένα.');

  return (
    <section className="card form-grid instruments">
      <h3>Όργανα σκάφους</h3>
      <div className={`inst-status full ${cfg.enabled ? (inst.live ? 'ok' : 'bad') : ''}`}>
        <span className="dot" aria-hidden="true" />
        <span>{statusText}</span>
      </div>
      <label className="full">
        Τύπος σύνδεσης
        <select value={cfg.source} onChange={(e) => set({ source: e.target.value as InstrumentSource })}>
          {SOURCES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      {cfg.source !== 'simulator' && (
        <label className="full">
          Διεύθυνση gateway
          <input type="url" inputMode="url" value={cfg.url} onChange={(e) => set({ url: e.target.value.trim() })} placeholder={SOURCES.find((s) => s.id === cfg.source)?.hint} />
        </label>
      )}
      {warn && <p className="warn-text full small">{warn}</p>}
      <p className="muted small full">
        Το κινητό μπαίνει στο Wi-Fi του σκάφους. Η διεύθυνση είναι στο εγχειρίδιο του gateway (Signal K σε Raspberry Pi, Yacht Devices, Digital Yacht κ.ά.).
      </p>
      <div className="full">
        <button className={`btn ${cfg.enabled ? '' : 'primary'}`} onClick={() => set({ enabled: !cfg.enabled })}>
          {cfg.enabled ? 'Αποσύνδεση' : 'Σύνδεση'}
        </button>
      </div>
      {cfg.enabled && (
        <>
          <ul className="rows full">
            {ROWS.map((r) => {
              const v = inst.values[r.k];
              const at = inst.at[r.k];
              const age = at ? (now - at) / 1000 : undefined;
              return (
                <li key={r.k}>
                  <span>{r.label}</span>
                  <b>{v === undefined ? '—' : r.k === 'lat' && inst.values.lon !== undefined ? `${v.toFixed(4)}, ${inst.values.lon.toFixed(4)}` : r.fmt(v)}</b>
                  <span className={`small ${age !== undefined && age <= 10 ? 'ok-text' : 'muted'}`}>{age === undefined ? '' : `${age < 10 ? age.toFixed(1).replace('.', ',') : Math.round(age)} s`}</span>
                </li>
              );
            })}
            <li>
              <span>AIS</span>
              <b>{inst.ais.length} σκάφη</b>
              <span />
            </li>
          </ul>
        </>
      )}
      <label className="check full">
        <input type="checkbox" checked={cfg.record} onChange={(e) => set({ record: e.target.checked })} /> Καταγραφή αγώνα από τα όργανα (για την ανάλυση)
      </label>
      <label className="check full">
        <input type="checkbox" checked={cfg.aisOpponents} onChange={(e) => set({ aisOpponents: e.target.checked })} /> Θέσεις αντιπάλων από το AIS του σκάφους
      </label>
    </section>
  );
}
