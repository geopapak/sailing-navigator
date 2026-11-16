/**
 * Flow 4: training (P-035, P-039), criteria 38–45 and 40α.
 * «Αστάρτη» from /sync, instruments on «Προσομοίωση (για δοκιμή)», the fake clock
 * moves minutes in seconds.
 */
import { test, expect, type AppFixture } from './fixtures/app';
import { boatItem } from './fixtures/handlers';
import { download, gpxTimes, now, runningTrackLength } from './fixtures/session';

const MIN = 60_000;

test.use({ scenario: { boats: [boatItem()] } });

async function ready(app: AppFixture) {
  await app.open();
  await app.signIn();
  await expect(app.page.getByRole('combobox', { name: 'Ενεργό σκάφος' })).toHaveValue('e2e-astarti');
  await app.useSimulator();
}

const lapBtn = (app: AppFixture) => app.page.getByTestId('lap-button');
const strip = (app: AppFixture) => app.page.getByTestId('session-strip');

async function endTraining(app: AppFixture) {
  await app.page.getByTestId('session-end').click();
  await expect(app.page.getByRole('heading', { name: 'Τέλος προπόνησης;' })).toBeVisible();
  await app.page.getByRole('button', { name: '■ Ναι, τέλος' }).click();
  await expect(app.page.getByTestId('screen-title')).toHaveText('Η έξοδος τελείωσε');
}

test('38–39, 41–43: γύροι, παύση, σύνοψη χωρίς την παύση, GPX και CSV', async ({ app }) => {
  test.setTimeout(90_000);
  await ready(app);
  await app.startTraining();
  // 38
  await expect(app.page.getByTestId('session-pause')).toHaveText('⏸ Παύση');
  await expect(lapBtn(app)).toContainText('⏱ Γύρος 1');
  await expect(app.page.getByTestId('inst-pill')).toHaveCount(0); // no header pill inside a session
  await expect(app.page.getByRole('navigation', { name: 'Οθόνες εξόδου' })).toBeVisible();

  // 39: laps at 4′ and 9′
  await app.advance(4 * MIN);
  await lapBtn(app).click();
  await expect(strip(app)).toContainText(/Γύρος 1: (3:5[89]|4:0[0-2])/);
  await app.advance(5 * MIN);
  await lapBtn(app).click();
  await expect(strip(app)).toContainText(/Γύρος 2: (4:5[89]|5:0[0-2])/);
  await expect(app.page.getByTestId('lap-list')).toContainText(/Γύρος 2: (4:5[89]|5:0[0-2])/);

  // 41: pause 3′ — nothing recorded; then resume
  await app.advance(20_000); // let the 15″ save write the track
  await app.page.getByTestId('session-pause').click();
  await expect(strip(app)).toContainText('Παύση · δεν καταγράφεται');
  const pauseFrom = await now(app.page);
  await app.advance(20_000);
  const before = await runningTrackLength(app.page);
  expect(before).toBeGreaterThan(10);
  await app.advance(3 * MIN - 20_000);
  await expect(app.page.getByText('⏸ Σε παύση', { exact: true })).toBeVisible();
  expect(await runningTrackLength(app.page)).toBe(before);
  await app.page.getByTestId('session-resume').click();
  const pauseTo = await now(app.page);
  await expect(strip(app)).toContainText('Συνέχεια · η καταγραφή ξανάρχισε');
  await app.advance(3 * MIN - 20_000);
  expect(await runningTrackLength(app.page)).toBeGreaterThan(before);

  // 42: 15′ with a 3′ pause → 12′
  await endTraining(app);
  await expect(app.page.getByTestId('ended-undo')).toHaveText(/↶ Αναίρεση \(\d+″\)/);
  const stats = app.page.getByTestId('summary-stats');
  await expect(stats).toContainText(/0:(11:5\d|12:0\d)\s*διάρκεια/);
  await expect(app.page.getByText(/Χωρίς τις παύσεις \(3:0\d\)/)).toBeVisible();

  // 43: GPX and CSV, with no point inside the pause
  const gpx = await download(app.page, () => app.page.getByRole('button', { name: 'GPX', exact: true }).click());
  expect(gpx.name).toMatch(/\.gpx$/);
  expect(gpx.text).toMatch(/^<\?xml/);
  expect(gpx.text).toContain('</gpx>');
  const times = gpxTimes(gpx.text);
  expect(times.length).toBeGreaterThanOrEqual(10);
  expect(times.filter((t) => t > pauseFrom + 1000 && t < pauseTo - 1000)).toEqual([]);
  const csv = await download(app.page, () => app.page.getByRole('button', { name: 'CSV', exact: true }).click());
  expect(csv.name).toMatch(/\.csv$/);
  expect(csv.text.split('\n')[0]).toMatch(/^time,/);
});

