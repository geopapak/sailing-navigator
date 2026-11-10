/**
 * What the boat's instruments tell us. Every field is optional and carries
 * the time it was last received, so stale values can be ignored.
 * Units: knots, degrees (true unless named Mag), metres, decimal degrees.
 */
export interface InstrumentValues {
  /** True wind speed. */
  tws?: number;
  /** True wind angle, signed: + starboard, − port. */
  twa?: number;
  /** True wind direction (from). */
  twd?: number;
  /** Apparent wind speed / angle (signed). */
  aws?: number;
  awa?: number;
  /** Speed through water. */
  bsp?: number;
  hdgTrue?: number;
  hdgMag?: number;
  /** Magnetic variation, East positive (from HDG/RMC). */
  variation?: number;
  sog?: number;
  cog?: number;
  lat?: number;
  lon?: number;
  depth?: number;
}

export type InstrumentField = keyof InstrumentValues;

/** A batch of new values from one message. */
export type InstrumentUpdate = Partial<InstrumentValues>;

/** Another vessel seen on AIS. */
export interface AisTarget {
  mmsi: string;
  lat?: number;
  lon?: number;
  sog?: number;
  cog?: number;
  heading?: number;
  name?: string;
  /** When the last position arrived (ms). */
  at: number;
}

export type InstrumentSource = 'signalk' | 'nmea0183' | 'simulator';

export interface InstrumentSettings {
  enabled: boolean;
  source: InstrumentSource;
  /** ws:// or wss:// address of the gateway. */
  url: string;
  /** Record races from the instruments. */
  record: boolean;
  /** Use the boat's AIS for opponents' positions. */
  aisOpponents: boolean;
}

export const DEFAULT_INSTRUMENTS: InstrumentSettings = {
  enabled: false,
  source: 'signalk',
  url: 'ws://192.168.1.10:3000/signalk/v1/stream?subscribe=all',
  record: true,
  aisOpponents: true,
};

/** A value counts as live for this long after it arrives. */
export const FRESH_MS = 10_000;

export const KN_PER_MS = 1.943844;
export const DEG = 180 / Math.PI;

/** 0–360 angle → signed −180…180 (port negative). */
export function signedAngle(a: number): number {
  const x = ((a % 360) + 360) % 360;
  return x > 180 ? x - 360 : x;
}

export const norm360 = (a: number) => ((a % 360) + 360) % 360;
