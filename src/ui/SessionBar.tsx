import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { SheetFrame } from './Sheet';
import { UPDATE_TEXT } from '../pwa/updateText';
import { useUpdatePhase } from './AppUpdater';
import { useApp } from './AppContext';
import { useRace } from './RaceContext';
import { useInstruments } from './InstrumentsContext';
import { BtnIcon, Icon } from './Icons';
import { THEME_INFO } from './Appearance';
import { getLiveSail, setLiveSail } from './LiveView';
import { selectableSails } from '../performance/sails';
import { KIND_INFO, finishAt, finishCrossAt, finishNow, hasOwnBoat, kindOf, recordFrom, switchKind, trackEveryMs, withEstimates } from '../race/session';
import { finishPending } from '../race/finishLine';
import { EVENT_TEXT as ET, FINISH_TEXT as FT, mmss } from './eventText';
import { useRaceEvent } from './eventHooks';
import { flashSession } from './sessionFlash';
import { forgottenPrompt, keepGoing, type ForgottenPrompt } from '../race/idle';
import type { Race, SessionKind } from '../race/types';
import type { Theme } from './settings';
import { TestBadge } from './TestBadge';
import { KindAlertToggles } from './AlertsCard';
import { SESSION_FLASH } from './sessionFlash';
import { holdShare } from './crewShare';
import { activeMs, goalOf, goalSub, mss } from '../race/training';
import { pausedSince } from '../race/pauses';
import { destName } from '../race/cruise';
import { CRUISE_TEXT } from './sessionText';

/**
 * Inside a session (P-033): the bar on top with kind, running time, ⚙ quick
 * settings and «■ Τέλος», the status strip under it, and the session's sheets.
 */

const END_EVENT = 'session-end';
/** Opens the «■ Τέλος» sheet from anywhere (e.g. the race's «Τερματισμός» button). */
export const requestSessionEnd = () => window.dispatchEvent(new Event(END_EVENT));
const KIND_EVENT = 'session-kind';
/** Opens the kind sheet from the Live («⇄ Άλλαξε σε Αναψυχή / Προπόνηση», P-034). */
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
/** «14:32:07» (P-040: the time of a finish). */
export const hhmmss = (t: number) => new Date(t).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

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
  /** Ended on a crossing of the finish line (P-040 AC 20): its time, approximate or not. */
  line?: { t: number; approx?: boolean };
}

