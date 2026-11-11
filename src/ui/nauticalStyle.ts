import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { AllPaintProperties } from 'maplibre-gl';
import type { Theme } from './settings';

/** Map look: chart-like (depths, no roads) or the street map we had before. */
export type ChartKind = 'nautical' | 'road';

export const OFM_TILEJSON = 'https://tiles.openfreemap.org/planet';
export const ROAD_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const SEAMARK_TILES = 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const EMODNET_WMS = 'https://ows.emodnet-bathymetry.eu/wms';
const EMODNET_DEPTH = 'https://rest.emodnet-bathymetry.eu/depth_sample';

export const DEPTH_ATTRIBUTION = 'Βάθη © EMODnet (ενδεικτικά)';

export interface ChartTheme {
  land: string;
  water: string;
  coast: string;
  label: string;
  waterLabel: string;
  halo: string;
  /** Fill for 0–5 m, 5–10 m, 10–20 m (deeper water keeps the plain water colour). */
  depth: [string, string, string];
  contour: string;
  contourOpacity: number;
}

export const CHART_THEMES: Record<Theme, ChartTheme> = {
  day: {
    land: '#f2ead3', water: '#f4f9fd', coast: '#5b4a2f', label: '#3b2f1e', waterLabel: '#1f4e79', halo: '#ffffff',
    depth: ['#9cc3e6', '#bcd8ef', '#d9e9f6'], contour: '#5b7fa3', contourOpacity: 0.8,
  },
  dark: {
    land: '#2b2f36', water: '#0f1b2d', coast: '#9aa4b2', label: '#e5e7eb', waterLabel: '#93c5fd', halo: '#0b1220',
    depth: ['#1e4f7a', '#1a3f63', '#16304d'], contour: '#6b8fb8', contourOpacity: 0.7,
  },
  // Night: only black and dim red, to keep night vision.
  night: {
    land: '#120000', water: '#000000', coast: '#7a1410', label: '#b3261e', waterLabel: '#7a1410', halo: '#000000',
    depth: ['#3a0806', '#260403', '#170201'], contour: '#5a0d09', contourOpacity: 0.8,
  },
};

/** Server-side colouring (SLD): exact depth bands, transparent on land and below 20 m. */
export function depthSld(c: ChartTheme['depth']): string {
  return (
    '<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld"><NamedLayer><Name>emodnet:mean</Name>' +
    '<UserStyle><FeatureTypeStyle><Rule><RasterSymbolizer><ColorMap type="intervals">' +
    '<ColorMapEntry color="#ffffff" quantity="-20" opacity="0"/>' +
    `<ColorMapEntry color="${c[2]}" quantity="-10"/>` +
    `<ColorMapEntry color="${c[1]}" quantity="-5"/>` +
    `<ColorMapEntry color="${c[0]}" quantity="0"/>` +
    '<ColorMapEntry color="#000000" quantity="100000" opacity="0"/>' +
    '</ColorMap></RasterSymbolizer></Rule></FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>'
  );
}

export function contourSld(color: string): string {
  return (
    '<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld"><NamedLayer><Name>emodnet:contours</Name>' +
    '<UserStyle><FeatureTypeStyle><Rule><LineSymbolizer><Stroke>' +
    `<CssParameter name="stroke">${color}</CssParameter><CssParameter name="stroke-width">0.8</CssParameter>` +
    '</Stroke></LineSymbolizer></Rule></FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>'
  );
}

/** WMS tile URL template ({bbox-epsg-3857} is filled in by the map). */
export function wmsTiles(layer: string, sld: string): string {
  return (
    `${EMODNET_WMS}?service=WMS&version=1.1.1&request=GetMap&layers=${layer}&styles=&format=image/png` +
    '&transparent=true&srs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}' +
    `&SLD_BODY=${encodeURIComponent(sld)}`
  );
}

export const depthTiles = (t: ChartTheme) => wmsTiles('emodnet:mean', depthSld(t.depth));
export const contourTiles = (t: ChartTheme) => wmsTiles('emodnet:contours', contourSld(t.contour));

export interface VectorTileJson {
  tiles: string[];
  minzoom?: number;
  maxzoom?: number;
  attribution?: string;
}

const seamarkPaint = (theme: Theme) =>
  theme === 'night'
    ? { 'raster-opacity': 0.7, 'raster-saturation': -1, 'raster-brightness-max': 0.3 } // no blue/purple at night
    : { 'raster-opacity': 1 };

