/**
 * Boat profile model. Pure data, no UI or storage concerns.
 * Units: knots, degrees (TWA 0–180), metres, m², kg, seconds.
 */

/** Polar data in the layout of the ORC certificate "Velocity Prediction" table. */
export interface PolarTable {
  /** True wind speeds (kt), strictly ascending. */
  tws: number[];
  /** Optimum beat TWA per TWS. */
  beatAngle: number[];
  /** Optimum beat VMG per TWS. */
  beatVMG: number[];
  /** Boat speed per fixed TWA (key = TWA in degrees as string), one value per TWS. */
  speeds: Record<string, number[]>;
  /** Optimum run VMG per TWS. */
  runVMG: number[];
  /** Optimum gybe (run) TWA per TWS. */
  gybeAngle: number[];
}

export type SailKind = 'main' | 'headsail' | 'spinnaker' | 'reaching' | 'other';

export interface Sail {
  id: string;
  name: string;
  kind: SailKind;
  /** Area in m². */
  area?: number;
}

/**
 * A sail-selection rule: the sail is recommended when TWA and TWS fall inside
 * the given ranges (min inclusive, max exclusive). Rules are evaluated per
 * "slot" (e.g. the headsail/spinnaker slot), first match wins.
 */
export interface SailRule {
  sailId: string;
  twaMin: number;
  twaMax: number;
  twsMin: number;
  twsMax: number;
}

/** Identifiers of the scoring options printed on the ORC certificate. */
export type ScoringOptionId = string;

export interface ScoringOption {
  id: ScoringOptionId;
  label: string;
  /** Time on Distance, seconds per NM. */
  tod: number;
  /** Time on Time coefficient. */
  tot: number;
}

export interface BoatProfile {
  id: string;
  name: string;
  sailNumber?: string;
  design?: string;
  orcRef?: string;
  certificateValidUntil?: string; // ISO date
  loa?: number;
  beam?: number;
  draft?: number;
  displacement?: number;
  crewWeight?: number;
  gph?: number;
  cdl?: number;
  notes?: string;
  /** Polars are optional so that opponents can be stored with ratings only. */
  polar?: PolarTable;
  /**
   * Multiplier applied to all polar targets (e.g. 0.95 = expect 95% of the
   * certificate polars). 1 = raw certificate.
   */
  performanceFactor: number;
  sails: Sail[];
  sailRules: SailRule[];
  scoring: ScoringOption[];
  /** Performance curve per polar TWS (sec/NM), informational for now. */
  performanceCurve?: { label: string; tws: number[]; secPerNm: number[] };
  /** True for the user's own boat(s); used as default selection. */
  isOwn?: boolean;
  updatedAt: number;
}
