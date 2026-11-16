/**
 * Flow 3: race from setup to History, criteria 28–37.
 * «Αστάρτη» and a 3-mark course from /sync, instruments on the simulator, fake clock.
 */
import { test, expect, type AppFixture } from './fixtures/app';
import { boatItem, courseItem } from './fixtures/handlers';
import { COURSE } from './fixtures/data/course-saronic';
import { download, gpxTimes } from './fixtures/session';

const MIN = 60_000;
const RACE = 'Δοκιμαστικός Σαρωνικού';

test.use({ scenario: { boats: [boatItem(), courseItem()] } });

async function ready(app: AppFixture) {
  await app.open();
  await app.signIn();
  await expect(app.page.getByRole('combobox', { name: 'Ενεργό σκάφος' })).toHaveValue('e2e-astarti');
  await app.useSimulator();
  // 31 (outside a session the header pill says the instruments are live)
  await expect(app.page.getByRole('button', { name: 'Όργανα: συνδεδεμένα' })).toHaveText('Όργανα');
}

async function setupRace(app: AppFixture) {
  const { page } = app;
  await page.getByRole('button', { name: /^Αγώνας:/ }).click();
  // 28
  await expect(page.getByTestId('screen-title')).toHaveText('Νέος αγώνας');
  await expect(page.getByRole('button', { name: 'Πίσω' })).toHaveText('←');
  await expect(page.getByRole('navigation')).toHaveCount(0);
  // 29
  const problems = page.locator('.race-setup');
  const start = page.getByRole('button', { name: 'Αποθήκευση και έναρξη' });
  await expect(problems).toContainText('Δώσε όνομα αγώνα.');
  await expect(start).toBeDisabled();
  // 30 (the saved course is picked already; tapping it keeps it)
  await page.getByLabel('Όνομα', { exact: true }).fill(RACE);
  await expect(page.getByTestId('course-card').filter({ hasText: COURSE.name })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Εκκίνηση', { exact: true }).fill('2026-11-14T10:02');
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByTestId('session-end')).toBeVisible();
  for (const t of ['Live', 'Χάρτης', 'Σύμβουλος']) await expect(page.getByRole('navigation').getByRole('button', { name: t, exact: true })).toBeVisible();
  await expect(page.getByTestId('session-pause')).toHaveCount(0);
}

const points = async (app: AppFixture) => Number((await app.page.getByTestId('race-points').innerText()).match(/(\d+) σημεία/)?.[1] ?? -1);

async function endRace(app: AppFixture) {
  await app.page.locator('.race-live').getByRole('button', { name: 'Τερματισμός', exact: true }).click();
  await expect(app.page.getByRole('heading', { name: 'Τερματισμός αγώνα;' })).toBeVisible();
  await app.page.getByRole('button', { name: '■ Ναι, τερματίσαμε' }).click();
  await expect(app.page.getByTestId('screen-title')).toHaveText('Η έξοδος τελείωσε');
}

