/**
 * P-053: manual wind inside a session (docs/product/specs/P-053-manual-wind.md, QA Q2).
 * «Αστάρτη» (polar) and «Ναυτίλος» (no polar) from /sync, fake clock, the phone GPS
 * moved by the test or the instruments «simulator».
 */
import { test, expect, noHorizontalOverflow, type AppFixture } from './fixtures/app';
import { boatItem, courseItem } from './fixtures/handlers';
import { NO_POLAR } from './fixtures/data/boat-no-polar';
import { download, runningSession, storedSessions } from './fixtures/session';
import { expectActiveBoat } from './fixtures/boat';

const MIN = 60_000;

const sheet = (app: AppFixture) => app.page.getByTestId('wind-sheet');
const card = (app: AppFixture) => app.page.getByTestId('wind-reading');

async function signedIn(app: AppFixture, boat = 'e2e-astarti') {
  await app.open();
  await app.signIn();
  await expectActiveBoat(app.page, boat);
}

async function setupRace(app: AppFixture) {
  const { page } = app;
  await page.getByRole('button', { name: /^Αγώνας:/ }).click();
  await page.getByLabel('Όνομα', { exact: true }).fill('Δοκιμή ανέμου');
  await page.getByLabel('Εκκίνηση', { exact: true }).fill('2026-11-14T10:01');
  await page.getByRole('button', { name: 'Αποθήκευση και έναρξη' }).click();
  await expect(page.getByTestId('session-end')).toBeVisible();
}

async function endTraining(app: AppFixture) {
  await app.page.getByTestId('session-end').click();
  await app.page.getByRole('button', { name: 'Ναι, τέλος' }).click();
  await expect(app.page.getByTestId('screen-title')).toHaveText('Η έξοδος τελείωσε');
}

/** Types a value into the sheet's TWD or TWS field (as a sailor would, then «done»). */
async function type(app: AppFixture, field: RegExp, value: string) {
  const input = sheet(app).getByRole('textbox', { name: field });
  await input.fill(value);
  await input.press('Enter');
}

