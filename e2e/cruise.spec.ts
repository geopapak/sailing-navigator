/**
 * Cruise v1 (P-036), basic flow: «Πού πάμε;» → start → Live destination tile → change the
 * destination → pause → map → end → summary. No boat (a cruise does not need one), the
 * phone's GPS from Playwright, the saved course «Δοκιμαστική Σαρωνικού» from /sync.
 * EMODnet stays cut off by the guard: the depth is «—» and the requests keep the budget.
 */
import { test, expect, type AppFixture } from './fixtures/app';
import { courseItem } from './fixtures/handlers';
import { COURSE } from './fixtures/data/course-saronic';
import { download, gpxTimes, storedSessions } from './fixtures/session';

const MIN = 60_000;

test.use({ scenario: { boats: [courseItem()] } });

const tile = (app: AppFixture) => app.page.getByTestId('cruise-dest-tile');
/** Depth requests (EMODnet depth_sample) the guard cut off. */
const depthAsks = (app: AppFixture) => app.guard.cut.filter((u) => u.includes('emodnet') && u.includes('depth_sample'));

/** Moves the boat north (towards the upper mark) and lets the clock run. */
async function sail(app: AppFixture, steps: number, from: number) {
  for (let i = 1; i <= steps; i++) {
    await app.page.context().setGeolocation({ latitude: from + i * 0.0006, longitude: 23.66 });
    await app.advance(15_000);
  }
  return from + steps * 0.0006;
}

