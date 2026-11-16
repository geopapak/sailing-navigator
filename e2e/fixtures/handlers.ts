/**
 * The fake Worker (P-045): fixed JSON answers per route, the same for `page.route`
 * (flows 1–4) and for the local fake server on 127.0.0.1 (flows 5–6, service worker).
 * Error texts are the ones of server/accounts.ts. Never a real server, never AI.
 */
import type { PublicUser, ServerConfig, SyncItem } from '../../src/sync/api';
import type { OwnedCrew } from '../../src/crew/api';
import { TOKEN, USER } from './data/user';
import { ASTARTI } from './data/boat-astarti';
import { COURSE } from './data/course-saronic';
import { ADVICE_REPLY, CHAT_REPLY, LESSONS } from './data/ai';

/** Routes that would cost money on the real server: each test must allow them explicitly. */
export const AI_ROUTES = ['/analysis', '/chat', '/advice', '/certificate', '/entrylist'] as const;

export type Mode = 'ok' | '401' | '409' | '429' | '500' | 'abort' | 'hang';

export interface Scenario {
  user: PublicUser;
  /** What the first /sync brings: boats and courses of the account. */
  boats: SyncItem[];
  login: Mode;
  register: Mode;
  sync: Mode;
  analysis: Mode;
  /** «Κατέβασε τα δεδομένα μου» (GET /me/export) and «Διαγραφή λογαριασμού» (DELETE /me). */
  account: Mode;
  /** Milliseconds to wait before answering /auth/login (slow network). */
  loginDelayMs: number;
  /** The user owns a crew for the boat (training share, AC 45). */
  crew: boolean;
  /** AI routes this test asked for; any other AI call fails the test. */
  allowAi: string[];
}

export const boatItem = (b = ASTARTI): SyncItem => ({ kind: 'boat', id: b.id, data: b, updatedAt: b.updatedAt });
export const courseItem = (c = COURSE): SyncItem => ({ kind: 'course', id: c.id, data: c, updatedAt: c.updatedAt });

export const defaultScenario = (): Scenario => ({
  user: { ...USER },
  boats: [],
  login: 'ok',
  register: 'ok',
  sync: 'ok',
  analysis: 'ok',
  account: 'ok',
  loginDelayMs: 0,
  crew: false,
  allowAi: [],
});

export interface FakeRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  auth?: string;
  body?: unknown;
}

export interface FakeResponse {
  status: number;
  json?: unknown;
  /** Do not answer at all (the app's timeout or abort decides). */
  hang?: boolean;
  /** Close the connection (network error). */
  abort?: boolean;
  delayMs?: number;
}

export interface CallLog {
  method: string;
  path: string;
  body?: unknown;
}

const CONFIG: ServerConfig = { termsVersion: 4, controller: { name: 'Υπεύθυνος δοκιμών', email: 'privacy@example.test' } };

const err = (status: number, error: string): FakeResponse => ({ status, json: { error } });
const mode = (m: Mode, ok: () => FakeResponse, texts: Partial<Record<Mode, string>> = {}): FakeResponse => {
  if (m === 'ok') return ok();
  if (m === 'abort') return { status: 0, abort: true };
  if (m === 'hang') return { status: 0, hang: true };
  const status = Number(m);
  return err(status, texts[m] ?? `Σφάλμα δοκιμής (${status}).`);
};

const crewOf = (s: Scenario): OwnedCrew[] =>
  s.crew
    ? [{ id: 'e2e-crew-1', boatId: ASTARTI.id, boatName: ASTARTI.name, sailNo: ASTARTI.sailNumber ?? null, members: [], races: [] }]
    : [];

/** The fake Worker. Keeps the scenario and logs every call (`calls('/analysis')`). */
export class FakeWorker {
  scenario: Scenario = defaultScenario();
  log: CallLog[] = [];
  /** AI calls that no test allowed (criterion 4). */
  forbidden: string[] = [];
  /** Routes the fake does not know: a sign the app talks to something new. */
  unknown: string[] = [];

  set(patch: Partial<Scenario>) {
    this.scenario = { ...this.scenario, ...patch };
  }

  reset(patch: Partial<Scenario> = {}) {
    this.scenario = { ...defaultScenario(), ...patch };
    this.log = [];
    this.forbidden = [];
    this.unknown = [];
  }

  calls(path: string, method?: string): CallLog[] {
    return this.log.filter((c) => (c.path === path || (path.endsWith('*') && c.path.startsWith(path.slice(0, -1)))) && (!method || c.method === method));
  }

