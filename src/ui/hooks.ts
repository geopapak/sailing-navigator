import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { MS_TO_KT, bearingDeg, distanceNm } from '../nav/geo';

export type GpsStatus = 'off' | 'waiting' | 'ok' | 'denied' | 'unavailable';

export interface GpsFix {
  lat: number;
  lon: number;
  accuracy: number;
  t: number;
  /** Speed over ground, kt. */
  sog?: number;
  /** Course over ground, degrees true. */
  cog?: number;
  /** SOG/COG worked out from the positions (the device gave none). */
  fromFixes?: boolean;
}

/** Fallback SOG/COG uses fixes this old … */
export const FALLBACK_MIN_MS = 10_000;
/** … up to this old (P-056 §ΣΤ: phones that give a fix every 30″ or more). */
export const FALLBACK_MAX_MS = 120_000;
/** Moved less than this (m) … */
export const STILL_M = 4;
/** … in at least this long: still, SOG 0,0 and no COG. */
export const STILL_MS = 30_000;

/**
 * SOG/COG from earlier fixes when the device gives none (P-056 §ΣΤ). The reference is the
 * oldest fix of the last 30″ that is at least 10″ old (as before 0.19.1), else, with sparse
 * fixes, the newest one up to 120″ old: a long chord would show a wrong COG for two minutes
 * after a tack. Less than 4 m in 30″ or more is «still»: SOG 0, COG none.
 */
export function fallbackSogCog(history: Pick<GpsFix, 'lat' | 'lon' | 't'>[], f: Pick<GpsFix, 'lat' | 'lon' | 't'>): { sog: number; cog?: number } | undefined {
  const win = history.filter((x) => f.t - x.t >= FALLBACK_MIN_MS && f.t - x.t <= FALLBACK_MAX_MS).sort((a, b) => a.t - b.t);
  if (!win.length) return undefined;
  const longAgo = win.filter((x) => f.t - x.t >= STILL_MS).pop();
  if (longAgo && distanceNm(longAgo, f) * 1852 < STILL_M) return { sog: 0 };
  const ref = win.find((x) => f.t - x.t <= STILL_MS) ?? win[win.length - 1];
  const d = distanceNm(ref, f);
  if (d * 1852 < STILL_M) return undefined;
  const sog = d / ((f.t - ref.t) / 3_600_000);
  return sog > 0.5 ? { sog, cog: bearingDeg(ref, f) } : { sog };
}

/** Watches the device position. SOG/COG come from the device when available, otherwise from recent fixes. */
export function useGps(enabled: boolean): {
  status: GpsStatus;
  fix?: GpsFix;
  message?: string;
} {
  const [status, setStatus] = useState<GpsStatus>('off');
  const [fix, setFix] = useState<GpsFix>();
  const [message, setMessage] = useState<string>();
  const history = useRef<GpsFix[]>([]);

  useEffect(() => {
    if (!enabled) {
      // A switched-off GPS must not keep showing the last position.
      setStatus('off');
      setFix(undefined);
      setMessage(undefined);
      history.current = [];
      return;
    }
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      setMessage('Η συσκευή δεν υποστηρίζει GPS.');
      return;
    }
    setStatus('waiting');
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const c = pos.coords;
        const f: GpsFix = {
          lat: c.latitude,
          lon: c.longitude,
          accuracy: c.accuracy,
          t: pos.timestamp,
        };
        if (c.speed !== null && Number.isFinite(c.speed)) f.sog = c.speed * MS_TO_KT;
        if (c.heading !== null && Number.isFinite(c.heading) && (f.sog ?? 0) > 0.5) f.cog = c.heading;
        // Fallback: derive from earlier fixes (10–120 s ago).
        const h = history.current.filter((x) => f.t - x.t <= FALLBACK_MAX_MS);
        if (f.sog === undefined || f.cog === undefined) {
          const d = fallbackSogCog(h, f);
          if (d) {
            if (f.sog === undefined) {
              f.sog = d.sog;
              f.fromFixes = true;
            }
            if (f.cog === undefined && d.cog !== undefined && (f.sog ?? 0) > 0.5) f.cog = d.cog;
          }
        }
        history.current = [...h, f];
        setFix(f);
        setStatus('ok');
        setMessage(undefined);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied');
          setMessage('Δεν δόθηκε άδεια θέσης. Στο κινητό: Ρυθμίσεις → Τοποθεσία → επίτρεψε για τον browser (ή πάτα το λουκέτο δίπλα στη διεύθυνση) και ξαναφόρτωσε τη σελίδα.');
        } else {
          setStatus('waiting');
          setMessage(err.code === err.TIMEOUT ? 'Αναμονή σήματος GPS…' : 'Δεν υπάρχει σήμα GPS.');
        }
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return { status, fix, message };
}

