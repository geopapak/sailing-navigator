/** Account API on our server (see server/accounts.ts). */

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  ai: { allowed: boolean; used: number; limit: number };
  termsOk: boolean;
  termsAt: number | null;
  mustChangePassword: boolean;
  pdf: { used: number; left: number | null };
}

export interface AdminUser extends PublicUser {
  createdAt: number;
  resetRequestedAt: number | null;
}

export interface ServerConfig {
  termsVersion: number;
  controller: { name: string; email: string };
}

export interface SyncItem {
  kind: 'boat' | 'course' | 'note';
  id: string;
  data?: unknown;
  updatedAt: number;
  deleted?: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const base = (url: string) => url.trim().replace(/\/+$/, '');

export async function api<T>(server: string, path: string, opts: { method?: string; body?: unknown; token?: string; timeoutMs?: number } = {}): Promise<T> {
  if (!server.trim()) throw new ApiError(0, 'Δεν έχει οριστεί server στις Ρυθμίσεις.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ApiError(0, 'Χωρίς σύνδεση στο internet.');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 20_000);
  let res: Response;
  try {
    res = await fetch(`${base(server)}${path}`, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: {
        'content-type': 'application/json',
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: ctl.signal,
    });
  } catch (e) {
    throw new ApiError(0, (e as Error).name === 'AbortError' ? 'Η υπηρεσία δεν απάντησε εγκαίρως. Δοκίμασε ξανά.' : 'Δεν απαντά η υπηρεσία της εφαρμογής. Έλεγξε τη σύνδεση.');
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Κάτι πήγε στραβά (κωδικός ${res.status}). Δοκίμασε ξανά.`);
  return data;
}

export const accountApi = {
  register: (server: string, p: { email: string; password: string; name: string; acceptTerms: boolean; acceptPrivacy: boolean; marketing: boolean }) =>
    api<{ token: string; user: PublicUser }>(server, '/auth/register', { body: p }),
  forgot: (server: string, email: string) => api<{ ok: true }>(server, '/auth/forgot', { body: { email } }),
  acceptTerms: (server: string, token: string, version: number) => api<{ user: PublicUser }>(server, '/me/terms', { body: { version }, token }),
  exportData: (server: string, token: string) => api<Record<string, unknown>>(server, '/me/export', { token }),
  config: (server: string) => api<ServerConfig>(server, '/config', { timeoutMs: 8000 }),
  login: (server: string, email: string, password: string) => api<{ token: string; user: PublicUser }>(server, '/auth/login', { body: { email, password } }),
  logout: (server: string, token: string) => api(server, '/auth/logout', { body: {}, token }),
  me: (server: string, token: string) => api<{ user: PublicUser }>(server, '/me', { token }),
  changePassword: (server: string, token: string, current: string, next: string) =>
    api<{ user: PublicUser }>(server, '/me/password', { body: { current, next }, token }),
  certificate: (server: string, token: string, data: string, mediaType: string) =>
    api<{ extract: import('../boat/certificate').CertificateExtract; model: string }>(server, '/certificate', {
      body: { data, mediaType },
      token,
      timeoutMs: 150_000,
    }),
  deleteAccount: (server: string, token: string) => api(server, '/me', { method: 'DELETE', token }),
  sync: (server: string, token: string, since: number, changes: SyncItem[]) =>
    api<{ now: number; items: SyncItem[] }>(server, '/sync', { body: { since, changes }, token, timeoutMs: 40_000 }),
  users: (server: string, token: string) => api<{ users: AdminUser[] }>(server, '/admin/users', { token }),
  entryList: (server: string, token: string, data: string, mediaType: string) =>
    api<{ event: string; entries: import('../race/entrylist').CleanEntry[] }>(server, '/entrylist', { body: { data, mediaType }, token, timeoutMs: 150_000 }),
  orcBoat: (server: string, token: string, sailNo: string) =>
    api<{ found: boolean; sailNo: string; boat?: import('../boat/types').BoatProfile }>(server, `/orc/boat?sailNo=${encodeURIComponent(sailNo)}`, { token, timeoutMs: 30_000 }),
  ais: (server: string, token: string, mmsis: string[]) =>
    api<{ positions: { mmsi: string; lat: number; lon: number; sog?: number; cog?: number; name?: string; t: number }[] }>(
      server,
      `/ais?mmsi=${mmsis.join(',')}&wait=12000`,
      { token, timeoutMs: 30_000 },
    ),
  analysis: (server: string, token: string, summary: unknown) =>
    api<{ lessons: { text: string; impact?: string }[]; model: string }>(server, '/analysis', { body: { summary }, token, timeoutMs: 120_000 }),
  crewNotes: (server: string, token: string) => api<{ notes: import('../knowledge/types').KnowledgeNote[] }>(server, '/notes/crew', { token }),
  updateUser: (server: string, token: string, id: string, patch: { aiAllowed?: boolean; aiLimit?: number; resetPassword?: boolean }) =>
    api<{ user: PublicUser; tempPassword?: string }>(server, `/admin/users/${id}`, { body: patch, token }),
};
