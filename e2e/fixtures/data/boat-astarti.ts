import type { BoatProfile } from '../../../src/boat/types';
import { TRE_IRENE } from '../../../src/boat/treIrene';

/**
 * «Αστάρτη» GRE-1234: the repo's example profile (polar, sails, scoring) under a made-up
 * name and sail number, without an ORC reference. Used only for targets and corrected time.
 */
export const ASTARTI: BoatProfile = {
  ...TRE_IRENE,
  id: 'e2e-astarti',
  name: 'Αστάρτη',
  sailNumber: 'GRE-1234',
  orcRef: undefined,
  notes: undefined,
  isOwn: true,
  updatedAt: 1_763_000_000_000,
};

/** A long Greek boat name for the 320 px checks. */
export const ASTARTI_LONG: BoatProfile = { ...ASTARTI, name: 'Αστάρτη ΙΙ της Αιγίνης' };
