import type { ScoringOption } from '../boat/types';

export type ScoringMethod = 'ToT' | 'ToD';

/** Corrected time (s) under Time on Time: elapsed × ToT. */
export function correctedToT(elapsedSec: number, tot: number): number {
  return elapsedSec * tot;
}

/** Corrected time (s) under Time on Distance: elapsed − ToD (s/NM) × distance (NM). */
export function correctedToD(elapsedSec: number, todSecPerNm: number, distanceNm: number): number {
  return elapsedSec - todSecPerNm * distanceNm;
}

export function corrected(
  method: ScoringMethod,
  elapsedSec: number,
  opt: Pick<ScoringOption, 'tod' | 'tot'>,
  distanceNm: number,
): number {
  return method === 'ToT' ? correctedToT(elapsedSec, opt.tot) : correctedToD(elapsedSec, opt.tod, distanceNm);
}

/**
 * Latest elapsed time (s) at which "me" still beats/ties an opponent who
 * sailed `oppElapsedSec`.
 *   ToT: me.e × me.tot = opp.e × opp.tot  →  me.e = opp.e × opp.tot / me.tot
 *   ToD: me.e − me.tod·d = opp.e − opp.tod·d  →  me.e = opp.e + (me.tod − opp.tod)·d
 */
export function elapsedToTie(
  method: ScoringMethod,
  oppElapsedSec: number,
  me: Pick<ScoringOption, 'tod' | 'tot'>,
  opp: Pick<ScoringOption, 'tod' | 'tot'>,
  distanceNm: number,
): number {
  return method === 'ToT'
    ? (oppElapsedSec * opp.tot) / me.tot
    : oppElapsedSec + (me.tod - opp.tod) * distanceNm;
}

/** Average speed (kt) needed to cover distance in the given elapsed time. */
export function requiredSpeed(distanceNm: number, elapsedSec: number): number {
  return elapsedSec > 0 ? distanceNm / (elapsedSec / 3600) : Infinity;
}

export interface Entry {
  id: string;
  name: string;
  elapsedSec: number;
  option: Pick<ScoringOption, 'tod' | 'tot'>;
}

export interface RankedEntry extends Entry {
  correctedSec: number;
  rank: number;
  /** Corrected-time gap to the leader (s). */
  gapSec: number;
}

/** Ranks entries by corrected time (ties share a rank). */
export function rank(method: ScoringMethod, entries: Entry[], distanceNm: number): RankedEntry[] {
  const withCt = entries
    .filter((e) => Number.isFinite(e.elapsedSec) && e.elapsedSec > 0)
    .map((e) => ({ ...e, correctedSec: corrected(method, e.elapsedSec, e.option, distanceNm) }))
    .sort((a, b) => a.correctedSec - b.correctedSec);
  const best = withCt[0]?.correctedSec ?? 0;
  let prevCt = NaN;
  let prevRank = 0;
  return withCt.map((e, i) => {
    const r = Math.abs(e.correctedSec - prevCt) < 1e-6 ? prevRank : i + 1;
    prevCt = e.correctedSec;
    prevRank = r;
    return { ...e, rank: r, gapSec: e.correctedSec - best };
  });
}

/** Parses "h:mm:ss", "mm:ss" or a plain seconds number into seconds. NaN if invalid. */
export function parseDuration(s: string): number {
  const t = s.trim();
  if (!t) return NaN;
  const parts = t.split(':');
  if (parts.length > 3 || parts.some((p) => p === '' || !/^\d+(\.\d+)?$/.test(p))) return NaN;
  return parts.map(Number).reduce((acc, v) => acc * 60 + v, 0);
}

/** Formats seconds as h:mm:ss (with a leading "−" for negatives). */
export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec)) return '—';
  const neg = sec < 0;
  let s = Math.round(Math.abs(sec));
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  return `${neg ? '−' : ''}${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
