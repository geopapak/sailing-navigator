import type { BoatProfile } from '../../../src/boat/types';
import { ASTARTI } from './boat-astarti';

/**
 * «Ναυτίλος» GRE-5678: a made-up boat without a polar (P-053 AC 39–40): «Γρήγορη ματιά»
 * shows the basic Live, with the manual wind but no targets.
 */
export const NO_POLAR: BoatProfile = {
  ...ASTARTI,
  id: 'e2e-no-polar',
  name: 'Ναυτίλος',
  sailNumber: 'GRE-5678',
  polar: undefined,
};
