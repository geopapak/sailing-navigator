import { DEFAULT_INSTRUMENTS } from '../instruments/types';
import {
  DEFAULT_ALERTS,
  DEFAULT_CRUISE_ALERTS,
  DEFAULT_TRAINING_ALERTS,
  type AlertSettings,
  type CruiseAlerts,
  type RaceShiftDeg,
  type TrainingAlerts,
} from '../race/alerts';

export type Theme = 'day' | 'dark' | 'night';
export type TextSize = 'n' | 'l' | 'xl';
export type LiveMode = 'simple' | 'full';

export interface Settings {
  theme: Theme;
  /** Base text size: Κανονικά / Μεγάλα / Πολύ μεγάλα. */
  textSize: TextSize;
  /** Live screen: a few big numbers (simple) or every tile (full). */
  liveMode: LiveMode;
  /** The step-by-step first run was finished or skipped. */
  onboarded: boolean;
  activeBoatId: string;
  /** Magnetic declination, degrees East positive (Saronic ≈ +5°E). */
  declination: number;
  /** Manual TWD / heading entries are magnetic (compass) values. */
  manualMagnetic: boolean;
  keepAwake: boolean;
  /** AI advisor backend URL (Cloudflare Worker) and its access code. */
  aiUrl: string;
  aiCode: string;
  /** Signed-in account (session token from the server) and its cached profile. */
  authToken: string;
  account?: import('../sync/api').PublicUser;
  /** Boat instruments (Signal K / NMEA 0183 gateway, or the simulator). */
  instruments: import('../instruments/types').InstrumentSettings;
  /** Manoeuvre alerts during a race (P-023); sound, volume and words for every kind. */
  alerts: AlertSettings;
  /** Race wind shift threshold, degrees (P-034). */
  raceShiftDeg: RaceShiftDeg;
  /** Training alerts (P-034). */
  training: TrainingAlerts;
  /** Cruise safety alerts (P-034; used from Φ4). */
  cruiseAlerts: CruiseAlerts;
  /** Cruise track interval in seconds (P-033; the setting itself comes in Φ4). */
  cruiseTrackSec: 15 | 30;
}

/** The project's own server; users can point the app elsewhere in Settings. */
export const DEFAULT_SERVER: string =
  (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim() || 'https://sailing-navigator-ai.geopapak.workers.dev';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'day',
  textSize: 'n',
  liveMode: 'simple',
  onboarded: false,
  activeBoatId: '',
  declination: 5,
  manualMagnetic: true,
  keepAwake: true,
  aiUrl: DEFAULT_SERVER,
  aiCode: '',
  authToken: '',
  instruments: DEFAULT_INSTRUMENTS,
  alerts: DEFAULT_ALERTS,
  raceShiftDeg: 7,
  training: DEFAULT_TRAINING_ALERTS,
  cruiseAlerts: DEFAULT_CRUISE_ALERTS,
  cruiseTrackSec: 30,
};
