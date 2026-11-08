import type { BoatProfile } from '../boat/types';
import { calibratedField, gridField, uniformField } from '../weather/field';
import type { GridForecast, WindField } from '../weather/types';
import type { Mark, RouteOptions, RouteResult } from './isochrones';

/** Serializable description of the wind to route with. */
export type WindSpec =
  | { kind: 'uniform'; tws: number; twd: number }
  | { kind: 'grid'; forecast: GridForecast; calibration?: { twsFactor: number; twdOffset: number } };

export interface RouteRequest {
  id: number;
  boat: BoatProfile;
  marks: Mark[];
  startTime: number;
  wind: WindSpec;
  options?: Partial<RouteOptions>;
}

export type RouteResponse = { id: number; ok: true; result: RouteResult } | { id: number; ok: false; error: string };

export function buildWind(spec: WindSpec): WindField {
  if (spec.kind === 'uniform') return uniformField(spec.tws, spec.twd);
  const f = gridField(spec.forecast);
  return spec.calibration ? calibratedField(f, spec.calibration.twsFactor, spec.calibration.twdOffset) : f;
}

let worker: Worker | undefined;
let seq = 0;
const pending = new Map<number, { resolve: (r: RouteResult) => void; reject: (e: Error) => void }>();

/** Runs routing in a Web Worker so the UI stays responsive. */
export function routeInWorker(req: Omit<RouteRequest, 'id'>): Promise<RouteResult> {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<RouteResponse>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'Σφάλμα worker'));
      pending.clear();
      worker?.terminate();
      worker = undefined;
    };
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ ...req, id });
  });
}
