/**
 * Data exchanged between the app and the AI advisor backend.
 * The app sends numbers it has already computed; the model only interprets them.
 */

export type AdvisorKind = 'live' | 'plan';

export interface AdvisorSail {
  id: string;
  name: string;
}

/** Live-mode snapshot. Angles in degrees, speeds in knots, TWA positive = starboard tack. */
export interface LiveSnapshot {
  tws: number;
  twa: number;
  tack: 'stbd' | 'port' | 'none';
  mode: 'upwind' | 'reach' | 'downwind';
  bsp?: number;
  targetBsp: number;
  targetTwa?: number;
  polarBsp: number;
  vmg?: number;
  targetVmg?: number;
  /** Fractions, e.g. 0.92 = 92 %. */
  pctTarget?: number;
  pctPolar?: number;
  pctVmg?: number;
  beat: { twa: number; bsp: number; vmg: number };
  run: { twa: number; bsp: number; vmg: number };
  recommendedSail?: string;
  currentSail?: string;
  sailIfStronger?: string;
  sailIfLighter?: string;
  /** The app's own rule-based advice, already shown to the crew. */
  ruleAdvice: string[];
}

export interface NavSnapshot {
  position?: { lat: number; lon: number; sog?: number; cogTrue?: number };
  /** Observed true wind direction (from), degrees true. */
  observedTwd?: number;
  /** Forecast wind at the boat now, for comparison with what is observed. */
  forecastHere?: { tws: number; twd: number; model?: string };
  nextMark?: {
    name: string;
    index: number;
    of: number;
    distanceNm?: number;
    bearingTrue?: number;
    vmcKt?: number;
    eta?: string;
  };
  /** Isochrone route from here, if the crew re-routed recently. */
  route?: RouteSnapshot & { computedMinAgo?: number };
}

export interface LegSnapshot {
  from: string;
  to: string;
  start: string;
  durationMin: number;
  rhumbNm: number;
  sailedNm: number;
  avgTws: number;
  maxTws: number;
  avgTwd: number;
  share: { upwind: number; reach: number; downwind: number };
  tacks: number;
  gybes: number;
  sails: { sail: string; from: string }[];
  /** First heading to steer on this leg (true) and TWA (positive = starboard). */
  firstHeadingTrue?: number;
  firstTwa?: number;
  /** Wind along the leg every ~30 min: time, tws, twd. */
  windTimeline: { t: string; tws: number; twd: number }[];
}

export interface RouteSnapshot {
  start: string;
  finish: string;
  elapsedMin: number;
  rhumbNm: number;
  sailedNm: number;
  legs: LegSnapshot[];
}

export interface PlanSnapshot {
  courseName: string;
  windSource: 'forecast' | 'uniform';
  model?: string;
  forecastFetched?: string;
  route: RouteSnapshot;
  corrected?: { option: string; tot: string; tod: string };
}

export interface AdvisorContext {
  kind: AdvisorKind;
  /** Local time on the boat, ISO with offset. */
  now: string;
  boat: { name: string; type?: string; performanceFactor: number; sails: AdvisorSail[] };
  live?: LiveSnapshot;
  nav?: NavSnapshot;
  plan?: PlanSnapshot;
  /** Free-text question from the crew (Greek). */
  question?: string;
  /** The crew's own local-knowledge notes that fit here and this wind. */
  localKnowledge?: import('../knowledge/match').KnowledgeHint[];
}

export type AdvisorWhen = 'now' | 'soon' | 'watch';

export interface AdvisorAction {
  text: string;
  when: AdvisorWhen;
}

export interface AdvisorReply {
  summary: string;
  actions: AdvisorAction[];
  /** Safety or data-quality warning; empty string when there is none. */
  caution: string;
}

export interface AdvisorResponse {
  reply: AdvisorReply;
  model: string;
  /** True when a fallback model answered instead of the primary one. */
  fallback?: boolean;
}
