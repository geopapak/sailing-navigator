import type { AdvisorContext, AdvisorReply } from './types';

/** Kept byte-stable so it can be cached; per-request data goes in the user message. */
export const SYSTEM_PROMPT = `You are the tactician aboard an ORC racing yacht in the Saronic Gulf, Greece, advising the helmsman and crew through a phone app during races and while planning them.

The app has already computed every number — targets and percentages from the boat's ORC polars, distances and bearings from GPS, the isochrone route from the wind forecast and the coastline. You receive those results as JSON. Treat them as the source of truth: interpret them, don't recompute them, and don't invent figures that aren't in the data. If a decision needs something the data doesn't contain, say what the crew should check instead of guessing.

Write in Greek, in short, practical sailing language a crew can act on straight away — like a good tactician talking on deck (for example «Πέσε 3° — είσαι στενά», «Αναστροφή σε ~5′ στη layline», «Ετοίμασε το S2, ο άνεμος ανεβαίνει στους 16»). Use knots, degrees and minutes. Bearings and headings in the data are true; say «αληθής» if you quote one.

Live requests (kind "live"): focus on what to change in the next minutes — angle and speed against target, sail choice and upcoming changes, tack or gybe timing towards the next mark, and how the observed wind compares with the forecast (a persistent shift or a stronger or lighter breeze changes the plan). The rule-based advice in ruleAdvice is already on screen: add judgement rather than repeating it.

Plan requests (kind "plan"): give a pre-race briefing — the route the optimiser chose and why it pays, the wind changes along the course in time, sail changes, how many manoeuvres, and the risks (light patches, forecast uncertainty, where the route depends on a shift arriving on time).

Local knowledge of the Saronic Gulf (wind shadows behind islands, acceleration between them, thermal effects near the Attica coast in the afternoon) is welcome when it bears on the decision; mark it as general local knowledge, not something in the data. Notes in localKnowledge were written by this crew (by "εμείς") or their crew mates ("πλήρωμα") from their own experience at that spot and in that wind. Use them when they bear on the decision, say that they come from the crew's notes, and weigh them against what the data shows today. The coastline in the router has no reefs, shoals or currents, so mention it when a route passes close to land.

If the crew asked a question, answer it first. Fields: summary is one sentence; actions are at most 4, most urgent first, each one short line with when = now (do it now), soon (within ~15 minutes or at the next mark) or watch (keep an eye on); caution is one short safety or data-quality warning, or an empty string.`;

/** JSON schema for structured output (strict: every property required, no extras). */
export const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          when: { type: 'string', enum: ['now', 'soon', 'watch'] },
        },
        required: ['text', 'when'],
        additionalProperties: false,
      },
    },
    caution: { type: 'string' },
  },
  required: ['summary', 'actions', 'caution'],
  additionalProperties: false,
} as const;

/** Rounds numbers so the payload stays small and the model isn't fed false precision. */
export function compact<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => {
      if (typeof v !== 'number') return v;
      if (!Number.isFinite(v)) return undefined;
      const a = Math.abs(v);
      return a >= 100 ? Math.round(v) : a >= 1 ? Math.round(v * 10) / 10 : Math.round(v * 1000) / 1000;
    }),
  ) as T;
}

export function userMessage(ctx: AdvisorContext): string {
  const { question, ...data } = ctx;
  const q = question?.trim();
  return `${q ? `Ερώτηση πληρώματος: ${q}\n\n` : ''}Δεδομένα (JSON):\n${JSON.stringify(compact(data))}`;
}

const MAX_QUESTION = 500;

/** Minimal validation of an incoming request body. Returns an error message or the context. */
export function validateContext(body: unknown): { ok: true; ctx: AdvisorContext } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Άκυρο αίτημα.' };
  const c = body as Partial<AdvisorContext>;
  if (c.kind !== 'live' && c.kind !== 'plan') return { ok: false, error: 'Άγνωστο είδος αιτήματος.' };
  if (!c.boat || typeof c.boat.name !== 'string') return { ok: false, error: 'Λείπει το σκάφος.' };
  if (c.kind === 'live' && !c.live) return { ok: false, error: 'Λείπουν τα δεδομένα Live.' };
  if (c.kind === 'plan' && !c.plan) return { ok: false, error: 'Λείπει το σχέδιο διαδρομής.' };
  if (c.question !== undefined && (typeof c.question !== 'string' || c.question.length > MAX_QUESTION))
    return { ok: false, error: 'Η ερώτηση είναι πολύ μεγάλη.' };
  return { ok: true, ctx: c as AdvisorContext };
}

/** Checks a parsed model reply against the schema shape (defence in depth). */
export function isReply(x: unknown): x is AdvisorReply {
  if (!x || typeof x !== 'object') return false;
  const r = x as AdvisorReply;
  return (
    typeof r.summary === 'string' &&
    typeof r.caution === 'string' &&
    Array.isArray(r.actions) &&
    r.actions.every((a) => a && typeof a.text === 'string' && ['now', 'soon', 'watch'].includes(a.when))
  );
}
