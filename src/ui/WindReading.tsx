import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './AppContext';
import { useNav } from './NavContext';
import { useInstruments } from './InstrumentsContext';
import { useRace } from './RaceContext';
import { Icon } from './Icons';
import { useNow } from './SessionBar';
import { ManualWindSheet, type WindCommit } from './ManualWindSheet';
import { useSheetMode } from './hooks';
import { finishPending } from '../race/finishLine';
import { currentCourse } from './courseTracker';
import { WIND_TEXT as WT } from './sessionText';
import { gridField } from '../weather/field';
import {
  ageMin,
  ageWords,
  fmtAge,
  fmtDir,
  fmtKt,
  fromDisplay,
  isStale,
  prefill,
  pushLog,
  toDisplay,
  type Course,
  type DirOpts,
  type LiveNumbers,
  type Prefill,
} from '../race/manualWind';
import type { ManualWind } from '../race/types';

/** What the wind card shows: the wind used now and where it comes from. */
export interface WindView {
  from: LiveNumbers['windFrom'];
  tws?: number;
  twdTrue?: number;
  /** The manual wind, for its age. */
  manual?: ManualWind;
}

/**
 * The card «Άνεμος» (`wind-reading`, P-053): TWS, TWD in the units of the setting and where
 * the wind comes from («όργανα», «από τη Γρήγορη ματιά», «χειροκίνητα · πριν από 4′»).
 * Yellow with «⚠ … · έλεγξέ τον» once the manual wind is 15′ old (red outline at night).
 * The whole card is a button that opens the sheet.
 */
export function WindReading({ w, dir, onOpen, cruise }: { w: WindView; dir: DirOpts; onOpen: () => void; cruise?: boolean }) {
  useNow(10_000); // re-render on its own too; the time is read now, so it agrees with the tiles
  const now = Date.now();
  const man = w.from === 'manual' && !!w.manual;
  const min = man ? ageMin(w.manual!.at, now) : 0;
  const stale = man && isStale(w.manual!.at, now);
  // A04 once, when it gets old (a fixed region, never re-created, never every minute).
  const [say, setSay] = useState('');
  const was = useRef(stale);
  useEffect(() => {
    if (stale && !was.current) setSay(WT.staleSay);
    if (!stale) setSay('');
    was.current = stale;
  }, [stale]);
  if (w.from === 'none') return null;
  const tws = w.tws === undefined ? '—' : fmtKt(w.tws);
  const twd = w.twdTrue === undefined ? '—' : fmtDir(w.twdTrue, dir);
  const src = man ? WT.manual(fmtAge(min)) : w.from === 'instruments' ? WT.fromInst : WT.fromQuick;
  const ariaSrc = man ? WT.ariaManual(ageWords(min)) : w.from === 'instruments' ? WT.ariaInst : WT.ariaQuick;
  return (
    <>
      <button
        type="button"
        className={`wind-card${man ? ' manual' : ''}${stale ? ' stale' : ''}${cruise ? ' cruise' : ''}`}
        data-testid="wind-reading"
        aria-label={WT.aria(tws, twd, ariaSrc, stale)}
        onClick={onOpen}
      >
        <span className="wk">
          <span>{WT.title}</span>
          <span className="wsrc" data-testid="wind-age">
            {stale && <Icon name="warn" size="1em" stroke={2.2} className="wi" />}
            {src}
            {stale && WT.check}
          </span>
        </span>
        <span className="wv">
          <span>
            {tws}
            <small>kt</small>
          </span>
          <span>{twd}</span>
        </span>
        <span className="wgo" aria-hidden="true">
          <Icon name="pen" size={22} stroke={2.2} />
          <span className="wgl">{WT.change}</span>
        </span>
      </button>
      <span className="sr-only" role="status">
        {say}
      </span>
    </>
  );
}

/** «Χωρίς άνεμο: …» with «Βάλε άνεμο» (`wind-prompt`), race and training (AC 47–48). */
export function NoWindPrompt({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="wind-prompt" role="status">
      <p>
        <b>{WT.noWindLead}</b> {WT.noWindText}
      </p>
      <button type="button" className="btn primary big-btn wide" data-testid="wind-prompt" onClick={onOpen}>
        <Icon name="wind" size="1.2em" stroke={2.2} /> {WT.setWind}
      </button>
    </div>
  );
}

/** Cruise without wind (AC 49): «Άνεμος —» and a small «Βάλε», no warning. */
export function CruiseNoWind({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="wind-row">
      <span>
        <b>{WT.title} —</b>
        <span className="small muted">TWS / TWD</span>
      </span>
      <button type="button" className="btn" data-testid="wind-prompt" aria-label={WT.setWind} onClick={onOpen}>
        {WT.set}
      </button>
    </div>
  );
}

/** The forecast wind at the boat now, when the stored forecast covers it (for the sheet's first values). */
function useForecastNow(pos?: { lat: number; lon: number }) {
  const nav = useNav();
  const f = nav.forecast;
  const field = useMemo(() => (f ? gridField(f) : undefined), [f]);
  return () => {
    const now = Date.now();
    if (!f || !field || !pos || now < f.times[0] - 3600_000 || now > f.times[f.times.length - 1]) return undefined;
    const w = field.at(pos.lat, pos.lon, now);
    return { twd: w.twd, tws: w.tws, at: f.fetchedAt };
  };
}

