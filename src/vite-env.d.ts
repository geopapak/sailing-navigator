/// <reference types="vite/client" />
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Server (Cloudflare Worker) the app talks to; defaults to production. Set in .env.local for local development. */
  readonly VITE_SERVER_URL?: string;
  /** "staging" in the test build (.env.staging): shows the TEST badge. Unset in production. */
  readonly VITE_APP_ENV?: string;
}
