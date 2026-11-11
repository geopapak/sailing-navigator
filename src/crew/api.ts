/** Crews and invitations (P-022): client side of /crews and /invites. */
import { api } from '../sync/api';

export const ROLES = ['helm', 'tactician', 'navigator', 'genoa', 'main', 'spinnaker', 'pit', 'mast', 'bow'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  helm: 'Τιμονιέρης',
  tactician: 'Τακτικός',
  navigator: 'Ναυτίλος',
  genoa: 'Τρίμερ τζένοας',
  main: 'Τρίμερ μαΐστρας',
  spinnaker: 'Τρίμερ μπαλονιού',
  pit: 'Πιτ',
  mast: 'Μάστ',
  bow: 'Πλώρη',
};

export interface CrewPlace {
  userId?: string;
  name: string;
  role?: Role;
}

export interface RacePlan {
  name: string;
  start: number;
  courseName?: string;
  marks: { name: string; lat: number; lon: number }[];
  note?: string;
  crew: CrewPlace[];
}

export interface OwnedCrew {
  id: string;
  boatId: string;
  boatName: string;
  sailNo: string | null;
  members: { userId: string; name: string; kind: 'crew' | 'guest'; raceId: string | null; expiresAt: number | null; athleteCard: string | null }[];
  races: { raceId: string; data: RacePlan; updatedAt: number }[];
}

export interface MemberCrew {
  id: string;
  boatName: string;
  sailNo: string | null;
  owner: string;
  kind: 'crew' | 'guest';
  raceId: string | null;
  expiresAt: number | null;
  athleteCard: string | null;
  crew: { userId: string; name: string; kind: 'crew' | 'guest' }[];
  races: { raceId: string; data: RacePlan; updatedAt: number }[];
}

export interface InvitePreview {
  boatName: string;
  owner: string;
  kind: 'crew' | 'guest';
  raceName: string | null;
  raceStart: number | null;
}

export const crewApi = {
  list: (server: string, token: string) => api<{ owned: OwnedCrew[]; member: MemberCrew[] }>(server, '/crews', { token }),
  ensure: (server: string, token: string, boat: { boatId: string; boatName: string; sailNo?: string }) =>
    api<{ crew: { id: string } }>(server, '/crews', { body: boat, token }),
  invite: (server: string, token: string, crewId: string, kind: 'crew' | 'guest', raceId?: string) =>
    api<{ token: string; expiresAt: number }>(server, `/crews/${crewId}/invites`, { body: { kind, raceId }, token }),
  preview: (server: string, token: string, invite: string) => api<InvitePreview>(server, `/invites/${invite}`, { token }),
  accept: (server: string, token: string, invite: string, athleteCard?: string) =>
    api<{ ok: true; boatName: string }>(server, `/invites/${invite}/accept`, { body: { athleteCard }, token }),
  setCard: (server: string, token: string, crewId: string, userId: string, athleteCard: string) =>
    api(server, `/crews/${crewId}/members/${userId}`, { method: 'PATCH', body: { athleteCard }, token }),
  remove: (server: string, token: string, crewId: string, userId: string) => api(server, `/crews/${crewId}/members/${userId}`, { method: 'DELETE', token }),
  shareRace: (server: string, token: string, crewId: string, raceId: string, plan: RacePlan) =>
    api(server, `/crews/${crewId}/races/${raceId}`, { method: 'PUT', body: plan, token }),
  unshareRace: (server: string, token: string, crewId: string, raceId: string) => api(server, `/crews/${crewId}/races/${raceId}`, { method: 'DELETE', token }),
};

const PENDING = 'pending-invite';

/** A link like …/?invite=TOKEN: keep the token until the user is signed in, and clean the address bar. */
export function takeInviteFromUrl(): void {
  try {
    const u = new URL(window.location.href);
    const t = u.searchParams.get('invite');
    if (t && /^[A-Za-z0-9_-]{20,64}$/.test(t)) localStorage.setItem(PENDING, t);
    if (t !== null) {
      u.searchParams.delete('invite');
      window.history.replaceState(null, '', u.pathname + u.search + u.hash);
    }
  } catch {
    /* storage blocked */
  }
}

export function pendingInvite(): string | undefined {
  try {
    return localStorage.getItem(PENDING) ?? undefined;
  } catch {
    return undefined;
  }
}

export function clearPendingInvite(): void {
  try {
    localStorage.removeItem(PENDING);
  } catch {
    /* ignore */
  }
}

export function inviteLink(token: string): string {
  return `${window.location.origin}${window.location.pathname}?invite=${token}`;
}

/** Share sheet on phones (WhatsApp, Viber…), else copy to the clipboard. Returns how it went. */
export async function shareText(title: string, text: string, url?: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'failed';
  }
  try {
    await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** Text for the entry form: one line per person, with the athlete card or a gap. */
export function entryListText(boatName: string, people: { name: string; athleteCard?: string | null; role?: Role }[]): string {
  const lines = people.map((p, i) => `${i + 1}. ${p.name}${p.role ? ` (${ROLE_LABEL[p.role]})` : ''} — ${p.athleteCard || 'χωρίς αριθμό δελτίου'}`);
  return [`Πλήρωμα ${boatName}`, ...lines].join('\n');
}
