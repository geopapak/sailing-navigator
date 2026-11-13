import { useEffect, useMemo, useState } from 'react';
import { useHoldUpdate } from './useHoldUpdate';
import { useRace } from './RaceContext';
import { Icon } from './Icons';
import { RaceAnalysisView } from './RaceAnalysisView';
import { ScoringView } from './ScoringView';
import { SharedRaces } from './CrewViews';
import { dayStr, hhmm, type Ended } from './SessionBar';
import { analyseRace, toGpx } from '../race/analysis';
import { estimateRace } from '../race/estimate';
import { KIND_INFO, isCancelled, kindOf, reopen, sessionStats } from '../race/session';
import { formatDuration } from '../scoring/corrected';
import type { Race, SessionKind } from '../race/types';
import { TrainingSummaryView } from './TrainingSummary';
import { TRAINING_TEXT as TT } from './sessionText';
import { kindSpans, mss, trainingSummary } from '../race/training';

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
const gpxName = (r: Race) => `${(r.name || KIND_INFO[kindOf(r)].name).replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'session'}_${new Date(r.start).toISOString().slice(0, 10)}.gpx`;
export const exportGpx = (r: Race) => download(gpxName(r), toGpx(r), 'application/gpx+xml');

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
    return { dist: s.distanceNm, dur: s.durationSec, m: s.avgKt !== undefined ? `μέση ${n1(s.avgKt)} κν` : 'χωρίς ίχνος' };
  }, [r, kind]);
  return (
    <button type="button" className={`hist-card ${fresh ? 'fresh' : ''}`} onClick={onOpen}>
      <span className="ic">
        <Icon name={kind} />
      </span>
      <span className="body">
        <b>
          {r.name || KIND_INFO[kind].name}
          {fresh && <span className="pill-new">νέα</span>}
        </b>
        <span className="s">
          {KIND_INFO[kind].name} · {dayStr(r.start)}
          {line2.dur !== undefined ? ` · ${durTxt(line2.dur)}` : ''} · {n1(line2.dist)} νμ
          {sharedTraining(r) ? TT.sharedTag : ''}
        </span>
        <span className="m">{line2.m}</span>
      </span>
    </button>
  );
}

type Filter = 'all' | SessionKind;
type Sub = { s: 'list' } | { s: 'open'; id: string } | { s: 'calc' };

