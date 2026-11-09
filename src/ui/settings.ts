export type Theme = 'day' | 'dark' | 'night';

export interface Settings {
  theme: Theme;
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
}

/** The project's own server; users can point the app elsewhere in Settings. */
export const DEFAULT_SERVER = 'https://sailing-navigator-ai.geopapak.workers.dev';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'day',
  activeBoatId: 'tre-irene',
  declination: 5,
  manualMagnetic: true,
  keepAwake: true,
  aiUrl: DEFAULT_SERVER,
  aiCode: '',
  authToken: '',
};