/**
 * The sheet «Άνεμος» of the running session: opens from the card or «Βάλε άνεμο»; every change
 * is stored in the session at once (AC 29), with its log (AC 9–13).
 */
export function useSessionWindSheet(nb: LiveNumbers) {
  const { settings } = useApp();
  const inst = useInstruments();
  const nav = useNav();
  const race = useRace();
  const s = race.session;
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState<Prefill>();
  const fix = nav.gps.fix;
  const forecastNow = useForecastNow(fix ?? s?.marks[0]);
  const id = s?.id;
  const { patchRace } = race;
  const commit = useCallback(
    (c: WindCommit) => {
      if (!id) return;
      patchRace(id, (r) => ({
        ...(c.manual ? { manualWind: c.manual } : {}),
        ...(c.log?.length ? { windLog: c.log.reduce((l, e) => pushLog(l, e), r.windLog) } : {}),
      })).catch(() => undefined); // the strip offers «Ξανά»
    },
    [id, patchRace],
  );
  // «Τερματίσατε στις …;» outranks the sheet (P-040 AC 19): a tap does nothing; an open sheet waits
  // hidden with its draft (owner's answer 4) and comes back on «Όχι»; «Ναι» ends the session and drops it.
  const hold = finishPending(s);
  const sheetMode = useSheetMode();
  const openSheet = () => {
    if (hold) return;
    if (!s?.manualWind) {
      const iv = inst.live ? inst.values : {};
      setFirst(prefill({ live: inst.live, twd: iv.twd, tws: iv.tws }, forecastNow(), settings));
    }
    setOpen(true);
  };
  const iv = inst.live ? inst.values : {};
  const offTo = iv.tws !== undefined ? 'instruments' : hasTyped() ? 'quick' : 'none';
  const course: Course = nb.course ?? currentCourse(inst, fix, settings.declination);
  const sheet =
    open && s ? (
      <ManualWindSheet
        manual={s.manualWind}
        offTo={offTo}
        instLive={inst.live}
        prefill={first}
        course={course}
        dir={settings}
        keepDraft
        commit={commit}
        onClose={() => setOpen(false)}
      />
    ) : null;
  const shown = sheet && hold && sheetMode !== 'side' ? <div hidden>{sheet}</div> : sheet;
  const view: WindView = { from: nb.windFrom, tws: nb.tws, twdTrue: nb.twdTrue, manual: s?.manualWind };
  return { openSheet, sheet: shown, view };
}

const hasTyped = () => {
  try {
    return typeof (JSON.parse(localStorage.getItem('live-state') ?? '{}') as { windTypedAt?: unknown }).windTypedAt === 'number';
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// «Γρήγορη ματιά» without a polar (BasicLive, AC 39–40): the same sheet, stored in `live-state`.

interface BasicState {
  twd?: number | null;
  tws?: number | null;
  windAt?: number;
  windManualOn?: boolean;
}

function readBasic(): BasicState {
  try {
    return JSON.parse(localStorage.getItem('live-state') ?? '{}') as BasicState;
  } catch {
    return {};
  }
}

function patchLiveState(patch: Record<string, unknown>) {
  try {
    const raw = localStorage.getItem('live-state');
    localStorage.setItem('live-state', JSON.stringify({ ...(raw ? JSON.parse(raw) : {}), ...patch }));
  } catch {
    /* storage unavailable */
  }
}

/**
 * The manual wind of «Γρήγορη ματιά» without a polar: `live-state` `tws`, `twd` (in the units on
 * screen, as LiveView keeps it), `windInput: 'twd'`, `windAt`, `windManualOn`; using it counts
 * as typing a wind there (`windTypedAt`, AC 46).
 */
export function useBasicWind() {
  const { settings } = useApp();
  const inst = useInstruments();
  const nav = useNav();
  const [st, setSt] = useState<BasicState>(readBasic);
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState<Prefill>();
  const fix = nav.gps.fix;
  const forecastNow = useForecastNow(fix);
  const manual: ManualWind | undefined =
    typeof st.windAt === 'number' && typeof st.twd === 'number' && typeof st.tws === 'number'
      ? { on: !!st.windManualOn, twdTrue: fromDisplay(st.twd, settings), tws: st.tws, at: st.windAt }
      : undefined;
  const commit = useCallback(
    (c: WindCommit) => {
      const m = c.manual;
      if (!m) return; // the log is a session's only
      const patch: BasicState & Record<string, unknown> = {
        tws: m.tws,
        twd: Math.round(toDisplay(m.twdTrue, settings)),
        windInput: 'twd',
        windAt: m.at,
        windManualOn: m.on,
        ...(m.on ? { windTypedAt: Date.now() } : {}),
      };
      patchLiveState(patch);
      setSt((p) => ({ ...p, ...patch }));
    },
    [settings],
  );
  const course = currentCourse(inst, fix, settings.declination);
  const openSheet = () => {
    if (!manual) {
      const iv = inst.live ? inst.values : {};
      setFirst(prefill({ live: inst.live, twd: iv.twd, tws: iv.tws }, forecastNow(), settings));
    }
    setOpen(true);
  };
  const iv = inst.live ? inst.values : {};
  const sheet = open ? (
    <ManualWindSheet
      basic
      manual={manual}
      offTo={iv.tws !== undefined ? 'instruments' : 'none'}
      instLive={inst.live}
      prefill={first}
      course={course}
      dir={settings}
      commit={commit}
      onClose={() => setOpen(false)}
    />
  ) : null;
  return { manual, course, openSheet, sheet };
}
