/** Account API on our server (see server/accounts.ts). */

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  ai: { allowed: boolean; used: number; limit: number };
}

export interface AdminUser extends PublicUser {
  createdAt: number;
}

export interface SyncItem {
  kind: 'boat' | 'course';
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
    throw new ApiError(0, (e as Error).name === 'AbortError' ? 'Ο server δεν απάντησε εγκαίρως.' : 'Δεν βρέθηκε ο server.');
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Σφάλμα server (${res.status}).`);
  return data;
}

export const accountApi = {
  register: (server: string, email: string, password: string, name: string) =>
    api<{ token: string; user: PublicUser }>(server, '/auth/register', { body: { email, password, name } }),
  login: (server: string, email: string, password: string) => api<{ token: string; user: PublicUser }>(server, '/auth/login', { body: { email, password } }),
  logout: (server: string, token: string) => api(server, '/auth/logout', { body: {}, token }),
  me: (server: string, token: string) => api<{ user: PublicUser }>(server, '/me', { token }),
  changePassword: (server: string, token: string, current: string, next: string) => api(server, '/me/password', { body: { current, next }, token }),
  deleteAccount: (server: string, token: string) => api(server, '/me', { method: 'DELETE', token }),
  sync: (server: string, token: string, since: number, changes: SyncItem[]) =>
    api<{ now: number; items: SyncItem[] }>(server, '/sync', { body: { since, changes }, token, timeoutMs: 40_000 }),
  users: (server: string, token: string) => api<{ users: AdminUser[] }>(server, '/admin/users', { token }),
  updateUser: (server: string, token: string, id: string, patch: { aiAllowed?: boolean; aiLimit?: number; resetPassword?: boolean }) =>
    api<{ user: PublicUser; tempPassword?: string }>(server, `/admin/users/${id}`, { body: patch, token }),
};
