import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { CHECK_EVERY_MS, markUpdateReady, shouldCheck } from './pwa/update';
import { App } from './ui/App';
import './ui/styles.css';
import { takeInviteFromUrl } from './crew/api';

// P-043: never reload by itself; the app applies a waiting version when no session runs.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh: () => markUpdateReady(() => void updateSW(true)),
  onRegisteredSW: (_url, reg) => {
    if (!reg) return;
    let last = Date.now();
    const check = (force = false) => {
      const online = navigator.onLine !== false;
      if (reg.installing || (!force && !shouldCheck(last, Date.now(), online)) || !online) return;
      last = Date.now();
      reg.update().catch(() => undefined);
    };
    window.setInterval(() => check(true), CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    window.addEventListener('focus', () => check());
  },
});
// A crew invitation link (P-022): keep the token until the user has signed in.
takeInviteFromUrl();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