test('40, 40α: αναίρεση γύρου μέσα σε 5″ και διπλό πάτημα σε < 3″', async ({ app }) => {
  await ready(app);
  await app.startTraining();
  await app.advance(2 * MIN);
  // 40: undo → the next lap keeps the same number
  await lapBtn(app).click();
  await expect(lapBtn(app)).toContainText('⏱ Γύρος 2');
  await expect(app.page.getByTestId('lap-undo')).toHaveText(/↶ Αναίρεση \([1-5]″\)/);
  await app.page.getByTestId('lap-undo').click();
  await expect(strip(app)).toContainText('Ο γύρος αναιρέθηκε');
  await expect(lapBtn(app)).toContainText('⏱ Γύρος 1');
  await app.advance(MIN);
  // 40α: two taps within 3″ → one lap
  await lapBtn(app).click();
  await app.advance(1000, 500);
  await lapBtn(app).click();
  await expect(lapBtn(app)).toContainText('⏱ Γύρος 2');
  await app.advance(4000, 1000);
  await lapBtn(app).click();
  await expect(lapBtn(app)).toContainText('⏱ Γύρος 3');
});

test.describe('μαθήματα offline', () => {
  test.use({ scenario: { boats: [boatItem()], allowAi: ['/analysis'] } });
  test('44: offline ένα μόνο μήνυμα· online ακριβώς 1 κλήση /analysis', async ({ app, context }) => {
    await ready(app);
    await app.startTraining();
    await app.advance(5 * MIN);
    await endTraining(app);
    await app.advance(11_000, 1000); // past the 10″ undo
    await context.setOffline(true);
    await app.page.getByRole('button', { name: 'Ανάλυση και μαθήματα' }).click();
    await expect(app.page.getByText(/Χωρίς ίντερνετ: τα μαθήματα θα φτιαχτούν/)).toBeVisible();
    await expect(app.page.getByTestId('lessons-error')).toHaveCount(0);
    expect(app.server.calls('/analysis')).toHaveLength(0);
    await context.setOffline(false);
    await expect(app.page.getByTestId('lessons')).toContainText('Δοκιμαστικό μάθημα 1');
    await app.advance(5000, 1000);
    expect(app.server.calls('/analysis')).toHaveLength(1);
  });
});

test.describe('κοινοποίηση στο πλήρωμα', () => {
  test.use({ scenario: { boats: [boatItem()], crew: true } });

  async function sharedTraining(app: AppFixture) {
    await ready(app);
    await app.page.getByRole('button', { name: /^Προπόνηση:/ }).click();
    const share = app.page.getByRole('switch', { name: /Μοιράσου με το πλήρωμα/ }).or(app.page.getByRole('checkbox', { name: /Μοιράσου με το πλήρωμα/ }));
    await share.first().click();
    await app.page.getByRole('button', { name: '● Έναρξη προπόνησης' }).click();
    await app.advance(5 * MIN);
    await endTraining(app);
  }
  const puts = (app: AppFixture) => app.server.calls('/crews/*', 'PUT');

  test('45: η σύνοψη φεύγει για το πλήρωμα μόνο μετά τα 10″ της αναίρεσης', async ({ app }) => {
    await sharedTraining(app);
    await app.advance(6000, 1000);
    expect(puts(app)).toHaveLength(0);
    await app.advance(8000, 1000);
    await expect.poll(() => puts(app).length).toBe(1);
  });

  test('45: με «↶ Αναίρεση» δεν φεύγει τίποτα', async ({ app }) => {
    await sharedTraining(app);
    await app.page.getByTestId('ended-undo').click();
    await expect(app.page.getByText('Η έξοδος συνεχίζει')).toBeVisible();
    await app.advance(20_000, 1000);
    expect(puts(app)).toHaveLength(0);
  });
});