/** «Οι έξοδοί μου» (AC 28–30). */
export function HistoryView({ onHome, openId }: { onHome: () => void; openId?: string }) {
  const race = useRace();
  const [filter, setFilter] = useState<Filter>('all');
  const [sub, setSub] = useState<Sub>(openId ? { s: 'open', id: openId } : { s: 'list' });
  useEffect(() => setSub(openId ? { s: 'open', id: openId } : { s: 'list' }), [openId]);
  const done = useMemo(
    () => race.races.filter((r) => r.status === 'finished').sort((a, b) => (b.finish ?? b.start) - (a.finish ?? a.start)),
    [race.races],
  );
  const back = () => setSub({ s: 'list' });

  if (sub.s === 'calc')
    return (
      <>
        <button type="button" className="btn back-btn" onClick={back}>
          ← Οι έξοδοί μου
        </button>
        <ScoringView />
      </>
    );
  if (sub.s === 'open') {
    const r = race.races.find((x) => x.id === sub.id);
    if (r && kindOf(r) === 'race' && !isCancelled(r)) return <RaceAnalysisView id={r.id} onBack={back} backLabel="← Οι έξοδοί μου" />;
    return (
      <>
        <button type="button" className="btn back-btn" onClick={back}>
          ← Οι έξοδοί μου
        </button>
        {r ? <SessionSummary r={r} /> : <p className="muted">Η έξοδος δεν βρέθηκε.</p>}
      </>
    );
  }

  const list = done.filter((r) => filter === 'all' || kindOf(r) === filter);
  return (
    <div className="history">
      {done.length === 0 ? (
        <section className="card empty">
          <Icon name="history" size={64} />
          <p>
            <b>Δεν έχεις εξόδους ακόμα</b>
          </p>
          <p className="small muted">Κάθε αγώνας, προπόνηση ή βόλτα που τελειώνεις μπαίνει εδώ, με ίχνος και σύνοψη.</p>
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
                ['cruise', 'Βόλτες'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" className={filter === v ? 'on' : ''} aria-pressed={filter === v} onClick={() => setFilter(v)}>
                {l}
              </button>
            ))}
          </div>
          {list.length ? (
            list.map((r) => <SessionCard key={r.id} r={r} fresh={r.id === race.freshId} onOpen={() => setSub({ s: 'open', id: r.id })} />)
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
  const kind = kindOf(r);
  const cancelled = isCancelled(r);
  const stats = useMemo(() => {
    const s = sessionStats(r);
    // Cancelled / postponed race: no time, corrected time or position.
    if (cancelled) return [[`${n1(s.distanceNm)} νμ`, 'απόσταση']];
    if (kind !== 'race') {
      return [
        [formatDuration(s.durationSec), 'διάρκεια'],
        [`${n1(s.distanceNm)} νμ`, 'απόσταση'],
        [s.avgKt !== undefined ? `${n1(s.avgKt)} κν` : '—', 'μέση ταχύτητα'],
      ];
    }
    const a = analyseRace(r);
    const own = estimateRace(r, undefined, r.finish ?? Date.now()).find((x) => x.own);
    return [
      [formatDuration(a.durationSec), 'χρόνος'],
      [own?.corrected !== undefined ? formatDuration(own.corrected) : '—', 'διορθωμένος'],
      [a.rank ? `${a.rank}ος` : '—', 'εκτίμηση θέσης'],
      [`${n1(a.sailedNm)} νμ`, 'απόσταση'],
      [a.avgPct !== undefined ? `${Math.round(a.avgPct * 100)}%` : '—', 'μέσος όρος στόχου'],
      [String(a.tacks), 'αναστροφές'],
    ];
  }, [r, kind, cancelled]);
  const own = r.entries.find((e) => e.own);
  return (
    <section className="card session-summary">
      <div className="row">
        <span className="hist-ic">
          <Icon name={kind} />
        </span>
        <span>
          <b>{r.name || KIND_INFO[kind].name}</b>
          <br />
          <span className="small muted">
            {KIND_INFO[kind].name} · {dayStr(r.start)} · {hhmm(r.start)}
            {r.finish && !cancelled ? `–${hhmm(r.finish)}` : ''}
          </span>
        </span>
      </div>
      <div className="stats">
        {stats.map(([v, l]) => (
          <div key={l}>
            <b>{v}</b>
            <span className="small muted">{l}</span>
          </div>
        ))}
      </div>
      {cancelled && <p className="small">Ακύρωση / αναβολή: ο αγώνας έκλεισε πριν την εκκίνηση, χωρίς αποτέλεσμα.</p>}
      {kind !== 'race' && sessionStats(r).pausedSec > 0 && <p className="small muted">{TT.noPauses(mss(sessionStats(r).pausedSec))}</p>}
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
          <button type="button" className="btn big-btn wide" disabled={!r.track.length} onClick={() => exportGpx(r)}>
            Εξαγωγή GPX
          </button>
          <p className="small muted">Το ίχνος μένει μόνο σε αυτό το κινητό. Το GPX βγαίνει μόνο όταν το πατήσεις.</p>
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
    race.setActiveId(ended.id);
    race.setFreshId(undefined);
    try {
      await race.save(reopen(ended.before, Date.now()));
    } catch {
      /* the session strip offers «Ξανά» */
    }
    onUndone();
  };
  return (
    <div className="ended">
      {left > 0 && (
        <div className="msg undo-row" role="status">
          <span>Η έξοδος έκλεισε.</span>
          <button type="button" className="btn" onClick={undo}>
            ↶ Αναίρεση ({left}″)
          </button>
        </div>
      )}
      {r && <SessionSummary r={r} onAnalysis={() => onHistory(r.id)} />}
      <div className="btn-row sticky-actions">
        <button type="button" className="btn primary big-btn wide" onClick={() => onHistory()}>
          Στο Ιστορικό
        </button>
      </div>
    </div>
  );
}
