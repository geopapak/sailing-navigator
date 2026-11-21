import { useEffect, useMemo, useRef, useState } from 'react';
import { StickyBar } from './StickyBar';
import { useBarFit } from './hooks';
import { useAlerts } from './RaceAlerts';
import { useBackOverride } from './backStack';
import { deleteKV } from '../boat/store';
import { useHoldUpdate } from './useHoldUpdate';
import { RaceScreen } from './RaceScreen';
import { PolarTrimPanel } from './PolarTrimPanel';
import { RaceCrew } from './CrewViews';
import { useApp } from './AppContext';
import { fmtWind } from '../race/manualWind';
import { useNav, localToMs } from './NavContext';
import { useRace } from './RaceContext';
import { askConfirm } from './Dialogs';
import { useInstruments } from './InstrumentsContext';
import { CertificateImport, toBase64 } from './CertificateImport';
import { NumberStepper } from './NumberStepper';
import { CourseEditor, CoursePicker } from './RaceCourse';
import { DEFAULT_SERVER } from './settings';
import { accountApi, ApiError } from '../sync/api';
import { normalizeSailNo } from '../boat/orc';
import type { BoatProfile } from '../boat/types';
import type { CleanEntry } from '../race/entrylist';
import type { Race, RaceEntry } from '../race/types';
import { fmtGap, nextMarkOf, noComparison, relativeFix } from '../race/estimate';
import { GPH_OPTION, NONE_OPTION, SCORING_TEXT, defaultScoring, hasChoice, isUncorrected, optionLabel, scoringChoices } from '../scoring/options';
import { openBoatEditor } from './WelcomeCard';
import { formatDuration } from '../scoring/corrected';
import { useRaceEvent } from './eventHooks';
import { EVENT_TEXT as ET } from './eventText';
import { eventBoats, eventRaces, liveStanding, nextRaceSetup, openEvents, placeText, raceNumbers, unifyEntries } from '../race/event';
import { EventFields, deleteEventRace, newEventDraft, type EventDraft } from './EventView';
import type { RaceEvent } from '../race/types';
import type { ScoringMethod } from '../scoring/corrected';
import { Icon } from './Icons';
import { PlanView } from './PlanView';
import { useOnline } from './CruiseViews';
import { PLAN_TEXT, forecastStatus, plannedKey, planState, type PlanTarget } from '../routing/planTarget';
import { modelLabel, normalizeModel } from '../weather/models';
import { num } from '../format';
import { DateTimeField, type DateTimeValue } from './DateTimeField';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** A copy of a boat's ratings and polar for a race entry. */
export function entryBoat(b: BoatProfile): NonNullable<RaceEntry['boat']> {
  return {
    name: b.name,
    sailNumber: b.sailNumber,
    gph: b.gph,
    polar: b.polar,
    performanceFactor: b.performanceFactor,
    orcRef: b.orcRef,
    scoring: b.scoring,
  };
}

const sailKey = (s?: string) => (s ? normalizeSailNo(s).replace(/^[A-Z]{3}-/, '') : '');

const optLabel = optionLabel;
const SOURCE_LABEL: Record<RaceEntry['source'], string> = {
  own: 'εμείς',
  boats: 'από τα σκάφη μου',
  orc: 'ORC',
  pdf: 'πιστοποιητικό PDF',
  none: 'χωρίς βαθμολογία',
};

type Lookup = Record<string, 'searching' | 'notfound' | 'error' | undefined>;

