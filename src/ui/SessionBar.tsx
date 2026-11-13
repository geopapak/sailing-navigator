import { useEffect, useMemo, useState } from 'react';
import { UPDATE_TEXT } from '../pwa/updateText';
import { useUpdatePhase } from './AppUpdater';
import { useApp } from './AppContext';
import { useRace } from './RaceContext';
import { useInstruments } from './InstrumentsContext';
import { Icon } from './Icons';
import { THEME_INFO } from './Appearance';
import { getLiveSail, setLiveSail } from './LiveView';
import { selectableSails } from '../performance/sails';
import { KIND_INFO, finishAt, finishNow, hasOwnBoat, kindOf, recordFrom, switchKind, trackEveryMs } from '../race/session';
import { forgottenPrompt, keepGoing, type ForgottenPrompt } from '../race/idle';
import type { Race, SessionKind } from '../race/types';
import type { Theme } from './settings';
import { TestBadge } from './TestBadge';
import { KindAlertToggles } from './AlertsCard';
import { SESSION_FLASH } from './sessionFlash';
import { holdShare } from './crewShare';
import { activeMs, goalOf, goalSub, mss } from '../race/training';
import { pausedSince } from '../race/pauses';

/**
 * Inside a session (P-033): the bar on top with kind, running time, ⚙ quick
 * settings and «■ Τέλος», the status strip under it, and the session's sheets.
 */

const END_EVENT = 'session-end';
/** Opens the «■ Τέλος» sheet from anywhere (e.g. the race's «Τερματισμός» button). */
export const requestSessionEnd = () => window.dispatchEvent(new Event(END_EVENT));
const KIND_EVENT = 'session-kind';
/** Opens the kind sheet from the Live (« ⇄ Γίνε Βόλτα / Προπόνηση», P-034). */
export const requestKindSheet = () => window.dispatchEvent(new Event(KIND_EVENT));

