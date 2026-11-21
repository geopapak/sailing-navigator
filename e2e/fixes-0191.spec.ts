/**
 * P-056 fixes for 0.19.1 (Q1): scoring without a certificate (§Α), «no comparison» (§Γ), the crew
 * invite signed out (§Δ), «σε 6′48″» (§Ε), speed from GPS fixes (§ΣΤ), Home without a boat (§Η),
 * step titles (§Ι6), the Live bar (§Ι) and the race's «Βέλτιστη διαδρομή» (§Μ).
 * Real 2026 dates on a fake clock: today Τετ 25/11/2026 14:05, a race on Σάβ 28/11/2026 11:00.
 * Pure rules (Γ4 places, ΣΤ4 max speed, the forecast labels) are in Vitest.
 */
import { test, expect, noHorizontalOverflow, type AppFixture } from './fixtures/app';
import { boatItem, courseItem } from './fixtures/handlers';
import { expectActiveBoat } from './fixtures/boat';
import { ASTARTI } from './fixtures/data/boat-astarti';

const NOW = new Date('2026-11-25T14:05:00+02:00').getTime();
const GPH_ONLY = { ...ASTARTI, id: 'e2e-gph-only', name: 'Γαλήνη', gph: 612, scoring: [] };
const BARE = { ...ASTARTI, id: 'e2e-bare', name: 'Γαλήνη', gph: undefined, scoring: [] };

test.use({ clockStart: NOW });

/** «Παράλειψη όλων» when the first-run steps show (a device without boats). */
async function skipOnboarding(app: AppFixture) {
  const skip = app.page.getByRole('button', { name: 'Παράλειψη όλων' });
  const shown = await skip.waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false);
  if (shown) await skip.click();
}

/** Types a date and a time into a DateTimeField the way a phone keyboard does (digits only). */
async function typeDateTime(app: AppFixture, label: string, date: string, time: string) {
  const g = app.page.getByRole('group', { name: label });
  await g.getByLabel(`${label}, ημερομηνία`).fill('');
  await g.getByLabel(`${label}, ημερομηνία`).pressSequentially(date);
  await g.getByLabel(`${label}, ώρα`).fill('');
  await g.getByLabel(`${label}, ώρα`).pressSequentially(time);
  await g.getByLabel(`${label}, ώρα`).blur();
}

async function newRace(app: AppFixture) {
  await app.open();
  await app.signIn();
  await skipOnboarding(app);
  await app.page.getByRole('button', { name: /^Αγώνας:/ }).click();
  await expect(app.page.getByTestId('screen-title')).toHaveText('Νέος αγώνας');
}

test.describe('§Α βαθμολογία χωρίς πιστοποιητικό', () => {
  test.describe('με GPH μόνο', () => {
    test.use({ scenario: { boats: [boatItem(GPH_ONLY), courseItem()] } });
    test('ΚΑ-Α1, Α3: GPH — ToD προεπιλογή, ToT, «Χωρίς διόρθωση», και ο αγώνας ξεκινά', async ({ app }) => {
      await newRace(app);
      const sel = app.page.getByRole('combobox', { name: 'Βαθμολογία' });
      await expect(sel.locator('option')).toHaveText(['GPH — ToD', 'GPH — ToT', 'Χωρίς διόρθωση (πραγματικός χρόνος)']);
      await expect(sel.locator('option:checked')).toHaveText('GPH — ToD');
      await expect(app.page.getByTestId('scoring-help')).toContainText('διορθωμένος = πραγματικός − GPH × μίλια διαδρομής');
      await expect(app.page.getByTestId('scoring-help')).toContainText('Υπερισχύουν πάντα οι Οδηγίες Πλου.');
      await app.page.getByLabel('Όνομα', { exact: true }).fill('Χειμερινό · 3η');
      await typeDateTime(app, 'Εκκίνηση', '28112026', '1100');
      await app.page.getByRole('button', { name: 'Αποθήκευση και έναρξη' }).click();
      await expect(app.page.getByTestId('session-end')).toBeVisible();
      // ΚΑ-Γ3: no opponents → the place is words, not a number
      await expect(app.page.getByTestId('race-place')).toHaveText('Χωρίς αντιπάλους');
    });
  });

  test.describe('χωρίς GPH και συντελεστές', () => {
    test.use({ scenario: { boats: [boatItem(BARE), courseItem()] } });
    test('ΚΑ-Α2: μόνο «Χωρίς διόρθωση», με «Άνοιξε το σκάφος»', async ({ app }) => {
      await newRace(app);
      const sel = app.page.getByRole('combobox', { name: 'Βαθμολογία' });
      await expect(sel.locator('option')).toHaveText(['Χωρίς διόρθωση (πραγματικός χρόνος)']);
      const hint = app.page.getByTestId('scoring-none-hint');
      await expect(hint).toContainText('Για διορθωμένο χρόνο βάλε GPH ή συντελεστές στο σκάφος.');
      await expect(hint.getByRole('button', { name: 'Άνοιξε το σκάφος' })).toBeVisible();
    });
  });
});

