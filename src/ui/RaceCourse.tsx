import { useMemo, useState } from 'react';
import { useHoldUpdate } from './useHoldUpdate';
import { useApp } from './AppContext';
import { useNav } from './NavContext';
import { useRace } from './RaceContext';
import { MapView } from './MapView';
import { formatDM } from '../nav/geo';
import type { Course } from '../boat/store';
import type { Mark } from '../routing/isochrones';

/** The course part of a race: saved course id (if any), its name and a snapshot of the marks. */
export interface RaceCourseValue {
  courseId?: string;
  courseName?: string;
  marks: Mark[];
}

const markId = () => `m-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Small route sketch for a course card: start in green, marks in orange. */
export function CourseSketch({ marks }: { marks: Mark[] }) {
  const W = 84;
  const H = 64;
  const pad = 9;
  if (marks.length === 0) return <svg className="course-sketch" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" />;
  const kx = Math.cos((marks[0].lat * Math.PI) / 180);
  const xs = marks.map((m) => m.lon * kx);
  const ys = marks.map((m) => m.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const k = Math.min((W - 2 * pad) / (maxX - minX || 1e-6), (H - 2 * pad) / (maxY - minY || 1e-6));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const pts = marks.map((_, i) => [W / 2 + (xs[i] - cx) * k, H / 2 - (ys[i] - cy) * k] as const);
  return (
    <svg className="course-sketch" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === 0 ? 4 : 3} fill={i === 0 ? 'var(--good)' : 'var(--fair)'} />
      ))}
    </svg>
  );
}

/** Saved courses as cards, plus "new course here" and "change it for this race". */
export function CoursePicker({ value, onChange, onNew, onEdit }: { value: RaceCourseValue; onChange: (v: RaceCourseValue) => void; onNew: () => void; onEdit: () => void }) {
  const nav = useNav();
  const { races } = useRace();
  // Most recently used in a race first, then most recently edited.
  const courses = useMemo(() => {
    const lastUsed = new Map<string, number>();
    races.forEach((r) => r.courseId && lastUsed.set(r.courseId, Math.max(lastUsed.get(r.courseId) ?? 0, r.start)));
    return [...nav.courses].sort((a, b) => (lastUsed.get(b.id) ?? 0) - (lastUsed.get(a.id) ?? 0) || b.updatedAt - a.updatedAt).map((c) => ({ c, used: lastUsed.get(c.id) }));
  }, [nav.courses, races]);
  const raceOnly = !value.courseId && value.marks.length > 0;
  const pick = (c: Course) => onChange({ courseId: c.id, courseName: c.name, marks: c.marks });
  return (
    <div className="course-picker">
      {raceOnly && (
        <button type="button" className="course-card on" onClick={onEdit} aria-pressed="true">
          <CourseSketch marks={value.marks} />
          <span>
            <strong>{value.courseName || 'Διαδρομή αγώνα'} ✓</strong>
            <span className="muted small">{value.marks.length} σημεία · μόνο για αυτόν τον αγώνα</span>
          </span>
        </button>
      )}
      {courses.map(({ c, used }) => {
        const on = value.courseId === c.id;
        return (
          <button type="button" key={c.id} className={`course-card ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => pick(c)}>
            <CourseSketch marks={c.marks} />
            <span>
              <strong>
                {c.name}
                {on && ' ✓'}
              </strong>
              <span className="muted small">
                {c.marks.length} σημεία{used ? ` · αγώνας ${new Date(used).toLocaleDateString('el-GR')}` : ''}
              </span>
            </span>
          </button>
        );
      })}
      <button type="button" className="course-new" onClick={onNew}>
        ＋ Νέα διαδρομή εδώ
      </button>
      {value.marks.length > 0 && (
        <>
          <p className="small course-chain">{value.marks.map((m) => m.name).join(' → ')}</p>
          <button type="button" className="btn" onClick={onEdit}>
            ✎ Άλλαξέ τη για αυτόν τον αγώνα
          </button>
        </>
      )}
    </div>
  );
}

