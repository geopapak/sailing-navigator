/** Lets any view switch the app's tab (e.g. a "go to Settings" link). */
export type AppTab = 'live' | 'map' | 'chat' | 'polar' | 'scoring' | 'boats' | 'settings' | 'guide';

const EVENT = 'nav-open-tab';

export function openTab(tab: AppTab) {
  window.dispatchEvent(new CustomEvent<AppTab>(EVENT, { detail: tab }));
  window.scrollTo({ top: 0 });
}

export function onOpenTab(fn: (tab: AppTab) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<AppTab>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
