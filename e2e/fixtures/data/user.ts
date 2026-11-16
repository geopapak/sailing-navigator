import type { PublicUser } from '../../../src/sync/api';

/** The made-up test user. Only fake data: the traces of the public CI are readable by anyone. */
export const TEST_EMAIL = 'crew@example.test';
export const NEW_EMAIL = 'new-crew@example.test';
/** A made-up password, used only against the fixtures (never a real server). */
export const TEST_PASSWORD = 'e2e-only-Pa55word';

export const USER: PublicUser = {
  id: 'e2e-user-1',
  email: TEST_EMAIL,
  name: 'Δοκιμαστής',
  isAdmin: false,
  ai: { allowed: true, used: 0, limit: 50 },
  termsOk: true,
  termsAt: 1_763_000_000_000,
  mustChangePassword: false,
  pdf: { used: 0, left: 5 },
};

export const TOKEN = 'e2e-token-0001';