test('αναψυχή: «Πού πάμε;» → Live με προορισμό → αλλαγή → παύση → χάρτης → τέλος → σύνοψη', async ({ app, context }) => {
  test.setTimeout(90_000);
  await context.grantPermissions(['geolocation']);
  await app.open();
  await app.signIn();
  await app.page.getByRole('button', { name: 'Παράλειψη όλων' }).click();

  // Setup: «Αναψυχή» works without a boat.
  await app.page.getByRole('button', { name: /^Αναψυχή:/ }).click();
  await expect(app.page.getByText('Πού πάμε;', { exact: true })).toBeVisible();
  const saved = app.page.getByRole('button', { name: new RegExp(COURSE.name) });
  await expect(saved).toContainText('αποθηκευμένη');
  await expect(saved).toContainText(/περίπου \d+,\d NM · ~.+ με \d+,\d kt/);
  await saved.click();
  await expect(saved).toHaveAttribute('aria-pressed', 'true');
  await expect(app.page.getByText(/Η αναψυχή δεν μοιράζεται\. Ειδοποιήσεις μόνο ασφάλειας: ρηχά και άφιξη\./)).toBeVisible();
  await app.page.getByRole('button', { name: '● Έναρξη αναψυχής' }).click();
  await expect(app.page.getByTestId('session-end')).toBeVisible();

  // Live: the destination tile with the distance left.
  await expect(tile(app)).toContainText(COURSE.name);
  await expect(tile(app)).toContainText('διαδρομή · απομένουν');
  await expect(tile(app)).toContainText(/ETA/);
  const left0 = Number((await tile(app).locator('.val').innerText()).replace(/[^\d,]/g, '').replace(',', '.'));
  expect(left0).toBeGreaterThan(3);
  let lat = await sail(app, 8, 37.9);
  await expect
    .poll(async () => Number((await tile(app).locator('.val').innerText()).replace(/[^\d,]/g, '').replace(',', '.')))
    .toBeLessThan(left0);

  // AC 4: the destination changes inside the session, without a new one.
  await tile(app).click();
  const sheet = app.page.getByTestId('cruise-dest-sheet');
  await expect(sheet).toContainText('Πού πάμε;');
  await sheet.getByRole('button', { name: 'Χωρίς προορισμό' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(tile(app)).toContainText('Βάλε έναν για απόσταση και ETA');
  await tile(app).getByRole('button', { name: 'Βάλε' }).click();
  await app.page.getByTestId('cruise-dest-sheet').getByRole('button', { name: new RegExp(COURSE.name) }).click();
  await expect(tile(app)).toContainText(COURSE.name);
  const sessions = await storedSessions(app.page);
  expect(sessions.filter((s) => s.kind === 'cruise')).toHaveLength(1);

  // Pause: the ETA freezes, nothing is recorded.
  lat = await sail(app, 2, lat);
  await app.page.getByTestId('session-pause').click();
  await expect(tile(app)).toContainText('σε παύση · η ETA παγώνει');
  await app.advance(MIN);
  await app.page.getByTestId('session-resume').click();
  await expect(tile(app)).not.toContainText('σε παύση');
  lat = await sail(app, 4, lat);

  // Map: line to the destination, «Βάθος εδώ» is «—» (EMODnet cut off), never for navigation.
  await app.tab('Χάρτης');
  const map = app.page.getByTestId('cruise-map');
  await expect(map).toBeVisible();
  await expect(map).toContainText('Ενδεικτικό, όχι για ναυσιπλοΐα');
  await expect(map).toContainText(COURSE.name);
  await expect(app.page.getByTestId('depth-here')).toContainText('Βάθος εδώ');
  await expect(app.page.getByTestId('depth-here')).toContainText('—');
  await app.tab('Live');
  await expect(tile(app)).toBeVisible();

  // End → summary.
  await app.page.getByTestId('session-end').click();
  await expect(app.page.getByRole('heading', { name: 'Τέλος αναψυχής;' })).toBeVisible();
  await app.page.getByRole('button', { name: 'Ναι, τέλος' }).click();
  await expect(app.page.getByTestId('screen-title')).toHaveText('Η έξοδος τελείωσε');
  await expect(app.page.getByTestId('ended-undo')).toBeVisible();
  const stats = app.page.getByTestId('summary-stats');
  for (const l of ['διάρκεια', 'απόσταση', 'μέση ταχύτητα', 'μέγιστη', 'άφιξη', 'ίχνος']) await expect(stats).toContainText(l);
  await expect(stats).toContainText(/κάθε \d+″/);
  await expect(app.page.getByText('Η αναψυχή δεν μοιράζεται. Το ίχνος μένει μόνο σε αυτό το κινητό.')).toBeVisible();
  await expect(app.page.getByText(/^Χωρίς τις παύσεις \(1:0\d\)/)).toBeVisible();
  const gpx = await download(app.page, () => app.page.getByTestId('export-gpx').click());
  expect(gpx.name).toMatch(/\.gpx$/);
  expect(gpxTimes(gpx.text).length).toBeGreaterThanOrEqual(3);

  // Past the undo: the cruise is in the history and nothing about it left the phone.
  await app.advance(11_000, 1000);
  await app.page.getByRole('button', { name: 'Στο Ιστορικό' }).click();
  await expect(app.page.getByTestId('history-item').filter({ hasText: `Αναψυχή · ${COURSE.name}` })).toHaveCount(1);
  expect(app.server.calls('/crews/*', 'PUT')).toEqual([]);
  expect(JSON.stringify(app.server.log)).not.toContain('"cruise"');

  // EMODnet: asked, cut off by the guard, and at most once a minute.
  const asks = depthAsks(app);
  const minutes = (await app.page.evaluate(() => Date.now()) - new Date('2026-11-14T10:00:00+02:00').getTime()) / MIN;
  expect(asks.length).toBeGreaterThanOrEqual(1);
  expect(asks.length).toBeLessThanOrEqual(Math.ceil(minutes) + 1);
  expect(lat).toBeGreaterThan(37.9);
});

test('αναψυχή χωρίς προορισμό: το Live λέει «Χωρίς προορισμό» και ο χάρτης «Βάλε προορισμό»', async ({ app, context }) => {
  await context.grantPermissions(['geolocation']);
  await app.open();
  await app.signIn();
  await app.page.getByRole('button', { name: 'Παράλειψη όλων' }).click();
  await app.page.getByRole('button', { name: /^Αναψυχή:/ }).click();
  await expect(app.page.getByRole('button', { name: 'Χωρίς προορισμό' })).toHaveAttribute('aria-pressed', 'true');
  await expect(app.page.getByText(/\(άφιξη μόνο με προορισμό\)/)).toBeVisible();
  await app.page.getByRole('button', { name: '● Έναρξη αναψυχής' }).click();
  await expect(tile(app)).toContainText('Χωρίς προορισμό');
  await expect(tile(app).getByRole('button', { name: 'Βάλε' })).toBeVisible();
  await app.tab('Χάρτης');
  await expect(app.page.getByTestId('cruise-map').getByRole('button', { name: 'Βάλε προορισμό' })).toBeVisible();
});
