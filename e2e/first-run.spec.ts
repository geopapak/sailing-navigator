/**
 * Flow 1: first run (P-046, P-048), criteria 10–18.
 * The carousel shows once per device and never to someone with a boat; the phone's
 * GPS is asked only after a user action, unless the permission is already given.
 */
import { test, expect, type AppFixture } from './fixtures/app';
import { boatItem } from './fixtures/handlers';

const carousel = (app: AppFixture) => app.page.getByTestId('onboarding');
const home = (app: AppFixture) => app.page.getByRole('heading', { name: 'Τι κάνουμε σήμερα;' });

/** Opens a same-origin page without the app, so its storage can be changed with nothing open. */
async function withAppClosed(app: AppFixture, fn: () => Promise<void>) {
  await app.page.goto('/version.json');
  await app.page.evaluate(fn);
  await app.page.goto('/');
}

/** Marks in sessionStorage if the carousel is ever in the page, even for one frame. */
const WATCH_CAROUSEL = `(() => {
  const mark = () => { if (document.querySelector('[data-testid="onboarding"]')) try { sessionStorage.setItem('__sawCarousel', '1'); } catch {} };
  new MutationObserver(mark).observe(document, { childList: true, subtree: true });
})();`;

test.describe('πρώτη χρήση: καρουζέλ', () => {
  test('10–11: φαίνεται μία φορά και δεν ξαναβγαίνει μετά από «Παράλειψη όλων»', async ({ app, context }) => {
    await app.open();
    await app.signIn();
    await expect(carousel(app).getByRole('heading', { name: 'Καλώς ήρθες, Δοκιμαστής' })).toBeVisible();
    await expect(carousel(app).getByRole('img', { name: 'Βήμα 1 από 5' })).toBeVisible();

    await app.page.getByRole('button', { name: 'Παράλειψη όλων' }).click();
    await expect(home(app)).toBeVisible();
    await expect(app.page.getByTestId('screen-title')).toHaveText('Νέα έξοδος');

    await app.page.reload();
    await expect(home(app)).toBeVisible();
    await expect(carousel(app)).toHaveCount(0);

    // Close the tab and open the app again (same storage).
    const again = await context.newPage();
    await app.page.close();
    await again.goto('/');
    await expect(again.getByRole('heading', { name: 'Τι κάνουμε σήμερα;' })).toBeVisible();
    await expect(again.getByTestId('onboarding')).toHaveCount(0);

    await again.getByRole('navigation').getByRole('button', { name: 'Ιστορικό', exact: true }).click();
    await again.getByRole('navigation').getByRole('button', { name: 'Αρχική', exact: true }).click();
    await expect(again.getByRole('heading', { name: 'Τι κάνουμε σήμερα;' })).toBeVisible();
    await expect(again.getByTestId('onboarding')).toHaveCount(0);
  });

  test('12–13: μετά από όλα τα βήματα δεν ξαναβγαίνει, ούτε αν σβηστεί η μία από τις δύο αποθηκεύσεις', async ({ app }) => {
    await app.open();
    await app.signIn();
    await expect(carousel(app)).toBeVisible();
    for (const [label, step] of [
      ['Ξεκινάμε', 2],
      ['Επόμενο', 3],
      ['Το έκανα', 4],
      ['Επόμενο', 5],
    ] as const) {
      await carousel(app).getByRole('button', { name: label, exact: true }).click();
      await expect(carousel(app).getByRole('img', { name: `Βήμα ${step} από 5` })).toBeVisible();
    }
    await carousel(app).getByRole('button', { name: 'Αργότερα', exact: true }).click();
    await expect(home(app)).toBeVisible();
    await app.page.reload();
    await expect(home(app)).toBeVisible();
    await expect(carousel(app)).toHaveCount(0);

    // Only localStorage cleared: the `onboarded` flag in IndexedDB still holds.
    await withAppClosed(app, async () => localStorage.clear());
    await expect(home(app)).toBeVisible();
    await expect(carousel(app)).toHaveCount(0);

    // Only IndexedDB cleared (also signs out): the localStorage copy still holds after signing in.
    await withAppClosed(app, async () => {
      localStorage.setItem('onboarded', '1');
      await new Promise((ok, fail) => {
        const r = indexedDB.deleteDatabase('sailing-navigator');
        r.onsuccess = ok;
        r.onerror = fail;
        r.onblocked = () => fail(new Error('blocked'));
      });
    });
    await app.signIn();
    await expect(home(app)).toBeVisible();
    await expect(carousel(app)).toHaveCount(0);
  });

  test.describe('με σκάφος στον λογαριασμό', () => {
    test.use({ scenario: { boats: [boatItem()] } });
    test('14: το καρουζέλ δεν φαίνεται ούτε στιγμιαία', async ({ app, context }) => {
      await context.addInitScript(WATCH_CAROUSEL);
      await app.open();
      await app.signIn();
      await expect(app.page.getByRole('combobox', { name: 'Ενεργό σκάφος' })).toHaveValue('e2e-astarti');
      await expect(home(app)).toBeVisible();
      await app.page.reload();
      await expect(home(app)).toBeVisible();
      expect(await app.page.evaluate(() => sessionStorage.getItem('__sawCarousel'))).toBeNull();
    });
  });

  test('15: «Δείξε ξανά τα πρώτα βήματα» τα δείχνει μία φορά', async ({ app }) => {
    await app.open();
    await app.signIn();
    await app.page.getByRole('button', { name: 'Παράλειψη όλων' }).click();
    await app.tab('Ρυθμίσεις');
    await app.page.getByRole('button', { name: 'Δείξε ξανά τα πρώτα βήματα' }).click();
    await expect(carousel(app).getByRole('img', { name: 'Βήμα 1 από 5' })).toBeVisible();
    await app.page.getByRole('button', { name: 'Παράλειψη όλων' }).click();
    await expect(home(app)).toBeVisible();
    await app.page.reload();
    await expect(home(app)).toBeVisible();
    await expect(carousel(app)).toHaveCount(0);
  });

  test.describe('συγχρονισμός που αποτυγχάνει', () => {
    test.use({ scenario: { boats: [boatItem()], sync: '500' } });
    // P-047: today a device without boats shows the carousel when /sync fails, even if the
    // account has boats (accepted 2026-11-14). This test records that and changes with P-047.
    test('/sync 500 σε συσκευή χωρίς σκάφη: φαίνεται το καρουζέλ (σημερινή συμπεριφορά)', async ({ app }) => {
      await app.open();
      await app.signIn();
      await expect(carousel(app)).toBeVisible();
    });
  });

  test.describe('συγχρονισμός που αποτυγχάνει σε συσκευή με σκάφη', () => {
    test.use({ scenario: { boats: [boatItem()] } });
    test('/sync 500 σε συσκευή με σκάφη: το καρουζέλ δεν φαίνεται ούτε στιγμιαία', async ({ app, context }) => {
      await context.addInitScript(WATCH_CAROUSEL);
      await app.open();
      await app.signIn();
      await expect(app.page.getByRole('combobox', { name: 'Ενεργό σκάφος' })).toHaveValue('e2e-astarti');
      // The boat stays on the device; forget that the steps were done, so only the boat keeps them away.
      app.server.set({ sync: '500' });
      await app.page.evaluate(() => localStorage.removeItem('onboarded'));
      await app.setSettings({ onboarded: false });
      await expect(home(app)).toBeVisible();
      await expect(app.page.getByRole('combobox', { name: 'Ενεργό σκάφος' })).toHaveValue('e2e-astarti');
      await expect.poll(() => app.server.calls('/sync').length).toBeGreaterThanOrEqual(2);
      await app.advance(5000, 1000);
      await expect(carousel(app)).toHaveCount(0);
      expect(await app.page.evaluate(() => sessionStorage.getItem('__sawCarousel'))).toBeNull();
    });
  });
});

