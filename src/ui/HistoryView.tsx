import { useEffect, useMemo, useState } from 'react';
import { useHoldUpdate } from './useHoldUpdate';
import { useRace } from './RaceContext';
import { BtnIcon, Icon } from './Icons';
import { RaceAnalysisView } from './RaceAnalysisView';
import { ScoringView } from './ScoringView';
import { SharedRaces } from './CrewViews';
import { dayStr, hhmm, type Ended } from './SessionBar';
import { holdShare, releaseShare } from './crewShare';
import { analyseRace, toGpx } from '../race/analysis';
import { estimateRace } from '../race/estimate';
import { KIND_INFO, isCancelled, kindOf, reopen, sessionStats } from '../race/session';
import { formatDuration } from '../scoring/corrected';
import type { Race, SessionKind } from '../race/types';
import { TrainingSummaryView } from './TrainingSummary';
import { TRAINING_TEXT as TT } from './sessionText';
import { kindSpans, mss, trainingSummary } from '../race/training';
import { arrivalTime, maxSog30, sessionTitle, trackIntervalSec } from '../race/cruise';
import { useApp } from './AppContext';
import { CRUISE_TEXT as CT } from './sessionText';
import { EVENT_TEXT as ET, FINISH_TEXT as FT } from './eventText';
import { EventAfterCard, EventHistoryCard, EventScreen, ResultsEditor } from './EventView';
import { useRaceEvent } from './eventHooks';
import { classN, eventBoats, placeText, raceResult } from '../race/event';
import { hhmmss } from './SessionBar';
import type { RaceEvent } from '../race/types';

/** A shared training, or a cruise whose training part is shared (P-035 AC 27, 29). */
const sharedTraining = (r: Race) => !!r.crewShared && (kindOf(r) === 'training' || (!!r.finish && kindSpans(r, r.finish).some((k) => k.kind === 'training')));

