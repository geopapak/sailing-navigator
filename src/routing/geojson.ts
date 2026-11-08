import type { LatLon } from '../nav/geo';
import type { RouteResult, TrackPoint } from './isochrones';

type Feature<G> = { type: 'Feature'; geometry: G; properties: Record<string, unknown> };
type FC<G> = { type: 'FeatureCollection'; features: Feature<G>[] };
type Line = { type: 'LineString'; coordinates: [number, number][] };
type Pt = { type: 'Point'; coordinates: [number, number] };

const ll = (p: LatLon): [number, number] => [p.lon, p.lat];

/** Route as line segments, one feature per run of the same sail (property `sailId`). */
export function routeSegments(route: RouteResult | undefined): FC<Line> {
  const features: Feature<Line>[] = [];
  if (route) {
    for (const leg of route.legs) {
      let cur: Feature<Line> | null = null;
      for (let i = 0; i + 1 < leg.track.length; i++) {
        const a = leg.track[i];
        const b = leg.track[i + 1];
        const sail = a.sailId ?? '';
        if (!cur || cur.properties.sailId !== sail) {
          cur = { type: 'Feature', geometry: { type: 'LineString', coordinates: [ll(a)] }, properties: { sailId: sail } };
          features.push(cur);
        }
        cur.geometry.coordinates.push(ll(b));
      }
    }
  }
  return { type: 'FeatureCollection', features };
}

export function isochroneLines(route: RouteResult | undefined): FC<Line> {
  const features: Feature<Line>[] = [];
  for (const leg of route?.legs ?? []) {
    for (const iso of leg.isochrones) {
      if (iso.length < 2) continue;
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: iso.map(ll) }, properties: {} });
    }
  }
  return { type: 'FeatureCollection', features };
}

export function courseLine(marks: LatLon[]): FC<Line> {
  return {
    type: 'FeatureCollection',
    features: marks.length > 1 ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: marks.map(ll) }, properties: {} }] : [],
  };
}

export function pointFC(p: LatLon | undefined, props: Record<string, unknown> = {}): FC<Pt> {
  return { type: 'FeatureCollection', features: p ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: ll(p) }, properties: props }] : [] };
}

/** Interpolated position (and the track point in effect) along the route at time t. */
export function positionAt(route: RouteResult | undefined, t: number): (LatLon & { tp: TrackPoint }) | undefined {
  if (!route || route.legs.length === 0) return undefined;
  const all = route.legs.flatMap((l) => l.track);
  if (t <= all[0].t) return { lat: all[0].lat, lon: all[0].lon, tp: all[0] };
  for (let i = 0; i + 1 < all.length; i++) {
    const a = all[i];
    const b = all[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
      return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, tp: a };
    }
  }
  const last = all[all.length - 1];
  return { lat: last.lat, lon: last.lon, tp: last };
}
