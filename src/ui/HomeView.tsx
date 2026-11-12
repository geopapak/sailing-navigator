import { useMemo, useState } from 'react';
import { useHoldUpdate } from './useHoldUpdate';
import { useApp } from './AppContext';
import { useNav } from './NavContext';
import { useRace } from './RaceContext';
import { useInstruments } from './InstrumentsContext';
import { Icon } from './Icons';
import { LiveView, getLiveSail, setLiveSail } from './LiveView';
import { ChatView } from './ChatView';
import { showAlert } from './Dialogs';
import { startNewBoat } from './WelcomeCard';
import { entryBoat } from './RaceView';
import { SessionCard } from './HistoryView';
import { UpdateCard } from './AppUpdater';
import { dayStr, hhmm } from './SessionBar';
import { selectableSails } from '../performance/sails';
import { gridField } from '../weather/field';
import { KIND_INFO, SESSION_KINDS, newSession } from '../race/session';
import type { Race, SessionKind } from '../race/types';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** The planned race to show first: the next one to come, else the latest planned. */
export function nextPlanned(races: Race[], now: number): Race | undefined {
  const planned = races.filter((r) => r.status === 'planned').sort((a, b) => a.start - b.start);
  return planned.find((r) => r.start >= now - 3 * 3600_000) ?? planned[planned.length - 1];
}

/** «Νέα έξοδος» (P-033): what are we doing today. */
export function HomeView({
  onSetup,
  onQuick,
  onHistory,
  onOpen,
}: {
  onSetup: (kind: SessionKind, raceId?: string) => void;
  onQuick: () => void;
  onHistory: () => void;
  onOpen: (r: Race) => void;
}) {
  const { boats } = useApp();
  const race = useRace();
  const noBoat = boats.length === 0;
  const done = useMemo(
    () => race.races.filter((r) => r.status === 'finished').sort((a, b) => (b.finish ?? b.start) - (a.finish ?? a.start)),
    [race.races],
  );
  const next = nextPlanned(race.races, Date.now());
  // The next one first; the others stay reachable under it.
  const planned = next ? [next, ...race.races.filter((r) => r.status === 'planned' && r.id !== next.id).sort((a, b) => a.start - b.start)].slice(0, 3) : [];

  return (
    <div className="home">
      <UpdateCard />
      {noBoat && (
        <section className="card">
          <h3>Καλώς ήρθες</h3>
          <p className="small">Για Αγώνα και Προπόνηση χρειάζεται το σκάφος σου, από το πιστοποιητικό ORC. Για Βόλτα μπορείς να ξεκινήσεις και χωρίς.</p>
          <button type="button" className="btn primary big-btn wide" onClick={() => startNewBoat()}>
            ＋ Πρόσθεσε το σκάφος σου
          </button>
        </section>
      )}
      <h2 className="hello">Τι κάνουμε σήμερα;</h2>
      {SESSION_KINDS.map((k) => {
        const need = noBoat && k !== 'cruise';
        return (
          <button
            key={k}
            type="button"
            className={`mode-card ${need ? 'need' : ''}`}
            aria-label={`${KIND_INFO[k].name}: ${need ? 'Θέλει πρώτα σκάφος με polar' : KIND_INFO[k].desc}`}
            onClick={() => (need ? showAlert('Πρώτα πρόσθεσε το σκάφος σου') : onSetup(k))}
          >
            <span className="ic">
              <Icon name={k} size={30} />
            </span>
            <span>
              <b>{KIND_INFO[k].name}</b>
              <span className="d">{need ? 'Θέλει πρώτα σκάφος με polar' : KIND_INFO[k].desc}</span>
            </span>
            <span className="go" aria-hidden="true">
              ›
            </span>
          </button>
        );
      })}
      <button type="button" className="quick-btn" onClick={onQuick}>
        <Icon name="eye" />
        <span>
          Γρήγορη ματιά
          <span className="d">Live χωρίς καταγραφή</span>
        </span>
      </button>

      {planned.length > 0 && (
        <>
          <div className="sec">
            <h3>Επόμενος αγώνας</h3>
          </div>
          {planned.map((p) => (
            <section key={p.id} className="card planned">
              <span>
                <b>{p.name || 'Αγώνας'}</b>
                <br />
                <span className="small muted">
                  {dayStr(p.start)} · {hhmm(p.start)}
                  {p.courseName ? ` · ${p.courseName}` : ''}
                </span>
              </span>
              <button type="button" className="btn" onClick={() => onSetup('race', p.id)}>
                Στήσε
              </button>
            </section>
          ))}
        </>
      )}

      <div className="sec">
        <h3>Οι έξοδοί μου</h3>
        {done.length > 0 && (
          <button type="button" className="link-btn" onClick={onHistory}>
            Όλες ›
          </button>
        )}
      </div>
      {done.length === 0 ? (
        <section className="card empty">
          <p>
            <b>Δεν έχεις εξόδους ακόμα</b>
          </p>
          <p className="small muted">Διάλεξε πάνω Αγώνα, Προπόνηση ή Βόλτα. Η πρώτη σου έξοδος θα φανεί εδώ.</p>
        </section>
      ) : (
        done.slice(0, 3).map((r) => <SessionCard key={r.id} r={r} fresh={r.id === race.freshId} onOpen={() => onOpen(r)} />)
      )}
    </div>
  );
}

