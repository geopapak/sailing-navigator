/**
 * Crews (P-022): the boat owner invites crew with a one-time link (7 days),
 * as permanent crew or as a guest for one race. Members only read: the race
 * plan (time, course, who sails where, the owner's note). The optional athlete
 * card number is personal data: only the owner and the member see it.
 */
import { HttpError, TERMS_VERSION, sha256, type AccountEnv, type D1Database, type UserRow } from './accounts';
import { hit, type Limit } from './rateLimit';

export const ROLES = ['helm', 'tactician', 'navigator', 'genoa', 'main', 'spinnaker', 'pit', 'mast', 'bow'] as const;
export type Role = (typeof ROLES)[number];

export const INVITE_DAYS = 7;
/** A guest loses access two days after the race start (time to see the analysis next day). */
export const GUEST_HOURS_AFTER_START = 48;
const MAX_CREWS = 10;
const MAX_MEMBERS = 30;
const MAX_RACE_BYTES = 32 * 1024;
const INVITE_LIMIT: Limit = { scope: 'invite', max: 30, windowMs: 24 * 60 * 60_000 };

const DAY = 24 * 60 * 60_000;
const randomId = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomToken = () => {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const firstName = (n: string | null | undefined) => (n ?? '').trim().split(/\s+/)[0] || 'Μέλος';

function db(env: AccountEnv): D1Database {
  if (!env.DB) throw new HttpError(503, 'Οι λογαριασμοί δεν είναι διαθέσιμοι.');
  return env.DB;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Optional athlete card number: letters, digits, dash, space; up to 20. Empty → null. */
export function cleanCard(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') throw new HttpError(400, 'Άκυρος αριθμός δελτίου.');
  const s = v.trim();
  if (!s) return null;
  if (s.length > 20 || !/^[\p{L}\p{N} -]+$/u.test(s)) throw new HttpError(400, 'Ο αριθμός δελτίου θέλει έως 20 γράμματα ή αριθμούς.');
  return s;
}

interface CrewRow {
  id: string;
  owner_id: string;
  boat_id: string;
  boat_name: string;
  sail_no: string | null;
  created_at: number;
}
interface MemberRow {
  crew_id: string;
  user_id: string;
  kind: 'crew' | 'guest';
  race_id: string | null;
  expires_at: number | null;
  athlete_card: string | null;
  joined_at: number;
  name: string;
}

async function ownedCrew(env: AccountEnv, u: UserRow, crewId: string): Promise<CrewRow> {
  const c = await db(env).prepare('SELECT * FROM crews WHERE id = ?').bind(crewId).first<CrewRow>();
  if (!c || c.owner_id !== u.id) throw new HttpError(404, 'Δεν βρέθηκε το πλήρωμα.');
  return c;
}

const active = (m: { expires_at: number | null }, now: number) => m.expires_at === null || m.expires_at > now;

/** Crew of one of my boats (created on first use). */
export async function ensureCrew(env: AccountEnv, u: UserRow, body: Record<string, unknown>) {
  const boatId = str(body.boatId, 64);
  const boatName = str(body.boatName, 80);
  if (!boatId || !boatName) throw new HttpError(400, 'Λείπει το σκάφος.');
  const d = db(env);
  const sailNo = str(body.sailNo, 20) || null;
  const found = await d.prepare('SELECT * FROM crews WHERE owner_id = ? AND boat_id = ?').bind(u.id, boatId).first<CrewRow>();
  if (found) {
    if (found.boat_name !== boatName || found.sail_no !== sailNo)
      await d.prepare('UPDATE crews SET boat_name = ?, sail_no = ? WHERE id = ?').bind(boatName, sailNo, found.id).run();
    return { crew: { id: found.id, boatId, boatName, sailNo } };
  }
  const n = await d.prepare('SELECT COUNT(*) AS n FROM crews WHERE owner_id = ?').bind(u.id).first<{ n: number }>();
  if ((n?.n ?? 0) >= MAX_CREWS) throw new HttpError(400, 'Πάρα πολλά πληρώματα.');
  const id = randomId();
  await d
    .prepare('INSERT INTO crews (id, owner_id, boat_id, boat_name, sail_no, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, u.id, boatId, boatName, sailNo, Date.now())
    .run();
  return { crew: { id, boatId, boatName, sailNo } };
}

/** My crews (as owner, with members and their cards) and the crews I sail with (read-only). */
export async function listCrews(env: AccountEnv, u: UserRow, now = Date.now()) {
  const d = db(env);
  const owned = (await d.prepare('SELECT * FROM crews WHERE owner_id = ? ORDER BY created_at').bind(u.id).all<CrewRow>()).results;
  const memberOf = (
    await d
      .prepare(
        `SELECT c.*, m.kind AS m_kind, m.race_id AS m_race, m.expires_at AS m_exp, m.athlete_card AS m_card, o.name AS owner_name
         FROM crew_members m JOIN crews c ON c.id = m.crew_id JOIN users o ON o.id = c.owner_id
         WHERE m.user_id = ?`,
      )
      .bind(u.id)
      .all<CrewRow & { m_kind: 'crew' | 'guest'; m_race: string | null; m_exp: number | null; m_card: string | null; owner_name: string }>()
  ).results.filter((c) => c.m_exp === null || c.m_exp > now);
  const ids = [...owned.map((c) => c.id), ...memberOf.map((c) => c.id)];
  const members = new Map<string, MemberRow[]>();
  const races = new Map<string, { raceId: string; data: unknown; updatedAt: number }[]>();
  if (ids.length) {
    const q = ids.map(() => '?').join(', ');
    for (const m of (
      await d
        .prepare(`SELECT m.*, us.name FROM crew_members m JOIN users us ON us.id = m.user_id WHERE m.crew_id IN (${q}) ORDER BY m.joined_at`)
        .bind(...ids)
        .all<MemberRow>()
    ).results) {
      if (!active(m, now)) continue;
      members.set(m.crew_id, [...(members.get(m.crew_id) ?? []), m]);
    }
    for (const r of (
      await d.prepare(`SELECT crew_id, race_id, data, updated_at FROM shared_races WHERE crew_id IN (${q}) ORDER BY updated_at DESC`).bind(...ids).all<{
        crew_id: string;
        race_id: string;
        data: string;
        updated_at: number;
      }>()
    ).results) {
      races.set(r.crew_id, [...(races.get(r.crew_id) ?? []), { raceId: r.race_id, data: JSON.parse(r.data), updatedAt: r.updated_at }]);
    }
  }
  return {
    owned: owned.map((c) => ({
      id: c.id,
      boatId: c.boat_id,
      boatName: c.boat_name,
      sailNo: c.sail_no,
      members: (members.get(c.id) ?? []).map((m) => ({
        userId: m.user_id,
        name: m.name,
        kind: m.kind,
        raceId: m.race_id,
        expiresAt: m.expires_at,
        athleteCard: m.athlete_card,
      })),
      races: races.get(c.id) ?? [],
    })),
    member: memberOf.map((c) => ({
      id: c.id,
      boatName: c.boat_name,
      sailNo: c.sail_no,
      owner: firstName(c.owner_name),
      kind: c.m_kind,
      raceId: c.m_race,
      expiresAt: c.m_exp,
      /** My own card only; other members' cards are not shown to members. */
      athleteCard: c.m_card,
      crew: (members.get(c.id) ?? []).map((m) => ({ userId: m.user_id, name: m.name, kind: m.kind })),
      races: (races.get(c.id) ?? []).filter((r) => c.m_kind === 'crew' || r.raceId === c.m_race),
    })),
  };
}

/** One-time link, valid 7 days. Guests are invited for one shared race. */
export async function createInvite(env: AccountEnv, u: UserRow, crewId: string, body: Record<string, unknown>, now = Date.now()) {
  const c = await ownedCrew(env, u, crewId);
  const kind = body.kind === 'guest' ? 'guest' : 'crew';
  const raceId = kind === 'guest' ? str(body.raceId, 64) : '';
  if (kind === 'guest' && !raceId) throw new HttpError(400, 'Ο καλεσμένος χρειάζεται αγώνα.');
  const d = db(env);
  const m = await d.prepare('SELECT COUNT(*) AS n FROM crew_members WHERE crew_id = ?').bind(c.id).first<{ n: number }>();
  if ((m?.n ?? 0) >= MAX_MEMBERS) throw new HttpError(400, 'Το πλήρωμα είναι γεμάτο.');
  if (!(await hit(env.DB, INVITE_LIMIT, u.id, now))) throw new HttpError(429, 'Πολλές προσκλήσεις σήμερα. Δοκίμασε αύριο.');
  const token = randomToken();
  await d.batch([
    d.prepare('DELETE FROM invites WHERE crew_id = ? AND (expires_at <= ? OR used_at IS NOT NULL)').bind(c.id, now),
    d
      .prepare('INSERT INTO invites (token_hash, crew_id, kind, race_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(await sha256(`invite:${token}`), c.id, kind, raceId || null, now, now + INVITE_DAYS * DAY),
  ]);
  return { token, kind, expiresAt: now + INVITE_DAYS * DAY };
}

async function openInvite(env: AccountEnv, token: unknown, now: number) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new HttpError(404, 'Η πρόσκληση δεν βρέθηκε.');
  const inv = await db(env)
    .prepare(
      `SELECT i.*, c.boat_name, c.owner_id, o.name AS owner_name FROM invites i
       JOIN crews c ON c.id = i.crew_id JOIN users o ON o.id = c.owner_id WHERE i.token_hash = ?`,
    )
    .bind(await sha256(`invite:${token}`))
    .first<{ token_hash: string; crew_id: string; kind: 'crew' | 'guest'; race_id: string | null; expires_at: number; used_at: number | null; boat_name: string; owner_id: string; owner_name: string }>();
  if (!inv) throw new HttpError(404, 'Η πρόσκληση δεν βρέθηκε.');
  if (inv.used_at) throw new HttpError(410, 'Η πρόσκληση έχει ήδη χρησιμοποιηθεί. Ζήτα καινούργια.');
  if (inv.expires_at <= now) throw new HttpError(410, 'Η πρόσκληση έληξε. Ζήτα καινούργια.');
  return inv;
}

async function raceName(env: AccountEnv, crewId: string, raceId: string | null) {
  if (!raceId) return { name: null as string | null, start: null as number | null };
  const r = await db(env).prepare('SELECT data FROM shared_races WHERE crew_id = ? AND race_id = ?').bind(crewId, raceId).first<{ data: string }>();
  const x = r ? (JSON.parse(r.data) as { name?: string; start?: number }) : {};
  return { name: x.name ?? null, start: typeof x.start === 'number' ? x.start : null };
}

export async function previewInvite(env: AccountEnv, token: unknown, now = Date.now()) {
  const inv = await openInvite(env, token, now);
  const r = await raceName(env, inv.crew_id, inv.race_id);
  return { boatName: inv.boat_name, owner: firstName(inv.owner_name), kind: inv.kind, raceName: r.name, raceStart: r.start, termsVersion: TERMS_VERSION };
}

export async function acceptInvite(env: AccountEnv, u: UserRow, token: unknown, body: Record<string, unknown>, now = Date.now()) {
  const inv = await openInvite(env, token, now);
  if ((u.terms_version ?? 0) < TERMS_VERSION) throw new HttpError(409, 'Αποδέξου πρώτα τους νέους όρους.');
  if (inv.owner_id === u.id) throw new HttpError(400, 'Είσαι ο ιδιοκτήτης αυτού του σκάφους.');
  const card = cleanCard(body.athleteCard);
  const d = db(env);
  const existing = await d.prepare('SELECT kind FROM crew_members WHERE crew_id = ? AND user_id = ?').bind(inv.crew_id, u.id).first<{ kind: string }>();
  let expires: number | null = null;
  if (inv.kind === 'guest') {
    const r = await raceName(env, inv.crew_id, inv.race_id);
    expires = (r.start ?? now) + GUEST_HOURS_AFTER_START * 60 * 60_000;
  }
  const stmts = [d.prepare('UPDATE invites SET used_at = ? WHERE token_hash = ?').bind(now, inv.token_hash)];
  if (existing?.kind === 'crew') {
    // Already permanent crew: a guest link does not downgrade; only the card is updated if given.
    if (card) stmts.push(d.prepare('UPDATE crew_members SET athlete_card = ? WHERE crew_id = ? AND user_id = ?').bind(card, inv.crew_id, u.id));
  } else {
    stmts.push(
      d
        .prepare(
          `INSERT INTO crew_members (crew_id, user_id, kind, race_id, expires_at, athlete_card, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (crew_id, user_id) DO UPDATE SET kind = excluded.kind, race_id = excluded.race_id, expires_at = excluded.expires_at,
             athlete_card = COALESCE(excluded.athlete_card, crew_members.athlete_card)`,
        )
        .bind(inv.crew_id, u.id, inv.kind, inv.race_id, expires, card, now),
    );
  }
  await d.batch(stmts);
  return { ok: true, crewId: inv.crew_id, boatName: inv.boat_name };
}

/** Owner or the member: change the athlete card number. */
export async function updateMember(env: AccountEnv, u: UserRow, crewId: string, userId: string, body: Record<string, unknown>) {
  const c = await db(env).prepare('SELECT owner_id FROM crews WHERE id = ?').bind(crewId).first<{ owner_id: string }>();
  if (!c || (c.owner_id !== u.id && userId !== u.id)) throw new HttpError(404, 'Δεν βρέθηκε.');
  const r = await db(env)
    .prepare('UPDATE crew_members SET athlete_card = ? WHERE crew_id = ? AND user_id = ?')
    .bind(cleanCard(body.athleteCard), crewId, userId)
    .run();
  if (!r.meta?.changes) throw new HttpError(404, 'Δεν βρέθηκε.');
  return { ok: true };
}

/** Owner removes a member, or a member leaves. */
export async function removeMember(env: AccountEnv, u: UserRow, crewId: string, userId: string) {
  const c = await db(env).prepare('SELECT owner_id FROM crews WHERE id = ?').bind(crewId).first<{ owner_id: string }>();
  if (!c || (c.owner_id !== u.id && userId !== u.id)) throw new HttpError(404, 'Δεν βρέθηκε.');
  await db(env).prepare('DELETE FROM crew_members WHERE crew_id = ? AND user_id = ?').bind(crewId, userId).run();
  return { ok: true };
}

export async function deleteCrew(env: AccountEnv, u: UserRow, crewId: string) {
  const c = await ownedCrew(env, u, crewId);
  const d = db(env);
  await d.batch([
    d.prepare('DELETE FROM shared_races WHERE crew_id = ?').bind(c.id),
    d.prepare('DELETE FROM invites WHERE crew_id = ?').bind(c.id),
    d.prepare('DELETE FROM crew_members WHERE crew_id = ?').bind(c.id),
    d.prepare('DELETE FROM crews WHERE id = ?').bind(c.id),
  ]);
  return { ok: true };
}

/** The race plan the owner shares: validated and trimmed (no track, no GPS). */
export function cleanRacePlan(b: Record<string, unknown>) {
  const name = str(b.name, 80);
  const start = typeof b.start === 'number' && Number.isFinite(b.start) ? b.start : NaN;
  if (!name || Number.isNaN(start)) throw new HttpError(400, 'Λείπει όνομα ή ώρα αγώνα.');
  const marks = (Array.isArray(b.marks) ? b.marks : []).slice(0, 30).flatMap((m) => {
    const x = m as Record<string, unknown>;
    return typeof x.lat === 'number' && typeof x.lon === 'number' && Math.abs(x.lat) <= 90 && Math.abs(x.lon) <= 180
      ? [{ name: str(x.name, 40), lat: x.lat, lon: x.lon }]
      : [];
  });
  const crew = (Array.isArray(b.crew) ? b.crew : []).slice(0, MAX_MEMBERS).flatMap((p) => {
    const x = p as Record<string, unknown>;
    const role = ROLES.includes(x.role as Role) ? (x.role as Role) : undefined;
    const pname = str(x.name, 60);
    return pname ? [{ userId: str(x.userId, 32) || undefined, name: pname, role }] : [];
  });
  return { name, start, courseName: str(b.courseName, 80), marks, note: str(b.note, 500), crew };
}

export async function putRace(env: AccountEnv, u: UserRow, crewId: string, raceId: string, body: Record<string, unknown>, now = Date.now()) {
  const c = await ownedCrew(env, u, crewId);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(raceId)) throw new HttpError(400, 'Άκυρος αγώνας.');
  const data = JSON.stringify(cleanRacePlan(body));
  if (data.length > MAX_RACE_BYTES) throw new HttpError(413, 'Πολύ μεγάλο.');
  await db(env)
    .prepare(
      `INSERT INTO shared_races (crew_id, race_id, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (crew_id, race_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
    .bind(c.id, raceId, data, now)
    .run();
  return { ok: true, updatedAt: now };
}

export async function deleteRace(env: AccountEnv, u: UserRow, crewId: string, raceId: string) {
  const c = await ownedCrew(env, u, crewId);
  await db(env).prepare('DELETE FROM shared_races WHERE crew_id = ? AND race_id = ?').bind(c.id, raceId).run();
  return { ok: true };
}

/** Routes under /crews and /invites (signed-in users). */
export async function crewRoutes(env: AccountEnv, u: UserRow, method: string, path: string, body: () => Promise<Record<string, unknown>>) {
  if (method === 'GET' && path === '/crews') return listCrews(env, u);
  if (method === 'POST' && path === '/crews') return ensureCrew(env, u, await body());
  let m = path.match(/^\/invites\/([A-Za-z0-9_-]{20,64})$/);
  if (m && method === 'GET') return previewInvite(env, m[1]);
  m = path.match(/^\/invites\/([A-Za-z0-9_-]{20,64})\/accept$/);
  if (m && method === 'POST') return acceptInvite(env, u, m[1], await body());
  m = path.match(/^\/crews\/([0-9a-f]{24})(?:\/(invites|members|races)(?:\/([A-Za-z0-9_-]{1,64}))?)?$/);
  if (!m) throw new HttpError(404, 'Not found');
  const [, crewId, sub, rawId] = m;
  // "me" = the signed-in member (change my own card, or leave).
  const id = sub === 'members' && rawId === 'me' ? u.id : rawId;
  if (!sub && method === 'DELETE') return deleteCrew(env, u, crewId);
  if (sub === 'invites' && !id && method === 'POST') return createInvite(env, u, crewId, await body());
  if (sub === 'members' && id && method === 'PATCH') return updateMember(env, u, crewId, id, await body());
  if (sub === 'members' && id && method === 'DELETE') return removeMember(env, u, crewId, id);
  if (sub === 'races' && id && method === 'PUT') return putRace(env, u, crewId, id, await body());
  if (sub === 'races' && id && method === 'DELETE') return deleteRace(env, u, crewId, id);
  throw new HttpError(404, 'Not found');
}

/** For GDPR export: my crews (without other people's card numbers) and my memberships. */
export async function exportCrews(env: AccountEnv, u: UserRow) {
  const x = await listCrews(env, u, 0);
  return {
    ownedCrews: x.owned.map((c) => ({ ...c, members: c.members.map((m) => ({ name: m.name, kind: m.kind })) })),
    memberships: x.member.map((c) => ({ boatName: c.boatName, kind: c.kind, athleteCard: c.athleteCard })),
  };
}

/** For account deletion: my memberships, and my crews with everything in them. */
export function deleteCrewStatements(d: D1Database, userId: string) {
  const mine = 'SELECT id FROM crews WHERE owner_id = ?';
  return [
    d.prepare('DELETE FROM crew_members WHERE user_id = ?').bind(userId),
    d.prepare(`DELETE FROM shared_races WHERE crew_id IN (${mine})`).bind(userId),
    d.prepare(`DELETE FROM invites WHERE crew_id IN (${mine})`).bind(userId),
    d.prepare(`DELETE FROM crew_members WHERE crew_id IN (${mine})`).bind(userId),
    d.prepare('DELETE FROM crews WHERE owner_id = ?').bind(userId),
  ];
}

/** Users who sail together with `userId` (owner + permanent crew) per crew sail number. */
export async function crewCircles(d: D1Database, userId: string): Promise<{ sailNo: string | null; users: string[] }[]> {
  const crews = (
    await d
      .prepare(
        `SELECT DISTINCT c.id, c.owner_id, c.sail_no FROM crews c LEFT JOIN crew_members m ON m.crew_id = c.id
         WHERE c.owner_id = ? OR (m.user_id = ? AND m.kind = 'crew')`,
      )
      .bind(userId, userId)
      .all<{ id: string; owner_id: string; sail_no: string | null }>()
  ).results;
  const out = [];
  for (const c of crews) {
    const ms = (await d.prepare("SELECT user_id FROM crew_members WHERE crew_id = ? AND kind = 'crew'").bind(c.id).all<{ user_id: string }>()).results;
    out.push({ sailNo: c.sail_no, users: [c.owner_id, ...ms.map((m) => m.user_id)] });
  }
  return out;
}