test.describe('αγώνας χωρίς όργανα', () => {
  test.use({ scenario: { boats: [boatItem(), courseItem()] } });

  // The phone GPS stands still here: Chromium stamps its fixes with the real clock, so a course
  // from moving fixes cannot be made under the fake clock. The COG path (2,5 / 2 kt, 30″) is in
  // src/race/manualWind.test.ts; here the boat is still, as in the spec's «Χωρίς κίνηση» case.
  test('ΚΑ 3–4, 9–12, 15, 18, 19, 29, 47: «Βάλε άνεμο», ακίνητο σκάφος, παλιός στα 15′, «Ισχύει ακόμα», ανανέωση', async ({ app, context }) => {
    test.setTimeout(120_000);
    await context.grantPermissions(['geolocation']);
    await signedIn(app);
    await setupRace(app);
    const { page } = app;
    await app.advance(2 * MIN);

    // AC 47: no wind yet → the prompt, never the 10 kt / 42° defaults
    const screen = page.getByRole('region', { name: 'Οθόνη αγώνα' });
    await expect(screen.getByText('Χωρίς άνεμο:')).toBeVisible();
    await expect(screen.getByText(/42°/)).toHaveCount(0);
    // QA bug 1: the very first tap of the race (it also unlocks the sound) opens the sheet.
    await expect(screen.getByRole('button', { name: 'Ενεργοποίηση ήχου' })).toBeVisible();
    await page.getByTestId('wind-prompt').click();
    await expect(sheet(app)).toBeVisible();
    await expect(sheet(app)).toContainText('Τώρα: χωρίς άνεμο');
    await expect(page.getByTestId('wind-use')).toBeDisabled();

    // AC 15–16: 040°M with declination +5° is 045°T; TWS ±2
    await type(app, /^TWD σε °M/, '040');
    await expect(sheet(app)).toContainText('040°M = 045°T');
    await sheet(app).getByRole('button', { name: 'TWS +2' }).click();
    await expect(sheet(app).getByRole('textbox', { name: /^TWS σε kt/ })).toHaveValue('12');
    await page.getByTestId('wind-use').click();
    await expect(page.getByTestId('wind-off')).toHaveAttribute('aria-checked', 'true');
    await expect(sheet(app).getByTestId('wind-age')).toHaveText('Χειροκίνητα · τώρα');

    // AC 18: no course (standing still) → TWA «—» and why
    await expect(page.getByTestId('wind-twa')).toHaveText('TWA: — · χρειάζεται πορεία GPS (SOG 2,5 kt και πάνω)');
    await sheet(app).getByRole('button', { name: 'TWD +5' }).click();
    await expect(sheet(app)).toContainText('045°M = 050°T');
    // AC 15, 29: stored at once in the session, in °T
    await expect.poll(async () => (await runningSession(page))?.manualWind).toMatchObject({ on: true, twdTrue: 50, tws: 12 });
    await sheet(app).getByRole('button', { name: 'Έτοιμο' }).click();
    await expect(sheet(app)).toHaveCount(0);
    await expect(card(app)).toContainText('χειροκίνητα · τώρα');
    await expect(card(app)).toContainText('045°M');
    await expect(screen.getByText(/^Άνεμος χειροκίνητα: χωρίς ειδοποιήσεις/)).toBeVisible();
    await expect(screen.getByText('χρειάζεται SOG 2,5 kt').first()).toBeVisible();
    // QA bug 3: the ranking estimate shows the TWD in the units of the setting
    await expect(page.getByText(/Άνεμος για την εκτίμηση: 12 kt \/ 045°M \(χειροκίνητα\)\./)).toBeVisible();

    // AC 19: 15′ later it is old (no dialog, no pop-up)
    await app.advance(15 * MIN, 30_000);
    await expect(card(app)).toHaveClass(/stale/);
    await expect(card(app).getByTestId('wind-age')).toHaveText(/πριν από 1[5-6]′ · έλεγξέ τον/);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    // AC 4: «✓ Ισχύει ακόμα» → age «τώρα», sheet closed
    await card(app).click();
    await page.getByTestId('wind-confirm').click();
    await expect(sheet(app)).toHaveCount(0);
    await expect(card(app).getByTestId('wind-age')).toHaveText('χειροκίνητα · τώρα');
    await expect(card(app)).not.toHaveClass(/stale/);

    // AC 29: a reload keeps it, the age goes on
    await app.advance(3 * MIN);
    await page.reload();
    await expect(page.getByTestId('session-end')).toBeVisible();
    await expect(card(app).getByTestId('wind-age')).toHaveText(/χειροκίνητα · πριν από [34]′/);
    const s = await runningSession(page);
    expect(s?.windLog?.map((e) => e.ev)).toEqual(expect.arrayContaining(['on', 'confirm']));
    expect(s?.track.some((p) => p.wind === 'manual')).toBe(true);
  });
});