/** Speed, wind, COG, TWA and depth without a boat profile (cruise without a boat, «Γρήγορη ματιά»). */
function BasicLive() {
  const nav = useNav();
  const inst = useInstruments();
  const fix = nav.gps.fix;
  const v = inst.live ? inst.values : {};
  const n1 = (x?: number) => (x === undefined ? '—' : x.toFixed(1).replace('.', ','));
  const d0 = (x?: number) => (x === undefined ? '—' : `${Math.round(x)}°`);
  return (
    <section className="card basic-live">
      <div className="bl-tile">
        <span>
          <b>Ταχύτητα</b>
          <span className="small muted">{v.bsp !== undefined ? 'BSP' : 'SOG από GPS'}</span>
        </span>
        <span className="val">
          {n1(v.bsp ?? fix?.sog)}
          <small> κν</small>
        </span>
      </div>
      <div className="bl-tile">
        <span>
          <b>Άνεμος</b>
          <span className="small muted">TWS · αληθής</span>
        </span>
        <span className="val">
          {n1(v.tws)}
          <small> κν</small>
        </span>
      </div>
      <div className="bl-mini">
        <div>
          <b>{d0(fix?.cog)}</b>
          <span className="small muted">πορεία COG</span>
        </div>
        <div>
          <b>{v.twa === undefined ? '—' : `${Math.round(Math.abs(v.twa))}°`}</b>
          <span className="small muted">TWA</span>
        </div>
        <div>
          <b>{v.depth === undefined ? '—' : `${n1(v.depth)} μ`}</b>
          <span className="small muted">βάθος</span>
        </div>
      </div>
    </section>
  );
}

/** Live inside a training or cruise session (Φ1: today's Live; without a polar, the basic numbers). */
export function SessionLive() {
  const { activeBoat } = useApp();
  const race = useRace();
  // A cruise without a boat shows the basic numbers only.
  const withBoat = !!race.session?.entries.some((e) => e.own);
  return withBoat && activeBoat?.polar ? <LiveView /> : (
    <>
      {withBoat && activeBoat && <p className="card small">Το σκάφος «{activeBoat.name}» δεν έχει polars, άρα ούτε στόχους. Πρόσθεσε polars από Σκάφη → Επεξεργασία.</p>}
      <BasicLive />
    </>
  );
}

/** «Γρήγορη ματιά»: Live without recording, the advisor one tap away (AC 5). */
export function QuickLook({ onHome }: { onHome: () => void }) {
  const { activeBoat } = useApp();
  const nav = useNav();
  const inst = useInstruments();
  const [chat, setChat] = useState(false);
  const nothing = !nav.gps.fix && !inst.live;
  return (
    <div className="quick-look">
      <p className="msg warn">Γρήγορη ματιά: δεν καταγράφεται ίχνος, χωρίς ειδοποιήσεις.</p>
      <div className="seg" role="tablist" aria-label="Γρήγορη ματιά">
        <button type="button" role="tab" aria-selected={!chat} className={!chat ? 'on' : ''} onClick={() => setChat(false)}>
          Live
        </button>
        <button type="button" role="tab" aria-selected={chat} className={chat ? 'on' : ''} onClick={() => setChat(true)}>
          Σύμβουλος
        </button>
      </div>
      {nothing && <p className="msg bad">Ούτε GPS ούτε όργανα. Άνοιξε την τοποθεσία του κινητού ή σύνδεσε όργανα από τις Ρυθμίσεις.</p>}
      {chat ? <ChatView /> : activeBoat?.polar ? <LiveView /> : <BasicLive />}
      <button type="button" className="btn primary big-btn wide" onClick={onHome}>
        ● Ξεκίνα καταγραφή (νέα έξοδος)
      </button>
    </div>
  );
}

