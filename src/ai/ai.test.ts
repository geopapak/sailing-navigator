import { describe, expect, it } from 'vitest';
import { TRE_IRENE } from '../boat/treIrene';
import { computeLive } from '../performance/targets';
import { sailOutlook } from '../performance/sails';
import { adviceFor } from '../performance/advice';
import { routeCourse, project, type Mark } from '../routing/isochrones';
import { NO_LAND } from '../routing/land';
import { uniformField } from '../weather/field';
import { buildLiveContext, buildPlanContext, localIso } from './context';
import { compact, isReply, userMessage, validateContext } from './prompt';

const boat = TRE_IRENE;

function liveCtx(question?: string) {
  const result = computeLive(boat, { tws: 10, twa: -42, bsp: 6.0 })!;
  const outlook = sailOutlook(boat, result.tws, result.twa);
  const advice = adviceFor(result, { ...outlook, currentSailId: 'J2' });
  return buildLiveContext({ boat, result, outlook, advice, currentSailId: 'J2', nav: { observedTwd: 20 }, question, now: Date.UTC(2026, 10, 9, 12) });
}

describe('advisor context', () => {
  it('builds a live snapshot from the app calculations', () => {
    const c = liveCtx();
    expect(c.kind).toBe('live');
    expect(c.live!.tack).toBe('port');
    expect(c.live!.twa).toBe(-42);
    expect(c.live!.pctTarget).toBeCloseTo(6 / c.live!.targetBsp, 6);
    expect(c.live!.currentSail).toBe('J2');
    expect(c.live!.recommendedSail).toBeTruthy();
    expect(c.live!.ruleAdvice.length).toBeGreaterThan(0);
    expect(c.boat.sails.length).toBe(boat.sails.length);
    expect(validateContext(JSON.parse(JSON.stringify(c))).ok).toBe(true);
  });

  it('builds a plan snapshot with legs, sails and a wind timeline', () => {
    const A: Mark = { id: 'a', name: 'Εκκίνηση', lat: 37.7, lon: 23.5 };
    const B: Mark = { id: 'b', name: 'Σημαδούρα', ...project(A, 0, 6) };
    const t0 = Date.UTC(2026, 10, 9, 9);
    const route = routeCourse(boat, [A, B, A], t0, uniformField(12, 0), NO_LAND);
    const c = buildPlanContext(boat, { courseName: 'Test', windSource: 'uniform', route }, 'Κίνδυνοι;', t0);
    const r = c.plan!.route;
    expect(r.legs).toHaveLength(2);
    expect(r.legs[0].share.upwind).toBeGreaterThan(0.9);
    expect(r.legs[0].sails[0].sail).toBe('J1.5');
    expect(r.legs[0].windTimeline.length).toBeGreaterThan(1);
    expect(r.legs[0].windTimeline[0]).toMatchObject({ tws: 12, twd: 0 });
    expect(r.elapsedMin).toBeCloseTo(route.elapsedSec / 60);
    expect(validateContext(c).ok).toBe(true);
  });

  it('keeps the payload small', () => {
    const msg = userMessage(liveCtx('Αναστροφή τώρα;'));
    expect(msg.startsWith('Ερώτηση πληρώματος: Αναστροφή τώρα;')).toBe(true);
    expect(msg.length).toBeLessThan(3000);
  });

  it('formats local time with offset', () => {
    expect(localIso(Date.UTC(2026, 10, 9, 12))).toMatch(/^2026-11-09T\d\d:00:00[+-]\d\d:\d\d$/);
  });
});

describe('prompt helpers', () => {
  it('rounds numbers by magnitude and drops non-finite values', () => {
    expect(compact({ a: 123.456, b: 6.789, c: 0.91234, d: NaN, e: 'x' })).toEqual({ a: 123, b: 6.8, c: 0.912, e: 'x' });
  });

  it('rejects malformed requests', () => {
    expect(validateContext(null).ok).toBe(false);
    expect(validateContext({ kind: 'x', boat: { name: 'a' } }).ok).toBe(false);
    expect(validateContext({ kind: 'live', boat: { name: 'a' } }).ok).toBe(false);
    expect(validateContext({ kind: 'plan', boat: { name: 'a' } }).ok).toBe(false);
    expect(validateContext({ kind: 'live', boat: { name: 'a' }, live: {}, question: 'x'.repeat(501) }).ok).toBe(false);
  });

  it('checks reply shape', () => {
    expect(isReply({ summary: 's', actions: [{ text: 't', when: 'now' }], caution: '' })).toBe(true);
    expect(isReply({ summary: 's', actions: [{ text: 't', when: 'later' }], caution: '' })).toBe(false);
    expect(isReply({ summary: 's', actions: [] })).toBe(false);
  });
});
