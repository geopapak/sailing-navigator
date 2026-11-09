/** Weather models available over the Saronic (checked against Open-Meteo, Nov 2026). */
export interface ModelInfo {
  id: string;
  /** Long label for selects. */
  label: string;
  /** Short label for charts and tables. */
  short: string;
  /** Approximate forecast horizon in days. */
  days: number;
}

export const MODELS: ModelInfo[] = [
  { id: 'ecmwf_ifs', label: 'ECMWF IFS HRES (9 km)', short: 'ECMWF', days: 15 },
  { id: 'icon_seamless', label: 'DWD ICON (7–13 km)', short: 'ICON', days: 7 },
  { id: 'meteofrance_seamless', label: 'Météo-France ARPEGE (10 km)', short: 'ARPEGE', days: 4 },
  { id: 'ukmo_seamless', label: 'UK Met Office (10 km)', short: 'UKMO', days: 7 },
  { id: 'gfs_seamless', label: 'NOAA GFS (13–25 km)', short: 'GFS', days: 16 },
  { id: 'ecmwf_aifs025_single', label: 'ECMWF AIFS (AI, 25 km)', short: 'AIFS', days: 15 },
  { id: 'gem_seamless', label: 'Καναδικό GEM (15 km)', short: 'GEM', days: 10 },
  { id: 'jma_seamless', label: 'Ιαπωνικό JMA (20 km)', short: 'JMA', days: 11 },
];

/** Models averaged for the "consensus" grid: the strongest five over the eastern Mediterranean. */
export const CONSENSUS_MODELS = ['ecmwf_ifs', 'icon_seamless', 'meteofrance_seamless', 'ukmo_seamless', 'gfs_seamless'];

export const CONSENSUS_ID = 'consensus';

/** Choices for the routing grid. */
export const GRID_MODELS: { id: string; label: string }[] = [
  { id: 'best_match', label: 'Αυτόματο (best match)' },
  { id: CONSENSUS_ID, label: 'Συμφωνία 5 μοντέλων (μέσος όρος)' },
  ...MODELS.map((m) => ({ id: m.id, label: m.label })),
];

/** Old ids kept working (ICON-EU and the 0.25° ECMWF grid are retired upstream). */
const LEGACY: Record<string, string> = { icon_eu: 'icon_seamless', ecmwf_ifs025: 'ecmwf_ifs' };

export function normalizeModel(id: string): string {
  const m = LEGACY[id] ?? id;
  return GRID_MODELS.some((g) => g.id === m) ? m : 'best_match';
}

export function modelLabel(id: string): string {
  if (id.startsWith('windy:')) return `Windy · ${id.slice(6)}`;
  return GRID_MODELS.find((m) => m.id === id)?.label ?? MODELS.find((m) => m.id === id)?.label ?? id;
}

export function modelShort(id: string): string {
  if (id.startsWith('windy:')) return `W·${id.slice(6)}`;
  if (id === CONSENSUS_ID) return 'Μ.Ο.';
  return MODELS.find((m) => m.id === id)?.short ?? id;
}
