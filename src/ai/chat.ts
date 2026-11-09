/**
 * The advisor chat: shared request/response shapes (app ↔ server) and the
 * helpers that build what the app sends.
 */
import type { BoatProfile } from '../boat/types';
import type { AdvisorContext } from './types';
import { spreadTimeline, type Comparison } from '../weather/compare';
import { localIso } from './context';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

/** Everything the app knows right now, sent with the latest question. */
export interface ChatContext {
  now: string;
  /** The active boat, complete (polar, sails, ratings) — the server's tools compute with it. */
  boat?: BoatProfile;
  /** Other boats in the app (opponents): name and ratings only. */
  others?: { name: string; gph?: number; scoring: BoatProfile['scoring'] }[];
  live?: AdvisorContext['live'];
  nav?: AdvisorContext['nav'];
  plan?: AdvisorContext['plan'];
  /** Model comparison at one point, hourly. */
  models?: {
    place: string;
    lat: number;
    lon: number;
    fetched: string;
    hourly: { t: string; tws: number; twd: number; sdTws: number; sdTwd: number; min: number; max: number; byModel: Record<string, [number, number]> }[];
    waves?: { t: string; h: number; dir?: number; period?: number }[];
  };
}

export interface ChatRequest {
  messages: ChatMessage[];
  context?: ChatContext;
}

export interface ChatSource {
  url: string;
  title: string;
}

export interface ChatResponse {
  text: string;
  model: string;
  fallback: boolean;
  /** Names of the tools the advisor used (for transparency in the UI). */
  tools: string[];
  sources: ChatSource[];
}

export const CHAT_LIMITS = { messages: 24, chars: 4000, body: 160 * 1024 };

export function validateChat(body: unknown): { ok: true; req: ChatRequest } | { ok: false; error: string } {
  const b = body as Partial<ChatRequest> | null;
  if (!b || !Array.isArray(b.messages) || b.messages.length === 0) return { ok: false, error: 'Δεν υπάρχει ερώτηση.' };
  if (b.messages.length > CHAT_LIMITS.messages) return { ok: false, error: 'Πολύ μεγάλη συζήτηση — ξεκίνα νέα.' };
  for (const m of b.messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.text !== 'string' || !m.text.trim()) {
      return { ok: false, error: 'Άκυρο μήνυμα.' };
    }
    if (m.text.length > CHAT_LIMITS.chars) return { ok: false, error: 'Πολύ μεγάλο μήνυμα.' };
  }
  if (b.messages[0].role !== 'user' || b.messages[b.messages.length - 1].role !== 'user') {
    return { ok: false, error: 'Η συζήτηση πρέπει να ξεκινά και να τελειώνει με ερώτηση.' };
  }
  for (let i = 1; i < b.messages.length; i++) {
    if (b.messages[i].role === b.messages[i - 1].role) return { ok: false, error: 'Άκυρη σειρά μηνυμάτων.' };
  }
  if (b.context !== undefined && (typeof b.context !== 'object' || b.context === null)) return { ok: false, error: 'Άκυρα δεδομένα.' };
  return { ok: true, req: { messages: b.messages, context: b.context } };
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Compact model comparison for the advisor (race window only, at most 30 hours). */
export function modelsContext(c: Comparison): ChatContext['models'] {
  const rows = spreadTimeline(c.series, c.start - 3_600_000, Math.min(c.end + 3_600_000, c.start + 30 * 3_600_000));
  const waves: NonNullable<ChatContext['models']>['waves'] = [];
  if (c.waves) {
    c.waves.times.forEach((t, i) => {
      const h = c.waves!.height[i];
      if (t >= c.start - 3_600_000 && t <= c.end + 3_600_000 && h != null && (t / 3_600_000) % 3 === 0) {
        waves.push({ t: localIso(t).slice(5, 16), h, dir: c.waves!.dir[i] ?? undefined, period: c.waves!.period[i] ?? undefined });
      }
    });
  }
  return {
    place: c.place,
    lat: c.lat,
    lon: c.lon,
    fetched: localIso(c.fetchedAt),
    hourly: rows.map(({ t, s }) => ({
      t: localIso(t).slice(5, 16),
      tws: r1(s.meanTws),
      twd: Math.round(s.meanTwd),
      sdTws: r1(s.spreadTws),
      sdTwd: Math.round(s.spreadTwd),
      min: r1(s.minTws),
      max: r1(s.maxTws),
      byModel: s.byModel,
    })),
    waves: waves.length ? waves : undefined,
  };
}
