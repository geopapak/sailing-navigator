/**
 * ORC API rating data (sas.orc.org, `DownBoatRMS … ext=json`) → our boat
 * profile. Field names are from the ORC API documentation (Sept 2026):
 * single-number ratings (APHD/APHT, OSN/TMF_Offshore, TMF_Inshore, triple
 * numbers TND_…/TN_…), national options (GRE_…, listed in ScoringOptions) and
 * Allowances in seconds per mile, from which the polar follows (kt = 3600 / s).
 */
import type { BoatProfile, PolarTable, ScoringOption } from './types';
import { scoringId } from './certificate';
import { newBoatId } from './ids';

export interface OrcRms {
  RefNo?: string;
  SailNo?: string;
  YachtName?: string;
  Class?: string;
  C_Type?: string;
  Family?: string;
  IssueDate?: string;
  LOA?: number;
  Draft?: number;
  MB?: number;
  Dspl_Sailing?: number;
  CrewWT?: number;
  GPH?: number;
  CDL?: number;
  Allowances?: {
    WindSpeeds?: number[];
    WindAngles?: number[];
    Beat?: number[];
    Run?: number[];
    BeatAngle?: number[];
    GybeAngle?: number[];
    [k: string]: number[] | undefined;
  };
  [k: string]: unknown;
}

export interface OrcScoringOption {
  CountryId?: string;
  Kind?: 'TOD' | 'TOT' | 'PCS' | string;
  Fieldname?: string;
  Name?: string;
  Families?: string[];
}

const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : undefined);
const r = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

/** Seconds per mile → knots. */
const kt = (s: number) => (s > 0 ? r(3600 / s, 2) : 0);

export function orcPolar(a: OrcRms['Allowances']): PolarTable | undefined {
  const tws = a?.WindSpeeds;
  const angles = a?.WindAngles;
  if (!a || !tws?.length || !angles?.length || !a.Beat || !a.Run || !a.BeatAngle || !a.GybeAngle) return undefined;
  const speeds: Record<string, number[]> = {};
  for (const ang of angles) {
    const row = a[`R${ang}`];
    if (row?.length === tws.length) speeds[String(ang)] = row.map(kt);
  }
  if (!Object.keys(speeds).length) return undefined;
  return {
    tws: [...tws],
    beatAngle: a.BeatAngle.map((x) => r(x, 1)),
    beatVMG: a.Beat.map(kt),
    speeds,
    runVMG: a.Run.map(kt),
    gybeAngle: a.GybeAngle.map((x) => r(x, 1)),
  };
}

/** ToT ⇄ ToD on ORC certificates: ToD (s/NM) × ToT = 600. */
const todFromTot = (tot: number) => r(600 / tot, 1);

const LEVELS = ['Low', 'Medium', 'High'] as const;

/** All the ToT/ToD options the certificate gives, with our ids where we have them. */
export function orcScoring(rms: OrcRms, options: OrcScoringOption[] = []): ScoringOption[] {
  const out: ScoringOption[] = [];
  const add = (id: string, label: string, tod?: number, tot?: number) => {
    if (tot === undefined && tod === undefined) return;
    const t = tot ?? r(600 / tod!, 4);
    out.push({ id, label, tod: tod ?? todFromTot(t), tot: t });
  };
  add('allPurpose', 'All purpose', n(rms.APHD), n(rms.APHT));
  add('windwardLeeward', 'Windward/Leeward', undefined, n(rms.TMF_Inshore));
  add('coastal', 'Coastal/Long Distance', n(rms.OSN), n(rms.TMF_Offshore));
  for (const lv of LEVELS) add(`tripleCoastal${lv}`, `Triple Coastal ${lv}`, n(rms[`TND_Offshore_${lv}`]), n(rms[`TN_Offshore_${lv}`]));
  for (const lv of LEVELS) add(`tripleWL${lv}`, `Triple W/L ${lv}`, n(rms[`TND_Inshore_${lv}`]), n(rms[`TN_Inshore_${lv}`]));
  // National options (e.g. Saronikos), paired by name: one TOD field and/or one TOT field each.
  const national = new Map<string, { tod?: number; tot?: number }>();
  for (const o of options) {
    if (!o.Name || !o.Fieldname || o.CountryId === 'ORC' || (o.Kind !== 'TOD' && o.Kind !== 'TOT')) continue;
    const v = n(rms[o.Fieldname]);
    if (v === undefined) continue;
    const e = national.get(o.Name) ?? {};
    if (o.Kind === 'TOD') e.tod = v;
    else e.tot = v;
    national.set(o.Name, e);
  }
  for (const [name, e] of national) add(scoringId(name), name, e.tod, e.tot);
  const seen = new Set<string>();
  return out.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
}

/** A boat profile from one ORC certificate (an opponent, or your own boat). */
export function orcToBoat(rms: OrcRms, options: OrcScoringOption[] = [], isOwn = false): BoatProfile {
  const name = (rms.YachtName ?? '').trim() || (rms.SailNo ?? 'ORC');
  return {
    id: newBoatId(name),
    name,
    sailNumber: rms.SailNo?.trim() || undefined,
    design: rms.Class?.trim() || undefined,
    orcRef: rms.RefNo,
    loa: n(rms.LOA),
    beam: n(rms.MB),
    draft: n(rms.Draft),
    displacement: n(rms.Dspl_Sailing),
    crewWeight: n(rms.CrewWT),
    gph: n(rms.GPH),
    cdl: n(rms.CDL),
    notes: `Από το ORC (${rms.C_Type ?? rms.Family ?? 'ORC'}${rms.IssueDate ? `, ${rms.IssueDate.slice(0, 10)}` : ''}).`,
    polar: orcPolar(rms.Allowances),
    performanceFactor: 1,
    sails: [{ id: 'main', name: 'Μαΐστρα', kind: 'main' }],
    sailRules: [],
    scoring: orcScoring(rms, options),
    isOwn,
    updatedAt: 0,
  };
}

/** "GRE 1234", "gre1234", "1234" → "GRE-1234" (Greek numbers by default). */
export function normalizeSailNo(s: string, country = 'GRE'): string {
  const t = s.trim().toUpperCase().replace(/\s+/g, '');
  const m = t.match(/^([A-Z]{3})-?(\d+[A-Z]?)$/);
  if (m) return `${m[1]}-${m[2]}`;
  if (/^\d+[A-Z]?$/.test(t)) return `${country}-${t}`;
  return t;
}