test.describe('§Α4 χωρίς διαδρομή', () => {
  test.use({ scenario: { boats: [boatItem()] } });
  test('ΚΑ-Α4: «Φτιάξε διαδρομή» δίπλα στο μήνυμα, ανοίγει τον επεξεργαστή', async ({ app }) => {
    await newRace(app);
    await expect(app.page.locator('.race-setup')).toContainText('Διάλεξε ή φτιάξε διαδρομή με τουλάχιστον 2 σημεία.');
    await app.page.getByRole('button', { name: 'Φτιάξε διαδρομή' }).click();
    await expect(app.page.getByText('Νέα διαδρομή').first()).toBeVisible();
  });
});

test.describe('§Κ, §Μ στήσιμο αγώνα', () => {
  test.use({ scenario: { boats: [boatItem(), courseItem()] } });

  test('ΚΑ-Κ: ηη/μμ/εεεε + ΩΩ:ΛΛ, «/» και «:» μόνα τους, έλεγχος στην έξοδο', async ({ app }) => {
    await newRace(app);
    const g = app.page.getByRole('group', { name: 'Εκκίνηση' });
    const d = g.getByLabel('Εκκίνηση, ημερομηνία');
    const t = g.getByLabel('Εκκίνηση, ώρα');
    await d.fill('');
    await d.pressSequentially('28112026');
    await expect(d).toHaveValue('28/11/2026');
    await t.fill('');
    await t.pressSequentially('1100');
    await expect(t).toHaveValue('11:00');
    await t.fill('');
    await t.pressSequentially('99');
    await t.blur();
    await expect(g.getByText('Γράψε ώρα όπως 11:00')).toBeVisible();
    await expect(app.page.locator('.race-setup')).toContainText('Βάλε ώρα εκκίνησης.');
    await expect(app.page.getByRole('button', { name: 'Αποθήκευση και έναρξη' })).toBeDisabled();
  });

  test('ΚΑ-Μ: «Βέλτιστη διαδρομή» για Σάβ 28/11 11:00 και «← Αγώνας»', async ({ app }) => {
    await newRace(app);
    await app.page.getByLabel('Όνομα', { exact: true }).fill('Χειμερινό · 3η');
    await typeDateTime(app, 'Εκκίνηση', '28112026', '1100');
    const card = app.page.getByTestId('best-route-card');
    await expect(card).toBeVisible();
    // Open-Meteo is cut off in E2E: no forecast on the device.
    await expect(card.getByTestId('forecast-label').first()).toContainText(/Δεν υπάρχει πρόγνωση για τον αγώνα ακόμα\.|Πρόγνωση για Σάβ 28\/11 11:00/);
    await card.getByTestId('best-route-open').click();
    await expect(app.page.getByTestId('prep-head')).toContainText('Βέλτιστη διαδρομή · Χειμερινό · 3η');
    expect(await noHorizontalOverflow(app.page)).toEqual([]);
    await app.page.getByRole('button', { name: 'Πίσω στον αγώνα' }).click();
    await expect(app.page.getByTestId('screen-title')).toHaveText('Νέος αγώνας');
    await expect(app.page.getByLabel('Όνομα', { exact: true })).toHaveValue('Χειμερινό · 3η');
  });
});