test.describe('προπόνηση με όργανα (simulator)', () => {
  test.use({ scenario: { boats: [boatItem()] } });

  test('ΚΑ 13, 22, 33–35, 43: ο χειροκίνητος κερδίζει τα όργανα, BSP από τα όργανα, ίχνος, πίσω στα όργανα, CSV', async ({ app }) => {
    test.setTimeout(120_000);
    await signedIn(app);
    await app.useSimulator();
    await app.startTraining();
    const { page } = app;
    await app.advance(MIN);
    await expect(card(app)).toContainText('όργανα');

    await card(app).click();
    await expect(sheet(app)).toContainText('Τώρα: από τα όργανα');
    await type(app, /^TWD σε °M/, '220');
    await type(app, /^TWS σε kt/, '10');
    await page.getByTestId('wind-use').click();
    await expect(sheet(app)).toContainText('Όργανα συνδεδεμένα. Ο άνεμος μένει χειροκίνητος.');
    // AC 43: the TWA from the instruments' heading
    await expect(page.getByTestId('wind-twa')).toContainText('από πλώρη οργάνων');
    // AC 15: 220°M → 225°T
    await expect.poll(async () => (await runningSession(page))?.manualWind).toMatchObject({ on: true, twdTrue: 225, tws: 10 });
    await sheet(app).getByRole('button', { name: 'Έτοιμο' }).click();
    await expect(card(app)).toContainText('10,0');
    await expect(card(app)).toContainText('220°M');
    await expect(page.getByText('BSP', { exact: false }).first()).toBeVisible();

    // AC 33: points with the manual wind and `wind: 'manual'`
    await app.advance(MIN);
    await expect
      .poll(async () => (await runningSession(page))?.track.filter((p) => p.wind === 'manual').length ?? 0)
      .toBeGreaterThanOrEqual(2);
    const pt = (await runningSession(page))!.track.filter((p) => p.wind === 'manual').pop()!;
    expect(pt.tws).toBe(10);
    expect(pt.twd).toBe(225);

    // AC 13: switching it off goes back to the instruments, with a 6″ undo
    await card(app).click();
    await page.getByTestId('wind-off').click();
    // QA bug 4: the «Αναίρεση» is inside the sheet, not a message over it
    await expect(sheet(app).getByTestId('wind-undo')).toContainText('Ο άνεμος έρχεται ξανά από τα όργανα');
    await expect(sheet(app).getByRole('button', { name: 'Αναίρεση' })).toBeVisible();
    await expect(page.locator('.snack')).toHaveCount(0);
    await sheet(app).getByRole('button', { name: 'Έτοιμο' }).click();
    await expect(card(app).getByTestId('wind-age')).toHaveText('όργανα');
    await app.advance(MIN);

    // AC 34–35: the summary note and the CSV column
    await endTraining(app);
    await expect(page.getByTestId('wind-manual-note')).toContainText(/^Άνεμος χειροκίνητα σε \d+′ από /);
    const csv = await download(page, () => page.getByRole('button', { name: 'CSV', exact: true }).click());
    const rows = csv.text.trim().split('\n');
    expect(rows[0].endsWith(',wind')).toBe(true);
    expect(rows.some((r) => r.endsWith(',manual'))).toBe(true);
    expect(rows.slice(1).some((r) => r.endsWith(','))).toBe(true);
  });
});

test.describe('χωρίς άνεμο', () => {
  test.use({ scenario: { boats: [boatItem()] } });

  test('ΚΑ 30, 46–52: προεπιλογές της 0.16.1 χωρίς windTypedAt δεν μετράνε· «Βάλε άνεμο» → στόχοι· νέα έξοδος κλειστός', async ({ app }) => {
    test.setTimeout(90_000);
    await signedIn(app);
    const { page } = app;
    // A 0.16.1 `live-state`: the defaults, never typed.
    await page.evaluate(() => localStorage.setItem('live-state', JSON.stringify({ windInput: 'twa', tws: 10, twa: 42, side: 'stbd' })));
    await page.reload();
    await app.startTraining();
    await app.advance(MIN);
    await expect(page.getByText('Χωρίς άνεμο:')).toBeVisible();
    await expect(page.locator('main, .content').first().getByText(/42°/)).toHaveCount(0);
    await expect(card(app)).toHaveCount(0);

    await page.getByTestId('wind-prompt').click();
    await type(app, /^TWD σε °M/, '220');
    await type(app, /^TWS σε kt/, '12');
    await page.getByTestId('wind-use').click();
    await sheet(app).getByRole('button', { name: 'Έτοιμο' }).click();
    await expect(page.getByTestId('wind-prompt')).toHaveCount(0);
    await expect(card(app)).toContainText('χειροκίνητα · τώρα');
    // QA bug 2: standing still (no TWA), the small TWS tile still shows the manual 12 kt
    await expect(page.getByTestId('tws-mini')).toHaveText('12,0');
    await expect(page.getByText('TWS kt · χειροκίνητα')).toBeVisible();
    await expect(page.getByText(/TWA · άνεμος χειροκίνητα/)).toBeVisible();
    await expect(page.getByText(/^Άνεμος χειροκίνητα: χωρίς ειδοποιήσεις/)).toBeVisible();

    // AC 30: a new session starts with it off (and without a wind)
    await endTraining(app);
    await app.tab('Αρχική');
    await app.startTraining();
    await expect(page.getByTestId('wind-prompt')).toBeVisible();
    const sessions = await storedSessions(page);
    expect(sessions.find((x) => x.status === 'running')?.manualWind).toBeUndefined();
  });
});

