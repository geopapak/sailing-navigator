import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LaylineResult } from '../nav/laylines';
import { Map as MLMap, Marker, NavigationControl, Popup, ScaleControl, setWorkerUrl, type GeoJSONSource, type RasterTileSource } from 'maplibre-gl';
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { BoatProfile } from '../boat/types';
import type { Mark, RouteResult } from '../routing/isochrones';
import { courseLine, isochroneLines, pointFC, routeSegments } from '../routing/geojson';
import { COASTLINE_ATTRIBUTION, COASTLINE_LINES } from '../routing/coastline';
import type { LatLon } from '../nav/geo';
import { sailColor } from './PolarChart';
import { useApp } from './AppContext';
import type { Theme } from './settings';
import {
  CHART_THEMES,
  OFM_TILEJSON,
  ROAD_STYLE_URL,
  SEAMARK_TILES,
  contourTiles,
  depthTiles,
  fetchDepth,
  formatDepth,
  nauticalStyle,
  themePaint,
  type ChartKind,
  type VectorTileJson,
} from './nauticalStyle';

setWorkerUrl(workerUrl);

const seaColor = (theme: Theme) => (theme === 'day' ? '#cfe3f3' : CHART_THEMES[theme].water);

/** Offline fallback: sea background + OSM coastline bundled with the app. */
function fallbackStyle(theme: Theme): StyleSpecification {
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
      { id: 'sea', type: 'background', paint: { 'background-color': seaColor(theme) } },
      { id: 'coast', type: 'line', source: 'coast', paint: { 'line-color': CHART_THEMES[theme].coast, 'line-width': 2 } },
    ],
  };
}

/** Waits generously: on a phone at sea the style can take well over 5 s. */
const STYLE_TIMEOUT_MS = 15_000;

async function loadStyle(chart: ChartKind, theme: Theme): Promise<{ style: StyleSpecification; online: boolean }> {
  if (navigator.onLine === false) return { style: fallbackStyle(theme), online: false };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), STYLE_TIMEOUT_MS);
    const res = await fetch(chart === 'road' ? ROAD_STYLE_URL : OFM_TILEJSON, { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    const style = chart === 'road' ? (json as StyleSpecification) : nauticalStyle(json as VectorTileJson, theme);
    return { style, online: true };
  } catch {
    return { style: fallbackStyle(theme), online: false };
  }
}

