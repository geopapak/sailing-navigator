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

/** What a session ("έξοδος") is: a race, a training sail or a cruise (P-033). */
export type SessionKind = 'race' | 'training' | 'cruise';

/** «Τι δουλεύουμε» of a training (P-035): only changes what Live shows big and the summary order. */
export type TrainingGoal = 'free' | 'upwind' | 'downwind' | 'tacks' | 'gybes' | 'starts';

/** Helm of a lap: a letter, never a name. */
export type Helm = 'Α' | 'Β' | 'Γ';

/** Start of a training lap (`t`), with the crew's note for that lap (≤ 60 characters). */
export interface Lap {
  t: number;
  sail?: string;
  helm?: Helm;
  trim?: string;
}

/** «⏸ Παύση» (P-039): no track, no alerts; `to` is missing while the pause lasts. */
export interface Pause {
  from: number;
  to?: number;
}

/** A tack or gybe found live from the dense in-memory samples, with the time back to 90% of target. */
export interface Manoeuvre {
  t: number;
  kind: 'tack' | 'gybe';
  /** Seconds until the 15″ mean was back at ≥ 90%; missing: not back within 90″ (or no speed). */
  recoverSec?: number;
  /** Measured without instruments (GPS speed, manual wind). */
  indicative?: boolean;
}

export interface Race {
  id: string;
  name: string;
  /** Kind of session; missing means 'race' (races from before 0.12). */
  kind?: SessionKind;
  /** Every switch between training and cruise while the session runs. */
  kindLog?: { kind: SessionKind; at: number }[];
  /** When the crew answered «Όχι, συνεχίζω» to the "not moving for 2 hours" prompt. */
  idleAskedAt?: number;
  /** When the crew answered «Όχι, συνεχίζω» to the "running for 24 hours" prompt. */
  staleAskedAt?: number;
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
  /** Who sails in which position (P-022), and the owner's note to the crew. */
  crew?: import('../crew/api').CrewPlace[];
  crewNote?: string;
  /** When the plan was last sent to the crew. */
  crewSharedAt?: number;
  /** Training (P-035): «Τι δουλεύουμε»; missing means 'free'. */
  goal?: TrainingGoal;
  /** Training laps: each entry is the start of a lap. Fewer than 2: one lap, the whole training. */
  laps?: Lap[];
  /** Pauses (training and cruise; never in a race). */
  pauses?: Pause[];
  /** Training manoeuvres found live. */
  manoeuvres?: Manoeuvre[];
  /** Training: the summary is (to be) shared with the crew (summary and notes, never the track). */
  crewShared?: boolean;
  /** The crew share (or its removal) still has to reach the server (offline). */
  crewSharePending?: boolean;
  /** Crew the training is shared with (the owner's crew of the boat). */
  crewId?: string;
  updatedAt: number;
}
