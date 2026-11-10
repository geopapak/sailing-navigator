/**
 * Which local-knowledge notes apply here and now, and the compact form the
 * advisor receives. The notes come from the crew, so the advisor is told they
 * are the crew's experience, not facts.
 */
import { distanceNm, type LatLon } from '../nav/geo';
import { SECTORS, SPEEDS, sectorOf, type KnowledgeNote } from './types';

export interface KnowledgeHint {
  place: string;
  text: string;
  /** "ΒΑ · Μέτριος" or "κάθε άνεμο". */
  wind: string;
  by: 'εμείς' | 'πλήρωμα';
  distanceNm?: number;
}

export function windLabel(n: Pick<KnowledgeNote, 'dirs' | 'speeds'>): string {
  const d = n.dirs.map((x) => SECTORS.find((s) => s.id === x)?.label ?? x).join(', ');
  const s = n.speeds.map((x) => SPEEDS.find((v) => v.id === x)?.label.split(' ')[0] ?? x).join(', ');
  return [d, s].filter(Boolean).join(' · ') || 'κάθε άνεμο';
}

const fitsSpeed = (n: KnowledgeNote, tws: number) =>
  n.speeds.some((id) => {
    const b = SPEEDS.find((s) => s.id === id);
    return !!b && tws >= b.min && tws < b.max;
  });

/** Notes near `where` (anywhere when not given) that fit the wind (any wind when unknown). */
export function relevantNotes(
  notes: KnowledgeNote[],
  where?: LatLon | LatLon[],
  wind?: { tws?: number; twd?: number },
  rangeNm = 3,
): (KnowledgeNote & { distanceNm?: number })[] {
  const places = where === undefined ? [] : Array.isArray(where) ? where : [where];
  const out: (KnowledgeNote & { distanceNm?: number })[] = [];
  for (const n of notes) {
    if (wind?.twd !== undefined && n.dirs.length && !n.dirs.includes(sectorOf(wind.twd))) continue;
    if (wind?.tws !== undefined && n.speeds.length && !fitsSpeed(n, wind.tws)) continue;
    let d: number | undefined;
    if (places.length) {
      d = Math.min(...places.map((p) => distanceNm(p, n)));
      if (d > n.radiusNm + rangeNm) continue;
    }
    out.push({ ...n, distanceNm: d });
  }
  return out.sort((a, b) => (a.distanceNm ?? 0) - (b.distanceNm ?? 0)).slice(0, 12);
}

let cache: { mine: KnowledgeNote[]; crew: KnowledgeNote[] } = { mine: [], crew: [] };

export function setKnowledgeCache(mine: KnowledgeNote[], crew: KnowledgeNote[]) {
  cache = { mine, crew };
}

/** The advisor's view of the notes that apply (short texts; only "us"/"crew", no names). */
export function knowledgeHints(where?: LatLon | LatLon[], wind?: { tws?: number; twd?: number }): KnowledgeHint[] | undefined {
  const all = [...cache.mine.map((n) => ({ ...n, by: 'εμείς' as const })), ...cache.crew.map((n) => ({ ...n, by: 'πλήρωμα' as const }))];
  if (!all.length) return undefined;
  const byId = new Map(all.map((n) => [n.id, n.by]));
  const list = relevantNotes(all, where, wind).map((n) => ({
    place: n.place.slice(0, 60),
    text: n.text.slice(0, 400),
    wind: windLabel(n),
    by: byId.get(n.id) ?? ('εμείς' as const),
    distanceNm: n.distanceNm === undefined ? undefined : Math.round(n.distanceNm * 10) / 10,
  }));
  return list.length ? list : undefined;
}
