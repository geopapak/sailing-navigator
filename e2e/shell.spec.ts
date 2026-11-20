/**
 * P-049 Φ-A (0.19.0): the shell of the refresh (docs/product/specs/P-049-refresh.md A6–A11,
 * A17–A19, K1, K2, K4, K6): light top bar with the boat chip, bottom navigation with the «pill»,
 * side rail on a low landscape screen, the shared sheet frame and the bundled Inter.
 */
import { test, expect, noHorizontalOverflow, type AppFixture } from './fixtures/app';
import { boatItem } from './fixtures/handlers';
import { ASTARTI_LONG } from './fixtures/data/boat-astarti';
import { NO_POLAR } from './fixtures/data/boat-no-polar';
import { boatChip, expectActiveBoat, selectBoat } from './fixtures/boat';

async function signedIn(app: AppFixture) {
  await app.open();
  await app.signIn();
  await expect(app.page.getByTestId('screen-title')).toHaveText('Νέα έξοδος');
}

/** K2: no colour on the page with G or B above 0.6·R (Night is red only). */
async function notRed(app: AppFixture) {
  return app.page.evaluate(() => {
    const out = new Set<string>();
    const props = ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'outlineColor', 'fill', 'stroke'] as const;
    for (const el of [document.documentElement, ...document.querySelectorAll<HTMLElement>('body *')]) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      for (const p of props) {
        const m = (cs[p] as string).match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/);
        if (!m) continue;
        const [R, G, B, A] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
        if (A === 0 || (R === 0 && G === 0 && B === 0)) continue;
        if (G > 0.6 * R + 1 || B > 0.6 * R + 1) out.add(`${p} ${cs[p]} σε ${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`);
      }
    }
    return [...out].slice(0, 8);
  });
}

