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
  /** The wind of this point was typed in by the crew inside the session (P-053). */
  wind?: 'manual';
}

/** Wind typed in by the crew inside the session (P-053). TWD always true. */
export interface ManualWind {
  on: boolean;
  /** 0–359, degrees true. */
  twdTrue: number;
  /** kt, 0–60, step 0.5. */
  tws: number;
  /** Last change of a value or «✓ Ισχύει ακόμα» (ms). */
  at: number;
}

/** One change of the session's manual wind (P-053): on, off, a settled value, «Ισχύει ακόμα». */
export interface WindLogEntry {
  at: number;
  ev: 'on' | 'off' | 'set' | 'confirm';
  twdTrue?: number;
  tws?: number;
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
  /** Cruise (P-036): a destination picked on the map (the marks are then `[dest]`). */
  dest?: { name: string; lat: number; lon: number };
  /** Cruise: when we came within 0,1 nm of the destination. */
  arrivedAt?: number;
  /** Cruise: the destination (`destKey`) the boat has been > 0,6 nm from since it was set: «ΦΤΑΝΕΙΣ» is armed. */
  arriveArmed?: string;
  /** Cruise: the destination (`destKey`) whose «ΦΤΑΝΕΙΣ» was shown (once, also after a reload). */
  arriveFired?: string;
  /** P-053: the wind typed in inside this session; missing means off. Never carried to a new session. */
  manualWind?: ManualWind;
  /** P-053: changes of the manual wind (at most 500, the first and the latest kept). */
  windLog?: WindLogEntry[];
  /** P-040: the multi-race event («Διοργάνωση») this race belongs to. Its number there is computed, never stored. */
  eventId?: string;
  /** P-040: official result codes per entry (DNF, DSQ …); a code and a time exclude each other. */
  resultCodes?: Record<string, ResultCode>;
  /** P-040: when the official results were typed in. */
  resultsEdited?: number;
  /** P-040: entries whose result or code was typed in the «Αποτελέσματα» editor («επίσημο»). */
  resultSrc?: Record<string, 'official'>;
  /** P-040: a cancelled race that was sailed without us («Η ιστιοδρομία έγινε χωρίς εμάς»): it counts. */
  held?: boolean;
  /** P-040: when the finish line detection was armed (every mark before the finish passed, or the start of a 2-point course). */
  finishArmedAt?: number;
  /** P-040: the last crossing of the finish line found from the GPS. */
  finishCross?: FinishCross;
  /** P-040: estimated elapsed seconds per opponent without a result, frozen when the race ended. */
  estAtFinish?: Record<string, number>;
  updatedAt: number;
}

/** P-040: where a result came from, for the «Αποτελέσματα» list. */
export type ResultSource = 'line' | 'manual' | 'official' | 'est';

/** P-040: official result codes (RRS A5.2: all score «boats in the class + 1»; DNE is never discarded). */
export type ResultCode = 'DNC' | 'DNS' | 'OCS' | 'DNF' | 'RET' | 'DSQ' | 'DNE';

/** P-040: a crossing of the finish line («Τερματίσατε στις …;»). */
export interface FinishCross {
  /** Interpolated time of the crossing (ms, whole seconds). */
  t: number;
  /** Found across a gap of more than 30″ (app in the background): the time is approximate. */
  approx?: boolean;
  /** Length of that gap (s), for «ήταν στο παρασκήνιο N′». */
  gapSec?: number;
  answered?: 'yes' | 'no';
  /** When it was answered. */
  at?: number;
  /** After «Όχι»: the boat was back on the side of the previous mark, > 0,1 NM from the line. */
  rearmed?: boolean;
}

/** P-040: a multi-race event («Διοργάνωση»), one class: the class of our boat. Stays on this device. */
export interface RaceEvent {
  id: string;
  name: string;
  /** «Παράρτημα A (θέσεις)» or «Άθροισμα διορθωμένων χρόνων». */
  scoring: 'points' | 'time';
  discards: 0 | 1 | 2;
  /** K: discards apply from this many completed races. Always > discards. */
  discardFrom: number;
  /** «Σκάφη στην κλάση»: for the «+ 1» points when not every boat was entered. */
  classSize?: number;
  status: 'open' | 'closed';
  owner?: string;
  createdAt: number;
  updatedAt: number;
}
