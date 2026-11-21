/**
 * The scoring of a race entry (P-056 §Α): the certificate options of the boat, or two
 * computed ones that are never stored on a boat, only as `race.scoringOptionId`:
 *  - `gph`:  ToD = GPH (s/NM), ToT = 600 / GPH (consistent with ORC ToT = 600 / ToD);
 *  - `none`: no correction (ToT = 1, ToD = 0), corrected = elapsed, for every boat.
 * The race's Sailing Instructions always prevail.
 */
import type { BoatProfile, ScoringOption } from '../boat/types';
import { STANDARD_SCORING_OPTIONS } from '../boat/scoringOptions';
import type { ScoringMethod } from './corrected';

export const GPH_OPTION = 'gph';
export const NONE_OPTION = 'none';

export type Coefficients = Pick<ScoringOption, 'tod' | 'tot'>;
type ScoringBoat = Partial<Pick<BoatProfile, 'gph' | 'scoring'>>;

const hasGph = (b?: ScoringBoat): b is ScoringBoat & { gph: number } => typeof b?.gph === 'number' && Number.isFinite(b.gph) && b.gph > 0;

/** ToD/ToT from a GPH (s/NM). */
export const gphCoefficients = (gph: number): Coefficients => ({ tod: gph, tot: 600 / gph });
export const NO_CORRECTION: Coefficients = { tod: 0, tot: 1 };

/**
 * The coefficients of one entry for the race's option: first the boat's own
 * (certificate) options, then `gph` from the boat's GPH, and `none` for everyone.
 * Undefined when the boat has none for this option.
 */
export function scoringOptionFor(entry: { boat?: ScoringBoat }, race: { scoringOptionId: string }): Coefficients | undefined {
  const id = race.scoringOptionId;
  const own = entry.boat?.scoring?.find((o) => o.id === id);
  if (own) return own;
  if (id === GPH_OPTION) return hasGph(entry.boat) ? gphCoefficients(entry.boat.gph) : undefined;
  if (id === NONE_OPTION) return NO_CORRECTION;
  return undefined;
}

/** Why an entry has no coefficients for the race's option (the «missing» of the estimate). */
export const missingScoring = (race: { scoringOptionId: string }): string => (race.scoringOptionId === GPH_OPTION ? 'χωρίς GPH' : 'χωρίς βαθμολογία');

export const isUncorrected = (race: { scoringOptionId: string }): boolean => race.scoringOptionId === NONE_OPTION;

export const SCORING_TEXT = {
  gphToD: 'GPH — ToD',
  gphToT: 'GPH — ToT',
  none: 'Χωρίς διόρθωση (πραγματικός χρόνος)',
  gphToDHelp: 'GPH — ToD (χρόνος σε απόσταση): διορθωμένος = πραγματικός − GPH × μίλια διαδρομής',
  gphToTHelp: 'GPH — ToT (χρόνος σε χρόνο): διορθωμένος = πραγματικός × 600 / GPH. Παράγωγο από το GPH, όχι ToT πιστοποιητικού',
  noneOnly: 'Για διορθωμένο χρόνο βάλε GPH ή συντελεστές στο σκάφος.',
  openBoat: 'Άνοιξε το σκάφος',
  sailingInstructions: 'Υπερισχύουν πάντα οι Οδηγίες Πλου.',
} as const;

/** The label of a certificate option id («Coastal/Long Distance»), or the computed ones. */
export function optionLabel(id: string): string {
  if (id === GPH_OPTION) return 'GPH';
  if (id === NONE_OPTION) return 'Χωρίς διόρθωση';
  return STANDARD_SCORING_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

export interface ScoringChoice {
  /** `${id}|${method}` (the value of the select). */
  value: string;
  id: string;
  method: ScoringMethod;
  label: string;
}

const choice = (id: string, method: ScoringMethod, label: string): ScoringChoice => ({ value: `${id}|${method}`, id, method, label });

/**
 * The «Βαθμολογία» choices for our boat. A boat with certificate options keeps them
 * exactly as in 0.19.0 (each option × ToT/ToD); a boat without them but with a GPH
 * gets «GPH — ToD» and «GPH — ToT». «Χωρίς διόρθωση» is always last.
 */
export function scoringChoices(boat?: ScoringBoat): ScoringChoice[] {
  const out: ScoringChoice[] = [];
  const cert = boat?.scoring ?? [];
  if (cert.length) for (const o of cert) for (const m of ['ToT', 'ToD'] as const) out.push(choice(o.id, m, `${optionLabel(o.id)} — ${m}`));
  else if (hasGph(boat)) out.push(choice(GPH_OPTION, 'ToD', SCORING_TEXT.gphToD), choice(GPH_OPTION, 'ToT', SCORING_TEXT.gphToT));
  out.push(choice(NONE_OPTION, 'ToT', SCORING_TEXT.none));
  return out;
}

/** True when the choice (id + method) is one of the boat's. */
export const hasChoice = (boat: ScoringBoat | undefined, id: string, method: ScoringMethod): boolean =>
  scoringChoices(boat).some((c) => c.id === id && (id === NONE_OPTION || c.method === method));

/**
 * The choice a new race starts with: the preferred one when the boat has it,
 * else the first («GPH — ToD» for a GPH-only boat, «Χωρίς διόρθωση» with nothing).
 */
export function defaultScoring(boat: ScoringBoat | undefined, preferred?: { id?: string; method?: ScoringMethod }): { scoringOptionId: string; method: ScoringMethod } {
  const all = scoringChoices(boat);
  const hit = preferred?.id ? all.find((c) => c.id === preferred.id && (!preferred.method || c.method === preferred.method)) ?? all.find((c) => c.id === preferred.id) : undefined;
  const c = hit ?? all[0];
  return { scoringOptionId: c.id, method: c.method };
}
