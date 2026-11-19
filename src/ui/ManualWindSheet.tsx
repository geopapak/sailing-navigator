import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icons';
import { SheetFrame, hhmm, useNow } from './SessionBar';
import { useSheetMode } from './hooks';
import { offerUndo, showNote } from './Dialogs';
import { WIND_TEXT as WT } from './sessionText';
import {
  LOG_SETTLE_MS,
  ageMin,
  dirUnit,
  fmtAge,
  fmtBoth,
  fmtDir,
  fmtTwsField,
  isStale,
  logEntry,
  manualTwa,
  parseTwd,
  parseTws,
  pad3,
  stepTwd,
  stepTws,
  toDisplay,
  type Course,
  type DirOpts,
  type Prefill,
} from '../race/manualWind';
import type { ManualWind, WindLogEntry } from '../race/types';

/** What the sheet stores: the manual wind (when given) and log entries, in one go. */
export interface WindCommit {
  manual?: ManualWind;
  log?: WindLogEntry[];
}

export interface ManualWindSheetProps {
  /** «Γρήγορη ματιά» without a polar (S17; no session, no «Γρήγορη ματιά» wind to fall back to). */
  basic?: boolean;
  /** The stored manual wind: on, or off with the last values. */
  manual?: ManualWind;
  /** The wind with the switch off. */
  offTo: 'instruments' | 'quick' | 'none';
  instLive: boolean;
  /** First values when nothing is stored yet (instruments → forecast). */
  prefill?: Prefill;
  course: Course;
  dir: DirOpts;
  /** Values changed with the switch off are kept as the sheet's next first values. */
  keepDraft?: boolean;
  commit: (c: WindCommit) => void;
  onClose: () => void;
}

interface Draft {
  twdTrue?: number;
  tws?: number;
  from?: Prefill['from'];
  at?: number;
}

const SIDE_W = 'min(26em, 48vw)';
/** «Αναίρεση» of the switch (N01–N03). */
const UNDO_SWITCH_MS = 6000;

/**
 * The sheet «Άνεμος» (P-053, design/manual-wind-2026-11): TWD/TWS with big ±, the switch
 * «Χρήση χειροκίνητου ανέμου», the TWA it gives and «✓ Ισχύει ακόμα». A bottom sheet on
 * phones, centred on tablets, a side panel next to the Live on wide or low screens.
 */
