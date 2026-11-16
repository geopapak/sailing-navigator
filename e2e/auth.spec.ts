/**
 * Flow 2: sign-up and sign-in, criteria 19–27, plus the slow-network and deep-link edge cases.
 * Every answer comes from the fake Worker with the texts of server/accounts.ts.
 */
import { test, expect, type AppFixture } from './fixtures/app';
import { NEW_EMAIL, TEST_EMAIL, TEST_PASSWORD, USER } from './fixtures/data/user';

const signInBtn = (app: AppFixture) => app.page.getByRole('button', { name: 'Σύνδεση', exact: true });
const signedInHome = (app: AppFixture) => app.page.getByTestId('screen-title');

async function openSignup(app: AppFixture) {
  await app.open();
  await app.page.getByRole('button', { name: 'Νέος λογαριασμός' }).click();
  await expect(app.page.getByRole('heading', { name: 'Νέος λογαριασμός' })).toBeVisible();
  await app.page.getByLabel('Όνομα').fill('Νέο Μέλος');
  await app.page.getByRole('textbox', { name: 'Email' }).fill(NEW_EMAIL);
  await app.page.getByLabel('Κωδικός').fill(TEST_PASSWORD);
}
const consent = (app: AppFixture, name: RegExp) => app.page.getByRole('checkbox', { name });

test('19: σε καθαρό browser φαίνεται η σύνδεση', async ({ app }) => {
  await app.open();
  await expect(app.page.getByLabel('Email')).toBeVisible();
  await expect(app.page.getByLabel('Κωδικός')).toBeVisible();
  await expect(signInBtn(app)).toBeVisible();
  await expect(app.page.getByRole('button', { name: 'Νέος λογαριασμός' })).toBeVisible();
});

test('20: εγγραφή χωρίς όρους και απόρρητο: μήνυμα και καμία κλήση', async ({ app }) => {
  await openSignup(app);
  // The button is aria-disabled but still tappable (it explains what is missing): force the tap.
  await app.page.getByRole('button', { name: 'Δημιουργία λογαριασμού' }).click({ force: true });
  await expect(app.page.getByText('Τσέκαρε τους όρους και την πολιτική απορρήτου για να συνεχίσεις.')).toBeVisible();
  expect(app.server.calls('/auth/register')).toHaveLength(0);
});

test('21: εγγραφή με τα δύο υποχρεωτικά', async ({ app }) => {
  await openSignup(app);
  await consent(app, /Αποδέχομαι τους/).check();
  await consent(app, /Διάβασα την/).check();
  await app.page.getByRole('button', { name: 'Δημιουργία λογαριασμού' }).click();
  await expect(app.page.getByRole('heading', { name: /Καλώς ήρθες/ }).first()).toBeVisible();
  const [call] = app.server.calls('/auth/register');
  expect(call.body).toMatchObject({ email: NEW_EMAIL, acceptTerms: true, acceptPrivacy: true, marketing: false });
});

test.describe('email που υπάρχει ήδη', () => {
  test.use({ scenario: { register: '409' } });
  test('22: 409 → μήνυμα, η φόρμα μένει συμπληρωμένη εκτός από τον κωδικό', async ({ app }) => {
    await openSignup(app);
    await consent(app, /Αποδέχομαι τους/).check();
    await consent(app, /Διάβασα την/).check();
    await app.page.getByRole('button', { name: 'Δημιουργία λογαριασμού' }).click();
    await expect(app.page.getByText('Υπάρχει ήδη λογαριασμός με αυτό το email.')).toBeVisible();
    await expect(app.page.getByRole('textbox', { name: 'Email' })).toHaveValue(NEW_EMAIL);
    await expect(app.page.getByLabel('Όνομα')).toHaveValue('Νέο Μέλος');
    await expect(app.page.getByLabel('Κωδικός')).toHaveValue('');
  });
});

for (const [mode, text] of [
  ['401', 'Λάθος email ή κωδικός.'],
  ['429', 'Πολλές λάθος προσπάθειες. Δοκίμασε ξανά σε 15 λεπτά.'],
] as const) {
  test.describe(`σύνδεση ${mode}`, () => {
    test.use({ scenario: { login: mode } });
    test(`23: ${mode} → «${text}»`, async ({ app }) => {
      await app.open();
      await app.signIn();
      await expect(app.page.getByText(text)).toBeVisible();
      await expect(signInBtn(app)).toBeEnabled();
    });
  });
}

