/**
 * Lets any view switch the app's tab (e.g. a "go to Settings" link).
 * Outside a session: Αρχική · Ιστορικό · Σκάφη · Ρυθμίσεις (plus «Γρήγορη ματιά»).
 * Inside a session: Live · Χάρτης · Σύμβουλος (P-033).
 */
export type AppTab = 'home' | 'history' | 'boats' | 'settings' | 'quick' | 'session:live' | 'session:map' | 'session:chat';

/** Tabs from before 0.12 (six tabs), still possibly stored or sent by old links. */
export type LegacyTab = 'live' | 'map' | 'chat' | 'polar' | 'scoring' | 'guide';

const TABS: AppTab[] = ['home', 'history', 'boats', 'settings', 'quick', 'session:live', 'session:map', 'session:chat'];

const LEGACY: Record<LegacyTab, AppTab> = {
  live: 'home',
  map: 'home',
  chat: 'home',
  scoring: 'history',
  polar: 'boats',
  guide: 'settings',
};

export const isSessionTab = (t: AppTab) => t.startsWith('session:');

/**
 * Any stored or requested tab as one of today's. Inside a session the outside
 * tabs other than Ρυθμίσεις / Σκάφη (opened from a link, with a way back) lead to Live.
 */
export function normalizeTab(t: unknown, inSession = false): AppTab {
  let tab: AppTab = typeof t === 'string' && (TABS as string[]).includes(t) ? (t as AppTab) : (LEGACY[t as LegacyTab] ?? 'home');
  if (inSession) {
    if (t === 'map') tab = 'session:map';
    else if (t === 'chat') tab = 'session:chat';
    else if (!isSessionTab(tab) && tab !== 'settings' && tab !== 'boats') tab = 'session:live';
  } else if (isSessionTab(tab)) tab = 'home';
  return tab;
}

const EVENT = 'nav-open-tab';

export function openTab(tab: AppTab | LegacyTab) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: tab }));
  window.scrollTo({ top: 0 });
}

export function onOpenTab(fn: (tab: string) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<string>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
