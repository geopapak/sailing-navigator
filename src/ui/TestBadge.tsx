/** True only in the staging (test) build, see .env.staging. Constant-folded away in production. */
export const IS_STAGING = import.meta.env.VITE_APP_ENV === 'staging';

/** Permanent "TEST" mark in the header so the test app is never mistaken for production (P-044). */
export function TestBadge() {
  if (!IS_STAGING) return null;
  return (
    <span className="test-badge" role="note" aria-label="Δοκιμαστική εφαρμογή (TEST)">
      TEST
    </span>
  );
}
