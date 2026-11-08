import { useEffect, useRef, useState } from 'react';
import { MS_TO_KT, sogCogFromFixes } from '../nav/geo';

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
}

/** Watches the device position. SOG/COG come from the device when available, otherwise from recent fixes. */
export function useGps(enabled: boolean): { status: GpsStatus; fix?: GpsFix; message?: string } {
  const [status, setStatus] = useState<GpsStatus>('off');
  const [fix, setFix] = useState<GpsFix>();
  const [message, setMessage] = useState<string>();
  const history = useRef<GpsFix[]>([]);

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
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
        const f: GpsFix = { lat: c.latitude, lon: c.longitude, accuracy: c.accuracy, t: pos.timestamp };
        if (c.speed !== null && Number.isFinite(c.speed)) f.sog = c.speed * MS_TO_KT;
        if (c.heading !== null && Number.isFinite(c.heading) && (f.sog ?? 0) > 0.5) f.cog = c.heading;
        // Fallback: derive from a fix ~10–30 s ago.
        const h = history.current.filter((x) => f.t - x.t <= 30_000);
        if (f.sog === undefined || f.cog === undefined) {
          const ref = h.find((x) => f.t - x.t >= 10_000);
          const d = ref && sogCogFromFixes(ref, f);
          if (d) {
            f.sog ??= d.sog;
            if (f.cog === undefined && d.sog > 0.5) f.cog = d.cog;
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
          setMessage('Δεν δόθηκε άδεια θέσης. Ενεργοποίησέ την από τις ρυθμίσεις του browser.');
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