test.describe('ο server δεν απαντά', () => {
  test.use({ scenario: { login: 'abort' } });
  test('24: σφάλμα δικτύου, και μετά η σύνδεση πετυχαίνει', async ({ app }) => {
    await app.open();
    await app.signIn();
    await expect(app.page.getByText('Δεν απαντά η υπηρεσία της εφαρμογής. Έλεγξε τη σύνδεση.')).toBeVisible();
    app.server.set({ login: 'ok' });
    await app.page.getByLabel('Κωδικός').fill(TEST_PASSWORD);
    await signInBtn(app).click();
    await expect(signedInHome(app)).toBeVisible();
  });
});

test.describe('ο server κρατά το αίτημα', () => {
  test.use({ scenario: { login: 'hang' } });
  test('24: πέρα από το όριο των 20″ → «Η υπηρεσία δεν απάντησε εγκαίρως.»', async ({ app }) => {
    await app.open();
    await app.signIn();
    await expect(app.page.getByRole('button', { name: 'Σύνδεση…' })).toBeDisabled();
    await app.advance(21_000, 3000);
    await expect(app.page.getByText('Η υπηρεσία δεν απάντησε εγκαίρως. Δοκίμασε ξανά.')).toBeVisible();
  });
});

test.describe('αργό δίκτυο', () => {
  test.use({ scenario: { loginDelayMs: 4000 } });
  test('αργή απάντηση: «Σύνδεση…», το κουμπί δεν πατιέται δεύτερη φορά', async ({ app }) => {
    await app.open();
    await app.signIn();
    const busy = app.page.getByRole('button', { name: 'Σύνδεση…' });
    await expect(busy).toBeDisabled();
    await busy.click({ force: true }).catch(() => undefined);
    await expect(signedInHome(app)).toBeVisible({ timeout: 10_000 });
    expect(app.server.calls('/auth/login')).toHaveLength(1);
  });
});

test('25, 27: μένει συνδεδεμένος μετά από ανανέωση· η αποσύνδεση γυρνά στη σύνδεση', async ({ app }) => {
  await app.open();
  await app.signIn();
  await app.page.getByRole('button', { name: 'Παράλειψη όλων' }).click();
  const meBefore = app.server.calls('/me').length;
  await app.page.reload();
  await expect(signedInHome(app)).toHaveText('Νέα έξοδος');
  await expect.poll(() => app.server.calls('/me').length).toBeGreaterThan(meBefore);
  await expect(app.page.getByLabel('Κωδικός')).toHaveCount(0);

  await app.tab('Ρυθμίσεις');
  await app.page.getByRole('button', { name: /^Αποσύνδεση/ }).first().click();
  await expect(signInBtn(app)).toBeVisible();
  expect(app.server.calls('/auth/logout')).toHaveLength(1);
});

test.describe('προσωρινός κωδικός', () => {
  test.use({ scenario: { user: { ...USER, mustChangePassword: true } } });
  test('26: πρώτα η οθόνη νέου κωδικού', async ({ app }) => {
    await app.open();
    await app.signIn();
    await expect(app.page.getByRole('heading', { name: 'Βάλε δικό σου κωδικό' })).toBeVisible();
    await expect(app.page.getByRole('navigation')).toHaveCount(0);
  });
});

test.describe('όροι που δεν έχουν γίνει αποδεκτοί', () => {
  test.use({ scenario: { user: { ...USER, termsOk: false } } });
  test('26: termsOk false → αποδοχή όρων', async ({ app }) => {
    await app.open();
    await app.signIn();
    await expect(app.page.getByRole('heading', { name: 'Νέοι όροι χρήσης' })).toBeVisible();
    await app.page.getByRole('checkbox', { name: /Αποδέχομαι τους/ }).check();
    await app.page.getByRole('checkbox', { name: /Συναινώ στην/ }).check();
    await app.page.getByRole('button', { name: 'Συνέχεια' }).click();
    await expect(app.page.getByRole('heading', { name: /Καλώς ήρθες/ }).first()).toBeVisible();
    expect(app.server.calls('/me/terms')).toHaveLength(1);
  });
});

test('σύνδεσμος πρόσκλησης χωρίς σύνδεση: πρώτα η σύνδεση, μετά η πρόσκληση', async ({ app }) => {
  await app.open('/?invite=e2e-invite-000000000001');
  await expect(signInBtn(app)).toBeVisible();
  expect(app.server.calls('/invites/*')).toHaveLength(0);
  await app.signIn(TEST_EMAIL);
  await expect.poll(() => app.server.calls('/invites/*').length).toBeGreaterThanOrEqual(1);
  expect(app.server.calls('/invites/*')[0].path).toBe('/invites/e2e-invite-000000000001');
});
