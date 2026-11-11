import { useState } from 'react';
import { useApp } from './AppContext';
import { useNav } from './NavContext';
import { useInstruments } from './InstrumentsContext';
import { useKnowledge } from './KnowledgeContext';
import { SECTORS, SPEEDS, sectorOf, type KnowledgeNote, type Sector } from '../knowledge/types';
import { relevantNotes, windLabel } from '../knowledge/match';
import { getLiveSnapshot } from '../ai/snapshot';
import { formatDM } from '../nav/geo';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** The wind we know now (instruments, else Live), for the "now" filter. */
function useWindNow(): { tws?: number; twd?: number } | undefined {
  const inst = useInstruments();
  if (inst.live && inst.values.twd !== undefined) return { tws: inst.values.tws, twd: inst.values.twd };
  const s = getLiveSnapshot(30);
  if (s?.ctx.nav?.observedTwd !== undefined) return { tws: s.ctx.live?.tws, twd: s.ctx.nav.observedTwd };
  return undefined;
}

export function KnowledgeView() {
  const k = useKnowledge();
  const wind = useWindNow();
  const [filter, setFilter] = useState<'all' | 'now' | Sector>('all');
  const [editing, setEditing] = useState<KnowledgeNote | 'new'>();
  if (editing) return <NoteEditor note={editing === 'new' ? undefined : editing} onDone={() => setEditing(undefined)} />;

  const all = [...k.mine, ...k.crew];
  const shown =
    filter === 'all'
      ? all
      : filter === 'now'
        ? relevantNotes(all, undefined, wind)
        : all.filter((n) => !n.dirs.length || n.dirs.includes(filter));
  return (
    <section className="card">
      <div className="row between">
        <h2>Τοπική γνώση</h2>
        <button className="btn primary" onClick={() => setEditing('new')}>
          Νέα σημείωση
        </button>
      </div>
      <p className="muted small">Ό,τι έχετε μάθει στη θάλασσα. Ο σύμβουλος τις λαμβάνει υπόψη όταν ταιριάζουν ο άνεμος και το σημείο, και λέει ότι προέρχονται από εσάς.</p>
      <div className="chips">
        <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
          Όλες
        </button>
        {wind?.twd !== undefined && (
          <button className={`chip ${filter === 'now' ? 'on' : ''}`} onClick={() => setFilter('now')}>
            Με τον τωρινό ({SECTORS.find((s) => s.id === sectorOf(wind.twd!))!.label}
            {wind.tws !== undefined ? ` ${Math.round(wind.tws)} kt` : ''})
          </button>
        )}
        {SECTORS.map((s) => (
          <button key={s.id} className={`chip ${filter === s.id ? 'on' : ''}`} onClick={() => setFilter(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="muted">{all.length ? 'Καμία σημείωση για αυτόν τον άνεμο.' : 'Δεν υπάρχουν σημειώσεις ακόμη.'}</p>
      ) : (
        <ul className="rows notes">
          {shown.map((n) => {
            const crew = n.id.startsWith('crew:');
            return (
              <li key={n.id}>
                <button className="row-btn note" onClick={() => !crew && setEditing(n)} disabled={crew}>
                  <span>
                    <strong>{n.place}</strong>
                    <span className="muted small"> · {crew ? n.author ?? 'Πλήρωμα' : 'εμείς'}</span>
                    <span className="note-text">{n.text}</span>
                    <span className="muted small">
                      {windLabel(n)} · {new Date(n.updatedAt || n.createdAt).toLocaleDateString('el-GR')} · {n.scope === 'crew' ? 'πλήρωμα' : 'μόνο εγώ'}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {k.crewError && <p className="muted small">Σημειώσεις πληρώματος: {k.crewError}</p>}
    </section>
  );
}

function NoteEditor({ note, onDone }: { note?: KnowledgeNote; onDone: () => void }) {
  const { activeBoat } = useApp();
  const nav = useNav();
  const k = useKnowledge();
  const fix = nav.gps.fix;
  const [n, setN] = useState<KnowledgeNote>(
    () =>
      note ?? {
        id: uid(),
        lat: fix?.lat ?? NaN,
        lon: fix?.lon ?? NaN,
        radiusNm: 1,
        dirs: [],
        speeds: [],
        place: '',
        text: '',
        scope: 'crew',
        sailNo: activeBoat?.isOwn ? activeBoat.sailNumber : undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
  );
  const set = (p: Partial<KnowledgeNote>) => setN((x) => ({ ...x, ...p }));
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const marks = nav.course?.marks ?? [];
  const hasPos = Number.isFinite(n.lat) && Number.isFinite(n.lon);
  const ok = hasPos && n.place.trim() && n.text.trim();

  return (
    <section className="card form-grid">
      <div className="row between">
        <h2>{note ? 'Σημείωση' : 'Νέα σημείωση'}</h2>
        <button className="btn small-btn" onClick={onDone}>
          Πίσω
        </button>
      </div>
      <label>
        Πού
        <input value={n.place} onChange={(e) => set({ place: e.target.value })} placeholder="π.χ. Αίγινα, βόρεια άκρη" maxLength={60} />
      </label>
      <div className="btn-row">
        <button className="btn small-btn" disabled={!fix} onClick={() => fix && set({ lat: fix.lat, lon: fix.lon })}>
          Εδώ που είμαι (GPS)
        </button>
        {marks.length > 0 && (
          <select
            aria-label="Ή σε σημαδούρα της διαδρομής"
            value=""
            onChange={(e) => {
              const m = marks.find((x) => x.id === e.target.value);
              if (m) set({ lat: m.lat, lon: m.lon, place: n.place || m.name });
            }}
          >
            <option value="">Σε σημαδούρα της διαδρομής…</option>
            {marks.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="muted small">{hasPos ? `${formatDM(n.lat, true)} ${formatDM(n.lon, false)}` : 'Διάλεξε θέση: GPS ή σημαδούρα της διαδρομής.'}</p>
      <label>
        Ακτίνα
        <select value={n.radiusNm} onChange={(e) => set({ radiusNm: Number(e.target.value) })}>
          {[0.5, 1, 2, 3, 5].map((r) => (
            <option key={r} value={r}>
              ~{String(r).replace('.', ',')} NM
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Με τι άνεμο ισχύει</legend>
        <div className="chips">
          {SECTORS.map((d) => (
            <button key={d.id} type="button" className={`chip ${n.dirs.includes(d.id) ? 'on' : ''}`} aria-pressed={n.dirs.includes(d.id)} onClick={() => set({ dirs: toggle(n.dirs, d.id) })}>
              {d.label}
            </button>
          ))}
        </div>
        <div className="chips">
          {SPEEDS.map((s) => (
            <button key={s.id} type="button" className={`chip ${n.speeds.includes(s.id) ? 'on' : ''}`} aria-pressed={n.speeds.includes(s.id)} onClick={() => set({ speeds: toggle(n.speeds, s.id) })}>
              {s.label}
            </button>
          ))}
        </div>
        <p className="muted small">Χωρίς επιλογή = ισχύει με κάθε άνεμο.</p>
      </fieldset>
      <label>
        Τι παρατήρησες
        <textarea rows={4} maxLength={400} value={n.text} onChange={(e) => set({ text: e.target.value })} placeholder="π.χ. Με ΒΑ 12–15 η ριπή μπαίνει πρώτα από αριστερά· μείνε έξω από τη σκιά της ακτής." />
      </label>
      <fieldset>
        <legend>Ποιος τη βλέπει</legend>
        <div className="seg">
          <button type="button" className={n.scope === 'me' ? 'on' : ''} onClick={() => set({ scope: 'me' })}>
            Μόνο εγώ
          </button>
          <button type="button" className={n.scope === 'crew' ? 'on' : ''} onClick={() => set({ scope: 'crew' })} disabled={!n.sailNo}>
            Πλήρωμα
          </button>
        </div>
        <p className="muted small">
          {n.sailNo
            ? `«Πλήρωμα» = όσοι έχουν το ${n.sailNo} ως δικό τους σκάφος στον λογαριασμό τους.`
            : 'Για κοινή χρήση με το πλήρωμα, διάλεξε πρώτα το δικό σας σκάφος (με αριθμό πανιού) επάνω.'}
        </p>
      </fieldset>
      <div className="btn-row">
        <button
          className="btn primary"
          disabled={!ok}
          onClick={async () => {
            await k.save({ ...n, place: n.place.trim(), text: n.text.trim(), scope: n.sailNo ? n.scope : 'me' });
            onDone();
          }}
        >
          Αποθήκευση
        </button>
        {note && (
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirm('Διαγραφή της σημείωσης;')) return;
              await k.remove(note.id);
              onDone();
            }}
          >
            Διαγραφή
          </button>
        )}
      </div>
    </section>
  );
}
