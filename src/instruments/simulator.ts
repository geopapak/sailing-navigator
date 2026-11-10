/**
 * A pretend boat for trying the app without a gateway: beating in an
 * oscillating northerly off Faliro, tacking on the headers, with two
 * AIS "opponents" nearby. Deterministic for a given start time.
 */
import type { AisTarget, InstrumentUpdate } from './types';
import { norm360, signedAngle } from './types';

const R = 3440.065; // NM

function move(lat: number, lon: number, brg: number, nm: number) {
  const b = (brg * Math.PI) / 180;
  return { lat: lat + ((nm * Math.cos(b)) / R) * (180 / Math.PI), lon: lon + ((nm * Math.sin(b)) / R) * (180 / Math.PI) / Math.cos((lat * Math.PI) / 180) };
}

export class Simulator {
  private t0: number;
  private lat = 37.9;
  private lon = 23.66;
  private tack: 1 | -1 = 1;
  private last: number;
  private opp = [
    { mmsi: '239000001', name: 'SIM ΑΣΤΑΡΤΗ', lat: 37.905, lon: 23.655, speed: 7.3 },
    { mmsi: '239000002', name: 'SIM ΝΗΡΕΑΣ', lat: 37.893, lon: 23.668, speed: 6.6 },
  ];

  constructor(now = Date.now()) {
    this.t0 = now;
    this.last = now;
  }

  /** Advances the simulation to `now` and returns the instrument values and AIS targets. */
  step(now = Date.now()): { update: InstrumentUpdate; ais: (Partial<AisTarget> & { mmsi: string; at: number })[] } {
    const dt = Math.max(0, (now - this.last) / 3_600_000);
    this.last = now;
    const min = (now - this.t0) / 60_000;
    const twd = norm360(20 + 8 * Math.sin((2 * Math.PI * min) / 9) + 3 * Math.sin((2 * Math.PI * min) / 2.3));
    const tws = 12 + 1.5 * Math.sin((2 * Math.PI * min) / 6) + 0.6 * Math.sin((2 * Math.PI * min) / 1.1);
    const twaTarget = 40;
    let hdg = norm360(twd - this.tack * twaTarget);
    // Tack when headed by more than 6° from the mean wind.
    const shift = signedAngle(twd - 20);
    if ((this.tack === 1 && shift < -6) || (this.tack === -1 && shift > 6)) {
      this.tack = this.tack === 1 ? -1 : 1;
      hdg = norm360(twd - this.tack * twaTarget);
    }
    const twa = signedAngle(twd - hdg);
    const bsp = 6.9 + 0.08 * (tws - 12) + 0.15 * Math.sin((2 * Math.PI * min) / 0.7);
    const p = move(this.lat, this.lon, hdg, bsp * dt);
    this.lat = p.lat;
    this.lon = p.lon;
    const ais = this.opp.map((o, i) => {
      const oh = norm360(twd - (i === 0 ? 1 : -1) * 41);
      const q = move(o.lat, o.lon, oh, o.speed * dt);
      o.lat = q.lat;
      o.lon = q.lon;
      return { mmsi: o.mmsi, name: o.name, lat: o.lat, lon: o.lon, sog: o.speed, cog: oh, at: now };
    });
    return {
      update: {
        tws: Math.round(tws * 10) / 10,
        twa: Math.round(twa),
        twd: Math.round(twd),
        bsp: Math.round(bsp * 100) / 100,
        hdgTrue: Math.round(hdg),
        sog: Math.round(bsp * 10) / 10,
        cog: Math.round(hdg),
        lat: this.lat,
        lon: this.lon,
        depth: 40,
      },
      ais,
    };
  }
}
