/**
 * Edge cases of the spec table (P-045): location permission «denied», training without
 * instruments (phone GPS only), and the empty history.
 */
import { test, expect, type AppFixture } from './fixtures/app';
import { boatItem } from './fixtures/handlers';
import { runningTrackLength, storedSessions } from './fixtures/session';
import { expectActiveBoat } from './fixtures/boat';

const MIN = 60_000;
const home = (app: AppFixture) => app.page.getByRole('heading', { name: 'Τι κάνουμε σήμερα;' });

/**
 * The browser answers «denied» for the location, the same way in Chromium and WebKit:
 * the permission query says 'denied' and every GPS call fails with PERMISSION_DENIED.
 */
const DENY_GEO = `(() => {
  const g = navigator.geolocation;
  if (!g) return;
  const denied = () => ({ code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
  g.watchPosition = (_ok, fail) => { setTimeout(() => fail && fail(denied()), 0); return 1; };
  g.getCurrentPosition = (_ok, fail) => { setTimeout(() => fail && fail(denied()), 0); };
  g.clearWatch = () => {};
  const p = navigator.permissions;
  if (p && typeof p.query === 'function') {
    const q = p.query.bind(p);
    p.query = (d) => d && d.name === 'geolocation'
      ? Promise.resolve({ state: 'denied', onchange: null, addEventListener() {}, removeEventListener() {} })
      : q(d);
  }
})();`;

const HOW_TO_ALLOW = /Δεν δόθηκε άδεια θέσης\. Στο κινητό: Ρυθμίσεις → Τοποθεσία/;

test.describe('άδεια θέσης «denied»', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(DENY_GEO);
  });

  test('χωρίς σκάφος: η «Γρήγορη ματιά» λέει να ανοίξει την τοποθεσία, χωρίς σφάλμα σελίδας', async ({ app }) => {
    await app.open();
    await app.signIn();
    await app.page.getByRole('button', { name: 'Παράλειψη όλων' }).click();
    await app.page.getByRole('button', { name: /Γρήγορη ματιά/ }).click();
    await expect(app.page.getByText('Ούτε GPS ούτε όργανα. Άνοιξε την τοποθεσία του κινητού ή σύνδεσε όργανα από τις Ρυθμίσεις.')).toBeVisible();
    await app.advance(5000, 1000);
    await expect(app.page.getByText('Ούτε GPS ούτε όργανα.', { exact: false })).toBeVisible();
  });

  test.describe('με σκάφος', () => {
    test.use({ scenario: { boats: [boatItem()] } });

    test('το Live δείχνει πώς δίνεται η άδεια', async ({ app }) => {
      await app.open();
      await app.signIn();
      await expectActiveBoat(app.page, 'e2e-astarti');
      await app.page.getByRole('button', { name: /Γρήγορη ματιά/ }).click();
      await expect(app.page.getByText(HOW_TO_ALLOW)).toBeVisible();
    });

    test('προπόνηση χωρίς θέση: η λωρίδα λέει ότι περιμένει GPS και δεν γράφεται ίχνος', async ({ app }) => {
      await app.open();
      await app.signIn();
      await expectActiveBoat(app.page, 'e2e-astarti');
      await app.startTraining();
      await app.advance(MIN);
      await expect(app.page.getByTestId('session-strip')).toContainText('Η καταγραφή περιμένει θέση GPS (ή όργανα).');
      await expect(app.page.getByTestId('session-pause')).toBeVisible();
      expect(await runningTrackLength(app.page)).toBe(0);
    });

    test('προπόνηση χωρίς θέση: το Live της εξόδου λέει πώς δίνεται η άδεια', async ({ app }) => {
      // FINDING (QA P-045, 2026-11-16): inside a session the Live only says «Η καταγραφή περιμένει
      // θέση GPS (ή όργανα).» and «Χωρίς όργανα: ταχύτητα από GPS…»; the «Δεν δόθηκε άδεια θέσης…»
      // help is only on «Γρήγορη ματιά». Remove this line when the session Live shows it.
      test.fail(true, 'Γνωστό κενό: το Live της εξόδου δεν λέει πώς δίνεται η άδεια θέσης');
      await app.open();
      await app.signIn();
      await expectActiveBoat(app.page, 'e2e-astarti');
      await app.startTraining();
      await app.advance(MIN);
      await expect(app.page.getByText(HOW_TO_ALLOW)).toBeVisible({ timeout: 3000 });
    });
  });
});

test.describe('χωρίς όργανα', () => {
  test.use({ scenario: { boats: [boatItem()] } });

  test('προπόνηση μόνο με το GPS του κινητού: ξεκινά, λέει «Χωρίς άνεμο» και γράφει ίχνος', async ({ app, context }) => {
    await context.grantPermissions(['geolocation']);
    await app.open();
    await app.signIn();
    await expectActiveBoat(app.page, 'e2e-astarti');
    await app.startTraining();
    // P-053 AC 47: no instruments and no wind typed → «Χωρίς άνεμο» and «Βάλε άνεμο», never the 10 kt / 42° defaults.
    await expect(app.page.getByText('Χωρίς άνεμο:')).toBeVisible();
    await expect(app.page.getByTestId('wind-prompt')).toBeVisible();
    await expect(app.page.getByTestId('inst-pill')).toHaveCount(0);
    // The boat moves north a little every 15″.
    for (let i = 1; i <= 8; i++) {
      await context.setGeolocation({ latitude: 37.9 + i * 0.0005, longitude: 23.66 });
      await app.advance(15_000);
    }
    await expect(app.page.getByTestId('session-strip')).toContainText(/Καταγραφή κάθε 15″/);
    await expect.poll(() => runningTrackLength(app.page)).toBeGreaterThanOrEqual(3);
    const s = (await storedSessions(app.page)).find((x) => x.status === 'running');
    const lats = (s?.track ?? []).map((p) => p.lat);
    expect(Math.max(...lats)).toBeGreaterThan(37.901);
  });
});

test.describe('κενό ιστορικό', () => {
  test('Αρχική και Ιστορικό χωρίς εξόδους: το κείμενο κενής λίστας και «Νέα έξοδος»', async ({ app }) => {
    await app.open();
    await app.signIn();
    await app.page.getByRole('button', { name: 'Παράλειψη όλων' }).click();
    await expect(app.page.getByText('Διάλεξε πάνω Αγώνα, Προπόνηση ή Αναψυχή. Η πρώτη σου έξοδος θα φανεί εδώ.')).toBeVisible();

    await app.tab('Ιστορικό');
    await expect(app.page.getByTestId('screen-title')).toHaveText('Οι έξοδοί μου');
    await expect(app.page.getByText('Δεν έχεις εξόδους ακόμα')).toBeVisible();
    await expect(app.page.getByText('Κάθε αγώνας, προπόνηση ή έξοδος αναψυχής που τελειώνεις μπαίνει εδώ, με ίχνος και σύνοψη.')).toBeVisible();
    await expect(app.page.getByTestId('history-item')).toHaveCount(0);
    await app.page.getByRole('button', { name: 'Νέα έξοδος', exact: true }).click();
    await expect(home(app)).toBeVisible();
  });
});