/** Keeps the screen on while `enabled` and the page is visible (Screen Wake Lock API). */
export function useWakeLock(enabled: boolean): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) {
      setActive(false);
      return;
    }
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        if (document.visibilityState !== 'visible') return;
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          lock.release();
          return;
        }
        setActive(true);
        lock.addEventListener('release', () => setActive(false));
      } catch {
        setActive(false);
      }
    };
    acquire();
    const onVis = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      lock?.release().catch(() => undefined);
    };
  }, [enabled]);
  return active;
}

/** useState persisted to localStorage (per-device UI conveniences only). */
export function useStoredState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { ...initial, ...JSON.parse(raw) } : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  }, [key, v]);
  return [v, setV];
}

/** Online / offline, kept up to date by the browser events. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export type SheetMode = 'bottom' | 'center' | 'side';

/**
 * Where a sheet opens (P-053 HANDOFF §5), in em of the text size setting (17 / 20 / 23 px), so
 * «Πολύ μεγάλα» keeps the phone layout longer: a side panel on wide screens (≥ 60em) or a
 * low landscape screen (≤ 30em high); a centred sheet from 34em; else from the bottom.
 */
export function sheetMode(width: number, height: number, fontPx: number): SheetMode {
  const w = width / fontPx;
  const h = height / fontPx;
  if (w >= 60 || (width > height && h <= 30)) return 'side';
  return w >= 34 ? 'center' : 'bottom';
}

/** `sheetMode` for this window, kept up to date on resize and rotation. */
export function useSheetMode(): SheetMode {
  const calc = () => {
    if (typeof window === 'undefined') return 'bottom' as SheetMode;
    const fs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 17;
    return sheetMode(window.innerWidth, window.innerHeight, fs);
  };
  const [mode, setMode] = useState<SheetMode>(calc);
  useEffect(() => {
    const on = () => setMode(calc());
    on();
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    const mo = new MutationObserver(on);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-size'],
    });
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
      mo.disconnect();
    };
  }, []);
  return mode;
}

export type NavMode = 'bottom' | 'side';

/**
 * Where the main navigation goes (P-049 A11): a rail on the left on a low landscape screen
 * (≤ 30em high in em of the text size setting, the same rule as the `side` sheet), else at the
 * bottom. Not a media query: there `em` is always 16 px and ignores the 17 / 20 / 23 px setting.
 */
export function navMode(width: number, height: number, fontPx: number): NavMode {
  return width > height && height / fontPx <= 30 ? 'side' : 'bottom';
}

/** The root font size in px (the text size setting). */
const rootFontPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 17;

/**
 * `navMode` for this window, kept up to date on resize, rotation and a change of the text size
 * (`data-size` on <html>).
 */
export function useNavMode(): NavMode {
  const calc = (): NavMode => (typeof window === 'undefined' ? 'bottom' : navMode(window.innerWidth, window.innerHeight, rootFontPx()));
  const [mode, setMode] = useState<NavMode>(calc);
  useEffect(() => {
    const on = () => setMode(calc());
    on();
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    const mo = new MutationObserver(on);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-size'],
    });
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
      mo.disconnect();
    };
  }, []);
  return mode;
}