export function ManualWindSheet(p: ManualWindSheetProps) {
  const { manual, dir, commit, onClose } = p;
  const mode = useSheetMode();
  useNow(5000);
  const now = Date.now();
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const on = !!manual?.on;
  const [draft, setDraft] = useState<Draft>(() => (manual ? { twdTrue: manual.twdTrue, tws: manual.tws } : p.prefill ? { ...p.prefill } : {}));
  const cur: Draft = on ? { twdTrue: manual!.twdTrue, tws: manual!.tws } : draft;
  const has = cur.twdTrue !== undefined && cur.tws !== undefined;
  const stale = on && isStale(manual!.at, now);
  const age = on ? fmtAge(ageMin(manual!.at, now)) : '';

  // A value change is logged once the presses settle (5″) or when the sheet closes.
  const pending = useRef<{ timer?: number; entry?: WindLogEntry }>({});
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const takePending = (): WindLogEntry[] => {
    window.clearTimeout(pending.current.timer);
    const e = pending.current.entry;
    pending.current = {};
    return e ? [e] : [];
  };
  useEffect(
    () => () => {
      const left = takePending();
      if (left.length) commitRef.current({ log: left });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Focus on the title when it opens, back on the card (or «Βάλε άνεμο») when it closes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    titleRef.current?.focus({ preventScroll: true });
    return () => {
      const back = opener?.isConnected ? opener : document.querySelector<HTMLElement>('[data-testid="wind-reading"], [data-testid="wind-prompt"]');
      back?.focus({ preventScroll: true });
    };
  }, []);

  // Side panel: under the session bar, above the tab bar; the Live makes room for it.
  const [edges, setEdges] = useState<{ top: number; bottom: number }>({ top: 0, bottom: 0 });
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add('wind-sheet-open');
    if (mode !== 'side') return () => root.classList.remove('wind-sheet-open');
    root.classList.add('wind-side-open');
    const measure = () => {
      // Below the session bar and the recording strip under it (its «Παύση» stays reachable).
      const top = [...document.querySelectorAll('.sbar, .topbar, [data-testid="session-strip"]')].reduce((m, el) => Math.max(m, el.getBoundingClientRect().bottom), 0);
      const tabs = document.querySelector('.tabbar');
      setEdges({ top: Math.max(0, top), bottom: tabs ? Math.max(0, window.innerHeight - tabs.getBoundingClientRect().top) : 0 });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
      root.classList.remove('wind-side-open', 'wind-sheet-open');
    };
  }, [mode]);

  const change = (k: 'twdTrue' | 'tws', v: number) => {
    const t = Date.now();
    if (on) {
      const next: ManualWind = { ...manual!, [k]: v, at: t };
      window.clearTimeout(pending.current.timer);
      pending.current.entry = logEntry('set', t, next);
      pending.current.timer = window.setTimeout(() => {
        const left = takePending();
        if (left.length) commitRef.current({ log: left });
      }, LOG_SETTLE_MS);
      commit({ manual: next });
      return;
    }
    const d = { ...draft, [k]: v };
    setDraft(d);
    if (p.keepDraft && d.twdTrue !== undefined && d.tws !== undefined) commit({ manual: { on: false, twdTrue: d.twdTrue, tws: d.tws, at: manual?.at ?? t } });
  };

  // The 6″ «Αναίρεση» of the switch stays inside the sheet while it is open (it never covers
  // the sheet at 320 px); closing the sheet early hands what is left to the app's message.
  const [undo, setUndo] = useState<{ text: string; run: () => void; until: number }>();
  const undoRef = useRef(undo);
  undoRef.current = undo;
  useEffect(() => {
    if (!undo) return;
    const t = window.setTimeout(() => setUndo(undefined), Math.max(0, undo.until - Date.now()));
    return () => window.clearTimeout(t);
  }, [undo]);
  useEffect(
    () => () => {
      const u = undoRef.current;
      const left = u ? u.until - Date.now() : 0;
      if (u && left > 500) offerUndo(u.text, u.run, left);
    },
    [],
  );

  const toggle = () => {
    const t = Date.now();
    const before = manual;
    if (on) {
      const off: ManualWind = { ...manual!, on: false };
      commit({ manual: off, log: [...takePending(), logEntry('off', t, off)] });
      setDraft({ twdTrue: off.twdTrue, tws: off.tws });
      setUndo({
        text: p.instLive ? WT.nInst : WT.nOff,
        run: () => commitRef.current({ manual: before, log: [logEntry('on', Date.now(), before)] }),
        until: t + UNDO_SWITCH_MS,
      });
    } else {
      if (cur.twdTrue === undefined || cur.tws === undefined) return;
      const next: ManualWind = { on: true, twdTrue: cur.twdTrue, tws: cur.tws, at: t };
      commit({ manual: next, log: [logEntry('on', t, next)] });
      setUndo({
        text: WT.nOn,
        run: () => commitRef.current({ manual: before ?? { ...next, on: false }, log: [logEntry('off', Date.now(), next)] }),
        until: t + UNDO_SWITCH_MS,
      });
    }
  };

  const confirm = () => {
    if (!on) return;
    const t = Date.now();
    const next: ManualWind = { ...manual!, at: t };
    commit({ manual: next, log: [...takePending(), logEntry('confirm', t, next)] });
    onClose();
    showNote(WT.nValid);
  };

  const offTo = p.offTo === 'instruments' ? WT.offToInst : p.offTo === 'quick' ? WT.offToQuick : WT.offToNone;
  const sub = on ? `${p.basic ? WT.onBasic : WT.onSession} ${WT.ifOff(offTo)}` : has ? WT.off(offTo) : WT.needValues;
  const unit = dirUnit(dir);

  return (
    <SheetFrame
      label={WT.title}
      labelledBy={titleId}
      onClose={onClose}
      testId="wind-sheet"
      mode={mode}
      className="wind-sheet"
      style={mode === 'side' ? { top: edges.top, bottom: edges.bottom, width: SIDE_W } : undefined}
    >
      {mode !== 'side' && (
        <div className="ws-hdl" aria-hidden="true">
          <i />
        </div>
      )}
      <div className="ws-head">
        <h3 id={titleId} ref={titleRef} tabIndex={-1}>
          {WT.title}
        </h3>
        <button type="button" className="ws-x" aria-label={WT.close} onClick={onClose}>
          <Icon name="close" stroke={2.2} />
        </button>
      </div>
      {on ? (
        <div className={`ws-stat${stale ? ' stale' : ''}`} data-testid="wind-age">
          {stale && <Icon name="warn" size="1em" stroke={2.2} className="wi" />}
          {WT.sheetManual(age)}
          {stale && WT.check}
        </div>
      ) : (
        <div className="ws-stat off">{p.offTo === 'instruments' ? WT.nowInst : p.offTo === 'quick' ? WT.nowQuick : WT.nowNone}</div>
      )}
      {on && p.instLive && <p className="ws-info">{WT.instConnected}</p>}
      {!on && has && draft.from && <p className="ws-info">{draft.from === 'instruments' ? WT.fromInstPrefill : WT.fromForecast(hhmm(draft.at ?? Date.now()))}</p>}
      {!on && !has && <p className="ws-info">{WT.emptyHint}</p>}

      <div className="ws-label">
        {WT.twdLabel} <span className="u">({unit})</span>
      </div>
      <WindStepper kind="twd" value={cur.twdTrue} dir={dir} onChange={(v) => change('twdTrue', v)} />
      {cur.twdTrue !== undefined && <div className="ws-conv">{fmtBoth(cur.twdTrue, dir)}</div>}
      {dir.manualMagnetic && dir.declination === 0 && <p className="ws-info warn">{WT.decl0}</p>}

      <div className="ws-label">
        {WT.twsLabel} <span className="u">(kt)</span>
      </div>
      <WindStepper kind="tws" value={cur.tws} dir={dir} onChange={(v) => change('tws', v)} />
      <p className="ws-hint">{WT.twsHint}</p>

      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={`toggle ws-switch${on ? ' on' : ''}`}
        data-testid={on ? 'wind-off' : 'wind-use'}
        disabled={!on && !has}
        onClick={toggle}
      >
        <span className="tx">
          {WT.use}
          <span className="small">{sub}</span>
        </span>
        <span className="knob" aria-hidden="true" />
      </button>

      <TwaLine twdTrue={cur.twdTrue} course={p.course} dir={dir} />
      <p className="ws-help">{WT.help}</p>

      <div className="ws-foot">
        <div className="ws-undo-slot" role="status">
          {undo && (
            <div className="ws-undo" data-testid="wind-undo">
              <span>{undo.text}</span>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  undo.run();
                  setUndo(undefined);
                }}
              >
                {WT.undo}
              </button>
            </div>
          )}
        </div>
        {on ? (
          <div className="g2 fit">
            <button type="button" className="btn big-btn" data-testid="wind-confirm" onClick={confirm}>
              {WT.stillValid}
            </button>
            <button type="button" className="btn big-btn" onClick={onClose}>
              {WT.done}
            </button>
          </div>
        ) : (
          <button type="button" className="btn big-btn wide" onClick={onClose}>
            {WT.done}
          </button>
        )}
      </div>
    </SheetFrame>
  );
}