export function SessionBar({ onEnded }: { onEnded: (e: Ended) => void }) {
  const race = useRace();
  const r = race.session;
  const now = useNow();
  const [sheet, setSheet] = useState<Sheet>();
  const [flash, setFlash] = useState<string>();
  const [promptOff, setPromptOff] = useState(false);
  // An unanswered crossing of the finish line outranks every other sheet (P-040 AC 19, Π15).
  const pending = finishPending(r);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => {
    if (pending) setSheet(undefined);
  }, [pending]);
  const { event, n: raceNo } = useRaceEvent(r);

  useEffect(() => {
    const on = () => !pendingRef.current && setSheet('end');
    const onKind = () => !pendingRef.current && setSheet('kind');
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
  const dn = kind === 'cruise' ? destName(r) : undefined;
  const what = kind === 'race' ? (event && raceNo ? ET.running(raceNo, r.name) : r.name || 'Αγώνας') : kind === 'training' ? goalSub(goalOf(r)) : dn ? CRUISE_TEXT.toward(dn) : CRUISE_TEXT.noDestSmall;
  const sub = now < from ? `καταγραφή από ${hhmm(from)}` : `${paused ? 'σε παύση' : 'σε εξέλιξη'} · ${what}`;
  // Training and cruise: the clock leaves the pauses out (P-039 AC 16).
  const time = before ? `−${hms(r.start - now)}` : hms(kind === 'race' ? now - r.start : activeMs(r, now));

  const end = async (o: { at?: number; cross?: number } = {}) => {
    const t = Date.now();
    let out = o.cross !== undefined ? finishCrossAt(r, o.cross, t) : o.at !== undefined ? finishAt(r, o.at, t) : finishNow(r, t);
    // The estimates of the opponents as the Live shows them now (P-040 AC 26).
    out = withEstimates(out, race.rows);
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
    const fc = r.finishCross;
    onEnded({
      id: r.id,
      before: r,
      until: t + ENDED_UNDO_MS,
      atLastMove: o.at !== undefined,
      line: o.cross !== undefined ? { t: out.finish ?? o.cross, approx: fc?.approx } : undefined,
    });
  };

  return (
    <>
      <div className="sbar">
        <TestBadge />
        <button
          type="button"
          className="modeb"
          onClick={() => !pending && setSheet('kind')}
          aria-label={`${info.name} ${sub}, ${time}. ${kind === 'race' ? 'Πληροφορίες τύπου' : 'Πάτα για αλλαγή τύπου'}`}
        >
          <b>
            <span className={`rec ${recording ? '' : 'off'}`} aria-hidden="true" />
            {info.upper}
            {kind !== 'race' && <Icon name="swap" size="1em" stroke={2.4} />}
          </b>
          <span className="t">{time}</span>
          <span className="s">{sub}</span>
        </button>
        <button type="button" className="sb" aria-label="Γρήγορες ρυθμίσεις" aria-disabled={pending || undefined} onClick={() => !pending && setSheet('quick')}>
          <Icon name="gear" />
        </button>
        {!pending && (
          <button type="button" className="sb end" data-testid="session-end" onClick={() => setSheet('end')}>
            <Icon name="stop" size="1em" stroke={2.6} />
            Τέλος
          </button>
        )}
      </div>
      <SessionStrip r={r} now={now} flash={flash} onFlash={setFlash} />
      <UpdateLine />
      {sheet === 'kind' && <KindSheet r={r} onClose={() => setSheet(undefined)} onSwitched={setFlash} />}
      {sheet === 'quick' && <QuickSettings kind={kind} onClose={() => setSheet(undefined)} />}
      {sheet === 'end' && (
        <SheetFrame
          kind="confirm"
          testId="end-sheet"
          title={
            kind === 'race' && before
              ? 'Ακύρωση / αναβολή αγώνα;'
              : kind === 'race'
                ? event && raceNo
                  ? ET.endTitle(raceNo)
                  : 'Τερματισμός αγώνα;'
                : kind === 'training'
                  ? 'Τέλος προπόνησης;'
                  : 'Τέλος αναψυχής;'
          }
          onClose={() => setSheet(undefined)}
        >
          <p className="small">
            {kind === 'race' && before
              ? 'Ο αγώνας δεν έχει ξεκινήσει ακόμα. Η έξοδος κλείνει χωρίς αποτέλεσμα: δεν γράφεται χρόνος ούτε θέση. Θα έχεις 10″ για αναίρεση.'
              : kind === 'race' && event
                ? ET.endText
                : 'Σταματά η καταγραφή και οι ειδοποιήσεις. Η οθόνη μπορεί πια να σβήσει. Θα έχεις 10″ για αναίρεση.'}
          </p>
          <button type="button" className="btn big-btn wide dangerfill" onClick={() => end()}>
            <BtnIcon name="stop" />
            {kind === 'race' ? (before ? 'Ναι, ακύρωση / αναβολή' : 'Ναι, τερματίσαμε') : 'Ναι, τέλος'}
          </button>
          <button type="button" className="btn big-btn wide" onClick={() => setSheet(undefined)}>
            Συνέχεια
          </button>
        </SheetFrame>
      )}
      {pending && r.finishCross && (
        <FinishSheet
          cross={r.finishCross}
          now={now}
          onYes={() => end({ cross: r.finishCross!.t })}
          onNo={() => {
            race.patchRace(r.id, (x) => ({ finishCross: { ...(x.finishCross ?? r.finishCross!), answered: 'no', at: Date.now(), rearmed: false } })).catch(() => undefined);
            flashSession(FT.goingOn);
          }}
        />
      )}
      {!sheet && !pending && prompt && !promptOff && (
        <ForgottenSheet
          r={r}
          p={prompt}
          now={now}
          onLine={r.finishCross?.answered === 'no' ? () => end({ cross: r.finishCross!.t }) : undefined}
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
    <div className="update-line" data-testid="update-line" role="status" title={text}>
      <span className="update-badge" aria-hidden="true">
        <Icon name="rotate" size="1em" stroke={2.6} />
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
        data-testid="session-pause"
        aria-label="Παύση καταγραφής"
        onClick={() => {
          race.pause();
          onFlash('Παύση · δεν καταγράφεται');
        }}
      >
        <BtnIcon name="pause" />
        Παύση
      </button>
    ) : null;
  const since = pausedSince(r);
  if (race.saveError)
    return (
      <div data-testid="session-strip" className="net-strip race-strip bad" role="alert">
        <span className="dot" aria-hidden="true" />
        <span>Η έξοδος δεν αποθηκεύτηκε ακόμα. Η καταγραφή συνεχίζει.</span>
        <button type="button" className="link" onClick={race.retrySave}>
          Ξανά
        </button>
      </div>
    );
  if (flash)
    return (
      <div data-testid="session-strip" className="net-strip ok race-strip" role="status">
        <span className="dot" aria-hidden="true" />
        <span>{flash}</span>
      </div>
    );
  if (since !== undefined)
    return (
      <div data-testid="session-strip" className="net-strip race-strip paused-strip" role="status">
        <span className="dot" aria-hidden="true" />
        <span>
          <b>Σε παύση {mss((now - since) / 1000)}</b> · δεν καταγράφεται, χωρίς ειδοποιήσεις
        </span>
        <button
          type="button"
          className="strip-btn"
          data-testid="session-resume"
          onClick={() => {
            race.resume();
            onFlash('Συνέχεια · η καταγραφή ξανάρχισε');
          }}
        >
          <BtnIcon name="play" />
          Συνέχεια
        </button>
      </div>
    );
  if (race.gap)
    return (
      <div data-testid="session-strip" className="net-strip race-strip" role="alert">
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
      <div data-testid="session-strip" className="net-strip ok race-strip quiet" role="status">
        <span className="dot" aria-hidden="true" />
        <span>Η καταγραφή ξεκινά μόνη της στις {hhmm(recordFrom(r))}, 10′ πριν από την εκκίνηση.</span>
      </div>
    );
  if (race.waitingGps)
    return (
      <div data-testid="session-strip" className="net-strip race-strip bad" role="alert">
        <span className="dot" aria-hidden="true" />
        <span>Η καταγραφή περιμένει θέση GPS (ή όργανα).</span>
        {pauseBtn}
      </div>
    );
  if (race.stalledMin)
    return (
      <div data-testid="session-strip" className="net-strip race-strip bad" role="alert">
        <span className="dot" aria-hidden="true" />
        <span>Η καταγραφή σταμάτησε πριν από {race.stalledMin}′: δεν έρχεται θέση GPS.</span>
        {pauseBtn}
      </div>
    );
  const fromInst = inst.live && inst.values.lat !== undefined;
  return (
    <div data-testid="session-strip" className="net-strip ok race-strip quiet" role="status">
      <span className="dot" aria-hidden="true" />
      <span>
        Καταγραφή κάθε {every}″{race.wakeOn ? ' · η οθόνη μένει ανοιχτή' : ' · κράτα την οθόνη ανοιχτή'}
        {fromInst ? ' · θέση από όργανα' : ''}
      </span>
      {pauseBtn}
    </div>
  );
}

/** The shared sheet now lives in `Sheet.tsx` (P-049); re-exported so the old imports keep working. */
export { SheetFrame };

function KindSheet({ r, onClose, onSwitched }: { r: Race; onClose: () => void; onSwitched: (msg: string) => void }) {
  const race = useRace();
  const { settings } = useApp();
  const kind = kindOf(r);
  if (kind === 'race')
    return (
      <SheetFrame label="Τύπος εξόδου" title="Ο αγώνας μένει αγώνας" onClose={onClose}>
        <p className="small">Για προπόνηση ή αναψυχή, τελείωσε τον αγώνα και ξεκίνα νέα έξοδο. Έτσι δεν χαλάνε οι χρόνοι και η κατάταξη.</p>
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
      onSwitched(to === 'cruise' ? `Τώρα: Αναψυχή · ίχνος κάθε ${cruiseSec}″ · μόνο ειδοποιήσεις ασφάλειας` : 'Τώρα: Προπόνηση · ίχνος κάθε 15″ · στόχοι polar');
    }
    onClose();
  };
  return (
    <SheetFrame title="Αλλαγή τύπου εξόδου" onClose={onClose}>
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
            {noBoat && kind !== 'training' ? 'Θέλει σκάφος: αυτή η έξοδος αναψυχής ξεκίνησε χωρίς σκάφος.' : 'στόχοι polar, γύροι · ίχνος κάθε 15″'}
          </span>
        </span>
      </button>
      <button type="button" className={`opt ${kind === 'cruise' ? 'on' : ''}`} aria-pressed={kind === 'cruise'} onClick={() => pick('cruise')}>
        <span>
          <b>Αναψυχή</b>
          <span className="small muted">προορισμός, ETA, βάθη · ίχνος κάθε {cruiseSec}″ · μόνο ειδοποιήσεις ασφάλειας</span>
        </span>
      </button>
      {kind === 'training' && r.crewShared && (
        <p className="msg warn">Το κομμάτι της προπόνησης ως τώρα μένει κοινό με το πλήρωμα (σύνοψη και σημειώσεις). Η αναψυχή από εδώ και πέρα δεν μοιράζεται.</p>
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
    <SheetFrame title="Γρήγορες ρυθμίσεις" onClose={onClose}>
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
  onLine,
}: {
  r: Race;
  p: ForgottenPrompt;
  now: number;
  onEnd: () => void;
  /** P-040 AC 24: a crossing of the line answered «Όχι» comes first. */
  onLine?: () => void;
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
    <SheetFrame
      kind="confirm"
      testId="forgotten-sheet"
      title={p.kind === 'idle' ? 'Το σκάφος δεν κινείται 2 ώρες' : `${info.The} τρέχει ${p.hours} ώρες`}
      onClose={onDismiss}
    >
      {p.kind === 'idle' ? (
        <p className="small">
          Η τελευταία κίνηση ήταν στις {at}. Τελείωσε {info.the}; Η διάρκεια κόβεται στην τελευταία κίνηση.
        </p>
      ) : (
        <p className="small">
          Η τελευταία κίνηση ήταν {yesterday ? `χθες στις ${at}` : `στις ${at}`}. Μάλλον ξέχασες να πατήσεις «Τέλος». Η διάρκεια κόβεται στην τελευταία
          κίνηση.
        </p>
      )}
      {onLine && r.finishCross && (
        <button type="button" className="btn primary big-btn wide" data-testid="forgotten-line" onClick={onLine}>
          {FT.forgotten(hhmmss(r.finishCross.t))}
        </button>
      )}
      <button type="button" className={`btn ${onLine ? '' : 'primary '}big-btn wide`} onClick={onEnd}>
        Τέλος στην τελευταία κίνηση ({yesterday ? `χθες ${at}` : at})
      </button>
      {p.kind === 'idle' && onPause && (
        <button type="button" className="btn big-btn wide" onClick={onPause}>
          <BtnIcon name="pause" />
          Παύση
        </button>
      )}
      <button type="button" className="btn big-btn wide" onClick={onKeep}>
        Όχι, συνεχίζω
      </button>
    </SheetFrame>
  );
}

/**
 * «Τερματίσατε στις …;» (P-040 AC 18, 23): an alert dialog over everything, closed only by its two
 * answers (no ✕, no tap outside, no Escape). «πριν από m:ss» counts live.
 */
function FinishSheet({ cross, now, onYes, onNo }: { cross: NonNullable<Race['finishCross']>; now: number; onYes: () => void; onNo: () => void }) {
  const titleId = useId();
  const yesRef = useRef<HTMLButtonElement>(null);
  const approx = !!cross.approx;
  return (
    <SheetFrame
      kind="confirm"
      dismissable={false}
      labelledBy={titleId}
      testId="finish-sheet"
      className="finish-sheet"
      backdropClassName="finish-backdrop"
      initialFocus={yesRef}
      onClose={() => undefined}
    >
      <p className="finish-tones" aria-hidden="true">
        {FT.tones}
      </p>
      <h3 id={titleId}>{approx ? FT.approxTitle(hhmm(cross.t)) : FT.title(hhmmss(cross.t))}</h3>
      <p className="small">{approx ? FT.approxBody(Math.max(1, Math.round((cross.gapSec ?? 60) / 60))) : FT.body(mmss((now - cross.t) / 1000))}</p>
      <button ref={yesRef} type="button" className="btn primary big-btn wide" data-testid="finish-yes" onClick={onYes}>
        {FT.yes}
      </button>
      <button type="button" className="btn big-btn wide" data-testid="finish-no" onClick={onNo}>
        {FT.no}
      </button>
    </SheetFrame>
  );
}