/**
 * P-056 §Ι: the race Live bar «Θέση αντιπάλου / Τερματισμός» is sticky only when it fits. Pure rule:
 * the race screen (to its last number), the alert band's reserved extra height and the bar fit in the
 * visible height, and the two buttons are on one row. Else the bar sits in the flow after the screen.
 * All in px of the moment; the caller measures.
 */
export function barFits(o: { screenEnd: number; reserve: number; bar: number; avail: number; oneRow: boolean }): boolean {
  return o.oneRow && o.screenEnd + o.reserve + o.bar + 12 <= o.avail;
}

/** The band (4.8em + 12 px, as in the sketch) takes the place of the «Οθόνη αγώνα» row: only the difference is reserved. */
export const bandReserve = (headPx: number | undefined, fontPx: number): number => (headPx === undefined ? 0 : Math.max(0, 4.8 * fontPx + 12 - headPx));

/** Whether the children of `el` wrapped onto more than one row. */
export const wrapped = (el: HTMLElement): boolean => {
  const kids = Array.from(el.children) as HTMLElement[];
  return kids.length > 1 && kids.some((k) => k.offsetTop !== kids[0].offsetTop);
};

/**
 * The Live bar's place: 'flow' (right after the race screen) or 'stick' (at the end, sticky).
 * Measured with the bar in the flow; decided again only when the text size, the orientation or the
 * window height changes, or when `again` changes (the sound prompt closed after the user's tap) — never when an
 * alert appears: the bar never moves under the tactician's finger.
 */
export function useBarFit(screenRef: RefObject<HTMLElement>, barRef: RefObject<HTMLElement>, active: boolean, again?: unknown): 'flow' | 'stick' {
  const [mode, setMode] = useState<'measure' | 'flow' | 'stick'>('measure');
  // QA: also once when the screen loses a block the user closed (the «Ενεργοποίηση ήχου» prompt after its tap).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (active) setMode('measure');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [again]);
  useEffect(() => {
    if (!active) return;
    setMode('measure');
    let h = window.innerHeight;
    let w = window.innerWidth;
    const again = () => setMode('measure');
    const onResize = () => {
      // Only a height change or a rotation (the width alone is the same phone).
      if (window.innerHeight !== h || window.innerWidth > window.innerHeight !== w > h) {
        h = window.innerHeight;
        w = window.innerWidth;
        again();
      }
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', again);
    const mo = new MutationObserver(again);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-size'],
    });
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', again);
      mo.disconnect();
    };
  }, [active]);
  useLayoutEffect(() => {
    if (mode !== 'measure') return;
    const rs = screenRef.current;
    const bar = barRef.current;
    if (!rs || !bar) return setMode('flow');
    const font = rootFontPx();
    const ends = rs.querySelectorAll<HTMLElement>('[data-fit-end], .wind-card');
    const endEl = ends.length ? ends[ends.length - 1] : rs;
    const screenEnd = endEl.getBoundingClientRect().bottom + window.scrollY;
    const head = rs.querySelector<HTMLElement>('.rs-top');
    const tab = document.querySelector<HTMLElement>('.tabbar');
    const tabH = tab && getComputedStyle(tab).position === 'fixed' ? tab.offsetHeight : 0;
    const fits = barFits({
      screenEnd,
      reserve: bandReserve(head?.offsetHeight, font),
      bar: bar.offsetHeight,
      avail: window.innerHeight - tabH,
      oneRow: !wrapped(bar),
    });
    setMode(fits ? 'stick' : 'flow');
  }, [mode, screenRef, barRef]);
  return mode === 'stick' ? 'stick' : 'flow';
}

/** Form bars (§Ι): sticky only while the buttons are on one row; a wrapped bar goes into the flow. */
export function useOneRowSticky(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const on = () => el.classList.toggle('flow', wrapped(el));
    on();
    const ro = new ResizeObserver(on);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
}
