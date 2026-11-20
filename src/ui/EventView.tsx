/**
 * Multi-race event («Διοργάνωση», P-040): the setup fields, the standing table, the results
 * editor, the event screen and its cards (home, History, end of a race). Approved prototypes:
 * `design/session-home-2026-11/` and `design/events-2026-11/`.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRace } from './RaceContext';
import { askConfirm, offerUndo, showNote } from './Dialogs';
import { SheetFrame, dayStr, hhmm, hhmmss } from './SessionBar';
import { useSheetMode } from './hooks';
import { CODE_HINT, EVENT_TEXT as ET, dec } from './eventText';
import { useRaceEvent } from './eventHooks';
import {
  RESULT_CODES,
  classN,
  entryOf,
  eventBoats,
  eventRaces,
  isCompleted,
  placeText,
  raceNumbers,
  raceResult,
  resultSource,
  standing,
  type BoatResult,
  type EventBoat,
  type Standing,
  type StandingCell,
} from '../race/event';
import { isCancelled } from '../race/session';
import { bufOf, bufText, checkEntry, pressKey, type EntryMode } from '../race/resultEntry';
import { formatDuration } from '../scoring/corrected';
import type { Race, RaceEvent, ResultCode, SessionKind } from '../race/types';
import { BtnIcon } from './Icons';

// ---- Settings of an event (AC 2, 36) ------------------------------------------------------

export interface EventDraft {
  name: string;
  scoring: RaceEvent['scoring'];
  discards: RaceEvent['discards'];
  discardFrom: number;
  classSize?: number;
}

export const newEventDraft = (): EventDraft => ({
  name: '',
  scoring: 'points',
  discards: 0,
  discardFrom: 4,
});
export const draftOf = (e: RaceEvent): EventDraft => ({
  name: e.name,
  scoring: e.scoring,
  discards: e.discards,
  discardFrom: e.discardFrom,
  classSize: e.classSize,
});
const K_CHOICES = [2, 3, 4, 5, 6, 7, 8, 9, 10];

/** «Όνομα διοργάνωσης», «Βαθμολογία», «Απορρίψεις … από K», «Σκάφη στην κλάση». */
export function EventFields({
  value,
  onChange,
  boats,
  nameError,
}: {
  value: EventDraft;
  onChange: (v: EventDraft) => void;
  boats: number;
  nameError?: boolean;
}) {
  const set = (p: Partial<EventDraft>) => {
    const v = { ...value, ...p };
    // K is always more than D (AC 2: D = 2 with K = 2 makes K = 3).
    if (v.discardFrom <= v.discards) v.discardFrom = v.discards + 1;
    onChange(v);
  };
  return (
    <div className="event-fields full" data-testid="event-fields">
      <label>
        {ET.eventName}
        <input
          value={value.name}
          maxLength={50}
          placeholder={ET.eventNamePh}
          aria-invalid={nameError || undefined}
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>
      {nameError && <p className="small warn-text">{ET.noEventName}</p>}
      <div className="field-group">
        <span className="field-label">{ET.scoring}</span>
        <div className="seg wrap" role="group" aria-label={`${ET.scoring} διοργάνωσης`}>
          {(['points', 'time'] as const).map((k) => (
            <button key={k} type="button" className={value.scoring === k ? 'on' : ''} aria-pressed={value.scoring === k} onClick={() => set({ scoring: k })}>
              {k === 'points' ? ET.points : ET.time}
            </button>
          ))}
        </div>
        <p className="small muted">{ET.scoringHelp}</p>
      </div>
      {value.scoring === 'points' && (
        <>
          <div className="field-group">
            <span className="field-label">{ET.discards}</span>
            <div className="seg" role="group" aria-label={ET.discards}>
              {([0, 1, 2] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={value.discards === d ? 'on' : ''}
                  aria-pressed={value.discards === d}
                  onClick={() => set({ discards: d })}
                >
                  {d}
                </button>
              ))}
            </div>
            {value.discards > 0 && (
              <label className="inline k-pick">
                {ET.discardFrom}
                <select
                  aria-label={`${ET.discards} ${ET.discardFrom}`}
                  value={value.discardFrom}
                  onChange={(e) => set({ discardFrom: Number(e.target.value) })}
                >
                  {K_CHOICES.filter((k) => k > value.discards).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                {ET.completedRaces}
              </label>
            )}
          </div>
          <label>
            {ET.classSize}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={200}
              placeholder={String(boats)}
              value={value.classSize ?? ''}
              onChange={(e) => {
                const n = Math.round(Number(e.target.value));
                set({
                  classSize: e.target.value === '' || !Number.isFinite(n) ? undefined : Math.max(1, Math.min(200, n)),
                });
              }}
            />
            <span className="small muted">{ET.classHelp}</span>
          </label>
        </>
      )}
    </div>
  );
}