/** Basic setup of a training (AC 18) or a cruise (AC 19). The race keeps today's «Νέος αγώνας». */
export function SessionSetup({ kind, onStarted }: { kind: 'training' | 'cruise'; onStarted: () => void }) {
  const { activeBoat, boats, updateSettings } = useApp();
  const nav = useNav();
  const race = useRace();
  const [withBoat, setWithBoat] = useState(kind === 'training' || !!activeBoat);
  useHoldUpdate(true); // training / cruise setup (P-043)
  const [courseId, setCourseId] = useState<string>('');
  const [sail, setSail] = useState(getLiveSail);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const boat = withBoat ? activeBoat : undefined;
  const sails = boat ? selectableSails(boat) : [];

  const start = async () => {
    if (race.session) return; // one session at a time (AC 20)
    const course = nav.courses.find((c) => c.id === courseId);
    const r = newSession(kind, {
      id: uid(),
      now: Date.now(),
      entries: boat ? [{ id: 'own', name: boat.name, sailNo: boat.sailNumber, own: true, source: 'own', boat: entryBoat(boat) }] : [],
      course: kind === 'training' && course ? { id: course.id, name: course.name, marks: course.marks } : undefined,
    });
    setBusy(true);
    setErr(undefined);
    try {
      race.setActiveId(r.id);
      await race.save(r);
      onStarted();
    } catch {
      setErr('Δεν αποθηκεύτηκε η έξοδος.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="session-setup">
      <section className="card">
        <div className="row between">
          <span>
            <b>Σκάφος</b>
            <br />
            <span className="small muted">
              {boat ? `${boat.name}${boat.polar ? ' · polar ✓' : ' · χωρίς polar'}` : 'χωρίς σκάφος · μόνο ταχύτητα και άνεμος'}
            </span>
          </span>
        </div>
        {boats.length > 0 && (
          <select
            aria-label="Σκάφος"
            value={boat?.id ?? ''}
            onChange={(e) => {
              if (!e.target.value) return setWithBoat(false);
              setWithBoat(true);
              updateSettings({ activeBoatId: e.target.value });
            }}
          >
            {kind === 'cruise' && <option value="">Χωρίς σκάφος</option>}
            {boats.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </section>

      {kind === 'training' && (
        <>
          {sails.length > 0 && (
            <>
              <div className="settings-sub">Πανί πλώρης</div>
              <div className="seg wrap" role="group" aria-label="Πανί πλώρης">
                {sails.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    className={sail === x.id ? 'on' : ''}
                    aria-pressed={sail === x.id}
                    onClick={() => {
                      setLiveSail(x.id);
                      setSail(x.id);
                    }}
                  >
                    {x.name}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="settings-sub">Διαδρομή (προαιρετικό)</div>
          <select aria-label="Διαδρομή (προαιρετικό)" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">Χωρίς · ελεύθερα</option>
            {nav.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="small muted">Ίχνος κάθε 15″, μένει μόνο στο κινητό. Χωρίς αντιπάλους και διορθωμένο χρόνο. Οι ειδοποιήσεις της προπόνησης έρχονται σε επόμενη έκδοση.</p>
        </>
      )}

      {kind === 'cruise' && (
        <>
          <WeatherCard />
          <p className="small muted">Ίχνος κάθε 30″, μένει μόνο στο κινητό. Η βόλτα δεν μοιράζεται.</p>
        </>
      )}

      {err && (
        <p className="errors" role="alert">
          {err}{' '}
          <button type="button" className="link" onClick={start}>
            Ξανά
          </button>
        </p>
      )}
      <div className="btn-row sticky-actions">
        <button type="button" className="btn primary big-btn wide" disabled={busy || !!race.session || (kind === 'training' && !boat)} onClick={start}>
          {kind === 'training' ? '● Έναρξη προπόνησης' : '● Έναρξη βόλτας'}
        </button>
      </div>
    </div>
  );
}

/** Wind now from the saved forecast; offline it says how old it is. */
function WeatherCard() {
  const nav = useNav();
  const f = nav.forecast;
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  const p = nav.gps.fix ?? { lat: 37.85, lon: 23.55 };
  const now = Date.now();
  const w = f && now >= f.times[0] - 3600_000 && now <= f.times[f.times.length - 1] ? gridField(f).at(p.lat, p.lon, now) : undefined;
  return (
    <section className="card">
      <b>Καιρός</b>
      <br />
      {w ? (
        <span className="small">
          {Math.round(w.tws)} κν από {Math.round(w.twd)}°{w.gust !== undefined ? `, ριπές ${Math.round(w.gust)}` : ''}
        </span>
      ) : (
        <span className="small muted">Δεν υπάρχει πρόγνωση για σήμερα.</span>
      )}
      {f && (
        <p className="small muted">
          Πρόγνωση από {hhmm(f.fetchedAt)}
          {online ? '' : ' (χωρίς ίντερνετ)'}
        </p>
      )}
      {nav.forecastStatus.error && <p className="small warn-text">{nav.forecastStatus.error}</p>}
      <button type="button" className="btn" disabled={nav.forecastStatus.busy} onClick={() => nav.loadForecast()}>
        {nav.forecastStatus.busy ? 'Φόρτωση…' : f ? 'Ανανέωση πρόγνωσης' : 'Φέρε πρόγνωση'}
      </button>
    </section>
  );
}