export function RaceSetup({
  id,
  eventId: eventId0,
  onDone,
  onCancel,
}: {
  id?: string;
  /** P-040: a new race of this event («Στήσε την <N>η ιστιοδρομία»): same boat, entries and crew. */
  eventId?: string;
  onDone: (started: boolean) => void;
  onCancel: () => void;
}) {
  const { activeBoat, boats, settings, account, saveBoat, refreshAccount } = useApp();
  const nav = useNav();
  const race = useRace();
  const existing = id ? race.races.find((r) => r.id === id) : undefined;
  // Race setup is unsaved input: a waiting app update waits for it (P-043).
  useHoldUpdate(true);
  // «Μέρος διοργάνωσης» (P-040 AC 1–6): 'none', 'new' or the id of an event.
  const [evSel, setEvSel] = useState<string>(() => existing?.eventId ?? eventId0 ?? 'none');
  const [evDraft, setEvDraft] = useState<EventDraft>(newEventDraft);
  const copyFrom = (evId: string) => {
    const ev = race.events.find((e) => e.id === evId);
    return ev ? nextRaceSetup(ev, race.races) : undefined;
  };
  const [r, setR] = useState<Race>(
    () =>
      existing ?? {
        id: uid(),
        name: '',
        courseId: nav.course?.id,
        courseName: nav.course?.name,
        marks: nav.course?.marks ?? [],
        start: Math.max(localToMs(nav.plan.startLocal) ?? 0, Math.ceil(Date.now() / 300_000) * 300_000),
        // P-056 §Α: a boat without certificate options starts with «GPH — ToD» or «Χωρίς διόρθωση».
        ...defaultScoring(activeBoat ? entryBoat(activeBoat) : undefined, {
          id: nav.plan.scoringOptionId || 'coastal',
          method: 'ToT',
        }),
        entries: activeBoat
          ? [
              {
                id: 'own',
                name: activeBoat.name,
                sailNo: activeBoat.sailNumber,
                own: true,
                source: 'own',
                boat: entryBoat(activeBoat),
              },
            ]
          : [],
        kind: 'race',
        status: 'planned',
        track: [],
        fixes: [],
        updatedAt: Date.now(),
        ...(eventId0 ? copyFrom(eventId0) : {}),
      },
  );
  const set = (p: Partial<Race>) => setR((x) => ({ ...x, ...p }));
  // P-064: what the «Εκκίνηση» field holds now (a day without a time is not a start).
  const [startInfo, setStartInfo] = useState<DateTimeValue>({
    ms: r.start,
    day: r.start,
    noTime: false,
  });
  // After the start the event is only text (AC 5).
  const evLocked = !!existing && existing.status !== 'planned';
  const selEvent: RaceEvent | undefined = evSel !== 'none' && evSel !== 'new' ? race.events.find((e) => e.id === evSel) : undefined;
  const evChoices = openEvents(race.events, race.races).filter((e) => e.id !== selEvent?.id);
  if (selEvent) evChoices.unshift(selEvent);
  const others = selEvent ? eventRaces(selEvent.id, race.races).filter((x) => x.id !== r.id) : [];
  const numberOf = (ev: RaceEvent) => raceNumbers([...eventRaces(ev.id, race.races).filter((x) => x.id !== r.id), { ...r, status: 'planned' as const }])[r.id] ?? 1;
  const evNo = selEvent ? numberOf(selEvent) : evSel === 'new' ? 1 : undefined;
  const prevRace = others.filter((x) => x.start <= r.start && x.status !== 'planned').pop() ?? others[others.length - 1];
  const pickEvent = (v: string) => {
    setEvSel(v);
    // A new race of an existing event starts as a copy of the previous one (AC 3).
    if (!existing && v !== 'none' && v !== 'new') {
      const c = copyFrom(v);
      if (c) set(c);
    }
  };
  const setEntry = (eid: string, p: Partial<RaceEntry>) =>
    setR((x) => ({
      ...x,
      entries: x.entries.map((e) => (e.id === eid ? { ...e, ...p } : e)),
    }));
  const server = settings.aiUrl || DEFAULT_SERVER;

  // Entry list (PDF)
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [listError, setListError] = useState<string>();
  const [list, setList] = useState<{
    file: string;
    event: string;
    entries: CleanEntry[];
  }>();
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
        entries = entries.map((x) =>
          x.own
            ? {
                ...x,
                mmsi: x.mmsi || e.mmsi || undefined,
                className: e.className,
              }
            : x,
        );
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
          setEntry(e.id, {
            source: 'orc',
            boat: entryBoat(res.boat),
            name: e.name || res.boat.name,
          });
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
  // P-067 §Μ: the preparation map, a sub-screen like the course editor (the form keeps what was typed).
  const [prepOpen, setPrepOpenState] = useState(false);
  const setPrepOpen = (v: boolean) => {
    setPrepOpenState(v);
    if (v) requestAnimationFrame(() => window.scrollTo(0, 0));
  };
  const closePrep = () => {
    setPrepOpen(false);
    requestAnimationFrame(() => document.querySelector('[data-testid="best-route-card"]')?.scrollIntoView({ block: 'center' }));
  };
  // Σ1: the header «←» closes the sub-screen only (as «← Αγώνας»), never the form with what was typed.
  useBackOverride(prepOpen, closePrep);
  // Open the editor at the top; come back to the course picker, not to where the page was.
  const setCourseEd = (v?: 'new' | 'edit') => {
    setCourseEdState(v);
    requestAnimationFrame(() => (v ? window.scrollTo(0, 0) : document.querySelector('.course-picker')?.scrollIntoView({ block: 'center' })));
  };
  useBackOverride(!!courseEd && !prepOpen, () => setCourseEd(undefined));
  // A new race that is never saved leaves no stored route behind (`planned:<id>`).
  const savedRef = useRef(!!existing);
  const raceIdRef = useRef(r.id);
  useEffect(
    () => () => {
      if (!savedRef.current) deleteKV(plannedKey(raceIdRef.current)).catch(() => undefined);
    },
    [],
  );

  const own = r.entries.find((e) => e.own);
  const choices = scoringChoices(own ? own.boat : activeBoat);
  const scoringValue = `${r.scoringOptionId}|${r.scoringOptionId === NONE_OPTION ? 'ToT' : r.method}`;
  const known = choices.some((c) => c.value === scoringValue);
  const problems: string[] = [];
  if (!r.name.trim()) problems.push(evSel === 'none' ? 'Δώσε όνομα αγώνα.' : ET.noRaceName);
  if (evSel === 'new' && !evDraft.name.trim()) problems.push(`${ET.noEventName}.`);
  const noCourse = 'Διάλεξε ή φτιάξε διαδρομή με τουλάχιστον 2 σημεία.';
  if (r.marks.length < 2) problems.push(noCourse);
  if (startInfo.day === undefined) problems.push('Βάλε ημερομηνία εκκίνησης.');
  else if (startInfo.ms === undefined) problems.push('Βάλε ώρα εκκίνησης.');
  if (!own) problems.push('Λείπει το σκάφος μας.');
  else if (!hasChoice(own.boat, r.scoringOptionId, r.method)) problems.push('Το σκάφος μας δεν έχει αυτή την επιλογή βαθμολογίας.');
  const scoringHelp = r.scoringOptionId === GPH_OPTION ? (r.method === 'ToT' ? SCORING_TEXT.gphToTHelp : SCORING_TEXT.gphToDHelp) : undefined;
  const ownBoatId = activeBoat?.isOwn ? activeBoat.id : (boats.find((b) => b.isOwn)?.id ?? activeBoat?.id);

  const store = async (start: boolean) => {
    const now = Date.now();
    let evId: string | undefined = evSel === 'none' ? undefined : evSel;
    // The event is saved together with its first race, never alone (AC 6).
    if (evSel === 'new') {
      const ev: RaceEvent = {
        id: uid(),
        ...evDraft,
        name: evDraft.name.trim(),
        status: 'open',
        createdAt: now,
        updatedAt: now,
      };
      await race.saveEvent(ev);
      evId = ev.id;
    } else if (selEvent) await race.saveEvent({ ...selEvent, updatedAt: now });
    // A boat known in the event by its sail number keeps the event's id (AC 9).
    const entries = evId ? unifyEntries(r.entries, eventBoats(eventRaces(evId, race.races).filter((x) => x.id !== r.id))) : r.entries;
    const out: Race = {
      ...r,
      eventId: evId,
      entries,
      name: r.name.trim(),
      status: start ? 'running' : r.status === 'running' ? 'running' : 'planned',
    };
    savedRef.current = true;
    await race.save(out);
    // Moved out of an event it was the only race of: the event goes too.
    const old = existing?.eventId;
    if (old && old !== evId && !race.races.some((x) => x.eventId === old && x.id !== r.id)) await race.removeEvent(old);
    race.setActiveId(out.id);
    onDone(start || out.status === 'running');
  };

  if (prepOpen) {
    return (
      <PlanView
        prep={{
          race: {
            id: r.id,
            name: r.name.trim(),
            marks: r.marks,
            scoringOptionId: r.scoringOptionId,
          },
          start: startInfo.ms,
          day: startInfo.day,
          onBack: closePrep,
        }}
      />
    );
  }

  if (courseEd) {
    const editing = courseEd === 'edit';
    const fromSaved = editing && !!r.courseId;
    return (
      <CourseEditor
        title={editing ? 'Αλλαγή διαδρομής' : 'Νέα διαδρομή'}
        initial={
          editing
            ? {
                name: fromSaved ? `${r.courseName ?? 'Διαδρομή'} (σήμερα)` : (r.courseName ?? ''),
                marks: r.marks,
              }
            : { name: '', marks: [] }
        }
        keepDefault={!editing}
        onCancel={() => setCourseEd(undefined)}
        onDone={(v) => {
          if (v.keep) {
            // Always a new saved course: changing a course for one race never overwrites the original.
            const c = {
              id: `c-${Date.now().toString(36)}`,
              name: v.name,
              marks: v.marks,
              updatedAt: Date.now(),
            };
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
        <div className="row between full">
          <div>
            <h2>{selEvent ? (existing ? ET.race : ET.newRace) : existing ? 'Αγώνας' : 'Νέος αγώνας'}</h2>
            {selEvent && evNo && (
              <p className="small muted" data-testid="setup-event-sub">
                {ET.existing(selEvent.name, evNo)}
              </p>
            )}
          </div>
        </div>
        {evLocked ? (
          selEvent && evNo ? (
            <p className="full small">
              {ET.partOf}: {ET.existing(selEvent.name, evNo)}
            </p>
          ) : null
        ) : (
          <div className="field-group full event-pick" role="radiogroup" aria-label={ET.partOf}>
            <span className="field-label" aria-hidden="true">
              {ET.partOf}
            </span>
            {[
              { v: 'none', t: ET.noneTitle, d: ET.noneSub },
              { v: 'new', t: ET.newTitle, d: ET.newSub },
              ...evChoices.map((e) => ({
                v: e.id,
                t: e.name,
                d: ET.existingSub(numberOf(e)),
              })),
            ].map((o) => (
              <button key={o.v} type="button" role="radio" aria-checked={evSel === o.v} className={`opt ${evSel === o.v ? 'on' : ''}`} onClick={() => pickEvent(o.v)}>
                <span>
                  <b>{o.t}</b>
                  <span className="small muted"> · {o.d}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {evSel === 'new' && !evLocked && <EventFields value={evDraft} onChange={setEvDraft} boats={r.entries.length} />}
        <label>
          {evSel === 'none' ? 'Όνομα' : ET.raceName}
          <input value={r.name} onChange={(e) => set({ name: e.target.value })} placeholder={evSel === 'none' ? 'π.χ. Χειμερινό · 3η' : ET.raceNamePh} maxLength={80} />
        </label>
        <div className="field-group full">
          <span className="field-label">Διαδρομή</span>
          <CoursePicker value={r} onChange={(v) => set(v)} onNew={() => setCourseEd('new')} onEdit={() => setCourseEd('edit')} />
        </div>
        <DateTimeField
          label="Εκκίνηση"
          testId="race-start"
          value={r.start}
          onChange={(v) => {
            setStartInfo(v);
            if (v.ms !== undefined) set({ start: v.ms });
          }}
        />
        <label>
          Βαθμολογία
          <select
            aria-label="Βαθμολογία"
            value={known ? scoringValue : ''}
            onChange={(e) => {
              const [o, m] = e.target.value.split('|');
              if (o) set({ scoringOptionId: o, method: m as ScoringMethod });
            }}
          >
            {!known && (
              <option value="" disabled>
                Διάλεξε βαθμολογία
              </option>
            )}
            {choices.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {choices.length === 1 && (
          <p className="full small muted scoring-hint" data-testid="scoring-none-hint">
            {SCORING_TEXT.noneOnly}{' '}
            {ownBoatId && (
              <button type="button" className="link" onClick={() => openBoatEditor(ownBoatId)}>
                {SCORING_TEXT.openBoat}
              </button>
            )}
          </p>
        )}
        {scoringHelp && (
          <p className="full small muted scoring-hint" data-testid="scoring-help">
            {scoringHelp}. {SCORING_TEXT.sailingInstructions}
          </p>
        )}
      </section>

      {r.status === 'planned' && (
        <BestRouteCard
          target={{
            raceId: r.id,
            start: startInfo.ms,
            day: startInfo.day,
            marks: r.marks,
            label: r.name.trim(),
          }}
          hasPolar={!!(activeBoat?.polar ?? own?.boat?.polar)}
          onOpen={() => setPrepOpen(true)}
        />
      )}

      <section className="card">
        <h3>Συμμετοχές</h3>
        {selEvent && prevRace && evNo && evNo > 1 && (
          <p className="small muted" data-testid="same-entries">
            {ET.sameEntries(prevRace.entries.length, evNo - 1)}
          </p>
        )}
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
                    {e.boat?.gph ? ` · GPH ${num(e.boat.gph)}` : ''}
                    {e.boat ? (e.boat.polar ? ' · polars ✓' : ' · χωρίς polars (εκτίμηση από GPH)') : ''}
                    {e.mmsi ? ` · MMSI ${e.mmsi}` : ''}
                    {lookup[e.id] === 'searching' && ' · αναζήτηση…'}
                    {lookup[e.id] === 'notfound' && ' · δεν βρέθηκε στο ORC'}
                  </div>
                </div>
                {!e.own && (
                  <button className="icon-btn" aria-label={`Αφαίρεση ${e.name}`} onClick={() => set({ entries: r.entries.filter((x) => x.id !== e.id) })}>
                    <Icon name="close" size={20} />
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
        {evSel !== 'none' && <p className="small">{ET.onlyClass}</p>}
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
              if (b)
                set({
                  entries: [
                    ...r.entries,
                    {
                      id: uid(),
                      name: b.name,
                      sailNo: b.sailNumber,
                      source: 'boats',
                      boat: entryBoat(b),
                    },
                  ],
                });
              setAddBoatId('');
            }}
          >
            Προσθήκη
          </button>
        </div>
      </section>

      {existing && <RaceCrew race={r} boat={activeBoat?.isOwn ? activeBoat : boats.find((b) => b.isOwn)} onChange={set} />}

      {evSel !== 'none' && <p className="small muted event-note">{ET.setupNote(settings.raceShiftDeg)}</p>}
      {problems.length > 0 && (
        <ul className="errors">
          {problems.map((p) => (
            <li key={p}>
              {p}
              {p === noCourse && (
                <>
                  {' '}
                  <button type="button" className="btn small-btn" onClick={() => setCourseEd('new')}>
                    Φτιάξε διαδρομή
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <StickyBar>
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
              const ev = gone.eventId ? race.events.find((e) => e.id === gone.eventId) : undefined;
              const only = !!ev && !race.races.some((x) => x.eventId === ev.id && x.id !== gone.id);
              await deleteEventRace(race, gone, ev, only);
              onCancel();
            }}
          >
            Διαγραφή
          </button>
        )}
      </StickyBar>
    </div>
  );
}

/**
 * «Βέλτιστη διαδρομή» in the race setup (P-067 §Μ, sketch `design/fixes-0.19.1/` frame 2): the forecast
 * label for the race's start, «Λήψη / Ανανέωση πρόγνωσης» and «Δες τη βέλτιστη διαδρομή», with what is missing.
 */
function BestRouteCard({ target, hasPolar, onOpen }: { target: PlanTarget; hasPolar: boolean; onOpen: () => void }) {
  const nav = useNav();
  const online = useOnline();
  const [refreshed, setRefreshed] = useState<number>();
  const f = nav.forecast;
  useEffect(() => {
    if (target.raceId) nav.loadRacePlan(target.raceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.raceId]);
  // KA-Λ9: one automatic refresh when the setup opens (old forecast, race within 72 h).
  useEffect(() => {
    if (target.start === undefined) return;
    let gone = false;
    nav.autoRefreshForecast(target).then((ok) => !gone && ok && setRefreshed(Date.now()));
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const stored = target.raceId ? (nav.racePlans[target.raceId] ?? undefined) : undefined;
  const st = planState(stored, target, f?.fetchedAt);
  const fs = forecastStatus({
    target,
    forecast: f,
    modelLabel: f ? modelLabel(f.model) : '',
    now: Date.now(),
    online,
    model: normalizeModel(nav.plan.model),
    estEnd: stored?.route.end,
  });
  // «Ανανεώθηκε…» takes the place of the «Πρόγνωση για…» line only while that forecast covers the start;
  // another start (past the horizon, not covered) shows its own status.
  const showRefreshed = !!refreshed && !!f && fs.canCompute && fs.lines[0]?.startsWith('Πρόγνωση για');
  const lines = showRefreshed ? [PLAN_TEXT.refreshed(f!.fetchedAt), ...fs.lines.slice(1)] : fs.lines;
  const missing = [
    target.marks.length < 2 && 'Λείπει διαδρομή με τουλάχιστον 2 σημεία.',
    target.start === undefined && 'Βάλε ώρα εκκίνησης.',
    !hasPolar && 'Η βέλτιστη διαδρομή θέλει polars του σκάφους (από το πιστοποιητικό ORC ή με το χέρι).',
  ].filter((x): x is string => !!x);
  const busy = nav.forecastStatus.busy;
  return (
    <section className="card best-route" data-testid="best-route-card">
      <h3>Βέλτιστη διαδρομή</h3>
      {lines.map((l, i) => (
        <div
          key={l}
          className={`fc ${showRefreshed && i === 0 ? 'good' : fs.warn && (i > 0 || !fs.canCompute || l.startsWith('Η ώρα')) ? 'warn' : ''}`}
          data-testid="forecast-label"
          role="status"
        >
          <span>{l}</span>
        </div>
      ))}
      {stored && st === 'current' && <span className="calc">{PLAN_TEXT.computed(stored.at, stored.route)}</span>}
      {stored && st === 'stale' && <span className="calc muted">{PLAN_TEXT.stale}</span>}
      {stored && st === 'oldForecast' && stored.forecastAt !== undefined && <span className="calc">{PLAN_TEXT.oldForecast(stored.forecastAt)}</span>}
      {nav.forecastStatus.error && <p className="small warn-text">{nav.forecastStatus.error}</p>}
      {nav.planStatus.error && stored && st !== 'current' && <p className="small warn-text">{`${PLAN_TEXT.failed} ${nav.planStatus.error}`}</p>}
      <div className="brow">
        {stored && (st === 'stale' || st === 'oldForecast') && (
          // ΚΑ-Λ9, Λ11: the stored route is for another time, course or forecast.
          <button
            type="button"
            className="btn"
            data-testid="best-route-again"
            disabled={nav.planStatus.busy || missing.length > 0 || (nav.plan.windSource !== 'uniform' && !fs.canCompute)}
            onClick={() => nav.computePlan(target)}
          >
            {nav.planStatus.busy ? 'Υπολογισμός…' : PLAN_TEXT.again}
          </button>
        )}
        {busy ? (
          <>
            <button type="button" className="btn" disabled>
              Λήψη…
            </button>
            <button type="button" className="btn" onClick={nav.cancelForecast}>
              Άκυρο
            </button>
          </>
        ) : (
          <button type="button" className="btn" disabled={!online || (target.start === undefined && target.day === undefined)}
            onClick={() => {
              // A download by hand: the label is the forecast's own, not «Ανανεώθηκε…» of the automatic one.
              setRefreshed(undefined);
              nav.loadForecast(target);
            }}
          >
            {f ? 'Ανανέωση πρόγνωσης' : 'Λήψη πρόγνωσης'}
          </button>
        )}
      </div>
      <button
        type="button"
        className="btn primary big-btn wide"
        data-testid="best-route-open"
        disabled={missing.length > 0}
        aria-describedby={missing.length ? 'best-route-miss' : undefined}
        onClick={onOpen}
      >
        Δες τη βέλτιστη διαδρομή
      </button>
      {missing.length > 0 && (
        <ul className="miss" id="best-route-miss">
          {missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---- Live -------------------------------------------------------------------

const ordinal = (n: number) => `${n}ος`;
const ago = (sec?: number) => (sec === undefined ? '' : sec < 90 ? 'τώρα' : sec < 3600 ? `πριν από ${Math.round(sec / 60)}′` : `πριν από ${Math.floor(sec / 3600)} ώρ.`);
const FIX_LABEL = {
  own: 'GPS',
  ais: 'AIS',
  aisstream: 'AIS μέσω ίντερνετ',
  manual: 'χειροκίνητα',
  mark: 'σημαδούρα',
} as const;
const WIND_LABEL = {
  manual: 'χειροκίνητα',
  instruments: 'όργανα',
  live: 'Live',
  forecast: 'πρόγνωση',
} as const;

function useClock(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

/** The race's Live: inside a session `onEnd` opens the session's «■ Τέλος» sheet instead of the old confirm. */
export function RaceLive({
  onBack,
  onOpponent,
  onFinished,
  onEnd,
}: {
  onBack?: () => void;
  onOpponent: (entryId?: string) => void;
  onFinished?: (id: string) => void;
  onEnd?: () => void;
}) {
  const { active: r, rows, wind, ais, update, recording, races } = useRace();
  const { settings } = useApp();
  const now = useClock();
  const { event } = useRaceEvent(r);
  // P-040 AC 12: the place in the event's standing, with this race's estimates as they are now.
  const live = useMemo(
    () => (event && r && r.status === 'running' ? liveStanding(event, races, r, rows, now) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [event, races, r, rows, Math.floor(now / 15_000)],
  );
  const screenRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const alerts = useAlerts();
  // The «Ενεργοποίηση ήχου» prompt goes after one tap: the race screen is shorter, decide the bar again.
  const barMode = useBarFit(screenRef, barRef, recording, alerts.audioOk);
  if (!r) return null;
  const liveOwn = live?.rows.find((x) => x.own);
  const elapsed = (now - r.start) / 1000;
  const own = rows.find((x) => x.own);
  const ranked = rows.filter((x) => x.rank !== undefined);
  const noCmp = noComparison(rows);
  const ahead = own?.rank ? ranked[own.rank - 2] : undefined;
  const behind = own?.rank ? ranked[own.rank] : undefined;
  const ownEntry = r.entries.find((e) => e.own);
  const next = ownEntry ? nextMarkOf(r.fixes.filter((f) => f.entryId === ownEntry.id), r.marks) : 1;
  const legText = next < r.marks.length ? `σκέλος ${next}/${r.marks.length - 1} προς ${r.marks[next].name}` : 'προς τον τερματισμό';

  const finish = async () => {
    if (onEnd) return onEnd();
    if (!(await askConfirm('Τερματίσαμε τώρα; Ο χρόνος σταματά σε αυτή τη στιγμή.', { ok: 'Ναι, τερματίσαμε' }))) return;
    const t = Date.now();
    update((x) => ({
      status: 'finished',
      finish: t,
      results: {
        ...(x.results ?? {}),
        ...(ownEntry ? { [ownEntry.id]: (t - x.start) / 1000 } : {}),
      },
    }));
    onFinished?.(r.id);
  };

  // P-056 §Ι: one bar, in one of two places (Tab order follows what is seen).
  const liveBar = (
    <div ref={barRef} className={`race-bar ${!recording || barMode === 'stick' ? 'stick' : 'flow'}`} role="group" aria-label="Ενέργειες αγώνα" data-testid="race-bar">
      <button className="btn" onClick={() => onOpponent()}>
        Θέση αντιπάλου
      </button>
      <button className="btn primary" onClick={finish} disabled={elapsed < 0}>
        Τερματισμός
      </button>
    </div>
  );

  return (
    <div className="race-live">
      {recording && (
        <>
          <div ref={screenRef}>
            <RaceScreen />
          </div>
          {barMode === 'flow' && liveBar}
          <PolarTrimPanel />
        </>
      )}
      <section className="card">
        <div className="row between">
          <div>
            <h2>{r.name}</h2>
            <p className="muted small">
              {optLabel(r.scoringOptionId)} {r.method} · {legText}
            </p>
            {event && (
              <p className="event-line" data-testid="event-live">
                {liveOwn?.place !== undefined ? ET.live(event.name, placeText(liveOwn.place, liveOwn.tied)) : ET.liveNone(event.name)}
              </p>
            )}
          </div>
          {onBack && (
            <button className="btn small-btn" onClick={onBack}>
              Αγώνες
            </button>
          )}
        </div>
        <div className="race-hero">
          <div>
            <div className="big-num">{elapsed >= 0 ? formatDuration(elapsed) : `−${formatDuration(-elapsed)}`}</div>
            <div className="muted small">{elapsed >= 0 ? 'πραγματικός' : 'μέχρι την εκκίνηση'}</div>
          </div>
          <div>
            {noCmp?.none ? (
              <div className="hero-text" data-testid="race-place">
                {noCmp.text}
              </div>
            ) : (
              <div className="big-num" data-testid="race-place">
                {own?.rank ? ordinal(own.rank) : '—'}
              </div>
            )}
            <div className="muted small">{isUncorrected(r) ? 'σε πραγματικό χρόνο (εκτίμηση)' : 'σε διορθωμένο (εκτίμηση)'}</div>
            {noCmp && !noCmp.none && (
              <div className="muted small" data-testid="race-no-compare">
                {noCmp.text}
              </div>
            )}
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
          {wind ? `Άνεμος για την εκτίμηση: ${fmtWind(wind.tws, wind.twd, settings)} (${WIND_LABEL[wind.source]}). ` : 'Χωρίς άνεμο: βάλε TWS/TWD στο Live ή πάτα «Λήψη πρόγνωσης» στον Χάρτη. '}
          {ais.status === 'ok' && `AIS μέσω ίντερνετ: ${ais.message}, ${ago((now - (ais.at ?? now)) / 1000)}. `}
          {ais.status === 'nokey' && `${ais.message} `}
          {ais.status === 'error' && `AIS μέσω ίντερνετ: ${ais.message} `}
        </p>
        <details>
          <summary className="muted small">Πώς υπολογίζεται</summary>
          <p className="muted small">
            Για κάθε σκάφος: πόσο απέχει από τον τερματισμό πάνω στη διαδρομή, πόσο θα του πάρει με τον άνεμο και τα polars του (ή τα δικά μας κλιμακωμένα με το GPH), και μετά
            ToT/ToD. Είναι εκτίμηση· ακριβέστερη όσο πλησιάζει ο τερματισμός και όσο φρέσκια είναι η θέση.
          </p>
        </details>
      </section>

      {(!recording || barMode === 'stick') && liveBar}
      {recording && (
        <p className="muted small rec">
          <span className="rec-dot" aria-hidden="true" /> Καταγραφή αγώνα σε εξέλιξη · <span data-testid="race-points">{r.track.length} σημεία</span>
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

export function OpponentPosition({ entryId, onDone }: { entryId?: string; onDone: () => void }) {
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
    addFix({
      entryId: e.id,
      t: Date.now(),
      lat: p.lat,
      lon: p.lon,
      source: 'manual',
    });
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
              addFix({
                entryId: e.id,
                t: Date.now(),
                lat: mark.lat,
                lon: mark.lon,
                source: 'mark',
                markIndex: Math.min(next, r.marks.length - 1),
              });
              onDone();
            }}
          >
            Πέρασε τώρα: «{mark.name}»
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
              update((x) => ({
                results: { ...(x.results ?? {}), [e.id]: (t - x.start) / 1000 },
              }));
              onDone();
            }}
          >
            Τερμάτισε τώρα: {e.name}
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
