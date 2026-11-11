import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './AppContext';
import { useNav, localToMs } from './NavContext';
import { useRace } from './RaceContext';
import { askConfirm, offerUndo } from './Dialogs';
import { useInstruments } from './InstrumentsContext';
import { useStoredState } from './hooks';
import { ScoringView } from './ScoringView';
import { KnowledgeView } from './KnowledgeView';
import { RaceAnalysisView } from './RaceAnalysisView';
import { CertificateImport, toBase64 } from './CertificateImport';
import { NumberStepper } from './NumberStepper';
import { CourseEditor, CoursePicker } from './RaceCourse';
import { DEFAULT_SERVER } from './settings';
import { accountApi, ApiError } from '../sync/api';
import { STANDARD_SCORING_OPTIONS } from '../boat/scoringOptions';
import { normalizeSailNo } from '../boat/orc';
import type { BoatProfile } from '../boat/types';
import type { CleanEntry } from '../race/entrylist';
import type { Race, RaceEntry } from '../race/types';
import { fmtGap, nextMarkOf, relativeFix } from '../race/estimate';
import { formatDuration } from '../scoring/corrected';
import type { ScoringMethod } from '../scoring/corrected';

type Section = 'races' | 'knowledge' | 'calc';
type Screen = { s: 'list' } | { s: 'setup'; id?: string } | { s: 'live' } | { s: 'opponent'; entryId?: string } | { s: 'analysis'; id: string };

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** A copy of a boat's ratings and polar for a race entry. */
export function entryBoat(b: BoatProfile): NonNullable<RaceEntry['boat']> {
  return { name: b.name, sailNumber: b.sailNumber, gph: b.gph, polar: b.polar, performanceFactor: b.performanceFactor, orcRef: b.orcRef, scoring: b.scoring };
}

const sailKey = (s?: string) => (s ? normalizeSailNo(s).replace(/^[A-Z]{3}-/, '') : '');

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const optLabel = (id: string) => STANDARD_SCORING_OPTIONS.find((o) => o.id === id)?.label ?? id;
const SOURCE_LABEL: Record<RaceEntry['source'], string> = { own: 'εμείς', boats: 'από τα σκάφη μου', orc: 'ORC', pdf: 'πιστοποιητικό PDF', none: 'χωρίς βαθμολογία' };

