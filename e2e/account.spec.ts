/**
 * Account data (GDPR as a feature, spec «Ιδιωτικότητα»): «Κατέβασε τα δεδομένα μου»
 * and «Διαγραφή λογαριασμού», against the fake Worker. The real server is P-045b.
 */
import { test, expect, type AppFixture } from './fixtures/app';
import { boatItem } from './fixtures/handlers';
import { download } from './fixtures/session';
import { TEST_EMAIL } from './fixtures/data/user';
import { expectActiveBoat } from './fixtures/boat';

test.use({ scenario: { boats: [boatItem()] } });

async function toAccount(app: AppFixture) {
  await app.open();
  await app.signIn();
  await expectActiveBoat(app.page, 'e2e-astarti');
  await app.tab('Ρυθμίσεις');
}

const boatsOnDevice = (app: AppFixture) =>
  app.page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('sailing-navigator');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const n = await new Promise<number>((res) => {
      const c = db.transaction('boats').objectStore('boats').count();
      c.onsuccess = () => res(c.result);
    });
    db.close();
    return n;
  });

test('«Κατέβασε τα δεδομένα μου»: ένα αρχείο JSON με τον λογαριασμό, μία κλήση', async ({ app }) => {
  await toAccount(app);
  const file = await download(app.page, () => app.page.getByRole('button', { name: /Κατέβασε τα δεδομένα μου/ }).click());
  expect(file.name).toMatch(/^sailing-navigator-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(file.text) as { user: { email: string }; boats: { name: string }[] };
  expect(data.user.email).toBe(TEST_EMAIL);
  expect(data.boats.map((b) => b.name)).toEqual(['Αστάρτη']);
  expect(app.server.calls('/me/export', 'GET')).toHaveLength(1);
});

test.describe('ο server δεν απαντά', () => {
  test.use({ scenario: { boats: [boatItem()], account: '500' } });

  test('εξαγωγή με 500: ελληνικό μήνυμα, κανένα αρχείο', async ({ app }) => {
    await toAccount(app);
    let downloaded = false;
    app.page.on('download', () => (downloaded = true));
    await app.page.getByRole('button', { name: /Κατέβασε τα δεδομένα μου/ }).click();
    await expect(app.page.getByText('Σφάλμα δοκιμής (500).')).toBeVisible();
    expect(downloaded).toBe(false);
  });

  test('διαγραφή με 500: μήνυμα και ο χρήστης μένει συνδεδεμένος', async ({ app }) => {
    await toAccount(app);
    await app.page.locator('summary', { hasText: 'Διαγραφή λογαριασμού' }).click();
    await app.page.getByRole('button', { name: 'Διαγραφή λογαριασμού', exact: true }).click();
    await app.page.getByRole('alertdialog').getByRole('button', { name: 'Διαγραφή λογαριασμού' }).click();
    const alert = app.page.getByRole('alertdialog');
    await expect(alert).toContainText('Σφάλμα δοκιμής (500).');
    await alert.getByRole('button', { name: 'Εντάξει' }).click();
    expect(app.server.calls('/me', 'DELETE')).toHaveLength(1);
    await expect(app.page.getByRole('textbox', { name: 'Email' })).toHaveCount(0);
    await expect(app.page.getByRole('button', { name: /Κατέβασε τα δεδομένα μου/ })).toBeVisible();
  });
});

test('«Διαγραφή λογαριασμού»: «Άκυρο» δεν σβήνει τίποτα· με επιβεβαίωση μία κλήση και αποσύνδεση, τα δεδομένα της συσκευής μένουν', async ({ app }) => {
  await toAccount(app);
  await app.page.locator('summary', { hasText: 'Διαγραφή λογαριασμού' }).click();
  await expect(app.page.getByText(/Τα δεδομένα σε αυτή τη συσκευή μένουν/)).toBeVisible();

  await app.page.getByRole('button', { name: 'Διαγραφή λογαριασμού', exact: true }).click();
  const confirm = app.page.getByRole('alertdialog');
  await expect(confirm).toContainText('Οριστική διαγραφή του λογαριασμού και των δεδομένων του στην υπηρεσία; Δεν αναιρείται.');
  // P-049: a destructive question starts on «Άκυρο», never on the «yes» button.
  await expect(confirm.getByRole('button', { name: 'Άκυρο' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Άκυρο' }).click();
  await expect(confirm).toHaveCount(0);
  expect(app.server.calls('/me', 'DELETE')).toHaveLength(0);

  await app.page.getByRole('button', { name: 'Διαγραφή λογαριασμού', exact: true }).click();
  await app.page.getByRole('alertdialog').getByRole('button', { name: 'Διαγραφή λογαριασμού' }).click();
  await expect(app.page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  expect(app.server.calls('/me', 'DELETE')).toHaveLength(1);
  expect(await boatsOnDevice(app)).toBe(1);
  // Signed out: the app no longer sends the old token anywhere.
  const before = app.server.log.length;
  await app.advance(10_000, 1000);
  expect(app.server.log.slice(before).filter((c) => c.path === '/sync' || c.path === '/me')).toEqual([]);
});
