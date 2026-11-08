import { useEffect, useRef, useState } from 'react';
import { Map as MLMap, Marker, NavigationControl, ScaleControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { BoatProfile } from '../boat/types';
import type { Mark, RouteResult } from '../routing/isochrones';
import { courseLine, isochroneLines, pointFC, routeSegments } from '../routing/geojson';
import { COASTLINE_ATTRIBUTION, COASTLINE_LINES } from '../routing/coastline';
import type { LatLon } from '../nav/geo';
import { sailColor } from './PolarChart';

setWorkerUrl(workerUrl);

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const SEAMARK_TILES = 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png';

/** Offline fallback: sea background + OSM coastline bundled with the app. */
function fallbackStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      coast: {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: COASTLINE_LINES.map((l) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: l }, properties: {} })),
        },
        attribution: COASTLINE_ATTRIBUTION,
      },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#cfe3f3' } },
      { id: 'coast', type: 'line', source: 'coast', paint: { 'line-color': '#5b4a2f', 'line-width': 2 } },
    ],
  };
}

async function loadStyle(): Promise<StyleSpecification | string> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    const res = await fetch(STYLE_URL, { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as StyleSpecification;
  } catch {
    return fallbackStyle();
  }
}

export interface WindArrow extends LatLon {
  tws: number;
  twd: number;
}

interface Props {
  boat?: BoatProfile;
  marks: Mark[];
  editable: boolean;
  addMode: boolean;
  onAdd?: (p: LatLon) => void;
  onMove?: (id: string, p: LatLon) => void;
  nextMarkId?: string;
  planned?: RouteResult;
  live?: RouteResult;
  showIsochrones: boolean;
  showSeamarks: boolean;
  wind?: WindArrow[];
  boatPos?: LatLon & { cog?: number };
  simPos?: LatLon;
  fitKey?: string;
}

const EMPTY = { type: 'FeatureCollection', features: [] } as const;

function arrowImage(): ImageData {
  const s = 48;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.translate(s / 2, s / 2);
  g.strokeStyle = '#ffffff';
  g.fillStyle = '#ffffff';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(0, -18);
  g.lineTo(0, 14);
  g.stroke();
  g.beginPath();
  g.moveTo(0, 20);
  g.lineTo(-9, 6);
  g.lineTo(9, 6);
  g.closePath();
  g.fill();
  return g.getImageData(0, 0, s, s);
}