test.describe('§Δ πρόσκληση χωρίς σύνδεση', () => {
  const TOKEN = 'e2e-invite-000000000002';

  test('ΚΑ-Δ1, Δ2, Δ4 (404), Δ5: πλαίσιο, εγγραφή πρώτα, σελίδα σφάλματος', async ({ app }) => {
    await app.open(`/?invite=${TOKEN}`);
    // Δ2: a device that never had an account opens on «Νέος λογαριασμός»
    await expect(app.page.getByRole('heading', { name: 'Νέος λογαριασμός' })).toBeVisible();
    const hint = app.page.getByTestId('invite-hint');
    await expect(hint).toContainText('Άνοιξες πρόσκληση πληρώματος');
    await expect(hint).toContainText('Φτιάξε λογαριασμό ή συνδέσου. Μετά θα δεις ποιο σκάφος σε καλεί και θα αποφασίσεις αν θα μπεις.');
    expect(await app.page.content()).not.toContain(TOKEN);
    await app.page.getByRole('button', { name: 'Σύνδεση', exact: true }).click();
    await expect(app.page.getByTestId('invite-hint')).toBeVisible();
    await app.signIn();
    await skipOnboarding(app);
    // Δ4 (404) and Δ5: its own page, the title, no «Ξανά», «Στην αρχική»
    const page = app.page.getByTestId('invite-error');
    await expect(page.getByRole('heading', { name: 'Πρόσκληση στο πλήρωμα' })).toBeVisible();
    await expect(page).toContainText('Η πρόσκληση δεν βρέθηκε. Ίσως ο σύνδεσμος κόπηκε στο αντίγραφο. Ζήτα νέο σύνδεσμο από τον κυβερνήτη.');
    await expect(page.getByRole('button', { name: 'Ξανά' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Στην αρχική' }).click();
    await expect(app.page.getByTestId('invite-error')).toHaveCount(0);
    expect(await app.page.evaluate(() => localStorage.getItem('pending-invite'))).toBeNull();
  });

  test('ΚΑ-Δ4: 410 κρατά το μήνυμα του server, σφάλμα δικτύου με «Ξανά»', async ({ app }) => {
    let mode: 'gone' | 'net' = 'gone';
    await app.page.route('**/invites/**', (route) =>
      mode === 'gone'
        ? route.fulfill({ status: 410, contentType: 'application/json', body: JSON.stringify({ error: 'Η πρόσκληση έληξε. Ζήτα καινούργια.' }) })
        : route.abort('internetdisconnected'),
    );
    await app.open(`/?invite=${TOKEN}`);
    await app.page.getByRole('button', { name: 'Σύνδεση', exact: true }).click();
    await app.signIn();
    await skipOnboarding(app);
    const err = app.page.getByTestId('invite-error');
    await expect(err).toContainText('Η πρόσκληση έληξε. Ζήτα καινούργια.');
    mode = 'net';
    await app.page.reload();
    await expect(err).toContainText('Δεν φορτώθηκε η πρόσκληση. Έλεγξε το ίντερνετ.');
    await expect(err.getByRole('button', { name: 'Ξανά' })).toBeVisible();
    await expect(err.getByRole('button', { name: 'Στην αρχική' })).toBeVisible();
  });

  test('συσκευή που είχε λογαριασμό: ανοίγει στη «Σύνδεση»· χωρίς ίντερνετ η σύνδεση περιμένει', async ({ app, context }) => {
    await app.open('/');
    await app.page.evaluate(() => localStorage.setItem('had-account', '1'));
    await app.open(`/?invite=${TOKEN}`);
    await expect(app.page.getByTestId('invite-hint')).toBeVisible();
    await expect(app.page.getByRole('button', { name: 'Σύνδεση', exact: true })).toBeEnabled();
    await context.setOffline(true);
    await expect(app.page.getByTestId('auth-offline')).toHaveText('Χωρίς ίντερνετ. Η σύνδεση θέλει ίντερνετ· η πρόσκληση μένει για μετά.');
    await expect(app.page.getByRole('button', { name: 'Σύνδεση', exact: true })).toBeDisabled();
    await context.setOffline(false);
  });
});

test.describe('§Η Αρχική χωρίς σκάφος, §Ι6 τίτλοι βημάτων', () => {
  test('ΚΑ-Ι6: κανένας τίτλος βήματος με αριθμό', async ({ app }) => {
    await app.open();
    await app.signIn();
    const steps = app.page.getByTestId('onboarding');
    await expect(steps).toBeVisible();
    for (let i = 1; i <= 5; i++) {
      await expect(steps.getByRole('img', { name: `Βήμα ${i} από 5` })).toBeVisible();
      await expect(steps.getByRole('heading', { level: 2 }).first()).not.toHaveText(/^\d+\.\s/);
      const next = steps.getByRole('button', { name: /Επόμενο|Συνέχεια/ });
      if (i < 5 && (await next.isVisible().catch(() => false))) await next.click();
      else break;
    }
  });

  test('ΚΑ-Η1–Η3: «Θέλει πρώτα σκάφος», «Καλώς ήρθες», «Πρόσθεσε σκάφος»', async ({ app }) => {
    await app.open();
    await app.signIn();
    await skipOnboarding(app);
    for (const k of ['Αγώνας', 'Προπόνηση']) {
      const card = app.page.getByRole('button', { name: `${k}: Θέλει πρώτα σκάφος` });
      await expect(card).toContainText('Θέλει πρώτα σκάφος');
    }
    await expect(app.page.locator('main')).not.toContainText(/polar/i);
    await expect(app.page.getByText('Για Αγώνα και Προπόνηση χρειάζεται το σκάφος σου: από το πιστοποιητικό ORC ή με το χέρι. Για Αναψυχή μπορείς να ξεκινήσεις και χωρίς.')).toBeVisible();
    await app.page.getByRole('button', { name: 'Αγώνας: Θέλει πρώτα σκάφος' }).click();
    await expect(app.page.getByRole('alertdialog', { name: 'Πρώτα πρόσθεσε το σκάφος σου' })).toBeVisible();
    await app.page.getByRole('button', { name: 'Πρόσθεσε σκάφος' }).click();
    await expect(app.page.getByRole('alertdialog', { name: 'Πρώτα πρόσθεσε το σκάφος σου' })).toHaveCount(0);
    // The new boat form opens (Σκάφη).
    await expect(app.page.getByRole('navigation').getByRole('button', { name: 'Σκάφη', exact: true })).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('§Ε, §Ι Live αγώνα', () => {
  test.use({ scenario: { boats: [boatItem(), courseItem()] } });

  for (const size of ['n', 'xl'] as const) {
    test(`ΚΑ-Ε1, Ι1/Ι3: «σε ·′·″» χωρίς «:», μπάρα χωρίς κομμένες λέξεις (${size})`, async ({ app }) => {
      test.setTimeout(60_000);
      await app.open();
      await app.signIn();
      await app.useSimulator();
      if (size === 'xl') await app.setSettings({ textSize: 'xl' });
      await expectActiveBoat(app.page, 'e2e-astarti');
      await app.page.getByRole('button', { name: /^Αγώνας:/ }).click();
      await app.page.getByLabel('Όνομα', { exact: true }).fill('Χειμερινό · 3η');
      await typeDateTime(app, 'Εκκίνηση', '25112026', '1400');
      await app.page.getByRole('button', { name: 'Αποθήκευση και έναρξη' }).click();
      await app.advance(60_000);
      const screen = app.page.getByRole('region', { name: 'Οθόνη αγώνα' });
      await expect(screen).toBeVisible();
      await expect(screen.locator('.rs-tile .val')).not.toContainText([/\d:\d\d/]);
      const nextIn = screen.getByTestId('next-in');
      if (await nextIn.count()) await expect(nextIn).toHaveText(/^σε\s*(\d+″|\d+′\d\d″|\d+ ώ \d\d′)$/);
      const band = screen.getByTestId('rs-band');
      if (await band.count()) {
        await expect(band).toContainText(/σε \d+′\d\d″|σε \d+″/);
        await expect(band.getByRole('button', { name: 'Σίγαση ειδοποιήσεων για 5 λεπτά' })).toBeVisible();
      }
      const bar = app.page.getByTestId('race-bar');
      await expect(bar).toBeVisible();
      // Never a cut word: each button's text fits its box.
      const cut = await bar.locator('.btn').evaluateAll((bs) => bs.filter((b) => b.scrollWidth > b.clientWidth + 1).length);
      expect(cut).toBe(0);
      // At the end of the scroll the last item is above the bar.
      await app.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const sticky = await bar.evaluate((b) => b.classList.contains('stick'));
      if (sticky) {
        const last = app.page.locator('.race-live > *:last-child');
        const lb = await last.boundingBox();
        const bb = await bar.boundingBox();
        expect(lb && bb && lb.y + lb.height <= bb.y + bb.height).toBeTruthy();
      }
      expect(await noHorizontalOverflow(app.page)).toEqual([]);
    });
  }
});

test.describe('§ΣΤ ταχύτητα από τις θέσεις GPS', () => {
  test.use({ scenario: { boats: [courseItem()] } });
  test('ΚΑ-ΣΤ3: θέσεις χωρίς ταχύτητα → «x,x kt», «xxx°T» και «από τις θέσεις GPS»', async ({ app, context }) => {
    test.setTimeout(90_000);
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 37.9, longitude: 23.66 });
    // Chromium stamps positions with the real time, the test clock is fake: stamp them with the page's clock.
    await context.addInitScript(() => {
      const g = navigator.geolocation;
      const orig = g.watchPosition.bind(g);
      g.watchPosition = (ok, err, o) =>
        orig((p) => ok({ coords: p.coords, timestamp: Date.now(), toJSON: () => ({}) } as GeolocationPosition), err ?? undefined, o);
    });
    await app.open();
    await app.signIn();
    await skipOnboarding(app);
    await app.page.getByRole('button', { name: /^Αναψυχή:/ }).click();
    await app.page.getByRole('button', { name: '● Έναρξη αναψυχής' }).click();
    await expect(app.page.getByTestId('session-end')).toBeVisible();
    // Playwright's positions carry no speed or heading (as many Android phones): north at ~5 kt.
    let lat = 37.9;
    for (let i = 0; i < 8; i++) {
      lat += 0.0004;
      await context.setGeolocation({ latitude: lat, longitude: 23.66 });
      await app.advance(10_000);
    }
    await expect(app.page.getByTestId('sog-from-fixes')).toHaveText('από τις θέσεις GPS');
    await expect(app.page.locator('.session-live .rs-tile').first().locator('.val')).toHaveText(/^\d+,\d\s?kt$/);
    await expect(app.page.getByTestId('cruise-cog')).toHaveText(/^(00\d|35\d)°[TM]$/);
  });
});

/**
 * Open-Meteo answered by the test (the guard cuts it off otherwise): 12 kt from 020° at every grid
 * point, hourly over the asked UTC days. Returns the asked [start_date, end_date] pairs.
 */
async function mockOpenMeteo(app: AppFixture) {
  const asked: { start: string; end: string }[] = [];
  await app.page.route('https://api.open-meteo.com/**', (route) => {
    const u = new URL(route.request().url());
    const start = u.searchParams.get('start_date')!;
    const end = u.searchParams.get('end_date')!;
    asked.push({ start, end });
    const n = (u.searchParams.get('latitude') ?? '').split(',').length;
    const time: number[] = [];
    for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T23:00:00Z`); t += 3_600_000) time.push(t / 1000);
    const loc = () => ({ hourly: { time, wind_speed_10m: time.map(() => 12), wind_direction_10m: time.map(() => 20), wind_gusts_10m: time.map(() => 15) } });
    const body = n === 1 ? loc() : Array.from({ length: n }, loc);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return asked;
}

/** The `planned:*` keys stored on the device. */
const plannedKeys = (app: AppFixture) =>
  app.page.evaluate(
    () =>
      new Promise<string[]>((res) => {
        const r = indexedDB.open('sailing-navigator');
        r.onsuccess = () => {
          const g = r.result.transaction('kv').objectStore('kv').getAllKeys();
          g.onsuccess = () => {
            r.result.close();
            res((g.result as string[]).filter((k) => String(k).startsWith('planned:')));
          };
        };
      }),
  );

test.describe('§Λ, §Μ πρόγνωση για την ώρα του αγώνα (Open-Meteo από το test)', () => {
  test.use({ scenario: { boats: [boatItem(), courseItem()] } });

  test('ΚΑ-Λ1, Λ3, Λ5, Λ11, Λ12, QA Μ2, Μ4: ημερομηνίες αιτήματος, ετικέτα, ορίζοντας, «Ξανά υπολογισμός»', async ({ app }) => {
    test.setTimeout(120_000);
    const asked = await mockOpenMeteo(app);
    await newRace(app);
    await app.page.getByLabel('Όνομα', { exact: true }).fill('Χειμερινό · 3η');
    // Past the 16-day horizon: nothing asked for that day, and the text says when to try again (Λ5).
    await typeDateTime(app, 'Εκκίνηση', '20122026', '1100');
    const card = app.page.getByTestId('best-route-card');
    await expect(card.getByTestId('forecast-label').first()).toHaveText(
      /^Η πρόγνωση φτάνει ως \S+ \d\d\/12\. Ο αγώνας είναι Κυρ 20\/12 11:00: δοκίμασε ξανά από \S+ \d\d\/12, ή διάλεξε «Σταθερός» άνεμο\.$/,
    );
    expect(asked.every((a) => a.end < '2026-12-20')).toBe(true);

    // Σάβ 28/11 11:00 with today Τετ 25/11: the request covers the race day (Λ1).
    await typeDateTime(app, 'Εκκίνηση', '28112026', '1100');
    await card.getByRole('button', { name: /Λήψη πρόγνωσης|Ανανέωση πρόγνωσης/ }).click();
    await expect(card.getByTestId('forecast-label').first()).toHaveText(/^Πρόγνωση για Σάβ 28\/11 11:00 · .+ · λήψη Τετ 25\/11 14:0\d$/);
    const last = asked[asked.length - 1];
    expect(last.start <= '2026-11-25').toBe(true);
    expect(last.end >= '2026-11-28').toBe(true);

    // Λ3, Λ12: the prep map has the same label; compute, back with «← Αγώνας».
    await card.getByTestId('best-route-open').click();
    await expect(app.page.getByTestId('prep-head')).toContainText('Πρόγνωση για Σάβ 28/11 11:00');
    await app.page.getByTestId('plan-compute').click();
    await expect(app.page.getByTestId('plan-result')).toBeVisible({ timeout: 60_000 });
    await app.page.getByRole('button', { name: 'Πίσω στον αγώνα' }).click();
    await expect(card).toContainText(/Υπολογίστηκε Τετ 25\/11 14:\d\d · /);

    // Λ11 + Μ4: another start → the route is for another time, with «Ξανά υπολογισμός».
    await typeDateTime(app, 'Εκκίνηση', '28112026', '1130');
    await expect(card).toContainText('Η διαδρομή υπολογίστηκε για άλλη ώρα ή διαδρομή');
    await card.getByTestId('best-route-again').click();
    await expect(card).toContainText(/Υπολογίστηκε Τετ 25\/11 14:\d\d · /, { timeout: 60_000 });
    await expect(card.getByTestId('best-route-again')).toHaveCount(0);

    // QA Μ2: a download without a race (the «Καιρός» card) does not cut Saturday off.
    await app.page.locator('.topbar').getByRole('button', { name: 'Πίσω' }).click();
    await app.page.getByRole('button', { name: /^Αναψυχή:/ }).click();
    const n0 = asked.length;
    await app.page.getByRole('button', { name: 'Ανανέωση πρόγνωσης' }).click();
    await expect.poll(() => asked.length).toBeGreaterThan(n0);
    expect(asked[asked.length - 1].end >= '2026-11-30').toBe(true);
  });

  test('QA Σ1: το «←» της κεφαλίδας κλείνει μόνο τον χάρτη προετοιμασίας· χωρίς αποθήκευση δεν μένει διαδρομή', async ({ app }) => {
    test.setTimeout(120_000);
    await newRace(app);
    await app.page.getByLabel('Όνομα', { exact: true }).fill('Χειμερινό · 3η');
    await typeDateTime(app, 'Εκκίνηση', '28112026', '1100');
    await app.page.getByTestId('best-route-open').click();
    await expect(app.page.getByTestId('prep-head')).toBeVisible();
    // «Σταθερός» wind: a route without a forecast.
    await app.page.getByRole('button', { name: 'Σταθερός', exact: true }).click();
    await app.page.getByTestId('plan-compute').click();
    await expect(app.page.getByTestId('plan-result')).toBeVisible({ timeout: 60_000 });
    const back = app.page.locator('.topbar').getByRole('button', { name: 'Πίσω' });
    await back.click();
    await expect(app.page.getByTestId('screen-title')).toHaveText('Νέος αγώνας');
    await expect(app.page.getByLabel('Όνομα', { exact: true })).toHaveValue('Χειμερινό · 3η');
    await expect(app.page.getByTestId('best-route-card')).toContainText(/Υπολογίστηκε/);
    expect(await plannedKeys(app)).toHaveLength(1);
    // Leaving the unsaved race: no `planned:<id>` stays on the device.
    await back.click();
    await expect(app.page.getByTestId('screen-title')).toHaveText('Νέα έξοδος');
    await expect.poll(() => plannedKeys(app)).toEqual([]);
  });
});

test.describe('QA Μ9: εγγραφή με πρόσκληση χωρίς ίντερνετ', () => {
  test('η ίδια λωρίδα «Χωρίς ίντερνετ» και στον «Νέο λογαριασμό»', async ({ app, context }) => {
    await app.open('/?invite=e2e-invite-000000000003');
    await expect(app.page.getByRole('heading', { name: 'Νέος λογαριασμός' })).toBeVisible();
    await context.setOffline(true);
    await expect(app.page.getByTestId('auth-offline')).toHaveText('Χωρίς ίντερνετ. Η σύνδεση θέλει ίντερνετ· η πρόσκληση μένει για μετά.');
    await expect(app.page.getByRole('button', { name: 'Δημιουργία λογαριασμού' })).toBeDisabled();
    await context.setOffline(false);
    await expect(app.page.getByTestId('auth-offline')).toHaveCount(0);
  });
});

test.describe('QA ΚΑ-Ι2: 390×844 μετά την ενεργοποίηση ήχου', () => {
  test.use({ scenario: { boats: [boatItem(), courseItem()] }, viewport: { width: 390, height: 844 } });
  test('η μπάρα γίνεται σταθερή, ≤ 72 px, και δεν σκεπάζει νούμερα', async ({ app }) => {
    test.setTimeout(60_000);
    await app.open();
    await app.signIn();
    await app.useSimulator();
    await app.page.getByRole('button', { name: /^Αγώνας:/ }).click();
    await app.page.getByLabel('Όνομα', { exact: true }).fill('Χειμερινό · 3η');
    await typeDateTime(app, 'Εκκίνηση', '25112026', '1400');
    await app.page.getByRole('button', { name: 'Αποθήκευση και έναρξη' }).click();
    await app.advance(60_000);
    const sound = app.page.getByRole('button', { name: 'Ενεργοποίηση ήχου' });
    if (await sound.count()) await sound.click();
    await expect(sound).toHaveCount(0);
    const bar = app.page.getByTestId('race-bar');
    await expect(bar).toHaveClass(/\bstick\b/);
    await app.page.evaluate(() => window.scrollTo(0, 0));
    const bb = (await bar.boundingBox())!;
    expect(bb.height).toBeLessThanOrEqual(72);
    const boxes = await app.page
      .locator('.race-screen .rs-tile .val, .race-screen .rs-next, .race-screen .wind-card')
      .evaluateAll((els) => els.map((e) => ({ top: e.getBoundingClientRect().top, bottom: e.getBoundingClientRect().bottom })));
    for (const box of boxes) expect(box.bottom > bb.y + 1 && box.top < bb.y + bb.height - 1, `σκεπάζει ${JSON.stringify(box)}`).toBe(false);
  });
});

test.describe('QA ΚΑ-Κ2–Κ6: μορφές σε αγγλικό browser', () => {
  test.use({ scenario: { boats: [boatItem(), courseItem()] }, locale: 'en-US', timezoneId: 'Europe/Athens' });
  test('χωρίς «x.y» σε νούμερα, χωρίς AM/PM, ημερομηνία ηη/μμ/εεεε', async ({ app }) => {
    test.setTimeout(90_000);
    const visible = () =>
      app.page.evaluate(() => {
        const out: string[] = [];
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          const el = n.parentElement;
          if (!el || !el.checkVisibility()) continue;
          const t = n.textContent ?? '';
          if (/\d\.\d/.test(t) || /\b(AM|PM)\b/.test(t)) out.push(t.trim());
        }
        for (const i of Array.from(document.querySelectorAll('input'))) if (/\b(AM|PM)\b/.test(i.value)) out.push(i.value);
        return out;
      });
    await app.open();
    await app.signIn();
    await app.useSimulator();
    expect(await visible()).toEqual([]);
    await app.page.getByRole('button', { name: /^Αγώνας:/ }).click();
    const g = app.page.getByRole('group', { name: 'Εκκίνηση' });
    await expect(g.getByLabel('Εκκίνηση, ημερομηνία')).toHaveValue(/^\d\d\/\d\d\/\d{4}$/);
    await expect(g.getByLabel('Εκκίνηση, ώρα')).toHaveValue(/^\d\d:\d\d$/);
    expect(await visible()).toEqual([]);
    await app.page.getByLabel('Όνομα', { exact: true }).fill('Χειμερινό · 3η');
    await typeDateTime(app, 'Εκκίνηση', '25112026', '1400');
    await app.page.getByRole('button', { name: 'Αποθήκευση και έναρξη' }).click();
    await app.advance(90_000);
    expect(await visible()).toEqual([]);
    await app.tab('Χάρτης');
    await expect(app.page.locator('.maplibregl-ctrl-scale')).toHaveText(/^\d+(,\d+)?\s?NM$/, { timeout: 15_000 });
    expect(await visible()).toEqual([]);
    await app.tab('Live');
    await app.page.locator('.race-live').getByRole('button', { name: 'Τερματισμός', exact: true }).click();
    await app.page.getByRole('button', { name: 'Ναι, τερματίσαμε' }).click();
    await expect(app.page.getByTestId('screen-title')).toHaveText('Η έξοδος τελείωσε');
    expect(await visible()).toEqual([]);
    await app.tab('Ιστορικό');
    await expect(app.page.getByTestId('history-item').first()).toBeVisible();
    expect(await visible()).toEqual([]);
    await expect(app.page.getByTestId('history-item').first()).not.toContainText('0 αναστροφές');
  });
});

test.describe('QA Μ1, Μ7: στενή οθόνη, «Πολύ μεγάλα»', () => {
  test.use({ scenario: { boats: [boatItem(), courseItem()] } });

  test('Μ1: 320×568, η σύνοψη της διαδρομής χωράει (ΚΑ-Μ6)', async ({ app }) => {
    test.setTimeout(120_000);
    await app.page.setViewportSize({ width: 320, height: 568 });
    await app.open();
    await app.signIn();
    await expectActiveBoat(app.page, 'e2e-astarti');
    await app.setSettings({ textSize: 'xl' });
    await expectActiveBoat(app.page, 'e2e-astarti');
    await app.page.getByRole('button', { name: /^Αγώνας:/ }).click();
    await app.page.getByLabel('Όνομα', { exact: true }).fill('Χειμερινό Σαρωνικού · 3η ιστιοδρομία της σεζόν');
    await typeDateTime(app, 'Εκκίνηση', '28112026', '1100');
    await app.page.getByTestId('best-route-open').click();
    await app.page.getByRole('button', { name: 'Σταθερός', exact: true }).click();
    await app.page.getByTestId('plan-compute').click();
    await expect(app.page.locator('.summary-grid')).toBeVisible({ timeout: 60_000 });
    expect(await noHorizontalOverflow(app.page)).toEqual([]);
  });

  test('Μ7: «Γρήγορες ρυθμίσεις» στα 375 px, καμία λέξη κομμένη στη μέση', async ({ app }) => {
    test.setTimeout(60_000);
    await app.open();
    await app.signIn();
    await expectActiveBoat(app.page, 'e2e-astarti');
    await app.setSettings({ textSize: 'xl' });
    await expectActiveBoat(app.page, 'e2e-astarti');
    await app.startTraining();
    await app.page.getByRole('button', { name: 'Γρήγορες ρυθμίσεις' }).click();
    for (const name of ['Θέμα', 'Ένταση']) {
      const lines = await app.page
        .getByRole('group', { name, exact: true })
        .locator('button')
        .evaluateAll((bs) =>
          bs.map((b) => {
            // Lines of each word: a word on two lines is a broken word.
            const out: string[] = [];
            const t = b.firstChild;
            if (!t || t.nodeType !== Node.TEXT_NODE) return out;
            const text = t.textContent ?? '';
            let i = 0;
            for (const w of text.split(' ')) {
              const r = document.createRange();
              r.setStart(t, i);
              r.setEnd(t, i + w.length);
              const tops = new Set(Array.from(r.getClientRects()).map((x) => Math.round(x.top)));
              if (tops.size > 1) out.push(w);
              i += w.length + 1;
            }
            return out;
          }),
        );
      expect(lines.flat(), name).toEqual([]);
    }
    expect(await noHorizontalOverflow(app.page)).toEqual([]);
  });
});
