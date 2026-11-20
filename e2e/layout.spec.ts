/**
 * Flow 6 (layout part), criteria 54–56: no horizontal scroll and no bar button out of
 * the screen on the main screens. «Νύχτα» + «Πολύ μεγάλα» at 320 px (@narrow-only,
 * projects chromium-320 / webkit-320); «Μέρα» and «Σούρουπο» at 375 px. Long Greek names.
 * Screenshots are attached for diagnosis only (no image comparison in v1).
 */
import { test, expect, noHorizontalOverflow, type AppFixture } from './fixtures/app';
import { boatItem, courseItem } from './fixtures/handlers';
import { ASTARTI_LONG } from './fixtures/data/boat-astarti';
import { LONG_RACE_NAME } from './fixtures/data/course-saronic';
import { expectActiveBoat } from './fixtures/boat';

test.use({ scenario: { boats: [boatItem(ASTARTI_LONG), courseItem()] } });

type Theme = 'day' | 'dark' | 'night';

/** Dark background and no white primary buttons in «Νύχτα» (criterion 55). */
async function nightColours(app: AppFixture) {
  return app.page.evaluate(() => {
    const rgb = (c: string) => (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
    const lum = (c: string) => {
      const [r, g, b] = rgb(c);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    const out: string[] = [];
    const bg = getComputedStyle(document.body).backgroundColor;
    if (lum(bg) > 0.2) out.push(`φωτεινό φόντο body: ${bg}`);
    for (const b of document.querySelectorAll<HTMLElement>('.btn.primary')) {
      const c = getComputedStyle(b).backgroundColor;
      if (rgb(c).every((x) => x > 240)) out.push(`λευκό κύριο κουμπί «${b.textContent?.trim()}»`);
    }
    return out;
  });
}

async function check(app: AppFixture, theme: Theme, screen: string) {
  await app.page.waitForTimeout(100);
  await test.info().attach(`${theme}-${screen}.png`, { body: await app.page.screenshot({ fullPage: true }), contentType: 'image/png' });
  expect(await noHorizontalOverflow(app.page), `${screen}: οριζόντια κύλιση`).toEqual([]);
  if (theme === 'night') {
    await expect(app.page.locator('html')).toHaveAttribute('data-theme', 'night');
    expect(await nightColours(app), `${screen}: χρώματα Νύχτας`).toEqual([]);
  }
}

async function walk(app: AppFixture, theme: Theme, size: 'n' | 'xl') {
  const { page } = app;
  await app.open();
  await app.signIn();
  await expectActiveBoat(page, 'e2e-astarti');
  await app.setSettings({ theme, textSize: size });
  await expect(page.locator('html')).toHaveAttribute('data-size', size);
  await app.useSimulator();
  await check(app, theme, 'nea-exodos');

  await app.tab('Ρυθμίσεις');
  await check(app, theme, 'rythmiseis');
  await app.tab('Αρχική');

  // Νέος αγώνας with a 60+ character name, then its Live
  await page.getByRole('button', { name: /^Αγώνας:/ }).click();
  await page.getByLabel('Όνομα', { exact: true }).fill(LONG_RACE_NAME);
  await page.getByLabel('Εκκίνηση', { exact: true }).fill('2026-11-14T10:01');
  await check(app, theme, 'neos-agonas');
  await page.getByRole('button', { name: 'Αποθήκευση και έναρξη' }).click();
  await app.advance(2 * 60_000);
  await expect(page.getByRole('region', { name: 'Οθόνη αγώνα' })).toBeVisible();
  await check(app, theme, 'live-agona');
  await page.getByTestId('session-end').click();
  await page.getByRole('button', { name: 'Ναι, τερματίσαμε' }).click();
  await app.advance(11_000, 1000);
  await page.getByRole('button', { name: 'Στο Ιστορικό' }).click();
  await app.tab('Αρχική');

  // Training Live with laps, then its summary with the laps table
  await app.startTraining();
  for (let i = 0; i < 3; i++) {
    await app.advance(60_000);
    await page.getByTestId('lap-button').click();
  }
  await app.advance(6000, 1000);
  await expect(page.getByTestId('lap-list')).toContainText('Γύρος 3');
  await check(app, theme, 'live-proponisis');
  await page.getByTestId('session-end').click();
  await page.getByRole('button', { name: 'Ναι, τέλος' }).click();
  await expect(page.getByTestId('laps-table')).toBeVisible();
  await check(app, theme, 'synopsi-proponisis');
}

test('54–55 @narrow-only: «Νύχτα» και «Πολύ μεγάλα» στα 320 px, χωρίς οριζόντια κύλιση', async ({ app }) => {
  test.setTimeout(process.env.CI ? 180_000 : 90_000); // CI chromium-320 timed out at 90″ (16″ locally)
  await walk(app, 'night', 'xl');
});

for (const theme of ['day', 'dark'] as const) {
  test(`56: «${theme === 'day' ? 'Μέρα' : 'Σούρουπο'}» στα 375 px, χωρίς οριζόντια κύλιση`, async ({ app }) => {
    test.setTimeout(90_000);
    await walk(app, theme, 'n');
  });
}
