import type { BoatProfile, Sail } from '../boat/types';
import { absTwa } from './angles';

/** First sail whose rule contains (TWS, TWA). The mainsail is implied and not part of rules. */
export function recommendSail(boat: BoatProfile, tws: number, twa: number): Sail | undefined {
  const a = absTwa(twa);
  const rule = boat.sailRules.find(
    (r) => a >= r.twaMin && a < r.twaMax && tws >= r.twsMin && tws < r.twsMax,
  );
  return rule ? boat.sails.find((s) => s.id === rule.sailId) : undefined;
}

export interface SailOutlook {
  recommended?: Sail;
  /** Sail recommended if the wind builds by `margin` kt (only when different). */
  ifStronger?: Sail;
  /** Sail recommended if the wind drops by `margin` kt (only when different). */
  ifLighter?: Sail;
}

/** Recommended sail and what to have ready if the wind moves by ±margin kt. */
export function sailOutlook(boat: BoatProfile, tws: number, twa: number, margin = 1.5): SailOutlook {
  const recommended = recommendSail(boat, tws, twa);
  const up = recommendSail(boat, tws + margin, twa);
  const down = recommendSail(boat, Math.max(0, tws - margin), twa);
  return {
    recommended,
    ifStronger: up && up.id !== recommended?.id ? up : undefined,
    ifLighter: down && down.id !== recommended?.id ? down : undefined,
  };
}

/** Sail ids that rules can recommend (headsails/spinnakers), in rule order, unique. */
export function selectableSails(boat: BoatProfile): Sail[] {
  const ids = [...new Set(boat.sailRules.map((r) => r.sailId))];
  const extra = boat.sails.filter((s) => s.kind !== 'main' && !ids.includes(s.id)).map((s) => s.id);
  return [...ids, ...extra]
    .map((id) => boat.sails.find((s) => s.id === id))
    .filter((s): s is Sail => !!s);
}
