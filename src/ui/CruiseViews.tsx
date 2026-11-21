import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { getKV, setKV } from '../boat/store';
import { distanceNm, type LatLon } from '../nav/geo';
import {
  depthCell,
  destPatch,
  durText,
  estimateKt,
  pushRecent,
  routeNm,
  splitName,
  type CruiseDest,
  type DestPoint,
} from '../race/cruise';
import type { Race } from '../race/types';
import { useApp } from './AppContext';
import { useNav } from './NavContext';
import { useRace } from './RaceContext';
import { useInstruments } from './InstrumentsContext';
import { SheetFrame, hhmm } from './SessionBar';
import { flashSession } from './sessionFlash';
import { CRUISE_TEXT as CT } from './sessionText';
import { cachedDepth, chartDepthAt, type ChartDepth } from './depthCache';
import { useCruiseNav } from './useSession';
import { useOnline } from './hooks';
import { num } from '../format';

export { useOnline };

/**
 * Cruise v1 (P-036): «Πού πάμε;» (setup and in-session sheet), the destination tile
 * of the Live and the depth here. The map parts are in `CruiseMap.tsx` (loaded lazily).
 */

// The map (MapLibre) is large: load it only when «Πάτα στον χάρτη» is opened.
const MapPick = lazy(() => import('./CruiseMap').then((m) => ({ default: m.MapPick })));

export const n1 = (x?: number) => num(x);

const RECENT_KEY = 'recent-destinations';
const RECENT_EVENT = 'recent-destinations';

/** Recent destinations of this account, only on this device (never synced). */
export function useRecents(): [DestPoint[], (d: DestPoint) => void] {
  const { account } = useApp();
  const owner = account?.id ?? '';
  const [list, setList] = useState<DestPoint[]>([]);
  useEffect(() => {
    let live = true;
    const load = () =>
      getKV<Record<string, DestPoint[]>>(RECENT_KEY, {})
        .then((all) => live && setList(all[owner] ?? []))
        .catch(() => undefined);
    load();
    window.addEventListener(RECENT_EVENT, load);
    return () => {
      live = false;
      window.removeEventListener(RECENT_EVENT, load);
    };
  }, [owner]);
  const add = useCallback(
    (d: DestPoint) => {
      getKV<Record<string, DestPoint[]>>(RECENT_KEY, {})
        .then((all) => setKV(RECENT_KEY, { ...all, [owner]: pushRecent(all[owner] ?? [], d) }))
        .then(() => window.dispatchEvent(new Event(RECENT_EVENT)))
        .catch(() => undefined);
    },
    [owner],
  );
  return [list, add];
}

interface Option {
  id: string;
  name: string;
  dest: CruiseDest;
  /** From here (or along the route); undefined without a position. */
  nm?: number;
  saved?: boolean;
}

/** The options of «Πού πάμε;»: recent points, then the saved routes. */
function useOptions(pos: LatLon | undefined): Option[] {
  const nav = useNav();
  const [recents] = useRecents();
  const out: Option[] = recents.map((p, i) => ({
    id: `r:${i}:${p.lat.toFixed(5)},${p.lon.toFixed(5)}`,
    name: p.name,
    dest: { kind: 'point', point: p },
    nm: pos ? distanceNm(pos, p) : undefined,
  }));
  for (const c of nav.courses) {
    if (!c.marks.length) continue;
    out.push({
      id: `c:${c.id}`,
      name: c.name,
      dest: { kind: 'course', id: c.id, name: c.name, marks: c.marks },
      nm: (pos ? distanceNm(pos, c.marks[0]) : 0) + routeNm(c.marks),
      saved: true,
    });
  }
  return out;
}

export const optionId = (d: CruiseDest): string =>
  d.kind === 'none' ? 'none' : d.kind === 'course' ? `c:${d.id}` : `p:${d.point.lat.toFixed(5)},${d.point.lon.toFixed(5)}`;
const sameDest = (o: Option, d: CruiseDest) =>
  d.kind === o.dest.kind &&
  (d.kind === 'course' ? o.dest.kind === 'course' && o.dest.id === d.id : d.kind === 'point' && o.dest.kind === 'point' && distanceNm(o.dest.point, d.point) < 0.01);