type BaseState = 'loading' | 'ok' | 'fallback' | 'slow';

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
  /** Nautical chart (depths, no roads) or the street map. */
  chart: ChartKind;
  /** Depth bands and contours on the nautical chart. */
  showDepth: boolean;
  wind?: WindArrow[];
  boatPos?: LatLon & { cog?: number };
  /** Laylines to the next mark (P-019). */
  laylines?: LaylineResult;
  simPos?: LatLon;
  fitKey?: string;
  /** Extra controls drawn over the map (buttons, legend). */
  children?: ReactNode;
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
  const [base, setBase] = useState<BaseState>('loading');
  const [attempt, setAttempt] = useState(0);
  const markers = useRef<Marker[]>([]);
  const propsRef = useRef(p);
  propsRef.current = p;
  const { settings } = useApp();
  const theme = settings.theme;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const popup = useRef<Popup>();
  const depthReq = useRef<AbortController>();

  // Without the base map, try again by itself when the connection comes back.
  useEffect(() => {
    if (base !== 'fallback') return;
    const retry = () => setAttempt((a) => a + 1);
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [base]);

  // Create the map (again on "retry").
  useEffect(() => {
    let disposed = false;
    setReady(false);
    setBase('loading');
    (async () => {
      const { style, online } = await loadStyle(propsRef.current.chart, themeRef.current);
      if (disposed || !el.current) return;
      const map = new MLMap({
        container: el.current,
        style,
        // Greek names for the map buttons (read out by screen readers).
        locale: {
          'NavigationControl.ZoomIn': 'Μεγέθυνση',
          'NavigationControl.ZoomOut': 'Σμίκρυνση',
          'NavigationControl.ResetBearing': 'Βορράς πάνω',
        },
        center: [23.5, 37.75],
        zoom: 9,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      if (!online) setBase('fallback');
      else {
        // The base map counts as loaded once all visible tiles are drawn.
        const slow = window.setTimeout(() => !disposed && setBase((b) => (b === 'loading' ? 'slow' : b)), 12_000);
        map.once('idle', () => {
          window.clearTimeout(slow);
          if (!disposed) setBase('ok');
        });
      }
      map.addControl(new NavigationControl({ visualizePitch: false }), 'top-right');
      map.addControl(new ScaleControl({ unit: 'nautical' }), 'bottom-left');
      map.on('click', (e) => {
        const cur = propsRef.current;
        if (cur.addMode && cur.onAdd) {
          cur.onAdd({ lat: e.lngLat.lat, lon: e.lngLat.lng });
          return;
        }
        // Tap on the sea: indicative depth (nautical chart only, not on a mark).
        const target = e.originalEvent.target as Element | null;
        if (cur.chart !== 'nautical' || target?.closest?.('.maplibregl-marker')) return;
        showDepthAt(map, e.lngLat.lat, e.lngLat.lng);
      });
      map.on('load', () => {
        // The nautical style has its own (night-dimmed) seamark layer.
        if (!map.getLayer('seamarks')) {
          map.addSource('seamarks', {
            type: 'raster',
            tiles: [SEAMARK_TILES],
            tileSize: 256,
            attribution: '© OpenSeaMap contributors',
          });
          map.addLayer({ id: 'seamarks', type: 'raster', source: 'seamarks', minzoom: 9 });
        }
        for (const id of ['course', 'iso', 'planned', 'live', 'lay', 'boat', 'sim', 'wind']) map.addSource(id, { type: 'geojson', data: EMPTY });
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
        // Laylines: starboard green, port red (as the navigation lights), dashed, as an indication.
        map.addLayer({ id: 'lay', type: 'line', source: 'lay', paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [3, 2], 'line-opacity': 0.9 } });
        map.addLayer({ id: 'sim', type: 'circle', source: 'sim', paint: { 'circle-radius': 7, 'circle-color': '#f59e0b', 'circle-stroke-color': '#000', 'circle-stroke-width': 2 } });
        map.addLayer({ id: 'boat', type: 'circle', source: 'boat', paint: { 'circle-radius': 8, 'circle-color': '#e11d48', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
        setReady(true);
      });
    })();
    return () => {
      disposed = true;
      depthReq.current?.abort();
      popup.current?.remove();
      popup.current = undefined;
      mapRef.current?.remove();
      mapRef.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, p.chart]);

  function showDepthAt(map: MLMap, lat: number, lon: number) {
    depthReq.current?.abort();
    popup.current?.remove();
    const box = document.createElement('div');
    box.className = 'depth-pop';
    const main = document.createElement('strong');
    const note = document.createElement('small');
    main.textContent = 'Βάθος…';
    note.textContent = 'ενδεικτικό, όχι για ναυσιπλοΐα';
    box.append(main, note);
    popup.current = new Popup({ closeButton: true, maxWidth: '240px' }).setLngLat([lon, lat]).setDOMContent(box).addTo(map);
    if (navigator.onLine === false) {
      main.textContent = 'Το βάθος θέλει σύνδεση';
      return;
    }
    const ctl = new AbortController();
    depthReq.current = ctl;
    const timer = window.setTimeout(() => ctl.abort(), 10_000);
    fetchDepth(lat, lon, ctl.signal)
      .then((d) => {
        main.textContent = d ? formatDepth(d) : 'Ξηρά ή χωρίς στοιχεία βάθους';
      })
      .catch(() => {
        if (depthReq.current === ctl) main.textContent = 'Δεν βρέθηκε βάθος (σύνδεση;)';
      })
      .finally(() => window.clearTimeout(timer));
  }

  // Theme switch: recolour in place, without reloading the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (map.getLayer('sea')) {
      map.setPaintProperty('sea', 'background-color', seaColor(theme));
      map.setPaintProperty('coast', 'line-color', CHART_THEMES[theme].coast);
      return;
    }
    if (p.chart !== 'nautical') return;
    for (const [layer, prop, value] of themePaint(theme))
      if (map.getLayer(layer)) map.setPaintProperty(layer, prop, value);
    (map.getSource('bathy') as RasterTileSource | undefined)?.setTiles([depthTiles(CHART_THEMES[theme])]);
    (map.getSource('contours') as RasterTileSource | undefined)?.setTiles([contourTiles(CHART_THEMES[theme])]);
  }, [ready, theme, p.chart]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const id of ['bathy', 'contours']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', p.showDepth ? 'visible' : 'none');
  }, [ready, p.showDepth, p.chart]);

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
    const l = p.laylines;
    set(
      'lay',
      !l || l.leg === 'reach'
        ? EMPTY
        : {
            type: 'FeatureCollection',
            features: (['stbd', 'port'] as const).map((b) => ({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: l.lines[b].map((q) => [q.lon, q.lat]) },
              properties: { color: b === 'stbd' ? '#16a34a' : '#dc2626' },
            })),
          },
    );
  }, [ready, p.laylines]);

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
      {base === 'loading' && <div className="map-status">Φόρτωση χάρτη…</div>}
      {(base === 'fallback' || base === 'slow') && (
        <div className="map-status warn" role="status">
          {base === 'fallback' ? 'Χωρίς σύνδεση: μόνο ακτογραμμή.' : 'Ο χάρτης αργεί (αργή σύνδεση).'}
          <button type="button" onClick={() => setAttempt((a) => a + 1)}>
            Ξανά
          </button>
        </div>
      )}
      {p.chart === 'nautical' && p.showDepth && ready && base !== 'fallback' && (
        <div className="depth-legend" aria-label="Βάθη σε μέτρα (ενδεικτικά)">
          {['0–5', '5–10', '10–20', '>20'].map((label, i) => (
            <span key={label}>
              <i style={{ background: i < 3 ? CHART_THEMES[theme].depth[i] : CHART_THEMES[theme].water }} />
              {label}
            </span>
          ))}
          <em>μέτρα</em>
        </div>
      )}
      {p.children}
    </div>
  );
}
