/**
 * NMEA 0183 sentences that matter for sailing performance:
 * MWV (wind), MWD (true wind direction), VHW (water speed, heading),
 * HDT/HDM/HDG (heading), RMC/VTG/GLL (position, SOG, COG), DPT/DBT (depth),
 * and !AIVDM / !AIVDO (AIS). Talker ids are ignored (II, GP, WI, …).
 */
import { AisAssembler, decodeAis } from './ais';
import { KN_PER_MS, norm360, signedAngle, type AisTarget, type InstrumentUpdate } from './types';

export function checksumOk(sentence: string): boolean {
  const star = sentence.lastIndexOf('*');
  if (star < 0) return true; // some gateways strip it
  const want = parseInt(sentence.slice(star + 1, star + 3), 16);
  let x = 0;
  for (let i = 1; i < star; i++) x ^= sentence.charCodeAt(i);
  return x === want;
}

const num = (s: string | undefined) => (s === undefined || s === '' ? undefined : Number(s));

function latLon(lat: string, ns: string, lon: string, ew: string) {
  if (!lat || !lon) return {};
  const la = Number(lat.slice(0, 2)) + Number(lat.slice(2)) / 60;
  const lo = Number(lon.slice(0, 3)) + Number(lon.slice(3)) / 60;
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return {};
  return { lat: ns === 'S' ? -la : la, lon: ew === 'W' ? -lo : lo };
}

function speedKn(v: number | undefined, unit: string): number | undefined {
  if (v === undefined || !Number.isFinite(v)) return undefined;
  if (unit === 'K') return v / 1.852;
  if (unit === 'M') return v * KN_PER_MS;
  return v; // N
}

export interface ParsedLine {
  update?: InstrumentUpdate;
  ais?: Partial<AisTarget> & { mmsi: string; at: number };
  /** AIVDO = our own vessel. */
  own?: boolean;
}

export class Nmea0183Parser {
  private ais = new AisAssembler();

  /** Parses one line; unknown, broken or invalid sentences give an empty result. */
  parse(raw: string, now = Date.now()): ParsedLine {
    const line = raw.trim();
    if (!/^[$!]/.test(line) || !checksumOk(line)) return {};
    const body = line.slice(1, line.includes('*') ? line.lastIndexOf('*') : undefined);
    const f = body.split(',');
    const id = f[0];
    const type = id.slice(-3);

    if (id.endsWith('VDM') || id.endsWith('VDO')) {
      const whole = this.ais.add(Number(f[1]), Number(f[2]), f[3], f[5] ?? '', Number(f[6] ?? 0));
      if (!whole) return {};
      const t = decodeAis(whole.payload, whole.fill, now);
      return t ? { ais: t, own: id.endsWith('VDO') } : {};
    }

    switch (type) {
      case 'MWV': {
        // MWV,angle,R|T,speed,unit,status
        if (f[5] && f[5] !== 'A') return {};
        const a = num(f[1]);
        const s = speedKn(num(f[3]), f[4]);
        if (a === undefined) return {};
        return f[2] === 'T' ? { update: { twa: signedAngle(a), ...(s !== undefined ? { tws: s } : {}) } } : { update: { awa: signedAngle(a), ...(s !== undefined ? { aws: s } : {}) } };
      }
      case 'MWD': {
        // MWD,dirT,T,dirM,M,speedKn,N,speedMs,M
        const d = num(f[1]);
        const s = num(f[5]) ?? (num(f[7]) !== undefined ? num(f[7])! * KN_PER_MS : undefined);
        return { update: { ...(d !== undefined ? { twd: norm360(d) } : {}), ...(s !== undefined ? { tws: s } : {}) } };
      }
      case 'VHW': {
        const ht = num(f[1]);
        const hm = num(f[3]);
        const kn = num(f[5]) ?? (num(f[7]) !== undefined ? num(f[7])! / 1.852 : undefined);
        return { update: { ...(ht !== undefined ? { hdgTrue: ht } : {}), ...(hm !== undefined ? { hdgMag: hm } : {}), ...(kn !== undefined ? { bsp: kn } : {}) } };
      }
      case 'HDT':
        return num(f[1]) !== undefined ? { update: { hdgTrue: num(f[1]) } } : {};
      case 'HDM':
        return num(f[1]) !== undefined ? { update: { hdgMag: num(f[1]) } } : {};
      case 'HDG': {
        // HDG,heading(mag sensor),dev,E/W,var,E/W
        const h = num(f[1]);
        if (h === undefined) return {};
        const dev = (num(f[2]) ?? 0) * (f[3] === 'W' ? -1 : 1);
        const v = num(f[4]);
        const variation = v !== undefined ? v * (f[5] === 'W' ? -1 : 1) : undefined;
        const mag = norm360(h + dev);
        return { update: { hdgMag: mag, ...(variation !== undefined ? { variation, hdgTrue: norm360(mag + variation) } : {}) } };
      }
      case 'RMC': {
        // RMC,time,status,lat,N,lon,E,sog,cog,date,var,E/W
        if (f[2] !== 'A') return {};
        const p = latLon(f[3], f[4], f[5], f[6]);
        const sog = num(f[7]);
        const cog = num(f[8]);
        const v = num(f[10]);
        return {
          update: {
            ...p,
            ...(sog !== undefined ? { sog } : {}),
            ...(cog !== undefined ? { cog } : {}),
            ...(v !== undefined ? { variation: v * (f[11] === 'W' ? -1 : 1) } : {}),
          },
        };
      }
      case 'GLL':
        return f[6] === 'V' ? {} : { update: latLon(f[1], f[2], f[3], f[4]) };
      case 'VTG': {
        const cog = num(f[1]);
        const sog = num(f[5]) ?? (num(f[7]) !== undefined ? num(f[7])! / 1.852 : undefined);
        return { update: { ...(cog !== undefined ? { cog } : {}), ...(sog !== undefined ? { sog } : {}) } };
      }
      case 'DPT': {
        const d = num(f[1]);
        return d !== undefined ? { update: { depth: d + Math.max(0, num(f[2]) ?? 0) } } : {};
      }
      case 'DBT': {
        const m = num(f[3]);
        return m !== undefined ? { update: { depth: m } } : {};
      }
      default:
        return {};
    }
  }
}