test.describe('με δύο σκάφη', () => {
  test.use({ scenario: { boats: [boatItem(ASTARTI_LONG), boatItem(NO_POLAR)] } });

  test('A6, A8: ανοιχτή πάνω μπάρα με τσιπ σκάφους που αλλάζει το ενεργό σκάφος', async ({ app }) => {
    const { page } = app;
    await signedIn(app);
    await expectActiveBoat(page, 'e2e-astarti');
    // A8: icon + name + ⌄, the name of the chip in its label; Home's title only for screen readers
    await expect(boatChip(page)).toHaveAccessibleName('Ενεργό σκάφος: Αστάρτη ΙΙ της Αιγίνης. Αλλαγή');
    await expect(boatChip(page)).toContainText('Αστάρτη ΙΙ της Αιγίνης');
    await expect(page.getByTestId('screen-title')).toHaveClass(/sr-only/);
    // A6: light bar outside a session (Μέρα: --surface)
    expect(await page.locator('.topbar').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(242, 244, 247)');

    await boatChip(page).click();
    const sheet = page.getByTestId('boat-sheet');
    await expect(sheet).toBeVisible();
    const group = sheet.getByRole('radiogroup', { name: 'Ενεργό σκάφος' });
    await expect(group.getByRole('radio')).toHaveCount(2);
    await expect(group.getByRole('radio', { name: /Αστάρτη/ })).toHaveAttribute('aria-checked', 'true');
    await expect(group.getByRole('radio', { name: /Ναυτίλος/ })).toHaveAttribute('aria-checked', 'false');
    // A18: ✕ always there, 48 px
    const x = (await sheet.getByRole('button', { name: 'Κλείσιμο' }).boundingBox())!;
    expect(Math.min(x.width, x.height)).toBeGreaterThanOrEqual(48);
    await sheet.getByRole('button', { name: 'Κλείσιμο' }).click();
    await expect(sheet).toHaveCount(0);
    // A18: the focus comes back to the chip
    await expect(boatChip(page)).toBeFocused();

    await selectBoat(page, 'Ναυτίλος');
    await expectActiveBoat(page, 'e2e-no-polar');
    await expect(boatChip(page)).toContainText('Ναυτίλος');

    // «Σκάφη ›» opens the Σκάφη tab
    await boatChip(page).click();
    await page.getByTestId('boat-sheet').getByRole('button', { name: 'Σκάφη ›' }).click();
    await expect(page.getByTestId('screen-title')).toHaveText('Σκάφη');
    await expect(page.getByTestId('screen-title')).not.toHaveClass(/sr-only/);
  });

  test('A8, K1 @narrow: 320 px «Πολύ μεγάλα»: το όνομα κόβεται με «…», χωρίς οριζόντια κύλιση', async ({ app }) => {
    const { page } = app;
    await signedIn(app);
    await expectActiveBoat(page, 'e2e-astarti');
    await app.setSettings({ textSize: 'xl', theme: 'night' });
    await expect(page.locator('html')).toHaveAttribute('data-size', 'xl');
    const name = boatChip(page).locator('.bc-name');
    await expect(name).toHaveCSS('text-overflow', 'ellipsis');
    expect(await noHorizontalOverflow(page)).toEqual([]);
    for (const el of [boatChip(page), page.getByTestId('inst-pill')]) {
      if (!(await el.count())) continue;
      const b = (await el.boundingBox())!;
      expect(b.height, 'στόχος 48 px').toBeGreaterThanOrEqual(48);
      expect(b.x + b.width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
    }
    expect(await notRed(app), 'Νύχτα: μόνο κόκκινο').toEqual([]);
    // QA: «Σκάφη» with two boats at 320 «Πολύ μεγάλα»: the «Επιλογή» row wraps, no sideways scroll
    await app.tab('Σκάφη');
    await expect(page.getByRole('button', { name: 'Επιλογή' }).first()).toBeVisible();
    expect(await noHorizontalOverflow(page), 'Σκάφη 320 xl').toEqual([]);
    for (const b of await page.locator('.boat-head .btn, .btn-row .btn').all()) expect(((await b.boundingBox())!).height).toBeGreaterThanOrEqual(48);
  });
});

test.describe('χωρίς σκάφος', () => {
  test('A8: «Χωρίς σκάφος» ανοίγει τα Σκάφη', async ({ app }) => {
    const { page } = app;
    await signedIn(app).catch(async () => {
      // First run without boats may show the steps; the chip is on Home either way.
    });
    await expect(boatChip(page)).toContainText('Χωρίς σκάφος');
    await expect(boatChip(page)).toHaveAccessibleName('Ενεργό σκάφος: κανένα. Αλλαγή');
    await boatChip(page).click();
    await expect(page.getByTestId('boat-sheet')).toHaveCount(0);
    await expect(page.getByTestId('screen-title')).toHaveText('Σκάφη');
  });
});

test.describe('πλοήγηση και φύλλα', () => {
  test.use({ scenario: { boats: [boatItem()] } });

  test('A5, §7: «Κανονικά» 17 px· το theme-color ακολουθεί το θέμα (και μετά από ανανέωση)', async ({ app }) => {
    const { page } = app;
    await signedIn(app);
    const meta = page.locator('meta[name="theme-color"]');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('17px');
    // Captions never under 13 px (A5)
    const small = await page.evaluate(() => Math.min(...[...document.querySelectorAll('.small, .tab-label')].map((e) => parseFloat(getComputedStyle(e).fontSize))));
    expect(small).toBeGreaterThanOrEqual(13);
    await expect(meta).toHaveAttribute('content', '#f2f4f7');
    // Μέρα → Σούρουπο from the settings, without a reload
    await app.tab('Ρυθμίσεις');
    await page.getByRole('button', { name: 'Σούρουπο', exact: true }).first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(meta).toHaveAttribute('content', '#0b1220');
    // A reload opens with Σούρουπο
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(meta).toHaveAttribute('content', '#0b1220');
    // Inside a session: the session bar colour
    await app.tab('Αρχική');
    await app.startTraining();
    await expect(meta).toHaveAttribute('content', '#7cb4ff');
  });

  test('§4.3: το «χάπι» δεν περνά από το χρώμα του προηγούμενου θέματος', async ({ app }) => {
    const { page } = app;
    await signedIn(app);
    await expectActiveBoat(page, 'e2e-astarti');
    await app.setSettings({ theme: 'night' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
    // Right after the load, no fade: the pill is already black
    const bg = await page.getByRole('navigation').locator('button.on .tab-icon').evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(bg).toBe('rgb(0, 0, 0)');
  });

  test('A10: κάτω πλοήγηση 64 px με «χάπι» στην ενεργή καρτέλα', async ({ app }) => {
    const { page } = app;
    await signedIn(app);
    const nav = page.getByRole('navigation', { name: 'Κύριες οθόνες' });
    await expect(nav.getByRole('button')).toHaveCount(4);
    const home = nav.getByRole('button', { name: 'Αρχική' });
    await expect(home).toHaveAttribute('aria-current', 'page');
    expect(((await home.boundingBox())!).height).toBeGreaterThanOrEqual(64);
    const pill = home.locator('.tab-icon');
    expect(await pill.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(219, 231, 245)');
    expect(await nav.getByRole('button', { name: 'Ιστορικό' }).locator('.tab-icon').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    // The labels always show
    for (const l of ['Αρχική', 'Ιστορικό', 'Σκάφη', 'Ρυθμίσεις']) await expect(nav.getByText(l, { exact: true })).toBeVisible();
  });

  test('A11, A17: οριζόντια χαμηλή οθόνη: πλαϊνή πλοήγηση και πλαϊνό φύλλο, ερώτηση στο κέντρο', async ({ app }) => {
    const { page } = app;
    await signedIn(app);
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('.app')).toHaveAttribute('data-nav', 'side');
    await expectActiveBoat(page, 'e2e-astarti');
    const nav = page.getByRole('navigation', { name: 'Κύριες οθόνες' });
    const nb = (await nav.boundingBox())!;
    expect(nb.x).toBeLessThanOrEqual(1);
    expect(nb.width).toBeLessThanOrEqual(110);
    const main = (await page.locator('main').boundingBox())!;
    expect(main.x).toBeGreaterThanOrEqual(nb.x + nb.width - 1);
    for (const b of await nav.getByRole('button').all()) expect(((await b.boundingBox())!).height).toBeGreaterThanOrEqual(48);
    expect(await noHorizontalOverflow(page)).toEqual([]);

    // The boat sheet is a side panel: not modal, the content stays visible next to it
    await page.getByTestId('boat-chip').click();
    const sheet = page.getByTestId('boat-sheet');
    await expect(sheet).toHaveClass(/mode-side/);
    await expect(sheet).toHaveAttribute('aria-modal', 'false');
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);

    // A confirm stays modal, in the middle
    await app.startTraining();
    await page.getByTestId('session-end').click();
    const ask = page.getByRole('alertdialog', { name: 'Τέλος προπόνησης;' });
    await expect(ask).toBeVisible();
    await expect(ask).toHaveAttribute('aria-modal', 'true');
    const ab = (await ask.boundingBox())!;
    expect(Math.abs(ab.x + ab.width / 2 - 844 / 2)).toBeLessThan(40);
    // Escape = «Συνέχεια»
    await page.keyboard.press('Escape');
    await expect(ask).toHaveCount(0);
    await expect(page.getByTestId('session-end')).toBeVisible();

    // Portrait again: the bottom bar comes back (A19: the shape follows the screen)
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator('.app')).toHaveAttribute('data-nav', 'bottom');
  });

  test('A17, A19: το φύλλο αλλάζει μορφή με το μέγεθος χωρίς να χάνει ό,τι γράφτηκε', async ({ app }) => {
    const { page } = app;
    await signedIn(app);
    await app.startTraining();
    const vp = await page.evaluate(() => [innerWidth, innerHeight, getComputedStyle(document.documentElement).fontSize]);
    test.info().annotations.push({ type: 'viewport', description: JSON.stringify(vp) });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByTestId('wind-prompt').click();
    const sheet = page.getByTestId('wind-sheet');
    await expect(sheet).toHaveClass(/mode-bottom/);
    await expect(sheet.locator('.sh-hdl')).toHaveCount(1);
    const tws = sheet.getByRole('textbox').nth(1);
    await tws.fill('14');
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(sheet).toHaveClass(/mode-center/);
    await expect(sheet.locator('.sh-hdl')).toHaveCount(0);
    await expect(tws).toHaveValue('14');
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(sheet).toHaveClass(/mode-side/);
    await expect(tws).toHaveValue('14');
    // Side panel: no scrim, the Live stays usable
    await expect(page.locator('.sheet-backdrop.mode-side')).toHaveCSS('display', 'contents');
    await expect(page.getByTestId('session-end')).toBeVisible();
  });

  test('K4: με λιγότερη κίνηση το φύλλο ανοίγει χωρίς κίνηση', async ({ app }) => {
    const { page } = app;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signedIn(app);
    // The boats come from the sync: before that the chip opens «Σκάφη» instead of the sheet.
    await expectActiveBoat(page, 'e2e-astarti');
    await page.getByTestId('boat-chip').click();
    await expect(page.getByTestId('boat-sheet')).toHaveCSS('animation-name', 'none');
    await expect(page.getByRole('navigation').locator('.tab-icon').first()).toHaveCSS('transition-duration', '0s');
  });

  test('A3, K6: το κείμενο είναι σε Inter από το build (λατινικά και ελληνικά)', async ({ app }) => {
    const { page } = app;
    await signedIn(app);
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([document.fonts.load('500 16px Inter', 'Αα'), document.fonts.load('500 16px Inter', 'Aa')]);
      return [...document.fonts].filter((f) => f.family.replace(/"/g, '') === 'Inter' && f.status === 'loaded').length;
    });
    expect(fonts).toBe(2);
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/^"?Inter"?,/);
  });
});
