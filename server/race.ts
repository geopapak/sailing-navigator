/**
 * Race helpers on the server: entry-list reading (Claude), ORC ratings
 * (ORC API, key kept here) and AIS positions (aisstream.io, key kept here).
 */
import Anthropic from '@anthropic-ai/sdk';
import { ENTRYLIST_PROMPT, ENTRYLIST_SCHEMA, cleanEntries, isEntryListExtract } from '../src/race/entrylist';
import { normalizeSailNo, orcToBoat, type OrcRms, type OrcScoringOption } from '../src/boat/orc';
import { HttpError } from './accounts';
import type { Usage } from './log';

const MODEL = 'claude-opus-5-5';

export async function readEntryList(
  client: Anthropic,
  file: { data: string; mediaType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' },
): Promise<{ event: string; entries: ReturnType<typeof cleanEntries>; model: string; usage: Usage }> {
  const source =
    file.mediaType === 'application/pdf'
      ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } } as const)
      : ({ type: 'image', source: { type: 'base64', media_type: file.mediaType, data: file.data } } as const);
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ENTRYLIST_SCHEMA as unknown as Record<string, unknown> } },
    system: ENTRYLIST_PROMPT,
    messages: [{ role: 'user', content: [source, { type: 'text', text: 'Διάβασε αυτή τη λίστα συμμετοχών.' }] }],
  });
  if (res.stop_reason === 'refusal') throw new HttpError(502, 'Το AI δεν διάβασε αυτό το αρχείο.');
  if (res.stop_reason === 'max_tokens') throw new HttpError(502, 'Η λίστα είναι πολύ μεγάλη για ανάγνωση.');
  let x: unknown;
  try {
    x = JSON.parse(res.content.map((b) => (b.type === 'text' ? b.text : '')).join(''));
  } catch {
    throw new HttpError(502, 'Μη αναγνώσιμη απάντηση από το AI. Δοκίμασε ξανά.');
  }
  if (!isEntryListExtract(x)) throw new HttpError(502, 'Μη αναμενόμενη απάντηση από το AI.');
  if (!x.isEntryList) throw new HttpError(422, 'Δεν μοιάζει με λίστα συμμετοχών.');
  return {
    event: x.event,
    entries: cleanEntries(x),
    model: res.model,
    usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens },
  };
}

// ---- ORC -------------------------------------------------------------------

const ORC_BASE = 'https://sas.orc.org/api';
const ORC_CACHE_SEC = 12 * 3600;

/** GET a JSON file from the ORC API, cached (certificates change rarely). The key never goes into logs or cache keys. */
async function orcJson(key: string, endpoint: string, params: Record<string, string>, cacheId: string): Promise<unknown> {
  const cacheKey = new Request(`https://orc-cache.invalid/${endpoint}/${encodeURIComponent(cacheId)}`);
  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined;
  const hit = await cache?.match(cacheKey);
  if (hit) return hit.json();
  const url = `${ORC_BASE}/${encodeURIComponent(key)}/${endpoint}?${new URLSearchParams(params)}`;
  const res = await fetch(url);
  if (res.status === 401) throw new HttpError(502, 'Το κλειδί ORC δεν γίνεται δεκτό.');
  if (!res.ok) throw new HttpError(502, `ORC: σφάλμα ${res.status}`);
  const text = await res.text();
  await cache?.put(cacheKey, new Response(text, { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${ORC_CACHE_SEC}` } }));
  return JSON.parse(text);
}

/** Looks up one boat's active ORC certificate by sail number and returns it as a boat profile. */
export async function orcBoat(key: string | undefined, sailNoRaw: string) {
  if (!key) throw new HttpError(501, 'Δεν έχει ρυθμιστεί κλειδί ORC στον server.');
  const sailNo = normalizeSailNo(sailNoRaw);
  if (!/^[A-Z]{3}-[0-9A-Z]{1,8}$/.test(sailNo)) throw new HttpError(400, 'Άκυρος αριθμός πανιού.');
  const country = sailNo.slice(0, 3);
  const body = (await orcJson(key, 'DownBoatRMS', { CountryId: country, SailNo: sailNo, Family: 'ORC', ext: 'json' }, sailNo)) as {
    rms?: OrcRms[];
    ScoringOptions?: OrcScoringOption[];
  };
  const rms = body.rms?.[0];
  if (!rms) return { found: false as const, sailNo };
  return { found: true as const, sailNo, boat: orcToBoat(rms, body.ScoringOptions ?? []) };
}

// ---- AIS (aisstream.io) ------------------------------------------------------

export interface AisPosition {
  mmsi: string;
  lat: number;
  lon: number;
  sog?: number;
  cog?: number;
  name?: string;
  t: number;
}

/** Saronic Gulf and approaches: [[lat, lon], [lat, lon]]. */
const BOX = [
  [37.1, 22.8],
  [38.2, 24.4],
];

/**
 * Listens to aisstream.io for up to `waitMs` and returns the latest position of
 * each requested MMSI. Class B boats report every 30 s–3 min, so a boat may be missing.
 */
export async function aisPositions(key: string | undefined, mmsis: string[], waitMs = 12_000): Promise<AisPosition[]> {
  if (!key) throw new HttpError(501, 'Δεν έχει ρυθμιστεί κλειδί aisstream.io στον server.');
  const wanted = [...new Set(mmsis.filter((m) => /^\d{9}$/.test(m)))].slice(0, 50);
  if (!wanted.length) return [];
  const res = await fetch('https://stream.aisstream.io/v0/stream', { headers: { Upgrade: 'websocket' } });
  const ws = (res as unknown as { webSocket?: WebSocket & { accept(): void } }).webSocket;
  if (!ws) throw new HttpError(502, 'Δεν συνδέθηκε το aisstream.io.');
  ws.accept();
  ws.send(JSON.stringify({ APIKey: key, BoundingBoxes: [BOX], FiltersShipMMSI: wanted, FilterMessageTypes: ['PositionReport', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport'] }));
  const out = new Map<string, AisPosition>();
  await new Promise<void>((resolve) => {
    const done = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve();
    };
    const timer = setTimeout(done, waitMs);
    ws.addEventListener('message', (ev: MessageEvent) => {
      const p = parseAisStream(typeof ev.data === 'string' ? ev.data : '');
      if (p) out.set(p.mmsi, p);
      if (wanted.every((m) => out.has(m))) {
        clearTimeout(timer);
        done();
      }
    });
    ws.addEventListener('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  return [...out.values()];
}

/** One aisstream.io message → position (MetaData carries MMSI, name, latitude, longitude). */
export function parseAisStream(raw: string): AisPosition | undefined {
  try {
    const m = JSON.parse(raw) as {
      MetaData?: { MMSI?: number; ShipName?: string; latitude?: number; longitude?: number; time_utc?: string };
      Message?: Record<string, { Sog?: number; Cog?: number }>;
    };
    const md = m.MetaData;
    if (!md?.MMSI || typeof md.latitude !== 'number' || typeof md.longitude !== 'number') return undefined;
    const body = m.Message ? Object.values(m.Message)[0] : undefined;
    const t = md.time_utc ? Date.parse(md.time_utc.replace(' +0000 UTC', 'Z').replace(/\.\d+/, '')) : NaN;
    return {
      mmsi: String(md.MMSI).padStart(9, '0'),
      lat: md.latitude,
      lon: md.longitude,
      sog: body?.Sog,
      cog: body?.Cog,
      name: md.ShipName?.trim() || undefined,
      t: Number.isFinite(t) ? t : Date.now(),
    };
  } catch {
    return undefined;
  }
}
