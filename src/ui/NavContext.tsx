import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { deleteCourse, getKV, listCourses, restoreCourse, saveCourse, setKV, type Course } from '../boat/store';
import type { Mark, RouteResult } from '../routing/isochrones';
import { routeInWorker, type WindSpec } from '../routing/protocol';
import { fetchOpenMeteo } from '../weather/openMeteo';
import { normalizeModel } from '../weather/models';
import { REMOTE_CHANGE } from '../sync/sync';
import { fetchComparison, type Comparison } from '../weather/compare';
import { advisorConfig, advisorReady, fetchWindySeries } from '../ai/client';
import { SARONIKOS_BOX, type GridForecast, type WindSample } from '../weather/types';
import { calibrationFrom, gridField } from '../weather/field';
import { useApp } from './AppContext';
import { useGps, useStoredState, type GpsFix, type GpsStatus } from './hooks';
import { queryGeoPermission, shouldWatchGps, toGeoPermission, type GeoPermission } from './gpsGate';
import { useInstruments } from './InstrumentsContext';
import { angle, dir, num, qty } from '../format';
import { forecastRange, widenRange, marksKey, plannedKey, shouldAutoRefresh, type PlanTarget, type StoredPlan } from '../routing/planTarget';

export interface PlanSettings {
  /** datetime-local value (device local time). */
  startLocal: string;
  windSource: 'forecast' | 'uniform';
  model: string;
  tws: number;
  twd: number;
  stepMin: number;
  tackPenaltySec: number;
  gybePenaltySec: number;
  scoringOptionId: string;
  showIsochrones: boolean;
  showSeamarks: boolean;
  showWind: boolean;
  /** Map look: nautical chart (default) or the street map. */
  mapChart: 'nautical' | 'road';
  showDepth: boolean;
}