/**
 * «Πού πάμε;» (P-036 AC 1, 4): recent destinations, saved routes, «Χωρίς προορισμό»
 * and «Πάτα στον χάρτη». In the setup each option tells the distance and time at
 * the speed of the last cruises; inside a session the distance from here.
 */
export function DestPicker({
  value,
  onPick,
  inSession = false,
  onMapOpen,
}: {
  value: CruiseDest;
  onPick: (d: CruiseDest) => void;
  inSession?: boolean;
  /** Told when «Πάτα στον χάρτη» opens or closes (the setup hides its sticky start meanwhile). */
  onMapOpen?: (open: boolean) => void;
}) {
  const nav = useNav();
  const race = useRace();
  const fix = nav.gps.fix;
  const last = race.session?.track[race.session.track.length - 1];
  const pos = fix ?? (inSession && last ? last : undefined);
  const options = useOptions(pos);
  const kt = estimateKt(race.races);
  const [mapOpen, setMapOpenState] = useState(false);
  const setMapOpen = (open: boolean) => {
    setMapOpenState(open);
    onMapOpen?.(open);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => onMapOpen?.(false), []);
  // A map point that is not (yet) in the recent list is shown too, as picked.
  const extra: Option | undefined =
    value.kind === 'point' && !options.some((o) => sameDest(o, value))
      ? { id: optionId(value), name: value.point.name, dest: value, nm: pos ? distanceNm(pos, value.point) : undefined }
      : undefined;
  const all = extra ? [extra, ...options] : options;

  if (mapOpen)
    return (
      <Suspense fallback={<p className="muted">Φόρτωση χάρτη…</p>}>
        <MapPick
          onCancel={() => setMapOpen(false)}
          onDone={(p) => {
            setMapOpen(false);
            onPick({ kind: 'point', point: p });
          }}
        />
      </Suspense>
    );

  return (
    <div className="dest-picker">
      {all.map((o) => {
        const on = sameDest(o, value);
        const dist =
          o.nm === undefined
            ? CT.needsGps
            : inSession
              ? CT.aboutFromHere(n1(o.nm))
              : `${CT.about(n1(o.nm))}${CT.at(durText((o.nm / kt) * 3600), n1(kt))}`;
        return (
          <button key={o.id} type="button" className={`opt ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onPick(o.dest)}>
            <span className="dest-opt">
              <b>
                {o.name}
                {o.saved && <span className="tag-saved">{CT.saved}</span>}
              </b>
              <span className="small muted">{dist}</span>
            </span>
          </button>
        );
      })}
      <div className="g2">
        <button type="button" className={`opt ${value.kind === 'none' ? 'on' : ''}`} aria-pressed={value.kind === 'none'} onClick={() => onPick({ kind: 'none' })}>
          <b>{CT.noDest}</b>
        </button>
        <button type="button" className="opt" onClick={() => setMapOpen(true)}>
          <b>{CT.tapMap}</b>
        </button>
      </div>
    </div>
  );
}

/** The session's destination as a «Πού πάμε;» value. */
export function destOf(r: Pick<Race, 'dest' | 'marks' | 'courseId' | 'courseName'>): CruiseDest {
  if (!r.marks?.length) return { kind: 'none' };
  if (r.dest) return { kind: 'point', point: r.dest };
  return { kind: 'course', id: r.courseId, name: r.courseName ?? r.marks[r.marks.length - 1].name, marks: r.marks };
}

/** «Πού πάμε;» inside the session: the destination changes without a new session (AC 4). */
export function DestSheet({ onClose }: { onClose: () => void }) {
  const race = useRace();
  const [, addRecent] = useRecents();
  const r = race.session;
  if (!r) return null;
  const pick = (d: CruiseDest) => {
    const cur = race.session;
    if (!cur) return onClose();
    // Saved at once: the new destination must survive the app being closed right after.
    race.save({ ...cur, ...destPatch(d), updatedAt: Date.now() }).catch(() => undefined);
    if (d.kind === 'point') addRecent(d.point);
    flashSession(d.kind === 'none' ? CT.destCleared : CT.destSet(d.kind === 'point' ? d.point.name : d.name));
    onClose();
  };
  return (
    <SheetFrame title={CT.whereTo} onClose={onClose} testId="cruise-dest-sheet">
      <DestPicker value={destOf(r)} onPick={pick} inSession />
      <button type="button" className="btn big-btn wide" onClick={onClose}>
        {CT.cancel}
      </button>
    </SheetFrame>
  );
}

/** ETA line of the destination: «ETA 14:32 · σε 1 ώ 05′», or why there is none. */
export function etaText(c: ReturnType<typeof useCruiseNav>): string {
  if (!c.hasFix && !c.eta) return CT.etaWaitGps;
  if (!c.eta) return CT.etaStill;
  return CT.eta(hhmm(c.eta.at), durText(c.eta.sec));
}

/**
 * Destination tile of the cruise Live (AC 3), after «Ταχύτητα»; without a
 * destination the card «Χωρίς προορισμό» with «Βάλε» (AC 4).
 */
export function DestTile({ onSet }: { onSet: () => void }) {
  const c = useCruiseNav();
  const race = useRace();
  if (!c.name)
    return (
      <div className="rs-tile no-dest" data-testid="cruise-dest-tile">
        <span>
          <span className="lab">{CT.noDestTitle}</span>
          <span className="ab">{CT.noDestSub}</span>
        </span>
        <button type="button" className="btn primary" onClick={onSet}>
          {CT.set}
        </button>
      </div>
    );
  const { place, detail } = splitName(c.name);
  const sub = detail ?? (race.session?.dest ? undefined : CT.route);
  return (
    <button type="button" className="rs-tile dest-tile" data-testid="cruise-dest-tile" onClick={onSet} aria-label={`${c.name}: ${n1(c.leftNm)} ναυτικά μίλια. ${CT.change}`}>
      <span>
        <span className="lab" title={c.name}>
          {place}
        </span>
        <span className="ab">{sub ? `${sub} · ${CT.left}` : CT.left}</span>
        <span className="sub">
          {etaText(c)}
          {race.paused ? ` · ${CT.etaPaused}` : ''}
        </span>
      </span>
      <span className="val">
        {n1(c.leftNm)}
        <small> NM</small>
      </span>
    </button>
  );
}

/**
 * Chart depth where we are (EMODnet), shared with the shallow alert's budget:
 * the cached cell, else one request a minute when the alert is not sampling ahead.
 * Undefined («—») when EMODnet does not answer, offline or without a position.
 */
export function useDepthHere(pos: LatLon | undefined, enabled: boolean): ChartDepth | undefined {
  const [d, setD] = useState<ChartDepth>();
  const ref = useRef(pos);
  ref.current = pos;
  const has = !!pos;
  useEffect(() => {
    if (!enabled || !has) {
      setD(undefined);
      return;
    }
    let stop = false;
    let lastHere: ChartDepth | undefined;
    let lastCell = '';
    const tick = () => {
      const p = ref.current;
      if (!p) return;
      const now = Date.now();
      const cell = depthCell(p);
      const hit = cachedDepth(p, now);
      if (hit) {
        lastHere = hit;
        lastCell = cell;
        setD(hit);
        return;
      }
      // A sample of a nearby cell stays for 2′ (moving at ~6 kn changes cell every ~1′).
      setD(lastHere && (cell === lastCell || now - lastHere.at < 2 * 60_000) ? lastHere : undefined);
      // Shares the minute's request with the shallow alert (every 2nd slot while it samples ahead).
      chartDepthAt(p, now, 'here').then((x) => {
        if (stop || !x) return;
        lastHere = x;
        lastCell = cell;
        setD(x);
      });
    };
    tick();
    const t = window.setInterval(tick, 5_000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [enabled, has]);
  return d;
}

/** Depth for the cruise Live and map: the sounder, else the chart (indicative). */
export function useCruiseDepth(): { sounder?: number; chart?: ChartDepth } {
  const inst = useInstruments();
  const c = useCruiseNav();
  const sounder = inst.live ? inst.values.depth : undefined;
  const online = useOnline();
  const chart = useDepthHere(c.pos, sounder === undefined && online);
  return { sounder, chart: online ? chart : undefined };
}

/** «12,4» or «~12» with one decimal under 10 m. */
export const depthNum = (m: number) => (m < 10 ? n1(m) : String(Math.round(m)));