// ---- Standing table (AC 34) ---------------------------------------------------------------

/** One cell: «3», «2,5=», «3 (εκτ.)», «DNF 8», «(4)», «(DNF 8)»; times «2:41:10». */
export function cellText(c: StandingCell, scoring: RaceEvent['scoring']): string {
  const r = c.r;
  const est = r.est ? ` ${ET.est}` : '';
  let t: string;
  if (scoring === 'time') t = r.code ?? (r.corrected !== undefined ? `${formatDuration(r.corrected)}${est}` : '—');
  else if (r.code) t = `${r.code} ${dec(r.points)}`;
  else if (r.missing) t = `— ${dec(r.points)}`;
  else t = `${dec(r.points)}${r.tied ? '=' : ''}${est}`;
  return c.discarded ? `(${t})` : t;
}

/** «12», «7:21:40», «1/2 · 2:41:10»; a boat with no time in any completed race: «—». */
export const totalText = (row: Standing['rows'][number], scoring: RaceEvent['scoring'], m: number) =>
  scoring === 'points' ? dec(row.total) : row.group === 1 ? formatDuration(row.total) : row.done ? `${row.done}/${m} · ${formatDuration(row.total)}` : '—';

const cellLabel = (c: StandingCell, n: number, scoring: RaceEvent['scoring']) => `${n}η: ${cellText(c, scoring)}${c.discarded ? ', απορρίπτεται' : ''}`;