/** Course editor inside the race setup: tap the map to add marks in order. */
export function CourseEditor({
  title,
  initial,
  keepDefault,
  onDone,
  onCancel,
}: {
  title: string;
  initial: { name: string; marks: Mark[] };
  keepDefault: boolean;
  onDone: (v: { name: string; marks: Mark[]; keep: boolean }) => void;
  onCancel: () => void;
}) {
  const { activeBoat } = useApp();
  const nav = useNav();
  const [name, setName] = useState(initial.name);
  const [marks, setMarks] = useState<Mark[]>(initial.marks);
  const [addMode, setAddMode] = useState(initial.marks.length === 0);
  const [keep, setKeep] = useState(keepDefault);
  const [fitKey] = useState(() => `race-course-${Date.now()}`);
  // Unsaved course: a waiting app update must not reload now (P-043).
  useHoldUpdate(true);
  const add = (lat: number, lon: number, label?: string) =>
    setMarks((ms) => [...ms, { id: markId(), name: label ?? (ms.length === 0 ? 'Εκκίνηση' : `Σημαδούρα ${ms.length}`), lat, lon }]);

  return (
    <div className="race-setup">
      <section className="card">
        <div className="row between">
          <h2>{title}</h2>
          <button className="btn small-btn" onClick={onCancel}>
            Άκυρο
          </button>
        </div>
        <label className="stack">
          Όνομα διαδρομής
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="π.χ. Τρίγωνο Φαλήρου" maxLength={80} />
        </label>
      </section>

      <MapView
        boat={activeBoat}
        marks={marks}
        editable
        addMode={addMode}
        onAdd={(p) => add(p.lat, p.lon)}
        onMove={(id, p) => setMarks((ms) => ms.map((m) => (m.id === id ? { ...m, ...p } : m)))}
        showIsochrones={false}
        showSeamarks={nav.plan.showSeamarks}
        chart={nav.plan.mapChart}
        showDepth={nav.plan.showDepth}
        boatPos={nav.gps.fix}
        fitKey={fitKey}
      />

      <section className="card">
        <p className="muted small" style={{ marginTop: 0 }}>
          {marks.length === 0
            ? 'Άγγιξε τον χάρτη για την Εκκίνηση, μετά τις σημαδούρες με τη σειρά και τέλος τον τερματισμό. Σύρε ένα σημείο για να το μετακινήσεις.'
            : addMode
              ? 'Άγγιξε για ακόμα ένα σημείο. Σύρε ένα σημείο για να το μετακινήσεις.'
              : 'Σύρε ένα σημείο για να το μετακινήσεις, ή πάτα «+ Σημαδούρα στον χάρτη» για νέο.'}
        </p>
        {marks.length > 0 && (
          <ol className="marks">
            {marks.map((m, i) => (
              <li key={m.id}>
                <span className="mark-idx">{i === 0 ? 'Ε' : i}</span>
                <input value={m.name} onChange={(e) => setMarks(marks.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)))} aria-label="Όνομα σημείου" />
                <span className="muted small coords">
                  {formatDM(m.lat, true)} {formatDM(m.lon, false)}
                </span>
                <span className="nowrap">
                  <button
                    className="icon-btn mark-btn"
                    aria-label="Πάνω"
                    disabled={i === 0}
                    onClick={() => {
                      const c = [...marks];
                      [c[i - 1], c[i]] = [c[i], c[i - 1]];
                      setMarks(c);
                    }}
                  >
                    ↑
                  </button>
                  <button className="icon-btn mark-btn" aria-label="Αφαίρεση" onClick={() => setMarks(marks.filter((x) => x.id !== m.id))}>
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
        <div className="btn-row">
          <button className={`btn ${addMode ? 'primary' : ''}`} onClick={() => setAddMode(!addMode)}>
            {addMode ? '✓ Τέλος προσθήκης' : '+ Σημαδούρα στον χάρτη'}
          </button>
          {nav.gps.fix ? (
            <button className="btn" onClick={() => add(nav.gps.fix!.lat, nav.gps.fix!.lon, marks.length === 0 ? 'Εκκίνηση' : 'Θέση GPS')}>
              + Από GPS
            </button>
          ) : (
            !nav.gpsEnabled && (
              <button className="btn" onClick={() => nav.setGpsEnabled(true)}>
                Άνοιξε το GPS
              </button>
            )
          )}
          {marks.length > 1 && (
            <button className="btn" onClick={() => setMarks([...marks].reverse())}>
              Αντίστροφη φορά
            </button>
          )}
        </div>
      </section>

      <section className="card form-grid">
        <label className="check">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          <span>
            Κράτα τη στις διαδρομές μου
            <span className="muted small" style={{ display: 'block', fontWeight: 400 }}>
              {keep ? 'θα τη βρίσκεις και στον Χάρτη' : 'μόνο για αυτόν τον αγώνα'}
            </span>
          </span>
        </label>
        {marks.length < 2 && <p className="muted small">Βάλε τουλάχιστον εκκίνηση και μία σημαδούρα ή τερματισμό.</p>}
        <button className="btn primary" disabled={marks.length < 2} onClick={() => onDone({ name: name.trim() || `Διαδρομή ${new Date().toLocaleDateString('el-GR')}`, marks, keep })}>
          Έτοιμο — πίσω στον αγώνα
        </button>
      </section>
    </div>
  );
}
