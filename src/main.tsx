import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { CHECK_EVERY_MS, clearStalePending, fetchCritical, markUpdateReady, setCritical, shouldCheck } from './pwa/update';
import { App } from './ui/App';
import './ui/styles.css';
import { takeInviteFromUrl } from './crew/api';

// P-043/P-044b: never reload by itself. A waiting version applies at 02:00 local
// time (or at once if critical), and only when no session or unsaved input holds it.
// Also fires on startup for a worker that was already waiting, so the state is restored.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh: () => {
    markUpdateReady(() => void updateSW(true), __APP_VERSION__);
    // Same origin as the app, past every cache; a failure means non-critical.
    void fetchCritical((u, o) => fetch(u, o), `${import.meta.env.BASE_URL}version.json`, __APP_VERSION__).then(setCritical);
  },
  onRegisteredSW: (_url, reg) => {
    if (!reg) return;
    if (!reg.waiting && !reg.installing) clearStalePending();
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