export function StandingTable({ s, event }: { s: Standing; event: RaceEvent }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const m = () => setWide(el.scrollWidth > el.clientWidth + 1);
    m();
    window.addEventListener('resize', m);
    return () => window.removeEventListener('resize', m);
  }, [s]);
  if (!s.races.length) return <p className="small muted">{ET.noRaces}</p>;
  const M = s.races.length;
  const total = (row: Standing['rows'][number]) => totalText(row, s.scoring, M);
  return (
    <>
      <div className="stand-wrap" ref={wrap} role="region" tabIndex={0} aria-label={`${ET.standing}: ${event.name}`}>
        <table className="stand" data-testid="event-standing">
          <thead>
            <tr>
              <th className="c-place" scope="col">
                {ET.colPlace}
              </th>
              <th className="c-boat" scope="col">
                {ET.colBoat}
              </th>
              {s.races.map((r) => (
                <th key={r.id} scope="col" title={r.name}>
                  {r.n}η
                </th>
              ))}
              <th className="c-total" scope="col">
                {ET.colTotal}
              </th>
            </tr>
          </thead>
          <tbody>
            {s.rows.map((row) => (
              <tr key={row.key} className={row.own ? 'own' : ''} data-testid={row.own ? 'standing-own' : undefined}>
                <td className="c-place">{placeText(row.place, row.tied)}</td>
                <th className="c-boat" scope="row" title={row.name} aria-label={`${row.name}${row.own ? `, ${ET.us}` : ''}`}>
                  <span className="nm">{row.name}</span>
                  {row.own && <span aria-hidden="true"> ◂</span>}
                </th>
                {row.cells.map((c, i) => (
                  <td key={c.raceId} className={c.discarded ? 'disc' : c.r.est ? 'est' : ''} aria-label={cellLabel(c, s.races[i].n, s.scoring)}>
                    {cellText(c, s.scoring)}
                  </td>
                ))}
                <td className="c-total">{total(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {wide && <p className="small muted swipe-hint">{ET.swipe}</p>}
      <p className="small muted stand-foot">{s.scoring === 'points' ? ET.pointsFoot(event.discards, event.discardFrom, s.discardsOn) : ET.timeFoot}</p>
      {s.tieBreaks.map((t) => (
        <p key={`${t.upper}|${t.lower}`} className="small muted stand-foot" data-testid="tie-line">
          {ET.tieLine(t.upper, t.lower, dec(t.total), t.rule)}
        </p>
      ))}
      {s.scoring === 'points' && s.hasCode && <p className="small muted stand-foot">{ET.codesFoot(s.N + 1)}</p>}
      {s.hasEst && <p className="small warn-text stand-foot">{ET.hasEst}</p>}
      {s.hasMissing && <p className="small warn-text stand-foot">{ET.hasMissing}</p>}
    </>
  );
}

// ---- Results editor (AC 29, design/events-2026-11: a list, one sheet per boat) -------------

type SheetModeKey = EntryMode | 'code';

interface Draft {
  key: string;
  mode: SheetModeKey;
  buf: string;
  code?: ResultCode;
  /** The first key replaces the shown value. */
  fresh: boolean;
}

/** What is stored for a boat now, for the list and the sheet. */
function boatNow(r: Race, b: EventBoat) {
  const e = entryOf(r, b);
  const code: ResultCode | undefined = !e ? 'DNC' : (r.resultCodes?.[e.id] ?? (b.own && r.held && r.results?.[e.id] === undefined ? 'DNC' : undefined));
  const t = e && !code ? r.results?.[e.id] : undefined;
  const est = e && !code && t === undefined ? r.estAtFinish?.[e.id] : undefined;
  return { e, code, t, est, src: e ? resultSource(r, e) : undefined };
}

/** The race's result fields with one boat's result changed (`next` undefined: cleared), for `patchRace`. */
function withResult(r: Race, b: EventBoat, next?: { elapsed?: number; code?: ResultCode }) {
  const results = { ...(r.results ?? {}) };
  const resultCodes: Record<string, ResultCode> = { ...(r.resultCodes ?? {}) };
  const resultSrc: Record<string, 'official'> = { ...(r.resultSrc ?? {}) };
  const entries = [...r.entries];
  let e = entryOf(r, b);
  // A boat not in this race joins it once it gets a time or a code other than DNC.
  if (!e && next && next.code !== 'DNC') {
    e = { ...b.entry };
    entries.push(e);
  }
  if (e) {
    delete results[e.id];
    delete resultCodes[e.id];
    delete resultSrc[e.id];
    if (next?.code) resultCodes[e.id] = next.code;
    else if (next?.elapsed !== undefined) results[e.id] = next.elapsed;
    if (next) resultSrc[e.id] = 'official';
  }
  return {
    results,
    resultCodes,
    resultSrc,
    entries,
    resultsEdited: Date.now(),
  };
}

type Next = { elapsed?: number; code?: ResultCode };

/** «Αποτελέσματα · <N>η ιστιοδρομία»: one row per boat of the event; a tap opens its sheet. */
export function ResultsEditor({ raceId, onBack }: { raceId: string; onBack: () => void }) {
  const race = useRace();
  const r = race.races.find((x) => x.id === raceId);
  const { event, n, races } = useRaceEvent(r);
  const boats = useMemo(() => eventBoats(races), [races]);
  const [draft, setDraft] = useState<Draft>();
  const [lastMode, setLastMode] = useState<EntryMode>('clock');
  const [saveError, setSaveError] = useState(false);
  if (!r || !event || !n) return <p className="muted">{ET.notFound}</p>;
  const N = classN(event, boats);
  const res = raceResult(r, boats, N);
  const own = standing(event, race.races).rows.find((x) => x.own);

  const openFor = (b: EventBoat, cur: Race = r) => {
    const now = boatNow(cur, b);
    const mode: SheetModeKey = now.code ? 'code' : lastMode;
    setSaveError(false);
    setDraft({
      key: b.key,
      mode,
      code: now.code,
      buf: now.t !== undefined && mode !== 'code' ? bufOf(mode, now.t, cur.start) : '',
      fresh: true,
    });
  };

  /** Saves one boat; «Αναίρεση» 8″ puts the race's results back as they were. */
  const apply = async (b: EventBoat, next: Next | undefined) => {
    const cur = race.races.find((x) => x.id === raceId) ?? r;
    const before: Partial<Race> = {
      results: cur.results,
      resultCodes: cur.resultCodes,
      resultSrc: cur.resultSrc,
      entries: cur.entries,
      resultsEdited: cur.resultsEdited,
    };
    const patch = withResult(cur, b, next);
    try {
      setSaveError(false);
      await race.patchRace(cur.id, patch);
    } catch {
      setSaveError(true);
      return undefined;
    }
    const after = { ...cur, ...patch };
    const x = raceResult(after, boats, N).byKey[b.key];
    const what = next?.code ?? (next?.elapsed !== undefined ? formatDuration(next.elapsed) : '');
    const text = !next
      ? ET.cleared(b.name, x.est === true)
      : ET.savedOne(b.name, what, x.code ? ET.pts(dec(x.points)) : x.place !== undefined ? ET.calcPlace(x.place, !!x.tied) : '—');
    offerUndo(text, () => race.patchRace(cur.id, before));
    return after;
  };

  const del = async () => {
    const only = races.length === 1;
    if (
      !(await askConfirm(ET.deleteAsk(n, r.name, only), {
        ok: ET.deleteYes,
        danger: true,
      }))
    )
      return;
    await deleteEventRace(race, r, event, only);
    onBack();
  };

  const db = draft ? boats.find((b) => b.key === draft.key) : undefined;
  return (
    <div className="results-editor" data-testid="results-editor">
      <section className="card">
        <h2>{ET.resultsTitle(n)}</h2>
        <p className="small muted">
          {r.name} · {dayStr(r.start)} · {ET.startNote(hhmm(r.start))}
        </p>
        <p className="small">
          {ET.resultsIntro}
          {own?.place !== undefined && (
            <>
              {' '}
              {ET.overallNow} <b>{placeText(own.place, own.tied)}ος</b>.
            </>
          )}
        </p>
      </section>
      <div className="er-list">
        {boats.map((b) => {
          const now = boatNow(r, b);
          const x = res.byKey[b.key];
          const place = x.code || x.place === undefined ? '—' : placeText(x.place, x.tied);
          const srcText = !now.e ? ET.notInRace : now.src === 'line' && r.finishCross?.approx ? ET.srcLineApprox : now.src ? ET.src[now.src] : ET.noResult;
          const elapsed = now.t ?? now.est;
          const isEst = now.est !== undefined;
          const value = now.code ? now.code : elapsed !== undefined ? `${isEst ? `${ET.est} ` : ''}${formatDuration(elapsed)}` : '—';
          const cap = now.code ? ET.pts(dec(x.points)) : elapsed !== undefined ? ET.finishAt(hhmmss(r.start + elapsed * 1000)) : ET.noResult;
          return (
            <button
              key={b.key}
              type="button"
              className={`er${b.own ? ' own' : ''}${isEst ? ' est' : ''}`}
              data-testid="result-row"
              aria-label={ET.rowLabel(b.name, place, `${value}, ${srcText}`)}
              onClick={() => openFor(b)}
            >
              <span className="pos" aria-hidden="true">
                {place}
              </span>
              <span className="nm">
                <b>{b.name}</b>
                <span className="small">
                  {b.own ? `${ET.us} · ` : ''}
                  {srcText}
                </span>
              </span>
              <span className="v">
                {value}
                <span className="small">{cap}</span>
              </span>
              <span className="go" aria-hidden="true">
                ›
              </span>
            </button>
          );
        })}
      </div>
      <p className="small muted">{ET.classFoot(N, N + 1, (event.classSize ?? 0) > boats.length)}</p>
      <button type="button" className="btn primary big-btn wide" data-testid="results-done" onClick={onBack}>
        {ET.done}
      </button>
      <button type="button" className="btn danger wide" onClick={del}>
        {ET.deleteRace}
      </button>
      {draft && db && (
        <ResultSheet
          r={r}
          b={db}
          boats={boats}
          N={N}
          draft={draft}
          setDraft={setDraft}
          saveError={saveError}
          onClose={() => setDraft(undefined)}
          onSave={async (next, goOn) => {
            const after = await apply(db, next);
            if (!after) return;
            if (draft.mode !== 'code') setLastMode(draft.mode);
            const i = boats.indexOf(db);
            if (goOn && i < boats.length - 1) openFor(boats[i + 1], after);
            else setDraft(undefined);
          }}
          onClear={async () => {
            if (await apply(db, undefined)) setDraft(undefined);
          }}
        />
      )}
    </div>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'B'];

/** The sheet of one boat: «Ώρα τερματισμού / Χρόνος / Κωδικός», its own 3×4 keypad and the live preview. */
function ResultSheet({
  r,
  b,
  boats,
  N,
  draft: d,
  setDraft,
  saveError,
  onClose,
  onSave,
  onClear,
}: {
  r: Race;
  b: EventBoat;
  boats: EventBoat[];
  N: number;
  draft: Draft;
  setDraft: (d: Draft) => void;
  saveError: boolean;
  onClose: () => void;
  onSave: (next: Next, goOn: boolean) => void;
  onClear: () => void;
}) {
  const sm = useSheetMode();
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const now = boatNow(r, b);
  const check = d.mode === 'code' ? undefined : checkEntry(d.mode, d.buf, r.start);
  const next: Next | undefined = d.mode === 'code' ? (d.code ? { code: d.code } : undefined) : check?.ok ? { elapsed: check.elapsed } : undefined;

  // The undo note goes to the top while the sheet is open (`:root.sheet-open`, set by the frame).
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [b.key]);

  const press = (k: string) => setDraft({ ...d, buf: pressKey(d.buf, k, d.fresh), fresh: false });
  const save = (goOn: boolean) => {
    if (next) onSave(next, goOn);
  };
  // Laptop: 0–9, ⌫ and Enter.
  const keyRef = useRef({ press, save, mode: d.mode });
  keyRef.current = { press, save, mode: d.mode };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const { press: p, save: s, mode } = keyRef.current;
      if (mode !== 'code' && /^[0-9]$/.test(e.key)) p(e.key);
      else if (mode !== 'code' && e.key === 'Backspace') p('B');
      else if (e.key === 'Enter' && (e.target as HTMLElement | null)?.tagName !== 'BUTTON') s(false);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const setMode = (mode: SheetModeKey) => {
    if (mode === d.mode) return;
    // A valid time follows to the other mode; from «Κωδικός» the stored time comes back.
    const c = d.mode !== 'code' ? checkEntry(d.mode, d.buf, r.start) : undefined;
    const t = c?.ok ? c.elapsed : d.mode === 'code' ? now.t : undefined;
    const buf = mode !== 'code' && t !== undefined ? bufOf(mode, t, r.start) : '';
    setDraft({ ...d, mode, buf, fresh: !!buf });
  };

  let calc: string;
  let err = false;
  if (d.mode === 'code') calc = d.code ? ET.codeIs(d.code, N + 1) : ET.why.code;
  else if (!check!.ok) {
    const w = check!.why;
    calc = w === 'empty' ? (d.mode === 'clock' ? ET.why.emptyclock : ET.why.emptyelapsed) : ET.why[w];
    err = w !== 'empty';
  } else {
    const x = raceResult({ ...r, ...withResult(r, b, { elapsed: check!.elapsed }) }, boats, N).byKey[b.key];
    calc = [
      d.mode === 'clock' ? ET.calcElapsed(formatDuration(check!.elapsed)) : ET.calcClock(hhmmss(r.start + check!.elapsed * 1000)),
      ...(check!.nextDay ? [ET.nextDay] : []),
      x.corrected !== undefined ? ET.calcCorr(formatDuration(x.corrected)) : ET.noRating,
      ...(x.place !== undefined ? [ET.calcPlace(x.place, !!x.tied)] : []),
    ].join(' · ');
  }
  const shown = bufText(d.buf);
  const estShown =
    now.est === undefined || d.mode === 'code' ? undefined : d.mode === 'clock' ? hhmmss(r.start + now.est * 1000) : formatDuration(now.est);
  const has = !!now.e && (!!r.resultCodes?.[now.e.id] || now.t !== undefined);

  return (
    <SheetFrame label={b.name} labelledBy={titleId} onClose={onClose} testId="result-sheet" mode={sm === 'side' ? 'center' : sm} className="result-sheet">
      <div className="rs-head">
        <h3 id={titleId} ref={titleRef} tabIndex={-1}>
          {b.name}
          {b.sailNo && <span className="small muted"> {b.sailNo}</span>}
        </h3>
        <button type="button" className="btn" onClick={onClose}>
          {ET.noChange}
        </button>
      </div>
      <div className="rs-seg" role="tablist" aria-label={ET.whatTyped}>
        {(['clock', 'elapsed', 'code'] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={d.mode === m} className={d.mode === m ? 'on' : ''} onClick={() => setMode(m)}>
            {ET.modes[m][0]}
            <span>{ET.modes[m][1]}</span>
          </button>
        ))}
      </div>
      {d.mode === 'code' ? (
        <div className="rs-codes" role="group" aria-label={ET.codesAria}>
          {RESULT_CODES.map((c) => (
            <button key={c} type="button" className={d.code === c ? 'on' : ''} aria-pressed={d.code === c} onClick={() => setDraft({ ...d, code: c })}>
              <b>{c}</b>
              <span>{CODE_HINT[c]}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <p className="rs-lab">{d.mode === 'clock' ? ET.clockLabel : ET.elapsedLabel}</p>
          <div className="rs-readout" data-testid="result-readout">
            <div className="rv">{shown ?? <i>{estShown ? `${ET.est} ${estShown}` : '––:––:––'}</i>}</div>
            <div className="rl" aria-hidden="true">
              <span>{d.mode === 'clock' ? 'ΩΩ' : 'Ω'}</span>
              <span>ΛΛ</span>
              <span>ΔΔ</span>
            </div>
          </div>
          <div className="rs-kp" role="group" aria-label={ET.keypad}>
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                className={k === 'C' || k === 'B' ? 'fn' : ''}
                aria-label={k === 'C' ? ET.keyClearAria : k === 'B' ? ET.keyBackAria : undefined}
                onClick={() => press(k)}
              >
                {k === 'C' ? ET.keyClear : k === 'B' ? '⌫' : k}
              </button>
            ))}
          </div>
        </>
      )}
      <p className={`rs-calc${err ? ' err' : ''}`} role="status" data-testid="result-calc">
        {calc}
      </p>
      <p className="small muted rs-note">
        {ET.startNote(hhmmss(r.start))} {d.mode === 'code' ? ET.codeNote(N + 1, N) : ET.digitsNote}
      </p>
      {has && !b.own && (
        <button type="button" className="link-btn" data-testid="result-clear" onClick={onClear}>
          {ET.clearResult(!!now.e && r.estAtFinish?.[now.e.id] !== undefined)}
        </button>
      )}
      {saveError && (
        <p className="msg bad" role="alert">
          {ET.saveFailed}
        </p>
      )}
      <div className="rs-foot">
        <button type="button" className="btn big-btn" disabled={!next} data-testid="result-save" onClick={() => save(false)}>
          {ET.save}
        </button>
        <button type="button" className="btn primary big-btn" disabled={!next} data-testid="result-save-next" onClick={() => save(true)}>
          {ET.saveNext}
        </button>
      </div>
    </SheetFrame>
  );
}

/**
 * Deletes a race of an event (AC 38) with an 8″ undo; the event goes too when it was its only race,
 * and the undo brings both back. The others are numbered again (computed).
 */
export async function deleteEventRace(race: ReturnType<typeof useRace>, r: Race, event: RaceEvent | undefined, only: boolean) {
  await race.remove(r.id);
  if (event && only) {
    await race.removeEvent(event.id);
    offerUndo(ET.deletedBoth(r.name, event.name), async () => {
      await race.saveEvent(event);
      await race.save(r);
    });
  } else offerUndo(event ? ET.deleted(r.name) : `Διαγράφηκε ο αγώνας «${r.name}»`, () => race.save(r));
}

// ---- Event screen (AC 33, 36) ---------------------------------------------------------------

/** Finished results of a race, best first: the boats with a place, then the codes and «—». */
function raceRows(s: Standing, raceId: string) {
  const res = s.results[raceId];
  if (!res) return [];
  const name = Object.fromEntries(s.rows.map((x) => [x.key, x]));
  return Object.values(res.byKey)
    .filter((x) => name[x.key])
    .sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity) || Number(!!a.missing) - Number(!!b.missing))
    .map((x) => ({ x, row: name[x.key] }));
}

const corrText = (x: BoatResult) => (x.code ? x.code : x.corrected !== undefined ? `${formatDuration(x.corrected)}${x.est ? ` ${ET.est}` : ''}` : '—');

export function EventScreen({
  eventId,
  onBack,
  onSetup,
  onAnalysis,
  onResults,
}: {
  eventId: string;
  onBack: () => void;
  onSetup: (kind: SessionKind, raceId?: string, eventId?: string) => void;
  onAnalysis: (raceId: string) => void;
  onResults: (raceId: string) => void;
}) {
  const race = useRace();
  const event = race.events.find((e) => e.id === eventId);
  const [edit, setEdit] = useState<EventDraft>();
  const [err, setErr] = useState<() => Promise<void>>();
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const races = useMemo(() => eventRaces(eventId, race.races), [eventId, race.races]);
  const s = useMemo(() => (event ? standing(event, race.races) : undefined), [event, race.races]);
  if (!event || !s) {
    return (
      <>
        <button type="button" className="btn back-btn" onClick={onBack}>
          <BtnIcon name="back" />
          {ET.back}
        </button>
        <p className="muted">{ET.notFound}</p>
      </>
    );
  }
  const nums = raceNumbers(races);
  const numbered = Object.keys(nums).length;
  const open = event.status === 'open';
  const planned = races.find((r) => r.status === 'planned');
  const running = races.some((r) => r.status === 'running');
  const boats = eventBoats(races).length;
  const lastDone = [...races].reverse().find(isCompleted)?.id;
  const ownRow = s.rows.find((x) => x.own);
  const tryRun = async (f: () => Promise<void>) => {
    try {
      setErr(undefined);
      await f();
    } catch {
      setErr(() => f);
    }
  };
  const setStatus = (status: RaceEvent['status']) => tryRun(() => race.saveEvent({ ...event, status, updatedAt: Date.now() }));
  const close = async () => {
    if (!(await askConfirm(ET.closeAsk, { ok: ET.closeYes }))) return;
    await setStatus('closed');
    offerUndo(ET.closed, () => race.saveEvent({ ...event, status: 'open', updatedAt: Date.now() }));
  };

  return (
    <div className="event-screen" data-testid="event-screen">
      <button type="button" className="btn back-btn" onClick={onBack}>
        <BtnIcon name="back" />
        {ET.back}
      </button>
      <section className="card">
        <div className="row between">
          <h2 className="ev-name">{event.name}</h2>
          {!open && <span className="badge">{ET.closedBadge}</span>}
        </div>
        <p className="small muted" data-testid="event-header">
          {ET.header(numbered, event.scoring, event.discards, event.discardFrom, open)}
        </p>
        {!open && <p className="msg info small">{ET.closed}</p>}
        {edit ? (
          <div className="form-grid">
            <EventFields value={edit} onChange={setEdit} boats={boats} nameError={!edit.name.trim()} />
            <div className="btn-row full">
              <button
                type="button"
                className="btn primary"
                disabled={!edit.name.trim()}
                onClick={() =>
                  tryRun(async () => {
                    await race.saveEvent({
                      ...event,
                      ...edit,
                      name: edit.name.trim(),
                      updatedAt: Date.now(),
                    });
                    setEdit(undefined);
                  })
                }
              >
                {ET.save}
              </button>
              <button type="button" className="btn" onClick={() => setEdit(undefined)}>
                {ET.cancel}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn small-btn" onClick={() => setEdit(draftOf(event))}>
            {ET.change}
          </button>
        )}
      </section>
      {err && (
        <p className="msg bad" role="alert">
          {ET.saveFailed}{' '}
          <button type="button" className="btn small-btn" onClick={() => tryRun(err)}>
            {ET.retry}
          </button>
        </p>
      )}
      <section className="card">
        <h3>{open ? ET.standing : ET.finalStanding}</h3>
        <StandingTable s={s} event={event} />
      </section>
      {races.map((r) => {
        const no = nums[r.id];
        if (isCompleted(r)) {
          const isOpen = opened[r.id] ?? r.id === lastDone;
          const mine = ownRow ? s.results[r.id]?.byKey[ownRow.key] : undefined;
          const what = !mine ? '—' : mine.code ? mine.code : mine.place !== undefined ? `${placeText(mine.place, mine.tied)}η · ${corrText(mine)}` : '—';
          const ests = Object.values(s.results[r.id]?.byKey ?? {}).filter((x) => x.est).length;
          const bodyId = `ev-race-${r.id}`;
          return (
            <section key={r.id} className={`card ev-race${isOpen ? '' : ' folded'}`} data-testid="event-race">
              <button
                type="button"
                className="rc-toggle"
                data-testid="race-toggle"
                aria-expanded={isOpen}
                aria-controls={bodyId}
                onClick={() => setOpened((o) => ({ ...o, [r.id]: !isOpen }))}
              >
                <span className="rc-text">
                  <span className="rc-title">{ET.raceCard(no, r.name)}</span>
                  <span className="small muted">{ET.raceLine(`${dayStr(r.start)} · ${hhmm(r.start)}`, ownRow?.name ?? ET.us, what, ests)}</span>
                </span>
                <span className="chev" aria-hidden="true">
                  {isOpen ? '▴' : '▾'}
                </span>
              </button>
              {isOpen && (
                <div id={bodyId}>
                  <table className="leader ev-results">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{ET.colBoat}</th>
                        <th className="num">{ET.colCorrected}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {raceRows(s, r.id).map(({ x, row }) => (
                        <tr key={x.key} className={row.own ? 'own' : ''}>
                          <td>{x.place !== undefined ? placeText(x.place, x.tied) : '—'}</td>
                          <td>
                            {row.name}
                            {row.own && <span aria-hidden="true"> ◂</span>}
                          </td>
                          <td className="num">{corrText(x)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="btn-row">
                    {!isCancelled(r) && (
                      <button type="button" className="btn" onClick={() => onAnalysis(r.id)}>
                        {ET.analysis}
                      </button>
                    )}
                    <button type="button" className="btn" data-testid="open-results" onClick={() => onResults(r.id)}>
                      {ET.results}
                    </button>
                  </div>
                </div>
              )}
            </section>
          );
        }
        if (r.status === 'finished') {
          return (
            <section key={r.id} className="card ev-race cancelled" data-testid="event-race">
              <p>{ET.cancelled(r.name, dayStr(r.start))}</p>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  tryRun(async () => {
                    await race.patchRace(r.id, { held: true });
                    onResults(r.id);
                  })
                }
              >
                {ET.heldBtn}
              </button>
            </section>
          );
        }
        return (
          <section key={r.id} className="card ev-race" data-testid="event-race">
            <h3>{ET.raceCard(no, r.name || ET.race)}</h3>
            <p className="small muted">
              {dayStr(r.start)} · {hhmm(r.start)} · {r.status === 'running' ? ET.runningNow : open ? ET.notYet : 'Δεν έγινε · δεν μετρά.'}
            </p>
            {r.status === 'planned' && open && (
              <button type="button" className="btn" onClick={() => onSetup('race', r.id)}>
                {ET.openRace(no)}
              </button>
            )}
          </section>
        );
      })}
      <div className="btn-col">
        {open && !planned && !running && (
          <button type="button" className="btn primary big-btn wide" data-testid="event-next" onClick={() => onSetup('race', undefined, event.id)}>
            {ET.setupRace(numbered + 1)}
          </button>
        )}
        {open ? (
          <button type="button" className="btn big-btn wide" onClick={close}>
            {ET.close}
          </button>
        ) : (
          <button
            type="button"
            className="btn big-btn wide"
            onClick={async () => {
              await setStatus('open');
              showNote(ET.reopened);
            }}
          >
            {ET.reopen}
          </button>
        )}
      </div>
    </div>
  );
}

// ---- Cards: home (AC 10), History (AC 35), end of a race (AC 30) ----------------------------

/** What the home card and the History card say about an event. */
function useEventFacts(event: RaceEvent) {
  const { races: all } = useRace();
  return useMemo(() => {
    const races = eventRaces(event.id, all);
    const nums = raceNumbers(races);
    const s = standing(event, all);
    const own = s.rows.find((x) => x.own);
    const lastDone = [...races].reverse().find(isCompleted);
    const planned = races.find((r) => r.status === 'planned');
    const numbered = Object.keys(nums).length;
    return {
      races,
      nums,
      s,
      own,
      lastDone,
      planned,
      numbered,
      next: planned ? nums[planned.id] : numbered + 1,
    };
  }, [event, all]);
}

export function HomeEventCard({
  event,
  onSetup,
  onEvent,
}: {
  event: RaceEvent;
  onSetup: (kind: SessionKind, raceId?: string, eventId?: string) => void;
  onEvent: (id: string) => void;
}) {
  const f = useEventFacts(event);
  return (
    <section className="card event-card" data-testid="home-event">
      <p className="ev-title">
        <b>
          {f.lastDone && f.own?.place !== undefined
            ? ET.afterN(event.name, f.nums[f.lastDone.id], placeText(f.own.place, f.own.tied), f.s.hasEst)
            : ET.noneYet(event.name)}
        </b>
      </p>
      <p className="ev-next">{ET.nextRace(f.next, f.planned?.name || undefined)}</p>
      <p className="small muted">{ET.when(f.planned ? `${dayStr(f.planned.start)} · ${hhmm(f.planned.start)}` : ET.notSet, f.next > 1)}</p>
      <button
        type="button"
        className="btn primary big-btn wide"
        data-testid="home-event-go"
        onClick={() => (f.planned ? onSetup('race', f.planned.id) : onSetup('race', undefined, event.id))}
      >
        {f.planned ? ET.openRace(f.next) : ET.setupRace(f.next)}
      </button>
      <button type="button" className="link-btn" onClick={() => onEvent(event.id)}>
        {ET.seeEvent}
      </button>
    </section>
  );
}

export function EventHistoryCard({ event, fresh, onOpen }: { event: RaceEvent; fresh?: boolean; onOpen: () => void }) {
  const f = useEventFacts(event);
  return (
    <button type="button" data-testid="history-event" className={`hist-card ev-hist ${fresh ? 'fresh' : ''}`} onClick={onOpen}>
      <span className="ic" aria-hidden="true">
        ⚑
      </span>
      <span className="body">
        <b>
          {event.name}
          {fresh && <span className="pill-new">νέα</span>}
        </b>
        <span className="s">{ET.histSub(f.numbered, event.status === 'open')}</span>
        {f.races
          .filter((r) => f.nums[r.id])
          .map((r) => {
            const x = f.s.results[r.id]?.byKey[f.own?.key ?? ''];
            const n = f.nums[r.id];
            return (
              <span key={r.id} className="s ev-line">
                {isCompleted(r) && x ? ET.histLine(n, r.name, corrText(x), placeText(x.place, x.tied)) : ET.histNotYet(n, r.name || ET.race)}
              </span>
            );
          })}
        {f.own?.place !== undefined && <span className="m">{ET.histOverall(placeText(f.own.place, f.own.tied), f.s.rows.length)}</span>}
      </span>
    </button>
  );
}

/** «<διοργάνωση> · μετά την <N>η» with the first 3 and our boat, on the end of a race. */
export function EventAfterCard({ r, onEvent, onResults }: { r: Race; onEvent: () => void; onResults: () => void }) {
  const { event, n } = useRaceEvent(r);
  const { races } = useRace();
  const s = useMemo(() => (event ? standing(event, races) : undefined), [event, races]);
  if (!event || !s || !n) return null;
  const top = s.rows.slice(0, 3);
  const own = s.rows.find((x) => x.own);
  const list = own && !top.includes(own) ? [...top, own] : top;
  return (
    <section className="card event-card" data-testid="event-after">
      <h3>{ET.afterCard(event.name, n)}</h3>
      {s.races.length ? (
        <ol className="rows compact ev-top">
          {list.map((x) => (
            <li key={x.key} className={x.own ? 'own' : ''}>
              <span>
                {placeText(x.place, x.tied)} · {x.name}
                {x.own && <span aria-hidden="true"> ◂</span>}
              </span>
              <span className="muted small">{totalText(x, s.scoring, s.races.length)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="small muted">{ET.noRaces}</p>
      )}
      {s.hasEst && <p className="small warn-text">{ET.hasEst}</p>}
      <div className="btn-row">
        <button type="button" className="btn" onClick={onEvent}>
          {ET.seeEvent}
        </button>
        <button type="button" className="btn" data-testid="after-results" onClick={onResults}>
          {ET.results}
        </button>
      </div>
    </section>
  );
}
