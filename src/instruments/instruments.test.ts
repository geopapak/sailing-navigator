import { describe, expect, it } from 'vitest';
import { Nmea0183Parser, checksumOk } from './nmea0183';
import { decodeAis, payloadBits } from './ais';
import { parseSignalK } from './signalk';
import { InstrumentState } from './state';
import { Simulator } from './simulator';

/** Adds a valid NMEA checksum. */
function nmea(body: string) {
  let x = 0;
  for (const c of body) x ^= c.charCodeAt(0);
  return `$${body}*${x.toString(16).toUpperCase().padStart(2, '0')}`;
}

describe('NMEA 0183', () => {
  const p = new Nmea0183Parser();

  it('checks checksums', () => {
    expect(checksumOk(nmea('IIMWV,045.0,T,12.4,N,A'))).toBe(true);
    expect(checksumOk('$IIMWV,045.0,T,12.4,N,A*00')).toBe(false);
    expect(p.parse('$IIMWV,045.0,T,12.4,N,A*00')).toEqual({});
  });

  it('reads true and apparent wind, port as negative', () => {
    expect(p.parse(nmea('IIMWV,315.0,T,12.4,N,A')).update).toEqual({ twa: -45, tws: 12.4 });
    expect(p.parse(nmea('WIMWV,030.0,R,18.0,N,A')).update).toEqual({ awa: 30, aws: 18 });
    expect(p.parse(nmea('IIMWV,045.0,T,6.0,M,A')).update!.tws).toBeCloseTo(11.66, 2);
    expect(p.parse(nmea('IIMWV,045.0,T,12.4,N,V'))).toEqual({});
    expect(p.parse(nmea('IIMWD,020.0,T,015.0,M,12.0,N,6.2,M')).update).toEqual({ twd: 20, tws: 12 });
  });

  it('reads speed, heading, position and depth', () => {
    expect(p.parse(nmea('IIVHW,340.0,T,335.0,M,7.21,N,13.35,K')).update).toEqual({ hdgTrue: 340, hdgMag: 335, bsp: 7.21 });
    expect(p.parse(nmea('IIHDG,335.0,,,5.0,E')).update).toEqual({ hdgMag: 335, variation: 5, hdgTrue: 340 });
    const rmc = p.parse(nmea('GPRMC,101500,A,3745.200,N,02331.800,E,7.0,338.0,101126,5.0,E')).update!;
    expect(rmc.lat).toBeCloseTo(37.7533, 4);
    expect(rmc.lon).toBeCloseTo(23.53, 4);
    expect(rmc).toMatchObject({ sog: 7, cog: 338, variation: 5 });
    expect(p.parse(nmea('GPRMC,101500,V,,,,,,,101126,,'))).toEqual({});
    expect(p.parse(nmea('SDDPT,42.0,0.5')).update).toEqual({ depth: 42.5 });
  });
});

describe('AIS', () => {
  it('decodes a class A position report', () => {
    // Widely used sample (e.g. pyais docs): MMSI 366053209, 37.802118 N, 122.341618 W, COG 219.3°
    const t = decodeAis('15M67FC000G?ufbE`FepT@3n00Sa', 0, 1)!;
    expect(t.mmsi).toBe('366053209');
    expect(t.lat).toBeCloseTo(37.802118, 5);
    expect(t.lon).toBeCloseTo(-122.341618, 5);
    expect(t.cog).toBeCloseTo(219.3, 1);
  });

  it('reads AIVDM through the NMEA parser', () => {
    const p = new Nmea0183Parser();
    const r = p.parse('!AIVDM,1,1,,B,15M67FC000G?ufbE`FepT@3n00Sa,0*5C', 5);
    expect(r.ais?.mmsi).toBe('366053209');
    expect(r.own).toBe(false);
  });

  it('turns armoured characters into 6 bits', () => {
    expect(payloadBits('0')).toBe('000000');
    expect(payloadBits('w')).toBe('111111');
  });
});

describe('Signal K', () => {
  it('converts SI units for our own boat', () => {
    const r = parseSignalK({
      context: 'vessels.self',
      updates: [
        {
          values: [
            { path: 'environment.wind.speedTrue', value: 6.17 },
            { path: 'environment.wind.angleTrueWater', value: -0.733 },
            { path: 'navigation.speedThroughWater', value: 3.7 },
            { path: 'navigation.headingTrue', value: 5.9 },
            { path: 'navigation.position', value: { latitude: 37.9, longitude: 23.6 } },
          ],
        },
      ],
    });
    expect(r.self!.tws).toBeCloseTo(12, 0);
    expect(r.self!.twa).toBeCloseTo(-42, 0);
    expect(r.self!.bsp).toBeCloseTo(7.19, 1);
    expect(r.self!.hdgTrue).toBeCloseTo(338, 0);
    expect(r.self).toMatchObject({ lat: 37.9, lon: 23.6 });
  });

  it('treats other vessels as AIS targets', () => {
    const r = parseSignalK({ context: 'vessels.urn:mrn:imo:mmsi:239112233', updates: [{ values: [{ path: 'navigation.position', value: { latitude: 37.8, longitude: 23.5 } }, { path: 'navigation.speedOverGround', value: 3.6 }] }] }, undefined, 9);
    expect(r.ais![0]).toMatchObject({ mmsi: '239112233', lat: 37.8, lon: 23.5, at: 9 });
    expect(r.ais![0].sog).toBeCloseTo(7, 0);
    expect(parseSignalK('not json')).toEqual({});
    expect(parseSignalK({ self: 'vessels.urn:mrn:imo:mmsi:239000000' })).toEqual({ selfId: 'vessels.urn:mrn:imo:mmsi:239000000' });
  });
});

describe('instrument state', () => {
  it('keeps only fresh values and derives TWD/TWA from heading', () => {
    const s = new InstrumentState();
    s.apply({ tws: 12, twa: -40, hdgMag: 335, variation: 5 }, 1000);
    const live = s.live(2000);
    expect(live.hdgTrue).toBe(340);
    expect(live.twd).toBe(300);
    expect(s.live(1000 + 11_000)).toEqual({});
    s.apply({ twd: 20, hdgTrue: 340 }, 20_000);
    expect(s.live(20_500).twa).toBe(40);
  });

  it('runs the simulator: a boat beating with two opponents', () => {
    const sim = new Simulator(0);
    let r = sim.step(0);
    for (let t = 1; t <= 600; t++) r = sim.step(t * 1000);
    expect(Math.abs(r.update.twa!)).toBeGreaterThan(30);
    expect(Math.abs(r.update.twa!)).toBeLessThan(50);
    expect(r.update.bsp).toBeGreaterThan(5);
    expect(r.ais).toHaveLength(2);
    expect(r.update.lat).not.toBe(37.9);
  });
});