export const hms = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const DAYS = ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'];
/** «Κυρ 23/11» */
export const dayStr = (t: number) => {
  const d = new Date(t);
  return `${DAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
};
export const hhmm = (t: number) => new Date(t).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hour12: false });

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    const vis = () => document.visibilityState === 'visible' && setNow(Date.now());
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [ms]);
  return now;
}

type Sheet = 'kind' | 'quick' | 'end' | undefined;

/** How long «↶ Αναίρεση» stays after «■ Τέλος». */
export const ENDED_UNDO_MS = 10_000;

/** What the session ended with, for the summary and its 10″ undo. */
export interface Ended {
  id: string;
  before: Race;
  until: number;
  /** Ended at the last movement: a race got no result. */
  atLastMove?: boolean;
}

export function SessionBar({ onEnded }: { onEnded: (e: Ended) => void }) {
  const race = useRace();
  const r = race.session;
  const now = useNow();
  const [sheet, setSheet] = useState<Sheet>();
  const [flash, setFlash] = useState<string>();
  const [promptOff, setPromptOff] = useState(false);

  useEffect(() => {
    const on = () => setSheet('end');
    const onKind = () => setSheet('kind');
    const onFlash = (e: Event) => setFlash((e as CustomEvent<string>).detail);
    window.addEventListener(END_EVENT, on);
    window.addEventListener(KIND_EVENT, onKind);
    window.addEventListener(SESSION_FLASH, onFlash);
    return () => {
      window.removeEventListener(END_EVENT, on);
      window.removeEventListener(KIND_EVENT, onKind);
      window.removeEventListener(SESSION_FLASH, onFlash);
    };
  }, []);
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(undefined), 4000);
    return () => window.clearTimeout(t);
  }, [flash]);

  // Checked every second with the clock (and when the app comes back to the front).
  const prompt = useMemo(() => (r ? forgottenPrompt(r, now) : undefined), [r, Math.floor(now / 5000)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setPromptOff(false), [prompt?.kind]);

  if (!r) return null;
  const kind = kindOf(r);
  const info = KIND_INFO[kind];
  const from = recordFrom(r);
  const before = now < r.start;
  const paused = race.paused;
  const recording = now >= from && !paused;
  const what = kind === 'race' ? r.name || 'Αγώνας' : kind === 'training' ? goalSub(goalOf(r)) : 'χωρίς προορισμό';
  const sub = now < from ? `καταγραφή από ${hhmm(from)}` : `${paused ? 'σε παύση' : 'σε εξέλιξη'} · ${what}`;
  // Training and cruise: the clock leaves the pauses out (P-039 AC 16).
  const time = before ? `−${hms(r.start - now)}` : hms(kind === 'race' ? now - r.start : activeMs(r, now));

  const end = async (o: { at?: number } = {}) => {
    const t = Date.now();
    let out = o.at !== undefined ? finishAt(r, o.at, t) : finishNow(r, t);
    // A training shared with the crew: its summary goes only when the 10″ undo is over
    // (or with the next connection), so an undone «Τέλος» never reaches the crew.
    if (out.crewShared && out.crewId) {
      holdShare(r.id, t + ENDED_UNDO_MS + 1000);
      out = { ...out, crewSharePending: true };
    }
    setSheet(undefined);
    try {
      await race.save(out);
    } catch {
      /* the strip offers «Ξανά» */
    }
    race.setFreshId(r.id);
    onEnded({ id: r.id, before: r, until: t + ENDED_UNDO_MS, atLastMove: o.at !== undefined });
  };

  return (
    <>
      <div className="sbar">
        <TestBadge />
        <button
          type="button"
          className="modeb"
          onClick={() => setSheet('kind')}
          aria-label={`${info.name} ${sub}, ${time}. ${kind === 'race' ? 'Πληροφορίες τύπου' : 'Πάτα για αλλαγή τύπου'}`}
        >
          <b>
            <span className={`rec ${recording ? '' : 'off'}`} aria-hidden="true" />
            {info.upper}
            {kind !== 'race' && ' ⇄'}
          </b>
          <span className="t">{time}</span>
          <span className="s">{sub}</span>
        </button>
        <button type="button" className="sb" aria-label="Γρήγορες ρυθμίσεις" onClick={() => setSheet('quick')}>
          <Icon name="gear" />
        </button>
        <button type="button" className="sb end" onClick={() => setSheet('end')}>
          ■ Τέλος
        </button>
      </div>
      <SessionStrip r={r} now={now} flash={flash} onFlash={setFlash} />
      <UpdateLine />
      {sheet === 'kind' && <KindSheet r={r} onClose={() => setSheet(undefined)} onSwitched={setFlash} />}
      {sheet === 'quick' && <QuickSettings kind={kind} onClose={() => setSheet(undefined)} />}
      {sheet === 'end' && (
        <SheetFrame label="Τέλος εξόδου" onClose={() => setSheet(undefined)}>
          {kind === 'race' && before ? (
            <>
              <h3>Ακύρωση / αναβολή αγώνα;</h3>
              <p className="small">
                Ο αγώνας δεν έχει ξεκινήσει ακόμα. Η έξοδος κλείνει χωρίς αποτέλεσμα: δεν γράφεται χρόνος ούτε θέση. Θα έχεις 10″ για αναίρεση.
              </p>
            </>
          ) : (
            <>
              <h3>{kind === 'race' ? 'Τερματισμός αγώνα;' : kind === 'training' ? 'Τέλος προπόνησης;' : 'Τέλος βόλτας;'}</h3>
              <p className="small">Σταματά η καταγραφή και οι ειδοποιήσεις. Η οθόνη μπορεί πια να σβήσει. Θα έχεις 10″ για αναίρεση.</p>
            </>
          )}
          <button type="button" className="btn big-btn wide dangerfill" onClick={() => end()}>
            ■ {kind === 'race' ? (before ? 'Ναι, ακύρωση / αναβολή' : 'Ναι, τερματίσαμε') : 'Ναι, τέλος'}
          </button>
          <button type="button" className="btn big-btn wide" onClick={() => setSheet(undefined)}>
            Συνέχεια
          </button>
        </SheetFrame>
      )}
      {!sheet && prompt && !promptOff && (
        <ForgottenSheet
          r={r}
          p={prompt}
          now={now}
          onEnd={() => end({ at: prompt.lastMove })}
          onDismiss={() => setPromptOff(true)}
          onPause={
            kind !== 'race'
              ? () => {
                  race.pause();
                  setFlash('Παύση · δεν καταγράφεται');
                  setPromptOff(true);
                }
              : undefined
          }
          onKeep={() => {
            // Saved at once (not with the 15″ flush), so a reload does not ask again.
            race.save({ ...r, ...keepGoing(prompt, Date.now()), updatedAt: Date.now() }).catch(() => undefined);
            setPromptOff(true);
          }}
        />
      )}
    </>
  );
}

/** P-043/P-044b: a new version waits (02:00 or the end of the session); one compact line, in the flow (covers nothing). */
function UpdateLine() {
  const { phase } = useUpdatePhase();
  if (phase !== 'waiting' && phase !== 'deferred') return null;
  const text = phase === 'waiting' ? UPDATE_TEXT.sessionWaiting : UPDATE_TEXT.sessionAfter;
  return (
    <div className="update-line" role="status" title={text}>
      <span className="update-badge" aria-hidden="true">
        ↻
      </span>
      <span className="update-text">{text}</span>
    </div>
  );
}

/** Status under the session bar (AC 15): recording, waiting for GPS, gaps, save errors. */
function SessionStrip({ r, now, flash, onFlash }: { r: Race; now: number; flash?: string; onFlash: (m: string) => void }) {
  const race = useRace();
  const { settings } = useApp();
  const inst = useInstruments();
  const every = trackEveryMs(kindOf(r), settings.cruiseTrackSec) / 1000;
  // «⏸ Παύση» in training and cruise, never in a race (P-039 AC 13).
  const pauseBtn =
    kindOf(r) !== 'race' ? (
      <button
        type="button"
        className="strip-btn"
        aria-label="Παύση καταγραφής"
        onClick={() => {
          race.pause();
          onFlash('Παύση · δεν καταγράφεται');
        }}
      >
        ⏸ Παύση
      </button>
    ) : null;
  const since = pausedSince(r);
  if (race.saveError)
    return (
      <div className="net-strip race-strip bad" role="alert">
        <span className="dot" aria-hidden="true" />
        <span>Δεν αποθηκεύτηκε η έξοδος. Η καταγραφή συνεχίζει στη μνήμη.</span>
        <button type="button" className="link" onClick={race.retrySave}>
          Ξανά
        </button>
      </div>
    );
  if (flash)
    return (
      <div className="net-strip ok race-strip" role="status">
        <span className="dot" aria-hidden="true" />
        <span>{flash}</span>
      </div>
    );
  if (since !== undefined)
    return (
      <div className="net-strip race-strip paused-strip" role="status">
        <span className="dot" aria-hidden="true" />
        <span>
          <b>Σε παύση {mss((now - since) / 1000)}</b> · δεν καταγράφεται, χωρίς ειδοποιήσεις
        </span>
        <button
          type="button"
          className="strip-btn"
          onClick={() => {
            race.resume();
            onFlash('Συνέχεια · η καταγραφή ξανάρχισε');
          }}
        >
          ▶ Συνέχεια
        </button>
      </div>
    );
  if (race.gap)
    return (
      <div className="net-strip race-strip" role="alert">
        <span className="dot" aria-hidden="true" />
        <span>
          Κενό {race.gap.minutes}′ στο ίχνος: η οθόνη έκλεισε ή η εφαρμογή πήγε στο παρασκήνιο. Άφησε την εφαρμογή ανοιχτή στην έξοδο.
        </span>
        <button type="button" className="link" onClick={race.dismissGap}>
          Εντάξει
        </button>
      </div>
    );
  if (now < recordFrom(r))
    return (
      <div className="net-strip ok race-strip quiet" role="status">
        <span className="dot" aria-hidden="true" />
        <span>Η καταγραφή ξεκινά μόνη της στις {hhmm(recordFrom(r))}, 10′ πριν την εκκίνηση.</span>
      </div>
    );
  if (race.waitingGps)
    return (
      <div className="net-strip race-strip bad" role="alert">
        <span className="dot" aria-hidden="true" />
        <span>Η καταγραφή περιμένει θέση GPS (ή όργανα).</span>
        {pauseBtn}
      </div>
    );
  if (race.stalledMin)
    return (
      <div className="net-strip race-strip bad" role="alert">
        <span className="dot" aria-hidden="true" />
        <span>Η καταγραφή σταμάτησε πριν από {race.stalledMin}′: δεν έρχεται θέση GPS.</span>
        {pauseBtn}
      </div>
    );
  const fromInst = inst.live && inst.values.lat !== undefined;
  return (
    <div className="net-strip ok race-strip quiet" role="status">
      <span className="dot" aria-hidden="true" />
      <span>
        Καταγραφή κάθε {every}″{race.wakeOn ? ' · η οθόνη μένει ανοιχτή' : ' · κράτα την οθόνη ανοιχτή'}
        {fromInst ? ' · θέση από όργανα' : ''}
      </span>
      {pauseBtn}
    </div>
  );
}

export function SheetFrame({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet session-sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function KindSheet({ r, onClose, onSwitched }: { r: Race; onClose: () => void; onSwitched: (msg: string) => void }) {
  const race = useRace();
  const { settings } = useApp();
  const kind = kindOf(r);
  if (kind === 'race')
    return (
      <SheetFrame label="Τύπος εξόδου" onClose={onClose}>
        <h3>Ο αγώνας μένει αγώνας</h3>
        <p className="small">Για προπόνηση ή βόλτα, τελείωσε τον αγώνα και ξεκίνα νέα έξοδο. Έτσι δεν χαλάνε οι χρόνοι και η κατάταξη.</p>
        <button type="button" className="btn big-btn wide" onClick={onClose}>
          Εντάξει
        </button>
      </SheetFrame>
    );
  const cruiseSec = trackEveryMs('cruise', settings.cruiseTrackSec) / 1000;
  const noBoat = !hasOwnBoat(r);
  const pick = (to: SessionKind) => {
    const p = switchKind(r, to, Date.now());
    if (p) {
      // Saved at once: the switch must survive the app being closed right after.
      race.save({ ...r, ...p, updatedAt: Date.now() }).catch(() => undefined);
      onSwitched(to === 'cruise' ? `Τώρα: Βόλτα · ίχνος κάθε ${cruiseSec}″ · μόνο ειδοποιήσεις ασφάλειας` : 'Τώρα: Προπόνηση · ίχνος κάθε 15″ · στόχοι polar');
    }
    onClose();
  };
  return (
    <SheetFrame label="Αλλαγή τύπου εξόδου" onClose={onClose}>
      <h3>Αλλαγή τύπου εξόδου</h3>
      <p className="small">Το ίχνος συνεχίζει. Αλλάζουν τα νούμερα στο Live και οι ειδοποιήσεις.</p>
      <button
        type="button"
        className={`opt ${kind === 'training' ? 'on' : ''}`}
        aria-pressed={kind === 'training'}
        disabled={noBoat && kind !== 'training'}
        onClick={() => pick('training')}
      >
        <span>
          <b>Προπόνηση</b>
          <span className="small muted">
            {noBoat && kind !== 'training' ? 'Θέλει σκάφος: αυτή η βόλτα ξεκίνησε χωρίς σκάφος.' : 'στόχοι polar, γύροι · ίχνος κάθε 15″'}
          </span>
        </span>
      </button>
      <button type="button" className={`opt ${kind === 'cruise' ? 'on' : ''}`} aria-pressed={kind === 'cruise'} onClick={() => pick('cruise')}>
        <span>
          <b>Βόλτα</b>
          <span className="small muted">προορισμός, ETA, βάθη · ίχνος κάθε {cruiseSec}″ · μόνο ειδοποιήσεις ασφάλειας</span>
        </span>
      </button>
      {kind === 'training' && r.crewShared && (
        <p className="msg warn">Το κομμάτι της προπόνησης ως τώρα μένει κοινό με το πλήρωμα (σύνοψη και σημειώσεις). Η βόλτα από εδώ και πέρα δεν μοιράζεται.</p>
      )}
      <button type="button" className="btn big-btn wide" onClick={onClose}>
        Άκυρο
      </button>
    </SheetFrame>
  );
}

/** ⚙ inside a session (AC 17): the current kind's alerts, volume, theme and head sail. */
function QuickSettings({ kind, onClose }: { kind: SessionKind; onClose: () => void }) {
  const { settings, updateSettings, activeBoat } = useApp();
  const a = settings.alerts;
  const setA = (p: Partial<typeof a>) => updateSettings({ alerts: { ...a, ...p } });
  const sails = activeBoat ? selectableSails(activeBoat) : [];
  const [sail, setSail] = useState(getLiveSail);
  const vol = a.sound === 'off' ? 'off' : a.volume;
  return (
    <SheetFrame label="Γρήγορες ρυθμίσεις" onClose={onClose}>
      <h3>Γρήγορες ρυθμίσεις</h3>
      <p className="small muted">Μένεις στην έξοδο. Η καταγραφή συνεχίζει.</p>
      <div className="settings-sub">Ειδοποιήσεις · {KIND_INFO[kind].name}</div>
      <KindAlertToggles kind={kind} quick />
      <div className="settings-sub">Ένταση</div>
      <div className="seg" role="group" aria-label="Ένταση">
        {(
          [
            ['off', 'Σίγαση'],
            ['low', 'Χαμηλά'],
            ['high', 'Δυνατά'],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            type="button"
            className={vol === v ? 'on' : ''}
            aria-pressed={vol === v}
            onClick={() =>
              setA(
                v === 'off'
                  ? a.sound === 'off'
                    ? {}
                    : { sound: 'off', soundBeforeMute: a.sound }
                  : { sound: a.sound === 'off' ? (a.soundBeforeMute ?? 'beep') : a.sound, volume: v },
              )
            }
          >
            {l}
          </button>
        ))}
      </div>
      <div className="settings-sub">Θέμα</div>
      <div className="seg" role="group" aria-label="Θέμα">
        {(Object.keys(THEME_INFO) as Theme[]).map((t) => (
          <button key={t} type="button" className={settings.theme === t ? 'on' : ''} aria-pressed={settings.theme === t} onClick={() => updateSettings({ theme: t })}>
            {THEME_INFO[t].label}
          </button>
        ))}
      </div>
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
      <button type="button" className="btn primary big-btn wide" onClick={onClose}>
        Πίσω στην έξοδο
      </button>
    </SheetFrame>
  );
}

/** «Το σκάφος δεν κινείται 2 ώρες» / «… τρέχει N ώρες» (AC 24–27). */
function ForgottenSheet({
  r,
  p,
  now,
  onEnd,
  onKeep,
  onDismiss,
  onPause,
}: {
  r: Race;
  p: ForgottenPrompt;
  now: number;
  onEnd: () => void;
  onKeep: () => void;
  /** Training and cruise: «⏸ Παύση» instead of ending (P-039 AC 17). */
  onPause?: () => void;
  /** Backdrop tap / Esc: just hide it (nothing saved, no snooze). */
  onDismiss: () => void;
}) {
  const info = KIND_INFO[kindOf(r)];
  const at = hhmm(p.lastMove);
  const yesterday = new Date(p.lastMove).toDateString() !== new Date(now).toDateString();
  return (
    <SheetFrame label="Ξεχασμένη έξοδος" onClose={onDismiss}>
      {p.kind === 'idle' ? (
        <>
          <h3>Το σκάφος δεν κινείται 2 ώρες</h3>
          <p className="small">
            Η τελευταία κίνηση ήταν στις {at}. Τελείωσε {info.the}; Η διάρκεια κόβεται στην τελευταία κίνηση.
          </p>
        </>
      ) : (
        <>
          <h3>
            {info.The} τρέχει {p.hours} ώρες
          </h3>
          <p className="small">
            Η τελευταία κίνηση ήταν {yesterday ? `χθες στις ${at}` : `στις ${at}`}. Μάλλον ξέχασες να την κλείσεις. Η διάρκεια κόβεται στην τελευταία
            κίνηση.
          </p>
        </>
      )}
      <button type="button" className="btn primary big-btn wide" onClick={onEnd}>
        Τέλος στην τελευταία κίνηση ({yesterday ? `χθες ${at}` : at})
      </button>
      {p.kind === 'idle' && onPause && (
        <button type="button" className="btn big-btn wide" onClick={onPause}>
          ⏸ Παύση
        </button>
      )}
      <button type="button" className="btn big-btn wide" onClick={onKeep}>
        Όχι, συνεχίζω
      </button>
    </SheetFrame>
  );
}
