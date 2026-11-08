import data from './data/coastline.json';
import { LandIndex, type Polyline } from './land';

export const COASTLINE_ATTRIBUTION: string = data.attribution;
export const COASTLINE_LINES = data.lines as Polyline[];

let cached: LandIndex | undefined;

/** Lazily built land index for the Saronic Gulf (OSM coastline). */
export function saronikosLand(): LandIndex {
  return (cached ??= new LandIndex(COASTLINE_LINES));
}
