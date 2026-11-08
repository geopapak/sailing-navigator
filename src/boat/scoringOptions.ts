import type { ScoringOption } from './types';

/** Standard option ids/labels as printed on ORC International certificates (incl. Saronikos options). */
export const STANDARD_SCORING_OPTIONS: { id: string; label: string }[] = [
  { id: 'allPurpose', label: 'All purpose' },
  { id: 'windwardLeeward', label: 'Windward/Leeward' },
  { id: 'coastal', label: 'Coastal/Long Distance' },
  { id: 'tripleCoastalLow', label: 'Triple Coastal Low' },
  { id: 'tripleCoastalMedium', label: 'Triple Coastal Medium' },
  { id: 'tripleCoastalHigh', label: 'Triple Coastal High' },
  { id: 'tripleWLLow', label: 'Triple W/L Low' },
  { id: 'tripleWLMedium', label: 'Triple W/L Medium' },
  { id: 'tripleWLHigh', label: 'Triple W/L High' },
  { id: 'saronikosSAll', label: 'Saronikos S All' },
  { id: 'saronikosSUp', label: 'Saronikos S Up' },
  { id: 'saronikosSDown', label: 'Saronikos S Down' },
  { id: 'saronikosNAll', label: 'Saronikos N All' },
  { id: 'saronikosNUp', label: 'Saronikos N Up' },
  { id: 'saronikosNDown', label: 'Saronikos N Down' },
  { id: 'saronikosSWAll', label: 'Saronikos SW All' },
  { id: 'saronikosSWUp', label: 'Saronikos SW Up' },
  { id: 'saronikosSWDown', label: 'Saronikos SW Down' },
  { id: 'saronikosNEAll', label: 'Saronikos NE All' },
  { id: 'saronikosNEUp', label: 'Saronikos NE Up' },
  { id: 'saronikosNEDown', label: 'Saronikos NE Down' },
];

/** Builds a full option list from a {id: [tod, tot]} map, in standard order. */
export function scoringFromMap(map: Record<string, [number, number]>): ScoringOption[] {
  return STANDARD_SCORING_OPTIONS.filter((o) => map[o.id]).map((o) => ({
    id: o.id,
    label: o.label,
    tod: map[o.id][0],
    tot: map[o.id][1],
  }));
}