/** The nautical chart: land/water, depth bands, contours, coast, seamarks and Greek place names. */
export function nauticalStyle(tj: VectorTileJson, theme: Theme): StyleSpecification {
  const t = CHART_THEMES[theme];
  const name = ['coalesce', ['get', 'name:el'], ['get', 'name']];
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      ofm: { type: 'vector', tiles: tj.tiles, minzoom: tj.minzoom ?? 0, maxzoom: tj.maxzoom ?? 14, attribution: tj.attribution },
      bathy: { type: 'raster', tiles: [depthTiles(t)], tileSize: 256, attribution: DEPTH_ATTRIBUTION },
      contours: { type: 'raster', tiles: [contourTiles(t)], tileSize: 256 },
      seamarks: { type: 'raster', tiles: [SEAMARK_TILES], tileSize: 256, attribution: '© OpenSeaMap contributors' },
    },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': t.land } },
      { id: 'water', type: 'fill', source: 'ofm', 'source-layer': 'water', paint: { 'fill-color': t.water } },
      { id: 'bathy', type: 'raster', source: 'bathy', paint: { 'raster-resampling': 'nearest' } },
      { id: 'contours', type: 'raster', source: 'contours', minzoom: 8, paint: { 'raster-opacity': t.contourOpacity } },
      {
        id: 'coast', type: 'line', source: 'ofm', 'source-layer': 'water',
        paint: { 'line-color': t.coast, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 13, 1.6] },
      },
      { id: 'seamarks', type: 'raster', source: 'seamarks', minzoom: 9, paint: seamarkPaint(theme) },
      {
        id: 'water-name', type: 'symbol', source: 'ofm', 'source-layer': 'water_name',
        layout: { 'text-field': name, 'text-font': ['Noto Sans Italic'], 'text-size': 12, 'text-letter-spacing': 0.1 },
        paint: { 'text-color': t.waterLabel, 'text-halo-color': t.halo, 'text-halo-width': 1.2 },
      },
      {
        id: 'place', type: 'symbol', source: 'ofm', 'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'island', 'islet']]],
        layout: {
          'text-field': name,
          'text-font': ['Noto Sans Bold'],
          'text-size': ['match', ['get', 'class'], 'city', 14, 'town', 13, 'island', 13, 12],
        },
        paint: { 'text-color': t.label, 'text-halo-color': t.halo, 'text-halo-width': 1.5 },
      },
    ],
  } as StyleSpecification;
}

/** Paint changes for a theme switch without reloading the map. [layer, property, value] */
export function themePaint(theme: Theme): [string, keyof AllPaintProperties, string | number][] {
  const t = CHART_THEMES[theme];
  const night = theme === 'night';
  return [
    ['land', 'background-color', t.land],
    ['water', 'fill-color', t.water],
    ['coast', 'line-color', t.coast],
    ['contours', 'raster-opacity', t.contourOpacity],
    ['water-name', 'text-color', t.waterLabel],
    ['water-name', 'text-halo-color', t.halo],
    ['place', 'text-color', t.label],
    ['place', 'text-halo-color', t.halo],
    ['seamarks', 'raster-opacity', night ? 0.7 : 1],
    ['seamarks', 'raster-saturation', night ? -1 : 0],
    ['seamarks', 'raster-brightness-max', night ? 0.3 : 1],
  ];
}

export interface DepthSample {
  /** Metres below sea level (positive). */
  depth: number;
  min?: number;
  max?: number;
}

/** Reads the EMODnet answer: negative heights are sea depth; land or no data gives undefined. */
export function parseDepth(j: { avg?: number | null; min?: number | null; max?: number | null }): DepthSample | undefined {
  if (typeof j.avg !== 'number' || !Number.isFinite(j.avg) || j.avg >= 0) return undefined;
  const out: DepthSample = { depth: -j.avg };
  // min is the deepest (most negative), max the shallowest.
  if (typeof j.min === 'number' && typeof j.max === 'number' && j.min < 0) {
    out.min = Math.max(0, -j.max);
    out.max = -j.min;
  }
  return out;
}

export function formatDepth(s: DepthSample): string {
  const r = (x: number) => (x < 10 ? Math.round(x * 10) / 10 : Math.round(x)).toLocaleString('el-GR');
  const range = s.min !== undefined && s.max !== undefined && s.max - s.min >= 1 ? ` (${r(s.min)}–${r(s.max)} m)` : '';
  return `Βάθος ≈ ${r(s.depth)} m${range}`;
}

export async function fetchDepth(lat: number, lon: number, signal?: AbortSignal): Promise<DepthSample | undefined> {
  const res = await fetch(`${EMODNET_DEPTH}?geom=${encodeURIComponent(`POINT(${lon.toFixed(5)} ${lat.toFixed(5)})`)}`, { signal });
  if (!res.ok) throw new Error(String(res.status));
  return parseDepth(await res.json());
}
