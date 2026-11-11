import { describe, expect, it } from 'vitest';
import { CHART_THEMES, depthSld, depthTiles, formatDepth, nauticalStyle, parseDepth, themePaint } from './nauticalStyle';

describe('nautical chart style', () => {
  it('colours the three shallow bands and leaves land and deep water transparent', () => {
    const sld = depthSld(['#111111', '#222222', '#333333']);
    expect(sld).toContain('quantity="-20" opacity="0"');
    expect(sld).toContain('<ColorMapEntry color="#333333" quantity="-10"/>');
    expect(sld).toContain('<ColorMapEntry color="#222222" quantity="-5"/>');
    expect(sld).toContain('<ColorMapEntry color="#111111" quantity="0"/>');
    expect(sld).toContain('quantity="100000" opacity="0"');
  });

  it('builds a WMS template the map can fill', () => {
    const url = depthTiles(CHART_THEMES.day);
    expect(url).toMatch(/^https:\/\/ows\.emodnet-bathymetry\.eu\/wms\?/);
    expect(url).toContain('bbox={bbox-epsg-3857}');
    expect(url).toContain('SLD_BODY=%3CStyledLayerDescriptor');
  });

  it('has no road layers and every themed layer exists', () => {
    const s = nauticalStyle({ tiles: ['https://x/{z}/{x}/{y}.pbf'] }, 'night');
    const ids = s.layers.map((l) => l.id);
    expect(ids).not.toContain('road');
    expect(ids).toEqual(['land', 'water', 'bathy', 'contours', 'coast', 'seamarks', 'water-name', 'place']);
    for (const [layer] of themePaint('dark')) expect(ids).toContain(layer);
  });
});

describe('depth on tap', () => {
  it('reads sea depth as positive metres with the min–max range', () => {
    expect(parseDepth({ avg: -95.49, min: -98, max: -89.4 })).toEqual({ depth: 95.49, min: 89.4, max: 98 });
  });

  it('gives nothing on land or without data', () => {
    expect(parseDepth({ avg: 190.8 })).toBeUndefined();
    expect(parseDepth({ avg: null })).toBeUndefined();
    expect(parseDepth({})).toBeUndefined();
  });

  it('formats shallow depths with a decimal and hides a tiny range', () => {
    expect(formatDepth({ depth: 4.26, min: 2, max: 6 })).toBe('Βάθος ≈ 4,3 m (2–6 m)');
    expect(formatDepth({ depth: 95.49, min: 95.1, max: 95.6 })).toBe('Βάθος ≈ 95 m');
  });
});
