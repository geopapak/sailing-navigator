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
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'day',
  activeBoatId: 'tre-irene',
  declination: 5,
  manualMagnetic: true,
  keepAwake: true,
  aiUrl: '',
  aiCode: '',
};
