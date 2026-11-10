/** A local-knowledge note: what the crew learned at a place, in some wind. */
export interface KnowledgeNote {
  id: string;
  lat: number;
  lon: number;
  /** Area it applies to, NM. */
  radiusNm: number;
  /** Wind directions it applies to (8 sectors: N, NE, … NW). Empty = any. */
  dirs: Sector[];
  /** Wind strength it applies to. Empty = any. */
  speeds: ('light' | 'medium' | 'strong')[];
  place: string;
  text: string;
  /** 'me' = only me; 'crew' = also crew members who have the same boat (sail number). */
  scope: 'me' | 'crew';
  /** Sail number of the boat the note belongs to (for crew sharing). */
  sailNo?: string;
  author?: string;
  createdAt: number;
  updatedAt: number;
}

export type Sector = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export const SECTORS: { id: Sector; label: string }[] = [
  { id: 'N', label: 'Β' },
  { id: 'NE', label: 'ΒΑ' },
  { id: 'E', label: 'Α' },
  { id: 'SE', label: 'ΝΑ' },
  { id: 'S', label: 'Ν' },
  { id: 'SW', label: 'ΝΔ' },
  { id: 'W', label: 'Δ' },
  { id: 'NW', label: 'ΒΔ' },
];

export const SPEEDS: { id: KnowledgeNote['speeds'][number]; label: string; min: number; max: number }[] = [
  { id: 'light', label: 'Ελαφρύς < 8 kt', min: 0, max: 8 },
  { id: 'medium', label: 'Μέτριος 8–18', min: 8, max: 18 },
  { id: 'strong', label: 'Δυνατός > 18', min: 18, max: 99 },
];

/** TWD (from) → sector. */
export function sectorOf(twd: number): Sector {
  const i = Math.round((((twd % 360) + 360) % 360) / 45) % 8;
  return SECTORS[i].id;
}
