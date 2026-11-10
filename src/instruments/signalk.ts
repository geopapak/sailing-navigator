/**
 * Signal K delta messages (https://signalk.org). Values are SI: radians,
 * metres per second, metres; positions in decimal degrees.
 * `vessels.self` (or the self urn) is our boat; other vessels are AIS targets.
 */
import { DEG, KN_PER_MS, norm360, signedAngle, type AisTarget, type InstrumentUpdate } from './types';

interface Delta {
  context?: string;
  self?: string;
  updates?: { timestamp?: string; values?: { path: string; value: unknown }[] }[];
}

const rad = (v: unknown) => (typeof v === 'number' ? v * DEG : undefined);
const kn = (v: unknown) => (typeof v === 'number' ? v * KN_PER_MS : undefined);

/** Signal K path → our field. */
function mapValue(path: string, value: unknown): InstrumentUpdate {
  switch (path) {
    case 'environment.wind.speedTrue':
    case 'environment.wind.speedOverGround':
      return path === 'environment.wind.speedTrue' ? { tws: kn(value) } : {};
    case 'environment.wind.angleTrueWater':
    case 'environment.wind.angleTrueGround': {
      const a = rad(value);
      return a !== undefined ? { twa: signedAngle(a) } : {};
    }
    case 'environment.wind.directionTrue': {
      const a = rad(value);
      return a !== undefined ? { twd: norm360(a) } : {};
    }
    case 'environment.wind.speedApparent':
      return { aws: kn(value) };
    case 'environment.wind.angleApparent': {
      const a = rad(value);
      return a !== undefined ? { awa: signedAngle(a) } : {};
    }
    case 'navigation.speedThroughWater':
      return { bsp: kn(value) };
    case 'navigation.headingTrue': {
      const a = rad(value);
      return a !== undefined ? { hdgTrue: norm360(a) } : {};
    }
    case 'navigation.headingMagnetic': {
      const a = rad(value);
      return a !== undefined ? { hdgMag: norm360(a) } : {};
    }
    case 'navigation.magneticVariation':
      return { variation: rad(value) };
    case 'navigation.speedOverGround':
      return { sog: kn(value) };
    case 'navigation.courseOverGroundTrue': {
      const a = rad(value);
      return a !== undefined ? { cog: norm360(a) } : {};
    }
    case 'navigation.position': {
      const p = value as { latitude?: number; longitude?: number } | null;
      return p && typeof p.latitude === 'number' && typeof p.longitude === 'number' ? { lat: p.latitude, lon: p.longitude } : {};
    }
    case 'environment.depth.belowSurface':
    case 'environment.depth.belowTransducer':
      return typeof value === 'number' ? { depth: value } : {};
    default:
      return {};
  }
}

const strip = (u: InstrumentUpdate) => Object.fromEntries(Object.entries(u).filter(([, v]) => v !== undefined && Number.isFinite(v as number))) as InstrumentUpdate;

export interface SignalKResult {
  self?: InstrumentUpdate;
  ais?: (Partial<AisTarget> & { mmsi: string; at: number })[];
  /** Our own context id, from the hello message. */
  selfId?: string;
}

/** Parses one Signal K stream message. */
export function parseSignalK(raw: string | Delta, selfId?: string, now = Date.now()): SignalKResult {
  let d: Delta;
  try {
    d = typeof raw === 'string' ? (JSON.parse(raw) as Delta) : raw;
  } catch {
    return {};
  }
  if (!d || typeof d !== 'object') return {};
  if (d.self && !d.updates) return { selfId: d.self };
  const ctx = d.context ?? 'vessels.self';
  const isSelf = ctx === 'vessels.self' || (selfId !== undefined && (ctx === selfId || ctx === `vessels.${selfId}` || `vessels.${ctx}` === selfId));
  let upd: InstrumentUpdate = {};
  for (const u of d.updates ?? []) for (const v of u.values ?? []) upd = { ...upd, ...mapValue(v.path, v.value) };
  upd = strip(upd);
  if (isSelf) return Object.keys(upd).length ? { self: upd } : {};
  const m = ctx.match(/mmsi:(\d{9})/);
  if (!m) return {};
  let name: string | undefined;
  for (const u of d.updates ?? []) for (const v of u.values ?? []) if (v.path === '' && v.value && typeof v.value === 'object' && 'name' in (v.value as object)) name = String((v.value as { name: unknown }).name);
  const t: Partial<AisTarget> & { mmsi: string; at: number } = { mmsi: m[1], at: now, lat: upd.lat, lon: upd.lon, sog: upd.sog, cog: upd.cog, heading: upd.hdgTrue, name };
  return { ais: [t] };
}

/** The message a client sends to subscribe to everything around (including AIS). */
export const SIGNALK_SUBSCRIBE = JSON.stringify({ context: 'vessels.*', subscribe: [{ path: '*', period: 1000 }] });