test.describe('πρώτη χρήση: θέση GPS', () => {
  test('16–17: χωρίς άδεια, καμία κλήση GPS σε 3 ανανεώσεις· μία μόνο μετά από «Γρήγορη ματιά»', async ({ app }) => {
    await app.open();
    await app.signIn();
    await app.page.getByRole('button', { name: 'Παράλειψη όλων' }).click();
    for (let i = 0; i < 3; i++) {
      await app.page.reload();
      await expect(home(app)).toBeVisible();
      // The permission query has up to 2″ to answer; let it.
      await app.advance(3000, 1000);
    }
    expect(await app.geoCalls()).toBe(0);

    await app.page.getByRole('button', { name: /Γρήγορη ματιά/ }).click();
    await expect(app.page.getByText('Γρήγορη ματιά: δεν καταγράφεται ίχνος, χωρίς ειδοποιήσεις.')).toBeVisible();
    await expect.poll(() => app.geoCalls()).toBe(1);
    await app.advance(5000, 1000);
    expect(await app.geoCalls()).toBe(1);
  });

  test('18: με δοσμένη άδεια το GPS ξεκινά μόνο του και η «Γρήγορη ματιά» έχει θέση', async ({ app, context }) => {
    await context.grantPermissions(['geolocation']);
    await app.open();
    await app.signIn();
    await app.page.getByRole('button', { name: 'Παράλειψη όλων' }).click();
    await app.page.reload();
    await expect(home(app)).toBeVisible();
    await expect.poll(() => app.geoCalls()).toBeGreaterThanOrEqual(1);
    await app.page.getByRole('button', { name: /Γρήγορη ματιά/ }).click();
    await expect(app.page.getByText('SOG από GPS')).toBeVisible();
    await expect(app.page.getByText(/Ούτε GPS ούτε όργανα/)).toHaveCount(0);
  });
});