test.describe('σύμβουλος', () => {
  test.use({ scenario: { boats: [boatItem()], allowAi: ['/chat', '/advice'] } });

  test('ΚΑ 37: το σώμα της ερώτησης έχει nav.windManual με ηλικία', async ({ app }) => {
    await signedIn(app);
    await app.useSimulator();
    await app.startTraining();
    const { page } = app;
    await app.advance(MIN);
    await card(app).click();
    await type(app, /^TWD σε °M/, '220');
    await type(app, /^TWS σε kt/, '12');
    await page.getByTestId('wind-use').click();
    await sheet(app).getByRole('button', { name: 'Έτοιμο' }).click();
    await app.advance(2 * MIN);
    await app.tab('Σύμβουλος');
    await page.getByRole('textbox', { name: 'Ερώτηση στον σύμβουλο' }).fill('Πού να πάμε;');
    await page.getByRole('button', { name: /^Ρώτα/ }).click();
    await expect(page.getByText('Δοκιμαστική απάντηση συμβούλου', { exact: false })).toBeVisible();
    const body = JSON.stringify([...app.server.calls('/chat'), ...app.server.calls('/advice')].map((c) => c.body));
    expect(body).toMatch(/"windManual":\{"twdTrue":225,"tws":12,"ageMin":\d+,"stale":false,"note":"Άνεμος που έβαλε το πλήρωμα με το χέρι, όχι μέτρηση."\}/);
  });
});

test.describe('«Γρήγορη ματιά» χωρίς polar', () => {
  test.use({ scenario: { boats: [boatItem(NO_POLAR)] } });

  test('ΚΑ 39–40: φύλλο, ηλικία, TWA χωρίς στόχους', async ({ app, context }) => {
    await context.grantPermissions(['geolocation']);
    await signedIn(app, 'e2e-no-polar');
    const { page } = app;
    await page.getByRole('button', { name: /Γρήγορη ματιά/ }).click();
    const empty = page.getByRole('button', { name: 'Άνεμος: κανένας. Βάλε άνεμο' });
    await expect(empty).toBeVisible();
    await empty.click();
    await type(app, /^TWD σε °M/, '220');
    await type(app, /^TWS σε kt/, '12');
    await page.getByTestId('wind-use').click();
    await expect(sheet(app)).toContainText('Ανοιχτό: η TWA βγαίνει από αυτόν τον άνεμο.');
    await sheet(app).getByRole('button', { name: 'Έτοιμο' }).click();
    await expect(card(app)).toContainText('χειροκίνητα · τώρα');
    await expect(card(app)).toContainText('220°M');
    // Standing still: no course yet, so no TWA, and never targets
    await expect(page.getByText('TWA · χρειάζεται SOG 2,5 kt')).toBeVisible();
    await expect(page.getByText(/του στόχου/)).toHaveCount(0);
    await app.advance(5 * MIN);
    await expect(card(app).getByTestId('wind-age')).toHaveText('χειροκίνητα · πριν από 5′');
  });
});

