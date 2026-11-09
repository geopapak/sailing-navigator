import type { BoatProfile } from '../boat/types';
import type { LiveResult } from '../performance/targets';
import type { SailOutlook } from '../performance/sails';
import type { Advice } from '../performance/advice';
import type { LegResult, RouteResult } from '../routing/isochrones';
import type { AdvisorContext, LegSnapshot, NavSnapshot, RouteSnapshot } from './types';

/** Local ISO time with offset, e.g. 2026-11-09T14:05:00+02:00. */
export function localIso(ms: number): string {
  const d = new Date(ms);
  const off = -d.getTimezoneOffset();
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const local = new Date(ms + off * 60_000).toISOString().slice(0, 19);
  return `${local}${off >= 0 ? '+' : '-'}${pad(off / 60)}:${pad(off % 60)}`;
}

const hhmm = (ms: number) => localIso(ms).slice(11, 16);

function sailName(boat: BoatProfile, id?: string) {
  return id ? boat.sails.find((s) => s.id === id)?.name ?? id : undefined;
}

export function boatInfo(boat: BoatProfile): AdvisorContext['boat'] {
  return {
    name: boat.name,
    type: boat.design,
    performanceFactor: boat.performanceFactor,
    sails: boat.sails.map((s) => ({ id: s.id, name: s.name })),
  };
}

/** Wind every ~30 min along a leg, sampled from the routed track. */
function windTimeline(leg: LegResult): LegSnapshot['windTimeline'] {
  const out: LegSnapshot['windTimeline'] = [];
  let next = leg.start;
  for (const p of leg.track) {
    if (p.t >= next) {
      out.push({ t: hhmm(p.t), tws: p.tws, twd: p.twd });
      next = p.t + 30 * 60_000;
    }
  }
  return out.slice(0, 24);
}

export function legSnapshot(leg: LegResult, boat: BoatProfile): LegSnapshot {
  const first = leg.track[0];
  return {
    from: leg.from.name,
    to: leg.to.name,
    start: hhmm(leg.start),
    durationMin: leg.durationSec / 60,
    rhumbNm: leg.rhumbNm,
    sailedNm: leg.sailedNm,
    avgTws: leg.avgTws,
    maxTws: leg.maxTws,
    avgTwd: leg.avgTwd,
    share: { ...leg.modeShare },
    tacks: leg.tacks,
    gybes: leg.gybes,
    sails: leg.sails.map((s) => ({ sail: sailName(boat, s.sailId) ?? s.sailId, from: hhmm(s.from) })),
    firstHeadingTrue: first?.heading,
    firstTwa: first?.twa,
    windTimeline: windTimeline(leg),
  };
}

export function routeSnapshot(r: RouteResult, boat: BoatProfile): RouteSnapshot {
  return {
    start: localIso(r.start),
    finish: localIso(r.end),
    elapsedMin: r.elapsedSec / 60,
    rhumbNm: r.rhumbNm,
    sailedNm: r.sailedNm,
    legs: r.legs.map((l) => legSnapshot(l, boat)),
  };
}

export interface LiveInputs {
  boat: BoatProfile;
  result: LiveResult;
  outlook?: SailOutlook;
  advice: Advice[];
  currentSailId?: string;
  nav: NavSnapshot;
  question?: string;
  now?: number;
}

export function buildLiveContext(i: LiveInputs): AdvisorContext {
  const r = i.result;
  return {
    kind: 'live',
    now: localIso(i.now ?? Date.now()),
    boat: boatInfo(i.boat),
    live: {
      tws: r.tws,
      twa: r.tack === 'port' ? -r.twa : r.twa,
      tack: r.tack === 'starboard' ? 'stbd' : r.tack === 'port' ? 'port' : 'none',
      mode: r.mode,
      bsp: r.bsp,
      targetBsp: r.targetBsp,
      targetTwa: r.targetTwa,
      polarBsp: r.polarBsp,
      vmg: r.vmg,
      targetVmg: r.targetVmg,
      pctTarget: r.pctTarget,
      pctPolar: r.pctPolar,
      pctVmg: r.pctVmg,
      beat: { twa: r.beat.angle, bsp: r.beat.bsp, vmg: r.beat.vmg },
      run: { twa: r.run.angle, bsp: r.run.bsp, vmg: r.run.vmg },
      recommendedSail: i.outlook?.recommended?.name,
      currentSail: sailName(i.boat, i.currentSailId),
      sailIfStronger: i.outlook?.ifStronger?.name,
      sailIfLighter: i.outlook?.ifLighter?.name,
      ruleAdvice: i.advice.map((a) => a.text),
    },
    nav: i.nav,
    question: i.question,
  };
}

export function buildPlanContext(
  boat: BoatProfile,
  plan: Omit<NonNullable<AdvisorContext['plan']>, 'route'> & { route: RouteResult },
  question?: string,
  now = Date.now(),
): AdvisorContext {
  return {
    kind: 'plan',
    now: localIso(now),
    boat: boatInfo(boat),
    plan: { ...plan, route: routeSnapshot(plan.route, boat) },
    question,
  };
}