const n1 = (x: number) => x.toFixed(1).replace('.', ',');
const durTxt = (sec: number) => {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} ώ ${String(m % 60).padStart(2, '0')}′` : `${m}′`;
};

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const gpxName = (r: Race) => `${(sessionTitle(r) || KIND_INFO[kindOf(r)].name).replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'session'}_${new Date(r.start).toISOString().slice(0, 10)}.gpx`;
export const exportGpx = (r: Race) => download(gpxName(r), toGpx(r, sessionTitle(r) || r.name), 'application/gpx+xml');

/** One line per finished session: kind · day · duration · nm, then the kind's own number (AC 28). */
export function SessionCard({ r, fresh, onOpen }: { r: Race; fresh?: boolean; onOpen: () => void }) {
  const kind = kindOf(r);
  const line2 = useMemo(() => {
    if (isCancelled(r)) return { dist: sessionStats(r).distanceNm, dur: undefined, m: 'Ακύρωση / αναβολή · χωρίς αποτέλεσμα' };
    if (kind === 'race') {
      const a = analyseRace(r);
      return { dist: a.sailedNm, dur: a.durationSec, m: [a.rank ? `${a.rank}ος σε διορθωμένο` : undefined, `${a.tacks} αναστροφές`].filter(Boolean).join(' · ') };
    }
    const s = sessionStats(r);
    if (kind === 'training') {
      const t = trainingSummary(r);
      return { dist: s.distanceNm, dur: s.durationSec, m: t.avgPct !== null ? `${t.avgPct}% του στόχου` : 'χωρίς στόχους' };
    }
    return { dist: s.distanceNm, dur: s.durationSec, m: s.avgKt !== undefined ? `μέση ${n1(s.avgKt)} kt` : 'χωρίς ίχνος' };
  }, [r, kind]);
  return (
    <button type="button" data-testid="history-item" className={`hist-card ${fresh ? 'fresh' : ''}`} onClick={onOpen}>
      <span className="ic">
        <Icon name={kind} />
      </span>
      <span className="body">
        <b>
          {sessionTitle(r) || KIND_INFO[kind].name}
          {fresh && <span className="pill-new">νέα</span>}
        </b>
        <span className="s">
          {KIND_INFO[kind].name} · {dayStr(r.start)}
          {line2.dur !== undefined ? ` · ${durTxt(line2.dur)}` : ''} · {n1(line2.dist)} NM
          {sharedTraining(r) ? TT.sharedTag : ''}
        </span>
        <span className="m">{line2.m}</span>
      </span>
    </button>
  );
}

type Filter = 'all' | SessionKind;
type Sub =
  | { s: 'list' }
  | { s: 'open'; id: string; back?: Sub }
  | { s: 'calc' }
  /** P-040: the event screen, and the results editor of one of its races. */
  | { s: 'event'; id: string }
  | { s: 'results'; id: string; back: Sub };

/** `openId`: a session id, or «event:<id>» / «results:<raceId>» (P-040). */
function subOf(openId: string | undefined, races: Race[]): Sub {
  if (!openId) return { s: 'list' };
  if (openId.startsWith('event:')) return { s: 'event', id: openId.slice(6) };
  if (openId.startsWith('results:')) {
    const id = openId.slice(8);
    const ev = races.find((r) => r.id === id)?.eventId;
    return { s: 'results', id, back: ev ? { s: 'event', id: ev } : { s: 'list' } };
  }
  return { s: 'open', id: openId };
}

type Item = { t: 'race'; r: Race; at: number } | { t: 'event'; e: RaceEvent; at: number; fresh: boolean };

/** «Οι έξοδοί μου» (AC 28–30). */
export function HistoryView({
  onHome,
  openId,
  onSetup,
}: {
  onHome: () => void;
  openId?: string;
  onSetup?: (kind: SessionKind, raceId?: string, eventId?: string) => void;
}) {
  const race = useRace();
  const [filter, setFilter] = useState<Filter>('all');
  const [sub, setSub] = useState<Sub>(() => subOf(openId, race.races));
  useEffect(() => setSub(subOf(openId, race.races)), [openId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [sub]);
  const done = useMemo(
    () => race.races.filter((r) => r.status === 'finished').sort((a, b) => (b.finish ?? b.start) - (a.finish ?? a.start)),
    [race.races],
  );
  // P-040 AC 35: an event is one card, at the time of its latest race; its races are not listed apart.
  const items = useMemo(() => {
    const out: Item[] = [];
    const seen = new Map<string, Item & { t: 'event' }>();
    for (const r of done) {
      const e = r.eventId ? race.events.find((x) => x.id === r.eventId) : undefined;
      const at = r.finish ?? r.start;
      if (!e) {
        out.push({ t: 'race', r, at });
        continue;
      }
      const have = seen.get(e.id);
      if (have) have.fresh ||= r.id === race.freshId;
      else {
        const it = { t: 'event' as const, e, at, fresh: r.id === race.freshId };
        seen.set(e.id, it);
        out.push(it);
      }
    }
    return out;
  }, [done, race.events, race.freshId]);
  const back = () => setSub({ s: 'list' });

  if (sub.s === 'event')
    return (
      <EventScreen
        eventId={sub.id}
        onBack={back}
        onSetup={(k, id, ev) => onSetup?.(k, id, ev)}
        onAnalysis={(id) => setSub({ s: 'open', id, back: sub })}
        onResults={(id) => setSub({ s: 'results', id, back: sub })}
      />
    );
  if (sub.s === 'results')
    return (
      <>
        <button type="button" className="btn back-btn" onClick={() => setSub(sub.back)}>
          <BtnIcon name="back" />
          {sub.back.s === 'event' ? ET.backEvent : ET.back}
        </button>
        <ResultsEditor raceId={sub.id} onBack={() => setSub(sub.back)} />
      </>
    );

  if (sub.s === 'calc')
    return (
      <>
        <button type="button" className="btn back-btn" onClick={back}>
          <BtnIcon name="back" />
          Οι έξοδοί μου
        </button>
        <ScoringView />
      </>
    );
  if (sub.s === 'open') {
    const r = race.races.find((x) => x.id === sub.id);
    const toEvent = sub.back?.s === 'event' ? sub.back : r?.eventId && race.events.some((e) => e.id === r.eventId) ? ({ s: 'event', id: r.eventId } as const) : undefined;
    if (r && kindOf(r) === 'race' && !isCancelled(r))
      return <RaceAnalysisView id={r.id} onBack={() => setSub(toEvent ?? { s: 'list' })} backLabel={toEvent ? ET.backEvent : ET.back} />;
    return (
      <>
        <button type="button" className="btn back-btn" onClick={back}>
          <BtnIcon name="back" />
          Οι έξοδοί μου
        </button>
        {r ? <SessionSummary r={r} /> : <p className="muted">Η έξοδος δεν βρέθηκε.</p>}
      </>
    );
  }

  const list = items.filter((x) => filter === 'all' || (x.t === 'event' ? filter === 'race' : kindOf(x.r) === filter));
  return (
    <div className="history">
      {done.length === 0 ? (
        <section className="card empty">
          <Icon name="history" size={64} />
          <p>
            <b>Δεν έχεις εξόδους ακόμα</b>
          </p>
          <p className="small muted">Κάθε αγώνας, προπόνηση ή έξοδος αναψυχής που τελειώνεις μπαίνει εδώ, με ίχνος και σύνοψη.</p>
          <button type="button" className="btn primary big-btn wide" onClick={onHome}>
            Νέα έξοδος
          </button>
        </section>
      ) : (
        <>
          <div className="seg filters" role="group" aria-label="Φίλτρο">
            {(
              [
                ['all', 'Όλες'],
                ['race', 'Αγώνες'],
                ['training', 'Προπονήσεις'],
                ['cruise', 'Αναψυχή'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" className={filter === v ? 'on' : ''} aria-pressed={filter === v} onClick={() => setFilter(v)}>
                {l}
              </button>
            ))}
          </div>
          {list.length ? (
            list.map((x) =>
              x.t === 'event' ? (
                <EventHistoryCard key={x.e.id} event={x.e} fresh={x.fresh} onOpen={() => setSub({ s: 'event', id: x.e.id })} />
              ) : (
                <SessionCard key={x.r.id} r={x.r} fresh={x.r.id === race.freshId} onOpen={() => setSub({ s: 'open', id: x.r.id })} />
              ),
            )
          ) : (
            <section className="card">Καμία έξοδος αυτού του τύπου ακόμα.</section>
          )}
          <p className="small muted">Οι έξοδοι μένουν σε αυτό το κινητό.</p>
        </>
      )}
      <SharedRaces />
      <button type="button" className="btn wide" onClick={() => setSub({ s: 'calc' })}>
        Υπολογιστής χρόνων
      </button>
    </div>
  );
}

/** Summary of a finished session (AC 23). */
export function SessionSummary({ r, onAnalysis }: { r: Race; onAnalysis?: () => void }) {
  if (kindOf(r) === 'training') return <TrainingSummaryView r={r} />;
  return <OtherSummary r={r} onAnalysis={onAnalysis} />;
}

function OtherSummary({ r, onAnalysis }: { r: Race; onAnalysis?: () => void }) {
  const { settings } = useApp();
  const { event, races: evRaces } = useRaceEvent(r);
  const kind = kindOf(r);
  const cancelled = isCancelled(r);
  const stats = useMemo(() => {
    const s = sessionStats(r);
    // Cancelled / postponed race: no time, corrected time or position.
    if (cancelled) return [[`${n1(s.distanceNm)} NM`, 'απόσταση']];
    if (kind !== 'race') {
      // Cruise (P-036 AC 9–10): top speed is the best 30″ mean; arrival within 0,1 nm.
      const max = maxSog30(r.track);
      const arr = r.arrivedAt ?? arrivalTime(r.track, r.marks);
      return [
        [formatDuration(s.durationSec), CT.duration],
        [`${n1(s.distanceNm)} NM`, CT.distance],
        [s.avgKt !== undefined ? `${n1(s.avgKt)} kt` : '—', CT.avg],
        [max !== undefined ? `${n1(max)} kt` : '—', CT.max],
        [arr !== undefined ? hhmm(arr) : '—', CT.arrival],
        [`κάθε ${trackIntervalSec(r.track, settings.cruiseTrackSec)}″`, CT.track],
      ];
    }
    const a = analyseRace(r);
    const own = estimateRace(r, undefined, r.finish ?? Date.now()).find((x) => x.own);
    // «θέση» once every boat has a time or a code, else «εκτίμηση θέσης» (P-040 AC 30).
    let place = a.rank ? `${a.rank}ος` : '—';
    let official = r.entries.every((e) => r.results?.[e.id] !== undefined || !!r.resultCodes?.[e.id]);
    if (event) {
      const boats = eventBoats(evRaces);
      const res = raceResult(r, boats, classN(event, boats));
      const mine = Object.values(res.byKey).find((x) => boats.find((b) => b.key === x.key)?.own);
      place = mine?.place !== undefined ? `${placeText(mine.place, mine.tied)}ος` : (mine?.code ?? '—');
      official = res.official;
    }
    return [
      [formatDuration(a.durationSec), 'χρόνος'],
      [own?.corrected !== undefined ? formatDuration(own.corrected) : '—', 'διορθωμένος'],
      [place, official ? ET.place : ET.estPlace],
      [`${n1(a.sailedNm)} NM`, 'απόσταση'],
      [a.avgPct !== undefined ? `${Math.round(a.avgPct * 100)}%` : '—', 'μέσος % του στόχου'],
      [String(a.tacks), 'αναστροφές'],
    ];
  }, [r, kind, cancelled, settings.cruiseTrackSec, event, evRaces]);
  const own = r.entries.find((e) => e.own);
  return (
    <section className="card session-summary">
      <div className="row">
        <span className="hist-ic">
          <Icon name={kind} />
        </span>
        <span>
          <b>{sessionTitle(r) || KIND_INFO[kind].name}</b>
          <br />
          <span className="small muted">
            {KIND_INFO[kind].name} · {dayStr(r.start)} · {hhmm(r.start)}
            {r.finish && !cancelled ? `–${hhmm(r.finish)}` : ''}
          </span>
        </span>
      </div>
      <div className="stats" data-testid="summary-stats">
        {stats.map(([v, l]) => (
          <div key={l}>
            <b>{v}</b>
            <span className="small muted">{l}</span>
          </div>
        ))}
      </div>
      {cancelled && <p className="small">Ακύρωση / αναβολή: ο αγώνας έκλεισε πριν από την εκκίνηση, χωρίς αποτέλεσμα.</p>}
      {kind !== 'race' && sessionStats(r).pausedSec > 0 && (
        <p className="small muted">{(kind === 'cruise' ? CT.noPauses : TT.noPauses)(mss(sessionStats(r).pausedSec))}</p>
      )}
      {kind === 'cruise' && sharedTraining(r) && (
        <p className="small muted">{TT.sharedPart(hhmm(trainingSummary(r, { kindOnly: 'training' }).trainingUntil ?? r.finish ?? r.start))}</p>
      )}
      {kind === 'race' && !cancelled && own && r.results?.[own.id] === undefined && (
        <p className="small warn-text">Ο χρόνος του σκάφους δεν γράφτηκε: βάλ' τον από τα αποτελέσματα.</p>
      )}
      {kind === 'race' ? (
        onAnalysis &&
        !cancelled && (
          <button type="button" className="btn big-btn wide" onClick={onAnalysis}>
            Ανάλυση και μαθήματα
          </button>
        )
      ) : (
        <>
          {!sharedTraining(r) && <p className="small muted">{CT.private}</p>}
          <button type="button" className="btn big-btn wide" data-testid="export-gpx" disabled={!r.track.length} onClick={() => exportGpx(r)}>
            {CT.gpx}
          </button>
          <p className="small muted">Το GPX βγαίνει μόνο όταν το πατήσεις.</p>
        </>
      )}
    </section>
  );
}

/** «Η έξοδος τελείωσε» right after «■ Τέλος», with a 10″ undo (AC 22). */
export function EndedScreen({ ended, onUndone, onHistory }: { ended: Ended; onUndone: () => void; onHistory: (id?: string) => void }) {
  const race = useRace();
  const [now, setNow] = useState(Date.now());
  const left = Math.max(0, Math.ceil((ended.until - now) / 1000));
  useEffect(() => {
    if (!left) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [left]);
  // A waiting app update (P-043) is applied only after the 10″ undo.
  useHoldUpdate(left > 0, 'undo');
  const r = race.races.find((x) => x.id === ended.id);
  const undo = async () => {
    // The crew share waits for the undo (SessionBar): keep it held while the session reopens.
    holdShare(ended.id, Infinity);
    race.setActiveId(ended.id);
    race.setFreshId(undefined);
    try {
      await race.save(reopen(ended.before, Date.now()));
    } catch {
      /* the session strip offers «Ξανά» */
    }
    releaseShare(ended.id);
    onUndone();
  };
  return (
    <div className="ended">
      {left > 0 && (
        <div className="msg undo-row" role="status">
          <span>Η έξοδος έκλεισε.</span>
          <button type="button" className="btn" data-testid="ended-undo" onClick={undo}>
            <BtnIcon name="undo" />
            Αναίρεση ({left}″)
          </button>
        </div>
      )}
      {ended.line && (
        <p className="msg small" data-testid="ended-line">
          {FT.ended(ended.line.approx ? hhmm(ended.line.t) : hhmmss(ended.line.t), ended.line.approx)}
        </p>
      )}
      {r && <SessionSummary r={r} onAnalysis={() => onHistory(r.id)} />}
      {r?.eventId && <EventAfterCard r={r} onEvent={() => onHistory(`event:${r.eventId}`)} onResults={() => onHistory(`results:${r.id}`)} />}
      <div className="btn-row sticky-actions">
        <button type="button" className="btn primary big-btn wide" onClick={() => onHistory()}>
          Στο Ιστορικό
        </button>
      </div>
    </div>
  );
}
