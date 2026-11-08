/// <reference lib="webworker" />
import { routeCourse, RoutingError } from './isochrones';
import { saronikosLand } from './coastline';
import { buildWind, type RouteRequest, type RouteResponse } from './protocol';

self.onmessage = (e: MessageEvent<RouteRequest>) => {
  const req = e.data;
  try {
    const wind = buildWind(req.wind);
    const result = routeCourse(req.boat, req.marks, req.startTime, wind, saronikosLand(), req.options);
    (self as unknown as Worker).postMessage({ id: req.id, ok: true, result } satisfies RouteResponse);
  } catch (err) {
    const msg = err instanceof RoutingError ? err.message : `Σφάλμα υπολογισμού: ${(err as Error).message}`;
    (self as unknown as Worker).postMessage({ id: req.id, ok: false, error: msg } satisfies RouteResponse);
  }
};