  handle(req: FakeRequest): FakeResponse {
    const { method, path } = req;
    if (method === 'OPTIONS') return { status: 204 };
    this.log.push({ method, path, body: req.body });
    const s = this.scenario;
    const signed = req.auth === `Bearer ${TOKEN}`;
    const needAuth = (fn: () => FakeResponse) => (signed ? fn() : err(401, 'Χρειάζεται σύνδεση.'));
    const ai = AI_ROUTES.find((r) => path === r);
    if (ai && !s.allowAi.includes(ai)) {
      this.forbidden.push(`${method} ${path}`);
      return err(500, 'Το E2E δεν επιτρέπει αυτή την κλήση AI.');
    }

    switch (`${method} ${path}`) {
      case 'GET /config':
        return { status: 200, json: CONFIG };
      case 'GET /health':
        return { status: 200, json: { ok: true, configured: true, codeOk: false, user: signed ? { ai: s.user.ai } : undefined } };
      case 'POST /auth/login':
        return {
          ...mode(s.login, () => ({ status: 200, json: { token: TOKEN, user: s.user } }), {
            '401': 'Λάθος email ή κωδικός.',
            '429': 'Πολλές λάθος προσπάθειες. Δοκίμασε ξανά σε 15 λεπτά.',
          }),
          delayMs: s.loginDelayMs,
        };
      case 'POST /auth/register': {
        const b = (req.body ?? {}) as { email?: string; name?: string };
        return mode(s.register, () => ({ status: 200, json: { token: TOKEN, user: { ...s.user, email: b.email ?? s.user.email, name: b.name || s.user.name } } }), {
          '409': 'Υπάρχει ήδη λογαριασμός με αυτό το email.',
        });
      }
      case 'POST /auth/logout':
        return { status: 200, json: { ok: true } };
      case 'POST /auth/forgot':
        return { status: 200, json: { ok: true } };
      case 'GET /me':
        return needAuth(() => ({ status: 200, json: { user: s.user } }));
      case 'POST /me/terms':
        return needAuth(() => {
          this.scenario.user = { ...s.user, termsOk: true };
          return { status: 200, json: { user: this.scenario.user } };
        });
      case 'POST /me/password':
        return needAuth(() => {
          this.scenario.user = { ...s.user, mustChangePassword: false };
          return { status: 200, json: { user: this.scenario.user } };
        });
      case 'GET /me/export':
        return needAuth(() => mode(s.account, () => ({ status: 200, json: { user: s.user, boats: s.boats.filter((b) => b.kind === 'boat').map((b) => b.data) } })));
      case 'DELETE /me':
        return needAuth(() => mode(s.account, () => ({ status: 200, json: { ok: true } })));
      case 'POST /sync':
        return needAuth(() =>
          mode(s.sync, () => {
            const since = Number((req.body as { since?: number } | undefined)?.since ?? 0);
            return { status: 200, json: { now: 1_763_100_000_000, items: since === 0 ? s.boats : [] } };
          }),
        );
      case 'GET /notes/crew':
        return needAuth(() => ({ status: 200, json: { notes: [] } }));
      case 'GET /crews':
        return needAuth(() => ({ status: 200, json: { owned: crewOf(s), member: [] } }));
      case 'POST /analysis':
        return needAuth(() => mode(s.analysis, () => ({ status: 200, json: LESSONS }), { '500': 'Ο σύμβουλος δεν απάντησε. Δοκίμασε ξανά.' }));
      case 'POST /chat':
        return { status: 200, json: CHAT_REPLY };
      case 'POST /advice':
        return { status: 200, json: ADVICE_REPLY };
      case 'POST /windy':
        return err(501, 'Windy off in E2E.');
      case 'POST /certificate':
      case 'POST /entrylist':
        return err(400, 'Δεν διαβάστηκε το αρχείο (E2E).');
      case 'GET /orc/boat':
        return needAuth(() => ({ status: 200, json: { found: false, sailNo: req.query.get('sailNo') ?? '' } }));
      case 'GET /ais':
        return needAuth(() => ({ status: 200, json: { positions: [] } }));
    }
    if (method === 'PUT' && /^\/crews\/[^/]+\/races\/[^/]+$/.test(path)) return needAuth(() => ({ status: 200, json: { ok: true } }));
    if (path.startsWith('/invites/')) return err(404, 'Η πρόσκληση δεν βρέθηκε.');
    this.unknown.push(`${method} ${path}`);
    return err(404, 'Άγνωστη διαδρομή (E2E).');
  }
}
