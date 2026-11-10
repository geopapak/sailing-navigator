import { mergeTarget } from './ais';
import { FRESH_MS, norm360, signedAngle, type AisTarget, type InstrumentField, type InstrumentUpdate, type InstrumentValues } from './types';

/** Latest instrument values with their receive times, plus AIS targets. */
export class InstrumentState {
  values: InstrumentValues = {};
  at: Partial<Record<InstrumentField, number>> = {};
  ais = new Map<string, AisTarget>();
  lastMessageAt = 0;

  apply(u: InstrumentUpdate, now = Date.now()) {
    for (const [k, v] of Object.entries(u) as [InstrumentField, number][]) {
      if (v === undefined || !Number.isFinite(v)) continue;
      this.values[k] = v;
      this.at[k] = now;
    }
    this.lastMessageAt = now;
  }

  applyAis(t: Partial<AisTarget> & { mmsi: string; at: number }) {
    this.ais.set(t.mmsi, mergeTarget(this.ais.get(t.mmsi), t));
    this.lastMessageAt = Math.max(this.lastMessageAt, t.at);
  }

  fresh(k: InstrumentField, now = Date.now()): number | undefined {
    const t = this.at[k];
    return t !== undefined && now - t <= FRESH_MS ? this.values[k] : undefined;
  }

  /** Fresh values, filling what can be derived (true heading from magnetic, TWD ⇄ TWA). */
  live(now = Date.now()): InstrumentValues {
    const g = (k: InstrumentField) => this.fresh(k, now);
    const out: InstrumentValues = {};
    for (const k of Object.keys(this.values) as InstrumentField[]) {
      const v = g(k);
      if (v !== undefined) out[k] = v;
    }
    if (out.hdgTrue === undefined && out.hdgMag !== undefined && out.variation !== undefined) out.hdgTrue = norm360(out.hdgMag + out.variation);
    const hdg = out.hdgTrue ?? (out.cog !== undefined && (out.sog ?? 0) > 1 ? out.cog : undefined);
    if (out.twd === undefined && out.twa !== undefined && hdg !== undefined) out.twd = norm360(hdg + out.twa);
    if (out.twa === undefined && out.twd !== undefined && hdg !== undefined) out.twa = signedAngle(out.twd - hdg);
    return out;
  }

  /** Age in seconds of the newest message, or undefined if nothing came yet. */
  ageSec(now = Date.now()): number | undefined {
    return this.lastMessageAt ? (now - this.lastMessageAt) / 1000 : undefined;
  }
}
