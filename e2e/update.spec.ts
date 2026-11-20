/**
 * Flow 5 @sw: a new version during a session (P-043, P-044b), criteria 46–51.
 * Version A is installed with its service worker; the local server then hands out B.
 * Never a reload inside a session; at 02:00 / «Ενημέρωση τώρα» / critical only outside.
 */
import { test, expect, type SwApp } from './fixtures/sw';
import { boatItem } from './fixtures/handlers';
import { UPDATE_TEXT } from '../src/pwa/updateText';
import { expectActiveBoat } from './fixtures/boat';

const MIN = 60_000;
test.use({ scenario: { boats: [boatItem()] } });

/** A marker that disappears if the page reloads. */
const mark = (sw: SwApp) => sw.page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
const stillSamePage = (sw: SwApp) => sw.page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload === true);

async function signedInWithA(sw: SwApp) {
  await sw.install();
  await sw.signIn();
  await expectActiveBoat(sw.page, 'e2e-astarti');
  await sw.useSimulator();
}

async function versionBWaits(sw: SwApp) {
  await sw.serve('b');
  await sw.checkForUpdate();
  await expect.poll(() => sw.waitingWorker(), { timeout: 20_000 }).toBe(true);
}

async function startTraining(sw: SwApp) {
  await sw.page.getByRole('button', { name: /^Προπόνηση:/ }).click();
  await sw.page.getByRole('button', { name: '● Έναρξη προπόνησης' }).click();
  await expect(sw.page.getByTestId('session-end')).toBeVisible();
}

async function version(sw: SwApp) {
  await sw.tab('Ρυθμίσεις');
  const v = await sw.page.getByText(/^Έκδοση /).innerText();
  await sw.tab('Αρχική');
  return v;
}

test('46–48: η B περιμένει όσο τρέχει η προπόνηση, και μετά τις 02:00· εφαρμόζεται μετά το τέλος', async ({ sw }) => {
  test.setTimeout(90_000);
  await signedInWithA(sw);
  expect(await version(sw)).toBe('Έκδοση 0.0.1');
  await startTraining(sw);
  await mark(sw);

  // 46: B waits, no reload
  await versionBWaits(sw);
  await expect(sw.page.getByTestId('update-line')).toHaveText(new RegExp(UPDATE_TEXT.sessionWaiting));
  expect(await stillSamePage(sw)).toBe(true);

  // 47: past 02:00 (Europe/Athens) still no reload; the line says it waits for the end
  await sw.advance(11 * MIN, 10_000);
  await expect(sw.page.getByTestId('update-line')).toHaveText(new RegExp(UPDATE_TEXT.sessionAfter));
  expect(await stillSamePage(sw)).toBe(true);

  // 48: end → after the 10″ undo «Ενημερώνουμε την εφαρμογή…», reload into B
  await sw.page.getByTestId('session-end').click();
  await sw.page.getByRole('button', { name: 'Ναι, τέλος' }).click();
  await expect(sw.page.getByTestId('screen-title')).toHaveText('Η έξοδος τελείωσε');
  await sw.advance(5000, 1000);
  expect(await stillSamePage(sw)).toBe(true);
  await expect(sw.page.getByText(UPDATE_TEXT.applying)).toHaveCount(0);
  await sw.advance(6000, 500);
  await expect(sw.page.getByText(UPDATE_TEXT.applying)).toBeVisible();
  await sw.advance(3000, 500);
  await expect.poll(() => stillSamePage(sw).catch(() => false), { timeout: 20_000 }).toBe(false);
  await expect(sw.page.getByTestId('screen-title')).toHaveText('Νέα έξοδος', { timeout: 20_000 });
  expect(await version(sw)).toBe('Έκδοση 0.0.2');
  await sw.tab('Ιστορικό');
  await expect(sw.page.getByTestId('history-item').filter({ hasText: 'Προπόνηση' })).toHaveCount(1);
});

test('49: εκτός εξόδου πριν τις 02:00: κάρτα με «Ενημέρωση τώρα», που ενημερώνει αμέσως', async ({ sw }) => {
  await signedInWithA(sw);
  await mark(sw);
  await versionBWaits(sw);
  const card = sw.page.getByTestId('update-card');
  await expect(card).toContainText(UPDATE_TEXT.available);
  expect(await stillSamePage(sw)).toBe(true);
  await card.getByRole('button', { name: UPDATE_TEXT.now }).click();
  await expect(sw.page.getByText(UPDATE_TEXT.applying)).toBeVisible();
  await sw.advance(3000, 500);
  await expect.poll(() => stillSamePage(sw).catch(() => false), { timeout: 20_000 }).toBe(false);
  await expect(sw.page.getByTestId('screen-title')).toHaveText('Νέα έξοδος', { timeout: 20_000 });
  expect(await version(sw)).toBe('Έκδοση 0.0.2');
});

test('φόρμα ανοιχτή στις 02:00: η B δεν εφαρμόζεται πριν κλείσει η φόρμα', async ({ sw }) => {
  await signedInWithA(sw);
  await versionBWaits(sw);
  await sw.page.getByRole('button', { name: /^Αγώνας:/ }).click();
  await sw.page.getByLabel('Όνομα', { exact: true }).fill('Δοκιμή ενημέρωσης');
  await mark(sw);
  await sw.advance(11 * MIN, 10_000);
  await expect(sw.page.getByText(UPDATE_TEXT.applying)).toHaveCount(0);
  expect(await stillSamePage(sw)).toBe(true);
  await expect(sw.page.getByLabel('Όνομα', { exact: true })).toHaveValue('Δοκιμή ενημέρωσης');
});

test.fixme('50: «Ενημέρωση τώρα» με αλλαγές που δεν σώθηκαν ρωτά πρώτα', async () => {
  // Not reachable from the UI today: the «Ενημέρωση τώρα» card is only on Home, and every
  // form that holds the update (Νέος αγώνας, σκάφος, σημείωση, προπόνηση) replaces Home.
  // The rule itself (`nowAction` → 'confirm') is covered by src/pwa/update.test.ts.
});

test.describe('critical έκδοση', () => {
  test.use({ clockStart: new Date('2026-11-14T10:00:00+02:00').getTime() });

  test('51: εκτός εξόδου εφαρμόζεται χωρίς να περιμένει τις 02:00', async ({ sw }) => {
    await signedInWithA(sw);
    await mark(sw);
    await sw.serve('b', true);
    await sw.checkForUpdate();
    // 10:00, far from 02:00: the page reloads into B by itself (the banner may be too quick to catch).
    await expect
      .poll(async () => (await stillSamePage(sw).catch(() => false)) && (await sw.advance(1000, 500), true), { timeout: 30_000 })
      .toBe(false);
    await expect(sw.page.getByTestId('screen-title')).toHaveText('Νέα έξοδος', { timeout: 20_000 });
    expect(await version(sw)).toBe('Έκδοση 0.0.2');
  });

  test('51: μέσα σε έξοδο, ακόμη και critical, περιμένει το τέλος', async ({ sw }) => {
    await signedInWithA(sw);
    await startTraining(sw);
    await mark(sw);
    await sw.serve('b', true);
    await sw.checkForUpdate();
    await expect.poll(() => sw.waitingWorker(), { timeout: 20_000 }).toBe(true);
    await expect(sw.page.getByTestId('update-line')).toHaveText(new RegExp(UPDATE_TEXT.sessionAfter));
    await sw.advance(30_000, 5000);
    expect(await stillSamePage(sw)).toBe(true);
  });
});