function defaultStart(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

const DEFAULT_PLAN: PlanSettings = {
  startLocal: defaultStart(),
  windSource: 'forecast',
  model: 'best_match',
  tws: 12,
  twd: 0,
  stepMin: 10,
  tackPenaltySec: 40,
  gybePenaltySec: 25,
  scoringOptionId: 'coastal',
  showIsochrones: false,
  showSeamarks: true,
  showWind: true,
  mapChart: 'nautical',
  showDepth: true,
};

interface NavState {
  courses: Course[];
  course?: Course;
  selectCourse: (id: string | undefined) => void;
  updateCourse: (c: Course) => void;
  newCourse: (name: string) => Course;
  removeCourse: (id: string) => Promise<void>;
  restoreCourse: (c: Course) => Promise<void>;

  plan: PlanSettings;
  setPlan: (p: Partial<PlanSettings>) => void;

  forecast?: GridForecast;
  forecastStatus: { busy: boolean; error?: string; beyond?: boolean };
  /**
   * P-067: the forecast for a target's start (default: «Διαδρομές μου», the map's «Ώρα εκκίνησης»),
   * from [now − 1 h, max(now, start) + 2 days], cut at the model horizon; nothing past it.
   */
  loadForecast: (target?: PlanTarget) => Promise<void>;
  /** Stops a slow download («Άκυρο»). */
  cancelForecast: () => void;
  /** KA-Λ9: one automatic refresh (old forecast, start within 72 h, once in 6 h). Resolves true when it refreshed. */
  autoRefreshForecast: (target: PlanTarget) => Promise<boolean>;

  /** Many models compared at one point (start mark by default). */
  comparison?: Comparison;
  comparisonStatus: { busy: boolean; error?: string };
  loadComparison: (target?: PlanTarget) => Promise<void>;

  /** «Διαδρομές μου»: the course and the «Ώρα εκκίνησης» of the map (KA-Λ14). */
  coursesTarget: PlanTarget;
  /** The route of «Διαδρομές μου» (the old `planned` key). */
  planned?: RouteResult;
  planStatus: { busy: boolean; error?: string };
  /** Computes for a target; a race's route is kept as `planned:<raceId>`, a session's from-here route only in memory. */
  computePlan: (target?: PlanTarget, opts?: { transient?: boolean }) => Promise<void>;
  /** Routes stored per race (loaded on demand); null: none. */
  racePlans: Record<string, StoredPlan | null>;
  loadRacePlan: (raceId: string) => void;
  /** A route computed from the boat's position inside a session (not stored). */
  transientPlan?: RouteResult;

  /** Live re-routing from the current position. */
  nextMark: number;
  setNextMark: (i: number) => void;
  liveRoute?: RouteResult;
  liveStatus: { busy: boolean; error?: string; note?: string; at?: number };
  /** `howMeasured` is shown in the note, e.g. "μέσος όρος 4′ από 12 μετρήσεις". */
  rerouteLive: (observed?: WindSample, howMeasured?: string) => Promise<void>;

  gps: { status: GpsStatus; fix?: GpsFix; message?: string };
  /** The phone's GPS is being watched (switch on and started). */
  gpsEnabled: boolean;
  /** The GPS switch; turning it on is a user action, so it also starts the GPS. */
  setGpsEnabled: (v: boolean) => void;
  /** Starts the phone's GPS for something the user did (may show the permission prompt). */
  requestGps: () => void;
}

const Ctx = createContext<NavState | null>(null);

/** A `datetime-local` text → ms; undefined when empty or wrong (never a silent «now», P-064). */
export function localToMs(s: string): number | undefined {
  if (!s) return undefined;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : undefined;
}

/** ms → the `datetime-local` text kept in the plan settings. */
export function msToLocal(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const AUTO_KEY = 'forecast-auto-at';

export function NavProvider({ children }: { children: ReactNode }) {
  const { activeBoat, settings } = useApp();
  const [courses, setCourses] = useState<Course[]>([]);
  const [ui, setUi] = useStoredState<{ courseId?: string; nextMark: number; gps: boolean }>('nav-ui', {
    nextMark: 1,
    gps: true,
  });
  const [plan, setPlanState] = useStoredState<PlanSettings>('plan-settings', DEFAULT_PLAN);
  const [forecast, setForecast] = useState<GridForecast>();
  const forecastRef = useRef<GridForecast>();
  forecastRef.current = forecast;
  const [forecastStatus, setForecastStatus] = useState<NavState['forecastStatus']>({ busy: false });
  const [planned, setPlanned] = useState<RouteResult>();
  const [racePlans, setRacePlans] = useState<Record<string, StoredPlan | null>>({});
  const [transientPlan, setTransientPlan] = useState<RouteResult>();
  const forecastAbort = useRef<AbortController>();
  const [comparison, setComparison] = useState<Comparison>();
  const [comparisonStatus, setComparisonStatus] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const [planStatus, setPlanStatus] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const [liveRoute, setLiveRoute] = useState<RouteResult>();
  const [liveStatus, setLiveStatus] = useState<NavState['liveStatus']>({ busy: false });
  // Watch at load only when the permission is already known, so a reload never prompts.
  const [geoPerm, setGeoPerm] = useState<GeoPermission>('unknown');
  const [gpsRequested, setGpsRequested] = useState(false);
  useEffect(() => {
    let status: PermissionStatus | undefined;
    let gone = false;
    const onChange = () => status && setGeoPerm(toGeoPermission(status.state));
    queryGeoPermission().then((r) => {
      if (gone) return;
      setGeoPerm(r.permission);
      status = r.status;
      status?.addEventListener?.('change', onChange);
    });
    return () => {
      gone = true;
      status?.removeEventListener?.('change', onChange);
    };
  }, []);
  const gpsOn = shouldWatchGps({ enabled: ui.gps, permission: geoPerm, requested: gpsRequested });
  const requestGps = useCallback(() => setGpsRequested(true), []);
  const phoneGps = useGps(gpsOn);
  // Position from the boat's instruments when they are live; the phone's GPS otherwise.
  const inst = useInstruments();
  const iv = inst.values;
  const instFix = inst.live && iv.lat !== undefined && iv.lon !== undefined;
  const instT = instFix ? (inst.at.lat ?? Date.now()) : 0;
  const gps = useMemo(
    () =>
      instFix
        ? { status: 'ok' as const, fix: { lat: iv.lat!, lon: iv.lon!, accuracy: 5, t: instT, sog: iv.sog, cog: iv.cog }, message: undefined }
        : phoneGps,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instFix, instT, phoneGps],
  );
  const saveTimer = useRef<number>();

  useEffect(() => {
    (async () => {
      setCourses(await listCourses());
      const f = await getKV<GridForecast | null>('forecast', null);
      if (f) setForecast(f);
      const p = await getKV<RouteResult | null>('planned', null);
      if (p) setPlanned(p);
      const c = await getKV<Comparison | null>('comparison', null);
      if (c) setComparison(c);
    })().catch(() => undefined);
  }, []);

  // Courses pulled from the account by the sync.
  useEffect(() => {
    const h = () => listCourses().then(setCourses).catch(() => undefined);
    window.addEventListener(REMOTE_CHANGE, h);
    return () => window.removeEventListener(REMOTE_CHANGE, h);
  }, []);

  const course = courses.find((c) => c.id === ui.courseId) ?? courses[0];

  const updateCourse = useCallback((c: Course) => {
    setCourses((cs) => {
      const exists = cs.some((x) => x.id === c.id);
      return exists ? cs.map((x) => (x.id === c.id ? c : x)) : [c, ...cs];
    });
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveCourse(c).catch(() => undefined), 400);
  }, []);

  const newCourse = useCallback(
    (name: string) => {
      const c: Course = { id: `c-${Date.now().toString(36)}`, name, marks: [], updatedAt: Date.now() };
      updateCourse(c);
      setUi((u) => ({ ...u, courseId: c.id, nextMark: 1 }));
      return c;
    },
    [updateCourse, setUi],
  );

  const coursesTarget = useMemo<PlanTarget>(
    () => ({ start: localToMs(plan.startLocal), marks: course?.marks ?? [], label: course?.name ?? '' }),
    [plan.startLocal, course],
  );

  const loadForecast = useCallback(
    async (target?: PlanTarget) => {
      const t = target ?? coursesTarget;
      const model = normalizeModel(plan.model);
      const now = Date.now();
      const asked = forecastRange(now, t.start ?? t.day, model);
      // Past the model horizon: no request (it would fail), the label says when to try again.
      if ('beyond' in asked) return setForecastStatus({ busy: false, beyond: true });
      // Never narrower than the forecast on the device (QA Μ2: the Home card must not cut a race off).
      const range = widenRange(asked, forecastRef.current, now, model);
      forecastAbort.current?.abort();
      const ac = new AbortController();
      forecastAbort.current = ac;
      setForecastStatus({ busy: true });
      try {
        const f = await fetchOpenMeteo({ box: SARONIKOS_BOX, step: 0.1, model, startDate: range.startDate, endDate: range.endDate }, ac.signal);
        setForecast(f);
        await setKV('forecast', f);
        setForecastStatus({ busy: false });
      } catch (e) {
        if (ac.signal.aborted) return setForecastStatus({ busy: false });
        setForecastStatus({
          busy: false,
          error: navigator.onLine === false ? 'Χωρίς ίντερνετ: κρατάμε την αποθηκευμένη πρόγνωση.' : (e as Error).message,
        });
      } finally {
        if (forecastAbort.current === ac) forecastAbort.current = undefined;
      }
    },
    [coursesTarget, plan.model],
  );

  const cancelForecast = useCallback(() => forecastAbort.current?.abort(), []);

  const autoRefreshForecast = useCallback(
    async (target: PlanTarget) => {
      const now = Date.now();
      const lastAutoAt = await getKV<number | null>(AUTO_KEY, null).catch(() => null);
      if (!shouldAutoRefresh({ now, start: target.start, fetchedAt: forecast?.fetchedAt, lastAutoAt: lastAutoAt ?? undefined, online: navigator.onLine !== false })) return false;
      await setKV(AUTO_KEY, now).catch(() => undefined);
      const before = forecast?.fetchedAt;
      await loadForecast(target);
      const f = await getKV<GridForecast | null>('forecast', null).catch(() => null);
      return !!f && f.fetchedAt !== before;
    },
    [forecast?.fetchedAt, loadForecast],
  );

  const loadRacePlan = useCallback((raceId: string) => {
    getKV<StoredPlan | null>(plannedKey(raceId), null)
      .then((p) => setRacePlans((m) => (m[raceId] === p ? m : { ...m, [raceId]: p })))
      .catch(() => undefined);
  }, []);

  const loadComparison = useCallback(async (target?: PlanTarget) => {
    const tg = target ?? coursesTarget;
    setComparisonStatus({ busy: true });
    try {
      // The same time and marks as the target (KA-Λ12); a target without a time: its day, else now.
      const start = tg.start ?? tg.day ?? Date.now();
      const first = tg.marks[0];
      const fix = gps.fix;
      const pt = first
        ? { lat: first.lat, lon: first.lon, place: first.name }
        : fix
          ? { lat: fix.lat, lon: fix.lon, place: 'Θέση GPS' }
          : { lat: 37.75, lon: 23.55, place: 'Κέντρο Σαρωνικού' };
      const own = tg.raceId ? racePlans[tg.raceId]?.route : planned;
      const end = own && own.start === start ? own.end : start + 8 * 3_600_000;
      const cfg = advisorConfig(settings);
      const windy = advisorReady(cfg) ? (la: number, lo: number) => fetchWindySeries(cfg, la, lo) : undefined;
      const c = await fetchComparison(pt.lat, pt.lon, pt.place, start, end, windy);
      setComparison(c);
      await setKV('comparison', c);
      setComparisonStatus({ busy: false });
    } catch (e) {
      setComparisonStatus({
        busy: false,
        error: navigator.onLine === false ? 'Χωρίς ίντερνετ: δείχνουμε την αποθηκευμένη σύγκριση.' : (e as Error).message,
      });
    }
  }, [coursesTarget, gps.fix, planned, racePlans, settings]);

  const windSpec = useCallback(
    (calibration?: { twsFactor: number; twdOffset: number }): WindSpec | undefined => {
      if (plan.windSource === 'uniform') return { kind: 'uniform', tws: plan.tws, twd: plan.twd };
      return forecast ? { kind: 'grid', forecast, calibration } : undefined;
    },
    [plan.windSource, plan.tws, plan.twd, forecast],
  );

  const options = useMemo(
    () => ({ stepMin: plan.stepMin, tackPenaltySec: plan.tackPenaltySec, gybePenaltySec: plan.gybePenaltySec }),
    [plan.stepMin, plan.tackPenaltySec, plan.gybePenaltySec],
  );

  const computePlan = useCallback(
    async (target?: PlanTarget, opts?: { transient?: boolean }) => {
      const tg = target ?? coursesTarget;
      if (!activeBoat || tg.marks.length < 2) return;
      if (tg.start === undefined) {
        setPlanStatus({ busy: false, error: 'Βάλε ώρα εκκίνησης για τη βέλτιστη διαδρομή.' });
        return;
      }
      const wind = windSpec();
      if (!wind) {
        setPlanStatus({ busy: false, error: 'Κατέβασε πρώτα πρόγνωση ή διάλεξε σταθερό άνεμο.' });
        return;
      }
      setPlanStatus({ busy: true });
      try {
        // P-067 KA-Λ2: the target's start and marks, never the map's time or `nav.course` for a race.
        const r = await routeInWorker({ boat: activeBoat, marks: tg.marks, startTime: tg.start, wind, options });
        if (opts?.transient) setTransientPlan(r);
        else if (tg.raceId) {
          const sp: StoredPlan = { route: r, start: tg.start, marksKey: marksKey(tg.marks), forecastAt: wind.kind === 'grid' ? forecast?.fetchedAt : undefined, at: Date.now() };
          setRacePlans((m) => ({ ...m, [tg.raceId!]: sp }));
          setKV(plannedKey(tg.raceId), sp).catch(() => undefined);
        } else {
          setPlanned(r);
          setKV('planned', r).catch(() => undefined);
        }
        setPlanStatus({ busy: false });
      } catch (e) {
        setPlanStatus({ busy: false, error: (e as Error).message });
      }
    },
    [activeBoat, coursesTarget, windSpec, options, forecast?.fetchedAt],
  );

  const rerouteLive = useCallback(
    async (observed?: WindSample, howMeasured?: string) => {
      if (!activeBoat || !course) return;
      const fix = gps.fix;
      if (!fix) {
        setLiveStatus({ busy: false, error: 'Χρειάζεται θέση GPS.' });
        return;
      }
      const remaining = course.marks.slice(Math.max(1, ui.nextMark));
      if (remaining.length === 0) {
        setLiveStatus({ busy: false, error: 'Δεν υπάρχουν άλλες σημαδούρες.' });
        return;
      }
      const now = Date.now();
      let wind: WindSpec | undefined;
      let note: string | undefined;
      if (observed && plan.windSource === 'forecast' && forecast) {
        const fc = gridField(forecast).at(fix.lat, fix.lon, now);
        const cal = calibrationFrom(fc, observed);
        wind = { kind: 'grid', forecast, calibration: cal };
        note = `Πρόγνωση εδώ ${qty(fc.tws, 'kt', 0)} / ${dir(fc.twd, 'T')}, μετρημένο ${qty(observed.tws, 'kt', 0)} / ${dir(observed.twd, 'T')} → διόρθωση ×${num(cal.twsFactor, 2)}, ${cal.twdOffset >= 0 ? '+' : ''}${angle(cal.twdOffset)}.`;
      } else if (observed && (plan.windSource === 'uniform' || !forecast)) {
        wind = { kind: 'uniform', tws: observed.tws, twd: observed.twd };
        note = `Σταθερός άνεμος από τις ενδείξεις: ${qty(observed.tws, 'kt', 0)} / ${dir(observed.twd, 'T')}.`;
      } else {
        wind = windSpec();
        note = 'Χωρίς μετρημένο TWD: χρησιμοποιείται η πρόγνωση όπως είναι.';
      }
      if (observed && howMeasured) note = `${note} Μετρημένος άνεμος: ${howMeasured}.`;
      if (!wind) {
        setLiveStatus({ busy: false, error: 'Δεν υπάρχει πρόγνωση ή ενδείξεις ανέμου.' });
        return;
      }
      setLiveStatus({ busy: true });
      try {
        const here: Mark = { id: 'gps', name: 'Θέση', lat: fix.lat, lon: fix.lon };
        const r = await routeInWorker({ boat: activeBoat, marks: [here, ...remaining], startTime: now, wind, options });
        setLiveRoute(r);
        setLiveStatus({ busy: false, note, at: now });
      } catch (e) {
        setLiveStatus({ busy: false, error: (e as Error).message });
      }
    },
    [activeBoat, course, gps.fix, ui.nextMark, plan.windSource, forecast, windSpec, options],
  );

  const value: NavState = {
    courses,
    course,
    selectCourse: (id) => setUi((u) => ({ ...u, courseId: id, nextMark: 1 })),
    updateCourse,
    newCourse,
    removeCourse: async (id) => {
      await deleteCourse(id);
      setCourses((cs) => cs.filter((c) => c.id !== id));
    },
    restoreCourse: async (c) => {
      await restoreCourse(c);
      setCourses((cs) => [c, ...cs.filter((x) => x.id !== c.id)]);
      setUi((u) => ({ ...u, courseId: c.id }));
    },
    plan,
    setPlan: (p) => setPlanState((prev) => ({ ...prev, ...p })),
    forecast,
    forecastStatus,
    loadForecast,
    cancelForecast,
    autoRefreshForecast,
    comparison,
    comparisonStatus,
    loadComparison,
    coursesTarget,
    planned,
    planStatus,
    computePlan,
    racePlans,
    loadRacePlan,
    transientPlan,
    nextMark: Math.min(Math.max(1, ui.nextMark), Math.max(1, (course?.marks.length ?? 2) - 1)),
    setNextMark: (i) => setUi((u) => ({ ...u, nextMark: i })),
    liveRoute,
    liveStatus,
    rerouteLive,
    gps,
    gpsEnabled: gpsOn,
    setGpsEnabled: (v) => {
      if (v) setGpsRequested(true);
      setUi((u) => ({ ...u, gps: v }));
    },
    requestGps,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNav(): NavState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNav outside NavProvider');
  return v;
}
