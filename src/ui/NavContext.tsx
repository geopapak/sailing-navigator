import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { deleteCourse, getKV, listCourses, saveCourse, setKV, type Course } from '../boat/store';
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
};

interface NavState {
  courses: Course[];
  course?: Course;
  selectCourse: (id: string | undefined) => void;
  updateCourse: (c: Course) => void;
  newCourse: (name: string) => Course;
  removeCourse: (id: string) => Promise<void>;

  plan: PlanSettings;
  setPlan: (p: Partial<PlanSettings>) => void;

  forecast?: GridForecast;
  forecastStatus: { busy: boolean; error?: string };
  loadForecast: () => Promise<void>;

  /** Many models compared at one point (start mark by default). */
  comparison?: Comparison;
  comparisonStatus: { busy: boolean; error?: string };
  loadComparison: () => Promise<void>;

  planned?: RouteResult;
  planStatus: { busy: boolean; error?: string };
  computePlan: () => Promise<void>;

  /** Live re-routing from the current position. */
  nextMark: number;
  setNextMark: (i: number) => void;
  liveRoute?: RouteResult;
  liveStatus: { busy: boolean; error?: string; note?: string; at?: number };
  rerouteLive: (observed?: WindSample) => Promise<void>;

  gps: { status: GpsStatus; fix?: GpsFix; message?: string };
  gpsEnabled: boolean;
  setGpsEnabled: (v: boolean) => void;
}

const Ctx = createContext<NavState | null>(null);

export function localToMs(s: string): number {
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function NavProvider({ children }: { children: ReactNode }) {
  const { activeBoat, settings } = useApp();
  const [courses, setCourses] = useState<Course[]>([]);
  const [ui, setUi] = useStoredState<{ courseId?: string; nextMark: number; gps: boolean }>('nav-ui', {
    nextMark: 1,
    gps: true,
  });
  const [plan, setPlanState] = useStoredState<PlanSettings>('plan-settings', DEFAULT_PLAN);
  const [forecast, setForecast] = useState<GridForecast>();
  const [forecastStatus, setForecastStatus] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const [planned, setPlanned] = useState<RouteResult>();
  const [comparison, setComparison] = useState<Comparison>();
  const [comparisonStatus, setComparisonStatus] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const [planStatus, setPlanStatus] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const [liveRoute, setLiveRoute] = useState<RouteResult>();
  const [liveStatus, setLiveStatus] = useState<NavState['liveStatus']>({ busy: false });
  const gps = useGps(ui.gps);
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

  const loadForecast = useCallback(async () => {
    setForecastStatus({ busy: true });
    try {
      const start = localToMs(plan.startLocal);
      const from = Math.min(start, Date.now());
      const f = await fetchOpenMeteo({
        box: SARONIKOS_BOX,
        step: 0.1,
        model: normalizeModel(plan.model),
        startDate: isoDate(from - 3600_000),
        endDate: isoDate(start + 2 * 86400_000),
      });
      setForecast(f);
      await setKV('forecast', f);
      setForecastStatus({ busy: false });
    } catch (e) {
      setForecastStatus({
        busy: false,
        error: navigator.onLine === false ? 'Δεν υπάρχει σύνδεση. Χρησιμοποιείται η αποθηκευμένη πρόγνωση.' : (e as Error).message,
      });
    }
  }, [plan.startLocal, plan.model]);

  const loadComparison = useCallback(async () => {
    setComparisonStatus({ busy: true });
    try {
      const start = localToMs(plan.startLocal);
      const first = course?.marks[0];
      const fix = gps.fix;
      const pt = first
        ? { lat: first.lat, lon: first.lon, place: first.name }
        : fix
          ? { lat: fix.lat, lon: fix.lon, place: 'Θέση GPS' }
          : { lat: 37.75, lon: 23.55, place: 'Κέντρο Σαρωνικού' };
      const end = planned && planned.start === start ? planned.end : start + 8 * 3_600_000;
      const cfg = advisorConfig(settings);
      const windy = advisorReady(cfg) ? (la: number, lo: number) => fetchWindySeries(cfg, la, lo) : undefined;
      const c = await fetchComparison(pt.lat, pt.lon, pt.place, start, end, windy);
      setComparison(c);
      await setKV('comparison', c);
      setComparisonStatus({ busy: false });
    } catch (e) {
      setComparisonStatus({
        busy: false,
        error: navigator.onLine === false ? 'Δεν υπάρχει σύνδεση. Δείχνεται η αποθηκευμένη σύγκριση.' : (e as Error).message,
      });
    }
  }, [plan.startLocal, course, gps.fix, planned, settings]);

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

  const computePlan = useCallback(async () => {
    if (!activeBoat || !course) return;
    const wind = windSpec();
    if (!wind) {
      setPlanStatus({ busy: false, error: 'Κατέβασε πρώτα πρόγνωση ή διάλεξε σταθερό άνεμο.' });
      return;
    }
    setPlanStatus({ busy: true });
    try {
      const r = await routeInWorker({ boat: activeBoat, marks: course.marks, startTime: localToMs(plan.startLocal), wind, options });
      setPlanned(r);
      setKV('planned', r).catch(() => undefined);
      setPlanStatus({ busy: false });
    } catch (e) {
      setPlanStatus({ busy: false, error: (e as Error).message });
    }
  }, [activeBoat, course, windSpec, plan.startLocal, options]);

  const rerouteLive = useCallback(
    async (observed?: WindSample) => {
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
        note = `Πρόγνωση εδώ ${fc.tws.toFixed(0)} kt / ${fc.twd.toFixed(0)}°, μετρημένο ${observed.tws.toFixed(0)} kt / ${observed.twd.toFixed(0)}° → διόρθωση ×${cal.twsFactor.toFixed(2)}, ${cal.twdOffset >= 0 ? '+' : ''}${cal.twdOffset.toFixed(0)}°.`;
      } else if (observed && (plan.windSource === 'uniform' || !forecast)) {
        wind = { kind: 'uniform', tws: observed.tws, twd: observed.twd };
        note = `Σταθερός άνεμος από τις ενδείξεις: ${observed.tws.toFixed(0)} kt / ${observed.twd.toFixed(0)}°.`;
      } else {
        wind = windSpec();
        note = 'Χωρίς μετρημένο TWD: χρησιμοποιείται η πρόγνωση όπως είναι.';
      }
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
    plan,
    setPlan: (p) => setPlanState((prev) => ({ ...prev, ...p })),
    forecast,
    forecastStatus,
    loadForecast,
    comparison,
    comparisonStatus,
    loadComparison,
    planned,
    planStatus,
    computePlan,
    nextMark: Math.min(Math.max(1, ui.nextMark), Math.max(1, (course?.marks.length ?? 2) - 1)),
    setNextMark: (i) => setUi((u) => ({ ...u, nextMark: i })),
    liveRoute,
    liveStatus,
    rerouteLive,
    gps,
    gpsEnabled: ui.gps,
    setGpsEnabled: (v) => setUi((u) => ({ ...u, gps: v })),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNav(): NavState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNav outside NavProvider');
  return v;
}
