import type { BoatProfile } from '../boat/types';
import type { Mark } from '../routing/isochrones';
import type { ScoringMethod } from '../scoring/corrected';

/** Where an entry's ratings came from. */
export type RatingSource = 'own' | 'boats' | 'orc' | 'pdf' | 'none';

export interface RaceEntry {
  id: string;
  name: string;
  sailNo?: string;
  mmsi?: string;
  className?: string;
  /** Our boat. */
  own?: boolean;
  source: RatingSource;
  /** Ratings and polar (a copy, so the race stays as it was). */
  boat?: Partial<Pick<BoatProfile, 'name' | 'sailNumber' | 'gph' | 'polar' | 'performanceFactor' | 'orcRef'>> & Pick<BoatProfile, 'scoring'>;
}

export type FixSource = 'own' | 'ais' | 'aisstream' | 'manual' | 'mark';

/** A known position of a boat at a time. */
export interface RaceFix {
  entryId: string;
  t: number;
  lat: number;
  lon: number;
  source: FixSource;
  /** For a mark rounding: the index of the mark passed. */
  markIndex?: number;
}

/** One recorded moment of our own boat. */
export interface TrackPoint {
  t: number;
  lat: number;
  lon: number;
  sog?: number;
  cog?: number;
  tws?: number;
  twa?: number;
  twd?: number;
  bsp?: number;
  targetBsp?: number;
  targetTwa?: number;
  pct?: number;
  sail?: string;
  /** 'instruments' or 'phone'. */
  src?: string;
}

export interface Race {
  id: string;
  name: string;
  courseId?: string;
  courseName?: string;
  /** Snapshot of the marks (start … finish). */
  marks: Mark[];
  start: number;
  finish?: number;
  scoringOptionId: string;
  method: ScoringMethod;
  entries: RaceEntry[];
  status: 'planned' | 'running' | 'finished';
  track: TrackPoint[];
  fixes: RaceFix[];
  /** Final elapsed seconds per entry, when known. */
  results?: Record<string, number>;
  /** Account that sailed this race on this device. Races stay local, so they are kept per account, never wiped. */
  owner?: string;
  analysis?: { lessons: { text: string; impact?: string }[]; at: number; model?: string };
  updatedAt: number;
}