test.describe('μέγεθος οθόνης', () => {
  test.use({ scenario: { boats: [boatItem()] } });

  test('@narrow ΚΑ 16, 41–42: 320 px, «Πολύ μεγάλα», Νύχτα: φύλλο χωρίς οριζόντια κύλιση, ± ≥ 48 px', async ({ app }) => {
    await signedIn(app);
    await app.setSettings({ theme: 'night', textSize: 'xl' });
    await expect(app.page.locator('html')).toHaveAttribute('data-theme', 'night');
    await app.startTraining();
    await app.advance(MIN);
    expect(await noHorizontalOverflow(app.page), 'Live χωρίς άνεμο').toEqual([]);
    await app.page.getByTestId('wind-prompt').click();
    await expect(sheet(app)).toBeVisible();
    await type(app, /^TWD σε °M/, '220');
    await type(app, /^TWS σε kt/, '12');
    await app.page.getByTestId('wind-use').click();
    // QA bug 4: no message over the top of the sheet; the «Αναίρεση» is inside it
    await expect(sheet(app).getByTestId('wind-undo')).toBeVisible();
    await expect(app.page.locator('.snack')).toHaveCount(0);
    const undo = sheet(app).getByRole('button', { name: 'Αναίρεση' });
    await expect(undo).toBeInViewport();
    expect(await undo.evaluate((b) => {
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!hit && b.contains(hit);
    }), '«Αναίρεση» δεν σκεπάζεται').toBe(true);
    await test.info().attach('wind-sheet-320-xl-night.png', { body: await app.page.screenshot(), contentType: 'image/png' });
    expect(await noHorizontalOverflow(app.page), 'φύλλο Ανέμου').toEqual([]);
    for (const b of await sheet(app).locator('.ws-sp').all()) {
      const r = (await b.boundingBox())!;
      expect(Math.min(r.width, r.height), await b.getAttribute('aria-label') ?? '').toBeGreaterThanOrEqual(48);
    }
    const sw = (await sheet(app).locator('.ws-steps').first().boundingBox())!;
    const sr = (await sheet(app).boundingBox())!;
    expect(sw.x + sw.width).toBeLessThanOrEqual(sr.x + sr.width + 1);
    // Night: no white or yellow backgrounds on the sheet
    const bgs = await sheet(app).evaluate((el) =>
      [el, ...el.querySelectorAll<HTMLElement>('*')].map((e) => getComputedStyle(e).backgroundColor).filter((c) => /rgb\((2[0-9]{2}), (2[0-9]{2}), /.test(c)),
    );
    expect(bgs).toEqual([]);
    await app.page.getByRole('button', { name: 'Έτοιμο' }).click();
    expect(await noHorizontalOverflow(app.page), 'Live με χειροκίνητο').toEqual([]);
  });

  test('tablet και laptop: φύλλο στο κέντρο και πλαϊνό πάνελ', async ({ app }) => {
    await signedIn(app);
    await app.startTraining();
    await app.page.setViewportSize({ width: 768, height: 1024 });
    await app.page.getByTestId('wind-prompt').click();
    await expect(sheet(app)).toHaveClass(/mode-center/);
    await test.info().attach('wind-sheet-768.png', { body: await app.page.screenshot(), contentType: 'image/png' });
    await sheet(app).getByRole('button', { name: 'Κλείσιμο' }).click();
    await app.page.setViewportSize({ width: 1280, height: 800 });
    await app.page.getByTestId('wind-prompt').click();
    await expect(sheet(app)).toHaveClass(/mode-side/);
    await test.info().attach('wind-sheet-1280.png', { body: await app.page.screenshot(), contentType: 'image/png' });
    expect(await noHorizontalOverflow(app.page)).toEqual([]);
    // Side panel: the Live stays usable next to it
    await expect(app.page.getByTestId('session-end')).toBeVisible();
  });
});