export function MapView(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap>();
  const [ready, setReady] = useState(false);
  const markers = useRef<Marker[]>([]);
  const propsRef = useRef(p);
  propsRef.current = p;

  // Create map once.
  useEffect(() => {
    let disposed = false;
    (async () => {
      const style = await loadStyle();
      if (disposed || !el.current) return;
      const map = new MLMap({
        container: el.current,
        style,
        center: [23.5, 37.75],
        zoom: 9,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.addControl(new NavigationControl({ visualizePitch: false }), 'top-right');
      map.addControl(new ScaleControl({ unit: 'nautical' }), 'bottom-left');
      map.on('click', (e) => {
        const cur = propsRef.current;
        if (cur.addMode && cur.onAdd) cur.onAdd({ lat: e.lngLat.lat, lon: e.lngLat.lng });
      });
      map.on('load', () => {
        map.addSource('seamarks', {
          type: 'raster',
          tiles: [SEAMARK_TILES],
          tileSize: 256,
          attribution: '© OpenSeaMap contributors',
        });
        map.addLayer({ id: 'seamarks', type: 'raster', source: 'seamarks', minzoom: 9 });
        for (const id of ['course', 'iso', 'planned', 'live', 'boat', 'sim', 'wind']) map.addSource(id, { type: 'geojson', data: EMPTY });
        if (!map.hasImage('nav-wind-arrow')) map.addImage('nav-wind-arrow', arrowImage(), { sdf: true });
        map.addLayer({
          id: 'wind',
          type: 'symbol',
          source: 'wind',
          layout: {
            'icon-image': 'nav-wind-arrow',
            'icon-size': ['interpolate', ['linear'], ['get', 'tws'], 0, 0.35, 25, 0.8],
            'icon-rotate': ['get', 'twd'],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
          },
          paint: {
            'icon-color': [
              'interpolate', ['linear'], ['get', 'tws'],
              4, '#2563eb', 8, '#0891b2', 12, '#16a34a', 16, '#ca8a04', 20, '#ea580c', 25, '#dc2626', 30, '#7e22ce',
            ],
            'icon-opacity': 0.85,
          },
        });
        map.addLayer({ id: 'course', type: 'line', source: 'course', paint: { 'line-color': '#6b7280', 'line-width': 2, 'line-dasharray': [2, 2] } });
        map.addLayer({ id: 'iso', type: 'line', source: 'iso', paint: { 'line-color': '#7c3aed', 'line-width': 1, 'line-opacity': 0.5 } });
        map.addLayer({ id: 'planned', type: 'line', source: 'planned', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 4 } });
        map.addLayer({ id: 'live', type: 'line', source: 'live', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#e11d48', 'line-width': 4, 'line-dasharray': [1.5, 1] } });
        map.addLayer({ id: 'sim', type: 'circle', source: 'sim', paint: { 'circle-radius': 7, 'circle-color': '#f59e0b', 'circle-stroke-color': '#000', 'circle-stroke-width': 2 } });
        map.addLayer({ id: 'boat', type: 'circle', source: 'boat', paint: { 'circle-radius': 8, 'circle-color': '#e11d48', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
        setReady(true);
      });
    })();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = undefined;
    };
  }, []);

  const set = (id: string, data: unknown) => {
    const src = mapRef.current?.getSource(id) as GeoJSONSource | undefined;
    src?.setData(data as Parameters<GeoJSONSource['setData']>[0]);
  };

  // Course line + mark markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    set('course', courseLine(p.marks));
    markers.current.forEach((m) => m.remove());
    markers.current = p.marks.map((mk, i) => {
      const div = document.createElement('div');
      const isStart = i === 0;
      const isFinish = i === p.marks.length - 1 && i > 0;
      div.className = `mark-pin ${mk.id === p.nextMarkId ? 'next' : ''} ${isStart ? 'start' : ''} ${isFinish ? 'finish' : ''}`;
      div.innerHTML = `<span class="mark-dot">${i === 0 ? 'Ε' : i}</span><span class="mark-label"></span>`;
      (div.querySelector('.mark-label') as HTMLElement).textContent = mk.name;
      const m = new Marker({ element: div, draggable: p.editable }).setLngLat([mk.lon, mk.lat]).addTo(map);
      m.on('dragend', () => {
        const ll = m.getLngLat();
        propsRef.current.onMove?.(mk.id, { lat: ll.lat, lon: ll.lng });
      });
      return m;
    });
  }, [ready, p.marks, p.editable, p.nextMarkId]);

  // Routes.
  useEffect(() => {
    if (!ready) return;
    const fc = routeSegments(p.planned);
    for (const f of fc.features) f.properties.color = p.boat && f.properties.sailId ? sailColor(p.boat, String(f.properties.sailId)) : '#0b2a4a';
    set('planned', fc);
    set('iso', p.showIsochrones ? isochroneLines(p.planned) : EMPTY);
  }, [ready, p.planned, p.showIsochrones, p.boat]);

  useEffect(() => {
    if (!ready) return;
    set('live', routeSegments(p.live));
  }, [ready, p.live]);

  useEffect(() => {
    if (!ready) return;
    set('boat', pointFC(p.boatPos));
    set('sim', pointFC(p.simPos));
  }, [ready, p.boatPos, p.simPos]);

  useEffect(() => {
    if (!ready) return;
    set('wind', {
      type: 'FeatureCollection',
      features: (p.wind ?? []).map((w) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [w.lon, w.lat] },
        properties: { tws: w.tws, twd: w.twd },
      })),
    });
  }, [ready, p.wind]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setLayoutProperty('seamarks', 'visibility', p.showSeamarks ? 'visible' : 'none');
  }, [ready, p.showSeamarks]);

  // Fit to the course when it changes identity.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || p.marks.length === 0) return;
    const lons = p.marks.map((m) => m.lon);
    const lats = p.marks.map((m) => m.lat);
    if (p.marks.length === 1) map.easeTo({ center: [lons[0], lats[0]], zoom: Math.max(map.getZoom(), 11) });
    else
      map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: 50, maxZoom: 13, duration: 600 },
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, p.fitKey]);

  return (
    <div className={`map-wrap ${p.addMode ? 'adding' : ''}`}>
      <div ref={el} className="map" />
      {p.addMode && <div className="map-hint">Άγγιξε τον χάρτη για νέα σημαδούρα</div>}
    </div>
  );
}
