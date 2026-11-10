/**
 * AIS (AIVDM/AIVDO) decoding for the messages that carry a position or a
 * name: 1, 2, 3 (class A), 18, 19 (class B), 5 and 24 (static data).
 * Multi-sentence messages are put back together by `AisAssembler`.
 */
import type { AisTarget } from './types';

/** 6-bit "armoured" payload → bit string. */
export function payloadBits(payload: string, fillBits = 0): string {
  let bits = '';
  for (const ch of payload) {
    let v = ch.charCodeAt(0) - 48;
    if (v > 40) v -= 8;
    bits += v.toString(2).padStart(6, '0');
  }
  return fillBits ? bits.slice(0, bits.length - fillBits) : bits;
}

const uint = (b: string, start: number, len: number) => (b.length >= start + len ? parseInt(b.slice(start, start + len), 2) : NaN);
const int = (b: string, start: number, len: number) => {
  const u = uint(b, start, len);
  return u >= 2 ** (len - 1) ? u - 2 ** len : u;
};
const text = (b: string, start: number, len: number) => {
  let s = '';
  for (let i = start; i + 6 <= start + len && i + 6 <= b.length; i += 6) {
    const c = parseInt(b.slice(i, i + 6), 2);
    s += String.fromCharCode(c < 32 ? c + 64 : c);
  }
  return s.replace(/@+$/, '').trim();
};

function position(b: string, lonAt: number, latAt: number) {
  const lon = int(b, lonAt, 28) / 600000;
  const lat = int(b, latAt, 27) / 600000;
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : {};
}

/** Decodes one complete AIS payload. Returns undefined for types we don't use. */
export function decodeAis(payload: string, fillBits = 0, now = Date.now()): (Partial<AisTarget> & { mmsi: string; at: number }) | undefined {
  const b = payloadBits(payload, fillBits);
  const type = uint(b, 0, 6);
  const mmsi = String(uint(b, 8, 30)).padStart(9, '0');
  if (!Number.isFinite(uint(b, 8, 30))) return undefined;
  const sogOf = (v: number) => (v === 1023 ? undefined : v / 10);
  const cogOf = (v: number) => (v === 3600 ? undefined : v / 10);
  const hdgOf = (v: number) => (v === 511 ? undefined : v);
  if (type >= 1 && type <= 3) {
    return { mmsi, at: now, sog: sogOf(uint(b, 50, 10)), ...position(b, 61, 89), cog: cogOf(uint(b, 116, 12)), heading: hdgOf(uint(b, 128, 9)) };
  }
  if (type === 18 || type === 19) {
    const out = { mmsi, at: now, sog: sogOf(uint(b, 46, 10)), ...position(b, 57, 85), cog: cogOf(uint(b, 112, 12)), heading: hdgOf(uint(b, 124, 9)) };
    return type === 19 ? { ...out, name: text(b, 143, 120) || undefined } : out;
  }
  if (type === 5) return { mmsi, at: now, name: text(b, 112, 120) || undefined };
  if (type === 24 && uint(b, 38, 2) === 0) return { mmsi, at: now, name: text(b, 40, 120) || undefined };
  return undefined;
}

/** Puts multi-sentence AIVDM messages back together. */
export class AisAssembler {
  private parts = new Map<string, { total: number; got: string[]; fill: number }>();

  /** Feed the fields of one !AIVDM sentence (without checksum); returns a full payload when complete. */
  add(total: number, num: number, seqId: string, payload: string, fill: number): { payload: string; fill: number } | undefined {
    if (total <= 1) return { payload, fill };
    const key = seqId || 'x';
    const entry = this.parts.get(key) ?? { total, got: [], fill: 0 };
    entry.got[num - 1] = payload;
    if (num === total) entry.fill = fill;
    this.parts.set(key, entry);
    if (entry.got.filter((x) => x !== undefined).length === total) {
      this.parts.delete(key);
      return { payload: entry.got.join(''), fill: entry.fill };
    }
    return undefined;
  }
}

/** Merges a decoded report into the known target (names and positions arrive separately). */
export function mergeTarget(prev: AisTarget | undefined, upd: Partial<AisTarget> & { mmsi: string; at: number }): AisTarget {
  const hasPos = upd.lat !== undefined && upd.lon !== undefined;
  return {
    mmsi: upd.mmsi,
    name: upd.name ?? prev?.name,
    lat: hasPos ? upd.lat : prev?.lat,
    lon: hasPos ? upd.lon : prev?.lon,
    sog: upd.sog ?? prev?.sog,
    cog: upd.cog ?? prev?.cog,
    heading: upd.heading ?? prev?.heading,
    at: hasPos ? upd.at : (prev?.at ?? upd.at),
  };
}