test.describe('αγώνας ως το Ιστορικό', () => {
  test.use({ scenario: { boats: [boatItem(), courseItem()], allowAi: ['/analysis'], analysis: '500' } });

  test('28–36: στήσιμο, Live, ανανέωση, τερματισμός, αναίρεση, Ιστορικό, GPX/CSV, μαθήματα', async ({ app }) => {
    test.setTimeout(90_000);
    const { page } = app;
    await ready(app);
    await setupRace(app);

    // 31: after 3′ the Live has numbers from the instruments
    await app.advance(3 * MIN);
    const screen = page.getByRole('region', { name: 'Οθόνη αγώνα' });
    await expect(screen).toBeVisible();
    await expect(screen.locator('.rs-tile .val').first()).not.toHaveText('—');
    await expect(screen.locator('.rs-tile .val').nth(1)).not.toHaveText('—');
    await expect(screen.getByText(/Χωρίς όργανα/)).toHaveCount(0);

    // 32: a reload opens inside the race and the track goes on
    await app.advance(20_000);
    const before = await points(app);
    expect(before).toBeGreaterThan(5);
    await page.reload();
    await expect(page.getByTestId('session-end')).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('button', { name: 'Live', exact: true })).toHaveAttribute('aria-current', 'page');
    await app.advance(MIN);
    await expect.poll(() => points(app)).toBeGreaterThan(before);

    // 33–34: finish, undo, finish again
    await app.advance(26 * MIN);
    await endRace(app);
    await page.getByTestId('ended-undo').click();
    await expect(page.getByText('Η έξοδος συνεχίζει')).toBeVisible();
    await expect(page.getByTestId('session-end')).toBeVisible();
    await app.advance(10_000);
    await endRace(app);
    await app.advance(11_000, 1000);
    await expect(page.getByTestId('ended-undo')).toHaveCount(0);
    await page.getByRole('button', { name: 'Στο Ιστορικό' }).click();
    await expect(page.getByTestId('screen-title')).toHaveText('Οι έξοδοί μου');
    await page.getByTestId('history-item').filter({ hasText: RACE }).click();

    // 35: GPX and CSV
    const view = page.getByTestId('race-analysis');
    await expect(view.getByRole('heading', { name: RACE })).toBeVisible();
    const gpx = await download(page, () => view.getByRole('button', { name: 'GPX', exact: true }).click());
    expect(gpx.name).toMatch(/\.gpx$/);
    expect(gpx.text).toMatch(/^<\?xml[\s\S]*<\/gpx>\s*$/);
    expect(gpxTimes(gpx.text).length).toBeGreaterThanOrEqual(10);
    const csv = await download(page, () => view.getByRole('button', { name: 'CSV', exact: true }).click());
    expect(csv.name).toMatch(/\.csv$/);
    expect(csv.text.split('\n')[0]).toMatch(/^time,/);

    // 36 + «Σφάλμα με Ξανά»: 500 then 200 → 2 calls in all; opening again makes none
    await view.getByRole('button', { name: 'Ζήτα μαθήματα από τον σύμβουλο' }).click();
    await expect(view.getByTestId('lessons-error')).toBeVisible();
    app.server.set({ analysis: 'ok' });
    await view.getByRole('button', { name: 'Ζήτα μαθήματα από τον σύμβουλο' }).click();
    await expect(view.getByTestId('lessons')).toContainText('Δοκιμαστικό μάθημα 1');
    expect(app.server.calls('/analysis')).toHaveLength(2);
    await view.getByRole('button', { name: '← Οι έξοδοί μου' }).click();
    await page.getByTestId('history-item').filter({ hasText: RACE }).click();
    await expect(view.getByTestId('lessons')).toContainText('Δοκιμαστικό μάθημα 1');
    await app.advance(3000, 1000);
    expect(app.server.calls('/analysis')).toHaveLength(2);
  });
});

test.describe('σύμβουλος μέσα στον αγώνα', () => {
  test.use({ scenario: { boats: [boatItem(), courseItem()], allowAi: ['/chat', '/advice'] } });
  test('37: ερώτηση στον Σύμβουλο → σταθερή απάντηση του fixture', async ({ app }) => {
    await ready(app);
    await setupRace(app);
    await app.tab('Σύμβουλος');
    await app.page.getByRole('textbox', { name: 'Ερώτηση στον σύμβουλο' }).fill('Ποια πλευρά ευνοείται;');
    await app.page.getByRole('button', { name: /^Ρώτα/ }).click();
    await expect(app.page.getByText('Δοκιμαστική απάντηση συμβούλου: μείνε στη δεξιά πλευρά.')).toBeVisible();
    expect(app.server.calls('/chat').length + app.server.calls('/advice').length).toBe(1);
  });
});

test.describe('χωρίς διαδρομή', () => {
  test.use({ scenario: { boats: [boatItem()] } });
  test('29: χωρίς διαδρομή → «Διάλεξε ή φτιάξε διαδρομή…» και ανενεργό κουμπί', async ({ app }) => {
    await app.open();
    await app.signIn();
    await expect(app.page.getByRole('combobox', { name: 'Ενεργό σκάφος' })).toHaveValue('e2e-astarti');
    await app.page.getByRole('button', { name: /^Αγώνας:/ }).click();
    await app.page.getByLabel('Όνομα', { exact: true }).fill(RACE);
    await expect(app.page.locator('.race-setup')).toContainText('Διάλεξε ή φτιάξε διαδρομή με τουλάχιστον 2 σημεία.');
    await expect(app.page.getByRole('button', { name: 'Αποθήκευση και έναρξη' })).toBeDisabled();
  });
});

test.describe('χωρίς σκάφος', () => {
  test.use({ scenario: { boats: [] } });
  test('Αγώνας χωρίς σκάφος: «Για Αγώνα και Προπόνηση χρειάζεται το σκάφος σου…»', async ({ app }) => {
    await app.open();
    await app.signIn();
    await app.page.getByRole('button', { name: 'Παράλειψη όλων' }).click();
    await expect(app.page.getByText(/Για Αγώνα και Προπόνηση χρειάζεται το σκάφος σου/)).toBeVisible();
    await expect(app.page.getByRole('button', { name: /^Αγώνας: Θέλει πρώτα σκάφος/ })).toBeVisible();
    await app.page.getByRole('button', { name: /^Αγώνας:/ }).click();
    await expect(app.page.getByText('Πρώτα πρόσθεσε το σκάφος σου')).toBeVisible();
  });
});