export function RaceView() {
  const [section, setSection] = useStoredState<{ s: Section }>('race-section', { s: 'races' });
  return (
    <div className="race">
      <div className="seg race-seg" role="tablist">
        {(
          [
            ['races', 'Αγώνες'],
            ['knowledge', 'Τοπική γνώση'],
            ['calc', 'Υπολογιστής χρόνου'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={section.s === id} className={section.s === id ? 'on' : ''} onClick={() => setSection({ s: id })}>
            {label}
          </button>
        ))}
      </div>
      {section.s === 'races' && <Races />}
      {section.s === 'knowledge' && <KnowledgeView />}
      {section.s === 'calc' && <ScoringView />}
    </div>
  );
}

function Races() {
  const race = useRace();
  const [screen, setScreen] = useState<Screen>(() => (race.active?.status === 'running' ? { s: 'live' } : { s: 'list' }));
  const back = () => setScreen({ s: 'list' });
  if (screen.s === 'setup') return <RaceSetup id={screen.id} onDone={(started) => setScreen(started ? { s: 'live' } : { s: 'list' })} onCancel={back} />;
  if (screen.s === 'live' && race.active) return <RaceLive onBack={back} onOpponent={(entryId) => setScreen({ s: 'opponent', entryId })} onFinished={(id) => setScreen({ s: 'analysis', id })} />;
  if (screen.s === 'opponent' && race.active) return <OpponentPosition entryId={screen.entryId} onDone={() => setScreen({ s: 'live' })} />;
  if (screen.s === 'analysis') return <RaceAnalysisView id={screen.id} onBack={back} />;
  return <RacesList onNew={() => setScreen({ s: 'setup' })} onOpen={(r) => {
    if (r.status === 'finished') setScreen({ s: 'analysis', id: r.id });
    else {
      race.setActiveId(r.id);
      setScreen(r.status === 'running' ? { s: 'live' } : { s: 'setup', id: r.id });
    }
  }} />;
}

function RacesList({ onNew, onOpen }: { onNew: () => void; onOpen: (r: Race) => void }) {
  const { races } = useRace();
  const running = races.filter((r) => r.status !== 'finished');
  const done = races.filter((r) => r.status === 'finished');
  const item = (r: Race) => (
    <li key={r.id}>
      <button className="row-btn" onClick={() => onOpen(r)}>
        <span>
          <strong>{r.name}</strong>
          <span className="muted small">
            {' '}
            · {r.courseName ?? 'διαδρομή'} · {new Date(r.start).toLocaleDateString('el-GR')}
          </span>
        </span>
        <span className={`badge ${r.status === 'running' ? 'ok' : ''}`}>{r.status === 'running' ? 'σε εξέλιξη' : r.status === 'planned' ? 'προγραμματισμένος' : `${r.track.length ? 'ανάλυση' : 'ολοκληρώθηκε'}`}</span>
      </button>
    </li>
  );
  return (
    <>
      <section className="card">
        <div className="row between">
          <h2>Αγώνες</h2>
          <button className="btn primary" onClick={onNew}>
            Νέος αγώνας
          </button>
        </div>
        {running.length > 0 && <ul className="rows">{running.map(item)}</ul>}
        <p className="muted small">
          Κάθε αγώνας καταγράφεται αυτόματα από την «Έναρξη» μέχρι τον «Τερματισμό»: θέση, άνεμος, ταχύτητα, πανιά, αντίπαλοι. Με όργανα από τα όργανα του σκάφους· χωρίς
          αυτά, από το GPS του κινητού και ό,τι γράφεις στο Live. Η καταγραφή μένει σε αυτή τη συσκευή.
        </p>
      </section>
      {done.length > 0 && (
        <section className="card">
          <h3>Ολοκληρωμένοι</h3>
          <ul className="rows">{done.map(item)}</ul>
        </section>
      )}
    </>
  );
}

// ---- Setup ------------------------------------------------------------------

type Lookup = Record<string, 'searching' | 'notfound' | 'error' | undefined>;

function RaceSetup({ id, onDone, onCancel }: { id?: string; onDone: (started: boolean) => void; onCancel: () => void }) {
  const { activeBoat, boats, settings, account, saveBoat, refreshAccount } = useApp();
  const nav = useNav();
  const race = useRace();
  const existing = id ? race.races.find((r) => r.id === id) : undefined;
  const [r, setR] = useState<Race>(
    () =>
      existing ?? {
        id: uid(),
        name: '',
        courseId: nav.course?.id,
        courseName: nav.course?.name,
        marks: nav.course?.marks ?? [],
        start: Math.max(localToMs(nav.plan.startLocal), Math.ceil(Date.now() / 300_000) * 300_000),
        scoringOptionId: nav.plan.scoringOptionId || 'coastal',
        method: 'ToT',
        entries: activeBoat ? [{ id: 'own', name: activeBoat.name, sailNo: activeBoat.sailNumber, own: true, source: 'own', boat: entryBoat(activeBoat) }] : [],
        status: 'planned',
        track: [],
        fixes: [],
        updatedAt: Date.now(),
      },
  );
  const set = (p: Partial<Race>) => setR((x) => ({ ...x, ...p }));
  const setEntry = (eid: string, p: Partial<RaceEntry>) => setR((x) => ({ ...x, entries: x.entries.map((e) => (e.id === eid ? { ...e, ...p } : e)) }));
  const server = settings.aiUrl || DEFAULT_SERVER;

  // Entry list (PDF)
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [listError, setListError] = useState<string>();
  const [list, setList] = useState<{ file: string; event: string; entries: CleanEntry[] }>();
  const [cls, setCls] = useState('');
  const classes = useMemo(() => [...new Set((list?.entries ?? []).map((e) => e.className).filter(Boolean))], [list]);

  const readList = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) return setListError('Το αρχείο είναι μεγαλύτερο από 10 MB.');
    setReading(true);
    setListError(undefined);
    try {
      const data = await toBase64(file);
      const res = await accountApi.entryList(server, settings.authToken, data, file.type || 'application/pdf');
      refreshAccount();
      setList({ file: file.name, event: res.event, entries: res.entries });
      const ownKey = sailKey(activeBoat?.sailNumber);
      const ownClass = res.entries.find((e) => ownKey && sailKey(e.sailNo) === ownKey)?.className;
      setCls(ownClass ?? '');
      if (!r.name && res.event) set({ name: res.event });
    } catch (e) {
      setListError((e as Error).message);
    } finally {
      setReading(false);
    }
  };

  const addFromList = () => {
    if (!list) return;
    const ownKey = sailKey(activeBoat?.sailNumber);
    const have = new Set(r.entries.map((e) => sailKey(e.sailNo)).filter(Boolean));
    const add: RaceEntry[] = [];
    let entries = r.entries;
    for (const e of list.entries.filter((x) => !cls || x.className === cls)) {
      const k = sailKey(e.sailNo);
      if (k && k === ownKey) {
        entries = entries.map((x) => (x.own ? { ...x, mmsi: x.mmsi || e.mmsi || undefined, className: e.className } : x));
        continue;
      }
      if (k && have.has(k)) continue;
      const mine = boats.find((b) => k && sailKey(b.sailNumber) === k);
      add.push({
        id: uid(),
        name: e.name || e.sailNo,
        sailNo: e.sailNo || undefined,
        mmsi: e.mmsi || undefined,
        className: e.className || undefined,
        source: mine ? 'boats' : 'none',
        boat: mine ? entryBoat(mine) : undefined,
      });
    }
    set({ entries: [...entries, ...add] });
    setList(undefined);
  };

  // ORC lookup for entries without ratings.
  const [lookup, setLookup] = useState<Lookup>({});
  const [orcNote, setOrcNote] = useState<string>();
  const searchOrc = async () => {
    setOrcNote(undefined);
    for (const e of r.entries.filter((x) => !x.own && !x.boat && x.sailNo)) {
      setLookup((l) => ({ ...l, [e.id]: 'searching' }));
      try {
        const res = await accountApi.orcBoat(server, settings.authToken, e.sailNo!);
        if (res.found && res.boat) {
          setEntry(e.id, { source: 'orc', boat: entryBoat(res.boat), name: e.name || res.boat.name });
          setLookup((l) => ({ ...l, [e.id]: undefined }));
        } else setLookup((l) => ({ ...l, [e.id]: 'notfound' }));
      } catch (err) {
        setLookup((l) => ({ ...l, [e.id]: 'error' }));
        if (err instanceof ApiError && err.status === 501) {
          setOrcNote('Η αναζήτηση στο επίσημο ORC δεν έχει ενεργοποιηθεί ακόμα. Μέχρι τότε, πρόσθεσε τα πιστοποιητικά τους (PDF).');
          setLookup((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, v === 'searching' ? 'error' : v])));
          return;
        }
        setOrcNote((err as Error).message);
      }
    }
  };

  const [certFor, setCertFor] = useState<string>();
  const [addBoatId, setAddBoatId] = useState('');
  const [mmsiFor, setMmsiFor] = useState<string>();
  const [courseEd, setCourseEdState] = useState<'new' | 'edit'>();
  // Open the editor at the top; come back to the course picker, not to where the page was.
  const setCourseEd = (v?: 'new' | 'edit') => {
    setCourseEdState(v);
    requestAnimationFrame(() => (v ? window.scrollTo(0, 0) : document.querySelector('.course-picker')?.scrollIntoView({ block: 'center' })));
  };

  const own = r.entries.find((e) => e.own);
  const options = own?.boat?.scoring ?? activeBoat?.scoring ?? [];
  const problems: string[] = [];
  if (!r.name.trim()) problems.push('Δώσε όνομα αγώνα.');
  if (r.marks.length < 2) problems.push('Διάλεξε ή φτιάξε διαδρομή με τουλάχιστον 2 σημεία.');
  if (!own) problems.push('Λείπει το σκάφος μας.');
  else if (!own.boat?.scoring.some((o) => o.id === r.scoringOptionId)) problems.push('Το σκάφος μας δεν έχει αυτή την επιλογή βαθμολογίας.');

  const store = async (start: boolean) => {
    const out: Race = { ...r, name: r.name.trim(), status: start ? 'running' : r.status === 'running' ? 'running' : 'planned' };
    await race.save(out);
    race.setActiveId(out.id);
    onDone(start || out.status === 'running');
  };

  if (courseEd) {
    const editing = courseEd === 'edit';
    const fromSaved = editing && !!r.courseId;
    return (
      <CourseEditor
        title={editing ? 'Αλλαγή διαδρομής' : 'Νέα διαδρομή'}
        initial={editing ? { name: fromSaved ? `${r.courseName ?? 'Διαδρομή'} (σήμερα)` : (r.courseName ?? ''), marks: r.marks } : { name: '', marks: [] }}
        keepDefault={!editing}
        onCancel={() => setCourseEd(undefined)}
        onDone={(v) => {
          if (v.keep) {
            // Always a new saved course: changing a course for one race never overwrites the original.
            const c = { id: `c-${Date.now().toString(36)}`, name: v.name, marks: v.marks, updatedAt: Date.now() };
            nav.updateCourse(c);
            set({ courseId: c.id, courseName: c.name, marks: c.marks });
          } else set({ courseId: undefined, courseName: v.name, marks: v.marks });
          setCourseEd(undefined);
        }}
      />
    );
  }

  if (certFor) {
    return (
      <CertificateImport
        isOwn={false}
        onCancel={() => setCertFor(undefined)}
        onRead={async (b) => {
          await saveBoat({ ...b, isOwn: false });
          setEntry(certFor, { source: 'pdf', boat: entryBoat(b) });
          setCertFor(undefined);
        }}
      />
    );
  }

  return (
    <div className="race-setup">
      <section className="card form-grid">
        <div className="row between">
          <h2>{existing ? 'Αγώνας' : 'Νέος αγώνας'}</h2>
          <button className="btn small-btn" onClick={onCancel}>
            Πίσω
          </button>
        </div>
        <label>
          Όνομα
          <input value={r.name} onChange={(e) => set({ name: e.target.value })} placeholder="π.χ. Χειμερινό · 3η" maxLength={80} />
        </label>
        <div className="field-group full">
          <span className="field-label">Διαδρομή</span>
          <CoursePicker value={r} onChange={(v) => set(v)} onNew={() => setCourseEd('new')} onEdit={() => setCourseEd('edit')} />
        </div>
        <label>
          Εκκίνηση
          <input type="datetime-local" value={toLocalInput(r.start)} onChange={(e) => set({ start: localToMs(e.target.value) })} />
        </label>
        <label>
          Βαθμολογία
          <select
            value={`${r.scoringOptionId}|${r.method}`}
            onChange={(e) => {
              const [o, m] = e.target.value.split('|');
              set({ scoringOptionId: o, method: m as ScoringMethod });
            }}
          >
            {options.flatMap((o) =>
              (['ToT', 'ToD'] as const).map((m) => (
                <option key={`${o.id}|${m}`} value={`${o.id}|${m}`}>
                  {optLabel(o.id)} — {m}
                </option>
              )),
            )}
          </select>
        </label>
      </section>

      <section className="card">
        <h3>Συμμετοχές</h3>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) readList(f);
          }}
        />
        {!list && (
          <>
            <button className="btn primary wide" disabled={reading || !account} onClick={() => fileRef.current?.click()}>
              {reading ? 'Το AI διαβάζει τη λίστα…' : 'Λίστα συμμετοχών (PDF)'}
            </button>
            <p className="muted small">
              Όπως τη βγάζει ο όμιλος (Entry list). Το AI βρίσκει σκάφη, αριθμούς πανιών και κλάσεις. Μετράει στις αναγνώσεις PDF του λογαριασμού
              {account?.pdf.left !== null && account?.pdf.left !== undefined ? ` (απομένουν ${account.pdf.left})` : ''}.
            </p>
          </>
        )}
        {listError && <p className="errors">{listError}</p>}
        {list && (
          <div className="entry-import">
            <p>
              <strong>✓ Βρέθηκαν {list.entries.length} σκάφη</strong> <span className="muted small">από {list.file}</span>
            </p>
            {classes.length > 1 && (
              <div className="chips">
                <button className={`chip ${cls === '' ? 'on' : ''}`} onClick={() => setCls('')}>
                  Όλες
                </button>
                {classes.map((c) => (
                  <button key={c} className={`chip ${cls === c ? 'on' : ''}`} onClick={() => setCls(c)}>
                    {c}
                  </button>
                ))}
              </div>
            )}
            <ul className="rows compact">
              {list.entries
                .filter((e) => !cls || e.className === cls)
                .map((e, i) => (
                  <li key={i}>
                    <span>{e.name || '—'}</span>
                    <span className="muted small">
                      {e.sailNo} {e.className && `· ${e.className}`}
                    </span>
                  </li>
                ))}
            </ul>
            <div className="btn-row">
              <button className="btn primary" onClick={addFromList}>
                Προσθήκη {list.entries.filter((e) => !cls || e.className === cls).length} σκαφών
              </button>
              <button className="btn" onClick={() => fileRef.current?.click()}>
                Άλλο PDF
              </button>
              <button className="btn" onClick={() => setList(undefined)}>
                Άκυρο
              </button>
            </div>
          </div>
        )}

        <ul className="rows entries">
          {r.entries.map((e) => (
            <li key={e.id} className="entry">
              <div className="entry-main">
                <div>
                  <strong>{e.name}</strong> <span className="muted small">{e.sailNo}</span>
                  <div className="muted small">
                    {SOURCE_LABEL[e.source]}
                    {e.boat?.gph ? ` · GPH ${e.boat.gph.toFixed(1)}` : ''}
                    {e.boat ? (e.boat.polar ? ' · polars ✓' : ' · χωρίς polars (εκτίμηση από GPH)') : ''}
                    {e.mmsi ? ` · MMSI ${e.mmsi}` : ''}
                    {lookup[e.id] === 'searching' && ' · αναζήτηση…'}
                    {lookup[e.id] === 'notfound' && ' · δεν βρέθηκε στο ORC'}
                  </div>
                </div>
                {!e.own && (
                  <button className="icon-btn" aria-label={`Αφαίρεση ${e.name}`} onClick={() => set({ entries: r.entries.filter((x) => x.id !== e.id) })}>
                    ✕
                  </button>
                )}
              </div>
              {!e.own && !e.boat && e.source !== 'none' && (
                <div className="btn-row">
                  <button className="btn small-btn" onClick={() => setCertFor(e.id)}>
                    Πιστοποιητικό PDF
                  </button>
                  <button className="btn small-btn" onClick={() => setEntry(e.id, { source: 'none' })}>
                    Χωρίς βαθμολογία
                  </button>
                </div>
              )}
              {mmsiFor === e.id ? (
                <label className="inline">
                  MMSI
                  <input
                    inputMode="numeric"
                    autoFocus
                    defaultValue={e.mmsi ?? ''}
                    maxLength={9}
                    onBlur={(ev) => {
                      const v = ev.target.value.replace(/\D/g, '');
                      setEntry(e.id, { mmsi: v.length === 9 ? v : undefined });
                      setMmsiFor(undefined);
                    }}
                  />
                </label>
              ) : (
                <button className="link-btn small" onClick={() => setMmsiFor(e.id)}>
                  {e.mmsi ? 'Αλλαγή MMSI' : 'Πρόσθεσε MMSI για AIS'}
                </button>
              )}
            </li>
          ))}
        </ul>
        {r.entries.some((e) => !e.own && !e.boat && e.sailNo && e.source !== 'none') && (
          <button className="btn wide" onClick={searchOrc} disabled={Object.values(lookup).includes('searching')}>
            Αναζήτηση πιστοποιητικών στο ORC
          </button>
        )}
        {orcNote && <p className="muted small">{orcNote}</p>}
        <p className="muted small">
          Οι συντελεστές και τα polars κάθε σκάφους έρχονται από το επίσημο ORC με τον αριθμό πανιού. Όσα δεν βρεθούν, τα συμπληρώνεις με το πιστοποιητικό τους (PDF).
          MMSI για AIS: από το PDF αν υπάρχει, αλλιώς γράψ' το στο σκάφος.
        </p>
        <div className="row">
          <select value={addBoatId} onChange={(e) => setAddBoatId(e.target.value)} aria-label="Πρόσθεσε σκάφος από τα σκάφη μου">
            <option value="">Πρόσθεσε από τα σκάφη μου…</option>
            {boats
              .filter((b) => !r.entries.some((e) => e.boat?.name === b.name && e.sailNo === b.sailNumber))
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
          <button
            className="btn small-btn"
            disabled={!addBoatId}
            onClick={() => {
              const b = boats.find((x) => x.id === addBoatId);
              if (b) set({ entries: [...r.entries, { id: uid(), name: b.name, sailNo: b.sailNumber, source: 'boats', boat: entryBoat(b) }] });
              setAddBoatId('');
            }}
          >
            Προσθήκη
          </button>
        </div>
      </section>

      {problems.length > 0 && (
        <ul className="errors">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="btn-row sticky-actions">
        <button className="btn primary" disabled={problems.length > 0} onClick={() => store(true)}>
          {r.status === 'running' ? 'Αποθήκευση' : 'Αποθήκευση και έναρξη'}
        </button>
        {r.status !== 'running' && (
          <button className="btn" disabled={problems.length > 0} onClick={() => store(false)}>
            Αποθήκευση για αργότερα
          </button>
        )}
        {existing && (
          <button
            className="btn danger"
            onClick={async () => {
              const gone = existing;
              await race.remove(gone.id);
              offerUndo(`Διαγράφηκε ο αγώνας «${gone.name}»`, () => race.save(gone));
              onCancel();
            }}
          >
            Διαγραφή
          </button>
        )}
      </div>
    </div>
  );
}

// ---- Live -------------------------------------------------------------------

const ordinal = (n: number) => `${n}ος`;
const ago = (sec?: number) => (sec === undefined ? '' : sec < 90 ? 'τώρα' : sec < 3600 ? `πριν ${Math.round(sec / 60)}′` : `πριν ${Math.floor(sec / 3600)} ώρ.`);
const FIX_LABEL = { own: 'GPS', ais: 'AIS', aisstream: 'AIS (internet)', manual: 'χειροκίνητα', mark: 'σημαδούρα' } as const;
const WIND_LABEL = { instruments: 'όργανα', live: 'Live', forecast: 'πρόγνωση' } as const;

function useClock(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

function RaceLive({ onBack, onOpponent, onFinished }: { onBack: () => void; onOpponent: (entryId?: string) => void; onFinished: (id: string) => void }) {
  const { active: r, rows, wind, ais, update, recording } = useRace();
  const now = useClock();
  if (!r) return null;
  const elapsed = (now - r.start) / 1000;
  const own = rows.find((x) => x.own);
  const ranked = rows.filter((x) => x.rank !== undefined);
  const ahead = own?.rank ? ranked[own.rank - 2] : undefined;
  const behind = own?.rank ? ranked[own.rank] : undefined;
  const ownEntry = r.entries.find((e) => e.own);
  const next = ownEntry ? nextMarkOf(r.fixes.filter((f) => f.entryId === ownEntry.id), r.marks) : 1;
  const legText = next < r.marks.length ? `σκέλος ${next}/${r.marks.length - 1} προς ${r.marks[next].name}` : 'προς τον τερματισμό';

  const finish = async () => {
    if (!(await askConfirm('Τερματίσαμε τώρα; Ο χρόνος σταματά σε αυτή τη στιγμή.', { ok: 'Ναι, τερματίσαμε' }))) return;
    const t = Date.now();
    update((x) => ({ status: 'finished', finish: t, results: { ...(x.results ?? {}), ...(ownEntry ? { [ownEntry.id]: (t - x.start) / 1000 } : {}) } }));
    onFinished(r.id);
  };

  return (
    <div className="race-live">
      <section className="card">
        <div className="row between">
          <div>
            <h2>{r.name}</h2>
            <p className="muted small">
              {optLabel(r.scoringOptionId)} {r.method} · {legText}
            </p>
          </div>
          <button className="btn small-btn" onClick={onBack}>
            Αγώνες
          </button>
        </div>
        <div className="race-hero">
          <div>
            <div className="big-num">{elapsed >= 0 ? formatDuration(elapsed) : `−${formatDuration(-elapsed)}`}</div>
            <div className="muted small">{elapsed >= 0 ? 'πραγματικός' : 'μέχρι την εκκίνηση'}</div>
          </div>
          <div>
            <div className="big-num">{own?.rank ? ordinal(own.rank) : '—'}</div>
            <div className="muted small">σε διορθωμένο (εκτίμηση)</div>
          </div>
        </div>
        {own?.rank && (ahead || behind) && (
          <p>
            {ahead && ahead.gap !== undefined && (
              <>
                {fmtGap(-ahead.gap).replace('+', '')} πίσω από {ahead.name}
              </>
            )}
            {ahead && behind && ' · '}
            {behind && behind.gap !== undefined && (
              <>
                {fmtGap(behind.gap).replace('+', '')} μπροστά από {behind.name}
              </>
            )}
          </p>
        )}
        {own?.missing && <p className="muted small">Εμείς: {own.missing}.</p>}
      </section>

      <section className="card">
        <table className="leader">
          <thead>
            <tr>
              <th>#</th>
              <th>Σκάφος</th>
              <th className="num">Διαφορά από εμάς</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.entryId} className={x.own ? 'own' : ''} onClick={() => !x.own && onOpponent(x.entryId)}>
                <td>{x.rank ?? '—'}</td>
                <td>
                  <strong>{x.name}</strong>
                  <div className="muted small">
                    {[x.missing, x.fix && `${FIX_LABEL[x.fix.source]} ${ago(x.ageSec)}`].filter(Boolean).join(' · ')}
                    {x.fix && (x.ageSec ?? 0) > 20 * 60 && ' · παλιά θέση'}
                  </div>
                </td>
                <td className="num">{x.own ? 'εμείς' : x.gap !== undefined ? fmtGap(x.gap) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">
          {wind ? `Άνεμος για την εκτίμηση: ${wind.tws.toFixed(0)} kt / ${Math.round(wind.twd)}° (${WIND_LABEL[wind.source]}). ` : 'Χωρίς άνεμο: βάλε TWS/TWD στο Live ή φέρε πρόγνωση στον Χάρτη. '}
          {ais.status === 'ok' && `AIS internet: ${ais.message}, ${ago((now - (ais.at ?? now)) / 1000)}. `}
          {ais.status === 'nokey' && `${ais.message} `}
          {ais.status === 'error' && `AIS internet: ${ais.message} `}
        </p>
        <details>
          <summary className="muted small">Πώς υπολογίζεται</summary>
          <p className="muted small">
            Για κάθε σκάφος: πόσο απέχει από τον τερματισμό πάνω στη διαδρομή, πόσο θα του πάρει με τον άνεμο και τα polars του (ή τα δικά μας κλιμακωμένα με το GPH), και μετά
            ToT/ToD. Είναι εκτίμηση· ακριβέστερη όσο πλησιάζει ο τερματισμός και όσο φρέσκια είναι η θέση.
          </p>
        </details>
      </section>

      <div className="btn-row sticky-actions">
        <button className="btn" onClick={() => onOpponent()}>
          Θέση αντιπάλου
        </button>
        <button className="btn primary" onClick={finish} disabled={elapsed < 0}>
          Τερματισμός
        </button>
      </div>
      {recording && (
        <p className="muted small rec">
          <span className="rec-dot" aria-hidden="true" /> Καταγραφή αγώνα σε εξέλιξη · {r.track.length} σημεία
        </p>
      )}
    </div>
  );
}

// ---- Opponent position -------------------------------------------------------

type Side = 'ahead-l' | 'ahead-r' | 'behind-l' | 'behind-r';
const SIDES: { id: Side; label: string }[] = [
  { id: 'ahead-l', label: 'Μπροστά αριστερά' },
  { id: 'ahead-r', label: 'Μπροστά δεξιά' },
  { id: 'behind-l', label: 'Πίσω αριστερά' },
  { id: 'behind-r', label: 'Πίσω δεξιά' },
];

function OpponentPosition({ entryId, onDone }: { entryId?: string; onDone: () => void }) {
  const { active: r, rows, addFix, update } = useRace();
  const nav = useNav();
  const inst = useInstruments();
  const others = r?.entries.filter((e) => !e.own) ?? [];
  const [id, setId] = useState(entryId ?? others[0]?.id ?? '');
  const [mode, setMode] = useState<'see' | 'mark' | 'finish' | 'none'>('see');
  const [side, setSide] = useState<Side>('ahead-l');
  const [dist, setDist] = useState(0.5);
  if (!r) return null;
  const e = r.entries.find((x) => x.id === id);
  const row = rows.find((x) => x.entryId === id);
  const fix = nav.gps.fix;
  const heading = inst.live ? (inst.values.hdgTrue ?? inst.values.cog) : fix?.cog;
  const next = e ? nextMarkOf(r.fixes.filter((f) => f.entryId === e.id), r.marks) : 1;
  const mark = r.marks[Math.min(next, r.marks.length - 1)];

  const saveSeen = () => {
    if (!fix || heading === undefined || !e) return;
    const p = relativeFix(fix, heading, side, dist);
    addFix({ entryId: e.id, t: Date.now(), lat: p.lat, lon: p.lon, source: 'manual' });
    onDone();
  };

  return (
    <div className="race-opponent">
      <section className="card form-grid">
        <div className="row between">
          <h2>Θέση αντιπάλου</h2>
          <button className="btn small-btn" onClick={onDone}>
            Πίσω
          </button>
        </div>
        <label>
          Σκάφος
          <select value={id} onChange={(ev) => setId(ev.target.value)}>
            {others.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">{row?.fix ? `Τελευταία θέση ${ago(row.ageSec)} (${FIX_LABEL[row.fix.source]}).` : 'Δεν υπάρχει ακόμη θέση.'} Διάλεξε τον πιο γρήγορο τρόπο:</p>
        <div className="seg">
          {(
            [
              ['see', 'Τον βλέπω'],
              ['mark', 'Σημαδούρα'],
              ['finish', 'Τερμάτισε'],
              ['none', 'Δεν φαίνεται'],
            ] as const
          ).map(([m, label]) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
        </div>
      </section>

      {mode === 'see' && (
        <section className="card">
          <h3>Πού τον βλέπεις από εμάς;</h3>
          <div className="quad">
            {SIDES.map((s) => (
              <button key={s.id} className={`btn ${side === s.id ? 'primary' : ''}`} onClick={() => setSide(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          <NumberStepper label="Απόσταση" unit="NM" value={dist} onChange={(v) => setDist(Math.max(0.05, Math.min(10, v ?? 0.5)))} decimals={2} small={0.05} big={0.5} min={0.05} max={10} />
          <p className="muted small">Μια ματιά αρκεί· η εκτίμηση διορθώνεται όταν έρθει AIS ή στη σημαδούρα.</p>
          {(!fix || heading === undefined) && <p className="errors">Χρειάζεται θέση και πορεία (GPS ή όργανα).</p>}
          <button className="btn primary wide" disabled={!fix || heading === undefined} onClick={saveSeen}>
            Αποθήκευση
          </button>
        </section>
      )}
      {mode === 'mark' && e && (
        <section className="card">
          <p className="muted small">Πάτα τη στιγμή που ο αντίπαλος περνά τη σημαδούρα. Είναι η πιο ακριβής χειροκίνητη μέτρηση.</p>
          <button
            className="btn primary wide"
            disabled={next >= r.marks.length}
            onClick={() => {
              addFix({ entryId: e.id, t: Date.now(), lat: mark.lat, lon: mark.lon, source: 'mark', markIndex: Math.min(next, r.marks.length - 1) });
              onDone();
            }}
          >
            Πέρασε τώρα την «{mark.name}»
          </button>
        </section>
      )}
      {mode === 'finish' && e && (
        <section className="card">
          <p className="muted small">Πάτα τη στιγμή που τερματίζει: ο χρόνος του μετράει ως τελικός.</p>
          <button
            className="btn primary wide"
            onClick={() => {
              const t = Date.now();
              update((x) => ({ results: { ...(x.results ?? {}), [e.id]: (t - x.start) / 1000 } }));
              onDone();
            }}
          >
            Τερμάτισε τώρα ο {e.name}
          </button>
        </section>
      )}
      {mode === 'none' && (
        <section className="card">
          <p className="muted small">Δεν τον βλέπεις; Η εφαρμογή συνεχίζει με εκτίμηση από την τελευταία του θέση και τα polars του, και το σημειώνει ως «παλιά θέση».</p>
          <button className="btn wide" onClick={onDone}>
            Εντάξει
          </button>
        </section>
      )}
    </div>
  );
}