/** S21–S25: the TWA the sheet's TWD gives, and where the course comes from. */
function TwaLine({ twdTrue, course, dir }: { twdTrue?: number; course: Course; dir: DirOpts }) {
  if (twdTrue === undefined) return null;
  const twa = manualTwa(twdTrue, course);
  if (twa === undefined || course.deg === undefined)
    return (
      <div className="ws-twa" data-testid="wind-twa" aria-live="polite">
        <b>TWA: —</b>
        {WT.twaNone.slice('TWA: —'.length)}
      </div>
    );
  const n = String(Math.round(Math.abs(twa)));
  const side = twa >= 0 ? WT.stbd : WT.port;
  const deg = fmtDir(course.deg, dir);
  const text = course.src === 'hdg' ? WT.twaHdg(n, side, deg) : WT.twaCog(n, side, deg);
  const head = `TWA ${n}° ${side}`;
  return (
    <div className="ws-twa" data-testid="wind-twa" aria-live="polite">
      <b>{head}</b>
      {text.slice(head.length)}
      {course.src === 'hold' && WT.twaHold}
      {course.src !== 'hdg' && <div className="ws-hint">{WT.cogNote}</div>}
    </div>
  );
}

/** −5 −1 [TWD] +1 +5 (around the compass) or −2 −1 [TWS] +1 +2 (0–60, half knots when typed). */
function WindStepper({ kind, value, dir, onChange }: { kind: 'twd' | 'tws'; value?: number; dir: DirOpts; onChange: (v: number) => void }) {
  const twd = kind === 'twd';
  const fmt = (v?: number) => (v === undefined ? '' : twd ? pad3(toDisplay(v, dir)) : fmtTwsField(v));
  const [text, setText] = useState(fmt(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editing, dir.manualMagnetic, dir.declination]);
  const [big, small] = twd ? [5, 1] : [2, 1];
  const name = twd ? 'TWD' : 'TWS';
  const step = (d: number) => {
    navigator.vibrate?.(10); // a short tick: presses register with wet hands
    onChange(twd ? stepTwd(value, d, dir) : stepTws(value, d));
  };
  const btn = (d: number) => (
    <button type="button" className="ws-sp" aria-label={`${name} ${d > 0 ? '+' : '−'}${Math.abs(d)}`} onClick={() => step(d)}>
      {d > 0 ? '+' : '−'}
      {Math.abs(d)}
    </button>
  );
  const commitText = () => {
    setEditing(false);
    const v = twd ? parseTwd(text, dir) : parseTws(text);
    if (v === undefined) setText(fmt(value));
    else onChange(v);
  };
  return (
    <div className="ws-steps">
      {btn(-big)}
      {btn(-small)}
      <label className="ws-val">
        <input
          inputMode="decimal"
          enterKeyHint="done"
          value={text}
          placeholder="—"
          aria-label={twd ? WT.ariaTwd(dirUnit(dir)) : WT.ariaTws}
          onFocus={(e) => {
            setEditing(true);
            e.target.select();
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <span className="u">{twd ? dirUnit(dir) : 'kt'}</span>
      </label>
      {btn(small)}
      {btn(big)}
    </div>
  );
}
