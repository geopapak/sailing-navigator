import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import './ui/styles.css';
import { takeInviteFromUrl } from './crew/api';

registerSW({ immediate: true });
// A crew invitation link (P-022): keep the token until the user has signed in.
takeInviteFromUrl();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
