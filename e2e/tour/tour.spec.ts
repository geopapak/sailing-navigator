/**
 * Visual tour (usability study input): every flow of the app as numbered screenshots, each
 * with a Greek caption file and the page's visible text. Runs only under
 * e2e/tour/playwright.tour.config.ts (see README.md), never in `npm run e2e` / CI.
 * Same fixtures as the E2E suite: fake Worker, network guard, fake clock, simulator,
 * made-up user. No AI route is allowed: the AI buttons are shown, never pressed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { test, expect, type AppFixture } from '../fixtures/app';
import { test as swTest, expect as swExpect } from '../fixtures/sw';
import { boatItem, courseItem } from '../fixtures/handlers';
import { NO_POLAR } from '../fixtures/data/boat-no-polar';
import { COURSE } from '../fixtures/data/course-saronic';
import { NEW_EMAIL, TEST_PASSWORD, USER } from '../fixtures/data/user';
import { boatChip, expectActiveBoat, selectBoat } from '../fixtures/boat';
import { UPDATE_TEXT } from '../../src/pwa/updateText';
import { tourOut } from './out';

test.skip(!process.env.SN_TOUR, 'Μόνο με το e2e/tour/playwright.tour.config.ts');
swTest.skip(!process.env.SN_TOUR, 'Μόνο με το e2e/tour/playwright.tour.config.ts');

const OUT = tourOut();
mkdirSync(OUT, { recursive: true });
const MIN = 60_000;
const RIVAL = { ...NO_POLAR, isOwn: false };
const pad = (n: number) => String(n).padStart(2, '0');

const FLOWS: Record<number, string> = {
  1: 'Ροή 1 · Πρώτη επίσκεψη, εγγραφή, όροι, πρώτα βήματα',
  2: 'Ροή 2 · Σύνδεση',
  3: 'Ροή 3 · Αρχική χωρίς τίποτα',
  4: 'Ροή 4 · Προσθήκη σκάφους, τσιπ και «Ενεργό σκάφος»',
  5: 'Ροή 5 · Ρυθμίσεις',
  6: 'Ροή 6 · Γρήγορη ματιά και χειροκίνητος άνεμος',
  7: 'Ροή 7 · Αγώνας: στήσιμο, Live, τερματισμός, σύνοψη, ανάλυση',
  8: 'Ροή 8 · Προπόνηση',
  9: 'Ροή 9 · Αναψυχή',
  10: 'Ροή 10 · Διοργάνωση (πολλές ιστιοδρομίες)',
  11: 'Ροή 11 · Ιστορικό',
  12: 'Ροή 12 · Πλήρωμα και κοινοποίηση',
  13: 'Ροή 13 · Σύμβουλος (χωρίς κλήση AI)',
  14: 'Ροή 14 · Χάρτης',
  15: 'Ροή 15 · Χωρίς ίντερνετ',
  16: 'Ροή 16 · Νέα έκδοση',
  17: 'Ροή 17 · Παραλλαγές: 320 «Πολύ μεγάλα», Νύχτα, tablet 768',
};

/** Numbered screenshots of one flow; `start` keeps the numbers apart when a flow spans tests. */
class Tour {
  private n: number;
  private missing: string[] = [];
  constructor(
    private page: Page,
    private flow: number,
    private tag: string,
    start = 0,
    private prefix = '',
  ) {
    this.n = start;
  }

  async shot(slug: string, caption: string, opts: { at?: Locator; full?: boolean; top?: boolean } = {}) {
    this.n += 1;
    const base = `${pad(this.flow)}-${pad(this.n)}-${this.prefix}${slug}`;
    try {
      if (opts.top) await this.page.evaluate(() => window.scrollTo(0, 0));
      if (opts.at) await opts.at.first().scrollIntoViewIfNeeded({ timeout: 5000 });
      await this.page.waitForTimeout(250);
      await this.page.screenshot({ path: join(OUT, `${base}.png`), fullPage: !!opts.full, animations: 'disabled', caret: 'hide' });
      const text = await this.page.evaluate(() => document.body.innerText);
      writeFileSync(join(OUT, `${base}.text.txt`), text, 'utf8');
      writeFileSync(join(OUT, `${base}.caption.txt`), `${caption}\n${FLOWS[this.flow]}\n`, 'utf8');
    } catch (e) {
      this.note(`${base}: δεν τραβήχτηκε (${(e as Error).message.split('\n')[0]})`);
    }
  }

  /** The whole screen in viewport-sized steps (long pages), at most `max` shots. */
  async scroll(slug: string, caption: string, max = 4) {
    await this.page.evaluate(() => window.scrollTo(0, 0));
    const [h, total] = await this.page.evaluate(() => [innerHeight, document.documentElement.scrollHeight]);
    const steps = Math.min(max, Math.max(1, Math.ceil((total - 40) / (h * 0.8))));
    for (let i = 0; i < steps; i++) {
      await this.page.evaluate((y) => window.scrollTo(0, y), Math.round(i * h * 0.8));
      await this.shot(`${slug}-${i + 1}`, steps > 1 ? `${caption} (${i + 1}/${steps})` : caption);
    }
    await this.page.evaluate(() => window.scrollTo(0, 0));
  }

  /** A step that may not be reachable: it is noted, the flow goes on. */
  async soft(label: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      this.note(`${label}: ${(e as Error).message.split('\n')[0]}`);
    }
  }

  note(line: string) {
    line = line.replace(/\u001b\[[0-9;]*m/g, '');
    this.missing.push(`${FLOWS[this.flow]} · ${line}`);
    writeFileSync(join(OUT, `${pad(this.flow)}-${this.tag}.missing.txt`), this.missing.join('\n') + '\n', 'utf8');
  }
}

async function signedIn(app: AppFixture, boat?: string) {
  await app.open();
  await app.signIn();
  if (boat) await expectActiveBoat(app.page, boat);
}

async function skipSteps(app: AppFixture) {
  await app.page.getByRole('button', { name: 'Παράλειψη όλων' }).click();
  await expect(app.page.getByRole('heading', { name: 'Τι κάνουμε σήμερα;' })).toBeVisible();
}

async function startRace(page: Page, name: string, start = '2026-11-14T10:02') {
  await page.getByRole('button', { name: /^Αγώνας:/ }).click();
  await page.getByLabel('Όνομα', { exact: true }).fill(name);
  await page.getByLabel('Εκκίνηση', { exact: true }).fill(start);
  await page.getByRole('button', { name: 'Αποθήκευση και έναρξη' }).click();
  await expect(page.getByTestId('session-end')).toBeVisible();
}

/** Lets the map draw (the fake clock also holds requestAnimationFrame). */
async function letMapDraw(app: AppFixture) {
  for (let i = 0; i < 20; i++) {
    await app.page.clock.runFor(100);
    await app.page.waitForTimeout(40);
  }
}

/** Five finished races of an event, written straight into the device database (as in events.spec.ts). */
async function seedEvent(page: Page) {
  await page.evaluate(async () => {
    const DAY = 86_400_000;
    const t0 = new Date('2026-11-01T11:00:00+02:00').getTime();
    const sc = [{ id: 'coastal', label: 'Coastal', tod: 600, tot: 1 }];
    const names = ['Αστάρτη', 'Μελτέμι του Σαρωνικού', 'Γαλήνη Τρίτη', 'Ζέφυρος ο Αργοναύτης', 'Ναυσικά'];
    const entries = names.map((n, i) => ({ id: i ? `o${i}` : 'own', name: n, sailNo: `GRE-${100 + i}`, own: i === 0, source: i ? 'boats' : 'own', boat: { scoring: sc } }));
    const races = [0, 1, 2, 3, 4].map((d) => ({
      id: `ev-r${d}`,
      name: `Ιστιοδρομία ${d + 1}`,
      kind: 'race',
      eventId: 'ev-long',
      marks: [],
      start: t0 + d * DAY,
      finish: t0 + d * DAY + 3 * 3600_000,
      scoringOptionId: 'coastal',
      method: 'ToT',
      entries,
      status: 'finished',
      track: [],
      fixes: [],
      results: Object.fromEntries(entries.filter((e) => !(d === 4 && e.id === 'o3')).map((e, i) => [e.id, 9000 + ((i + d) % 5) * 120])),
      resultCodes: d === 2 ? { o4: 'DNF' } : {},
      estAtFinish: d === 4 ? { o3: 9300 } : {},
      updatedAt: t0 + d * DAY,
    }));
    const event = { id: 'ev-long', name: 'Χειμερινό Πρωτάθλημα Σαρωνικού 2026', scoring: 'points', discards: 1, discardFrom: 4, status: 'open', createdAt: t0, updatedAt: t0 };
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('sailing-navigator');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const tx = db.transaction(['races', 'events'], 'readwrite');
    for (const r of races) tx.objectStore('races').put(r);
    tx.objectStore('events').put(event);
    await new Promise((res) => (tx.oncomplete = res));
    db.close();
  });
}

async function typeWind(page: Page, field: RegExp, value: string) {
  const input = page.getByTestId('wind-sheet').getByRole('textbox', { name: field });
  await input.fill(value);
  await input.press('Enter');
}

// ───────────────────────────── 1. First visit, sign-up, terms, carousel
test('01 πρώτη επίσκεψη, εγγραφή, όροι, καρουζέλ', async ({ app }) => {
  const { page } = app;
  const t = new Tour(page, 1, 'a');
  await app.open();
  await expect(page.getByRole('button', { name: 'Σύνδεση', exact: true })).toBeVisible();
  await t.shot('first-visit-login', 'Πρώτη επίσκεψη: η οθόνη σύνδεσης σε καθαρό browser');
  await page.getByRole('button', { name: 'Νέος λογαριασμός' }).click();
  await expect(page.getByRole('heading', { name: 'Νέος λογαριασμός' })).toBeVisible();
  await t.shot('signup-empty', 'Νέος λογαριασμός: κενή φόρμα με τα δύο υποχρεωτικά κουτάκια');
  await t.soft('όροι χρήσης', async () => {
    await page.getByRole('button', { name: 'Όρους χρήσης' }).first().click();
    await t.shot('terms', 'Όροι χρήσης (άνοιξαν από την εγγραφή)');
    await t.shot('terms-full', 'Όροι χρήσης: ολόκληρη η σελίδα', { full: true });
    await page.locator('.auth-back').first().click();
  });
  await t.soft('πολιτική απορρήτου', async () => {
    await page.getByRole('button', { name: /απορρήτου/i }).first().click();
    await t.shot('privacy', 'Πολιτική απορρήτου (από την εγγραφή)');
    await page.locator('.auth-back').first().click();
  });
  await expect(page.getByRole('heading', { name: 'Νέος λογαριασμός' })).toBeVisible();
  await page.getByLabel('Όνομα').fill('Νέο Μέλος');
  await page.getByRole('textbox', { name: 'Email' }).fill(NEW_EMAIL);
  await page.getByLabel('Κωδικός').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Δημιουργία λογαριασμού' }).click({ force: true });
  await expect(page.getByText('Τσέκαρε τους όρους και την πολιτική απορρήτου για να συνεχίσεις.')).toBeVisible();
  await t.shot('signup-no-consent', 'Εγγραφή χωρίς τα κουτάκια: το μήνυμα που εξηγεί τι λείπει');
  await page.getByRole('checkbox', { name: /Αποδέχομαι τους/ }).check();
  await page.getByRole('checkbox', { name: /Διάβασα την/ }).check();
  await t.shot('signup-ready', 'Εγγραφή: συμπληρωμένη φόρμα, έτοιμη για «Δημιουργία λογαριασμού»', { at: page.getByRole('button', { name: 'Δημιουργία λογαριασμού' }) });
  await page.getByRole('button', { name: 'Δημιουργία λογαριασμού' }).click();

  const carousel = page.getByTestId('onboarding');
  await expect(carousel.getByRole('img', { name: 'Βήμα 1 από 5' })).toBeVisible();
  await t.shot('onboarding-1', 'Πρώτα βήματα 1/5: καλωσόρισμα');
  for (const [label, step] of [
    ['Ξεκινάμε', 2],
    ['Επόμενο', 3],
    ['Το έκανα', 4],
    ['Επόμενο', 5],
  ] as const) {
    await carousel.getByRole('button', { name: label, exact: true }).click();
    await expect(carousel.getByRole('img', { name: `Βήμα ${step} από 5` })).toBeVisible();
    await t.shot(`onboarding-${step}`, `Πρώτα βήματα ${step}/5 (μετά από «${label}»)`, { top: true });
  }
  await carousel.getByRole('button', { name: 'Αργότερα', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Τι κάνουμε σήμερα;' })).toBeVisible();
  await t.shot('home-after-steps', 'Η Αρχική μετά τα πρώτα βήματα («Αργότερα»)');
});

test.describe('νέοι όροι', () => {
  test.use({ scenario: { user: { ...USER, termsOk: false } } });
  test('01b αποδοχή νέων όρων μετά τη σύνδεση', async ({ app }) => {
    const t = new Tour(app.page, 1, 'b', 20);
    await signedIn(app);
    await expect(app.page.getByRole('heading', { name: 'Νέοι όροι χρήσης' })).toBeVisible();
    await t.shot('new-terms', 'Νέοι όροι χρήσης: πρέπει να γίνουν αποδεκτοί πριν συνεχίσεις');
    await app.page.getByRole('checkbox', { name: /Αποδέχομαι τους/ }).check();
    await app.page.getByRole('checkbox', { name: /Συναινώ στην/ }).check();
    await t.shot('new-terms-checked', 'Νέοι όροι: τσεκαρισμένα, έτοιμο το «Συνέχεια»', { at: app.page.getByRole('button', { name: 'Συνέχεια' }) });
  });
});

test.describe('προσωρινός κωδικός', () => {
  test.use({ scenario: { user: { ...USER, mustChangePassword: true } } });
  test('01c νέος κωδικός μετά από προσωρινό', async ({ app }) => {
    const t = new Tour(app.page, 1, 'c', 30);
    await signedIn(app);
    await expect(app.page.getByRole('heading', { name: 'Βάλε δικό σου κωδικό' })).toBeVisible();
    await t.shot('set-password', 'Μετά από προσωρινό κωδικό: «Βάλε δικό σου κωδικό»');
  });
});

// ───────────────────────────── 2. Sign-in
test('02 σύνδεση', async ({ app }) => {
  const { page, server } = app;
  const t = new Tour(page, 2, 'a');
  await app.open();
  await page.getByRole('textbox', { name: 'Email' }).fill(USER.email);
  await page.getByLabel('Κωδικός').fill(TEST_PASSWORD);
  await t.shot('login-filled', 'Σύνδεση: συμπληρωμένα email και κωδικός (κρυφός)');
  server.set({ login: '401' });
  await page.getByRole('button', { name: 'Σύνδεση', exact: true }).click();
  await expect(page.getByText('Λάθος email ή κωδικός.')).toBeVisible();
  await t.shot('login-wrong', 'Σύνδεση με λάθος κωδικό: «Λάθος email ή κωδικός.»');
  server.set({ login: 'abort' });
  await page.getByLabel('Κωδικός').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Σύνδεση', exact: true }).click();
  await t.soft('σφάλμα δικτύου', async () => {
    await expect(page.getByText(/Δεν απαντά η υπηρεσία/)).toBeVisible();
    await t.shot('login-network', 'Σύνδεση χωρίς απάντηση από την υπηρεσία: μήνυμα σφάλματος δικτύου');
  });
  await t.soft('ξέχασα τον κωδικό', async () => {
    await page.getByRole('button', { name: 'Ξέχασα τον κωδικό' }).click();
    await t.shot('forgot', '«Ξέχασα τον κωδικό»');
    await page.locator('.auth-back').first().click();
  });
  server.set({ login: 'ok' });
  await page.getByRole('textbox', { name: 'Email' }).fill(USER.email);
  await page.getByLabel('Κωδικός').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Σύνδεση', exact: true }).click();
  await expect(page.getByTestId('onboarding')).toBeVisible();
  await t.shot('signed-in', 'Μετά τη σύνδεση (χωρίς σκάφος): τα πρώτα βήματα');
});

// ───────────────────────────── 3. Home empty
test('03 αρχική χωρίς τίποτα', async ({ app }) => {
  const { page } = app;
  const t = new Tour(page, 3, 'a');
  await signedIn(app);
  await skipSteps(app);
  await t.shot('home-empty', 'Αρχική χωρίς σκάφος και χωρίς εξόδους');
  await t.scroll('home-empty-scroll', 'Αρχική χωρίς τίποτα, όλη η σελίδα');
  await page.getByRole('button', { name: /^Αγώνας:/ }).click();
  await t.soft('αγώνας χωρίς σκάφος', async () => {
    await expect(page.getByText('Πρώτα πρόσθεσε το σκάφος σου')).toBeVisible();
    await t.shot('race-needs-boat', '«Αγώνας» χωρίς σκάφος: «Πρώτα πρόσθεσε το σκάφος σου»');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Εντάξει' }).click();
  });
  await app.tab('Ιστορικό').catch(async () => {
    await page.locator('.topbar').getByRole('button', { name: 'Πίσω' }).click();
    await app.tab('Ιστορικό');
  });
  await t.shot('history-empty', 'Ιστορικό χωρίς εξόδους');
});

// ───────────────────────────── 4. Add a boat
test('04 προσθήκη σκάφους', async ({ app }) => {
  const { page } = app;
  const t = new Tour(page, 4, 'a');
  await signedIn(app);
  await skipSteps(app);
  await t.shot('chip-no-boat', 'Αρχική: τσιπ «Χωρίς σκάφος» στην πάνω μπάρα', { at: boatChip(page) });
  await app.tab('Σκάφη');
  await expect(page.getByRole('heading', { name: 'Πρόσθεσε το σκάφος σου' })).toBeVisible();
  await t.shot('boats-chooser', 'Σκάφη: οι τρεις τρόποι να προστεθεί σκάφος');
  await page.getByRole('button', { name: /Έχω το πιστοποιητικό ORC/ }).click();
  await expect(page.getByRole('heading', { name: 'Πιστοποιητικό ORC' })).toBeVisible();
  await t.shot('cert-import', 'Εισαγωγή πιστοποιητικού ORC (PDF): πριν διαλέξεις αρχείο');
  await t.soft('αρχείο πιστοποιητικού', async () => {
    await page.locator('input[type="file"]').first().setInputFiles({ name: 'pistopoiitiko-dokimis.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% e2e tour, not a real certificate\n%%EOF\n') });
    await t.shot('cert-file-chosen', 'Πιστοποιητικό: αρχείο επιλεγμένο, το «Ανάγνωση με AI» ενεργό (δεν πατήθηκε)');
  });
  await page.locator('.auth-back').first().click();
  await page.getByRole('button', { name: /Θα τα γράψω μόνος μου/ }).click();
  await expect(page.getByRole('heading', { name: 'Νέο σκάφος' })).toBeVisible();
  await t.shot('manual-empty', 'Νέο σκάφος με το χέρι: κενή φόρμα');
  const ed = page.locator('.editor');
  await ed.getByLabel('Όνομα', { exact: true }).fill('Θέτιδα');
  await ed.getByLabel('Αριθμός πανιού').fill('GRE-0007');
  await ed.getByLabel('Τύπος / σχέδιο').fill('First 36.7');
  await t.shot('manual-filled', 'Νέο σκάφος: όνομα, αριθμός πανιού, τύπος');
  await t.scroll('manual-form', 'Νέο σκάφος: όλη η φόρμα (πανιά, συντελεστές, polars)', 5);
  await page.getByRole('button', { name: 'Αποθήκευση', exact: true }).click();
  await t.soft('αποθήκευση σκάφους', async () => {
    await expect(page.getByText(/Αποθηκεύτηκε: Θέτιδα/)).toBeVisible();
    await t.shot('boat-saved', 'Σκάφη: το σκάφος αποθηκεύτηκε και έγινε ενεργό', { top: true });
    await t.scroll('boats-hub', 'Σκάφη με ένα σκάφος: σύνδεσμοι Polar, Πιστοποιητικό, Πλήρωμα, Διαδρομές, Τοπική γνώση');
  });
  await app.tab('Αρχική');
  await expect(boatChip(page)).toContainText('Θέτιδα');
  await t.shot('home-chip', 'Αρχική με ενεργό σκάφος: τσιπ «Θέτιδα» πάνω αριστερά');
  await boatChip(page).click();
  await expect(page.getByTestId('boat-sheet')).toBeVisible();
  await t.shot('boat-sheet', 'Φύλλο «Ενεργό σκάφος» από το τσιπ');
});

test.describe('δύο σκάφη', () => {
  test.use({ scenario: { boats: [boatItem(), boatItem(NO_POLAR)] } });
  test('04b «Ενεργό σκάφος» με δύο σκάφη', async ({ app }) => {
    const t = new Tour(app.page, 4, 'b', 30);
    await signedIn(app, 'e2e-astarti');
    await boatChip(app.page).click();
    await expect(app.page.getByTestId('boat-sheet')).toBeVisible();
    await t.shot('boat-sheet-two', 'Φύλλο «Ενεργό σκάφος» με δύο σκάφη (Αστάρτη ενεργό)');
    await app.page.getByTestId('boat-sheet').getByRole('radio', { name: /Ναυτίλος/ }).click();
    await expectActiveBoat(app.page, 'e2e-no-polar');
    await t.shot('chip-switched', 'Αρχική μετά την αλλαγή: ενεργό το «Ναυτίλος»');
    await app.tab('Σκάφη');
    await t.scroll('boats-two', 'Σκάφη: λίστα με δύο σκάφη', 3);
    await app.page.getByRole('button', { name: /^Polar και στόχοι/ }).click();
    await t.shot('polar', 'Σκάφη › Polar και στόχοι (σκάφος χωρίς polar)');
  });
});

// ───────────────────────────── 5. Settings
test.describe('ρυθμίσεις', () => {
  test.use({ scenario: { boats: [boatItem()] } });
  test('05 ρυθμίσεις', async ({ app }) => {
    const { page } = app;
    const t = new Tour(page, 5, 'a');
    await signedIn(app, 'e2e-astarti');
    await app.tab('Ρυθμίσεις');
    await t.shot('settings-top', 'Ρυθμίσεις: πάνω μέρος');
    await t.shot('settings-appearance', 'Ρυθμίσεις › Εμφάνιση: μέγεθος γραμμάτων και θέμα', { at: page.getByRole('heading', { name: 'Εμφάνιση' }) });
    const card = page.getByTestId('instruments-card');
    await t.shot('instruments-off', 'Ρυθμίσεις › Όργανα σκάφους: πριν τη σύνδεση', { at: card });
    await card.getByRole('combobox').selectOption({ label: 'Προσομοίωση (για δοκιμή)' });
    await t.shot('instruments-sim', 'Όργανα: διαλεγμένη η «Προσομοίωση (για δοκιμή)»', { at: card });
    await expect(async () => {
      const connect = card.getByRole('button', { name: 'Σύνδεση', exact: true });
      if (await connect.isVisible()) await connect.click();
      await expect(card.getByText(/Συνδεδεμένο/)).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 15_000 });
    await app.advance(3000, 1000);
    await t.shot('instruments-on', 'Όργανα: συνδεδεμένα (προσομοίωση), «Όργανα» πάνω δεξιά', { at: card });
    await t.soft('ειδοποιήσεις', async () => {
      await t.shot('alerts-race', 'Ρυθμίσεις › Ειδοποιήσεις αγώνα', { at: page.getByRole('heading', { name: 'Ειδοποιήσεις · Αγώνας' }) });
      await t.shot('alerts-more', 'Ρυθμίσεις › Ειδοποιήσεις προπόνησης, αναψυχής, ήχος', { at: page.getByRole('group', { name: 'Ήχος' }) });
    });
    await t.soft('λογαριασμός', async () => {
      const exp = page.getByRole('button', { name: /Κατέβασε τα δεδομένα μου/ });
      await t.shot('account', 'Ρυθμίσεις › Λογαριασμός: εξαγωγή δεδομένων, αποσύνδεση', { at: exp });
      await page.locator('summary', { hasText: 'Διαγραφή λογαριασμού' }).click();
      await t.shot('account-delete', 'Λογαριασμός › «Διαγραφή λογαριασμού» ανοιχτό (χωρίς επιβεβαίωση)', { at: page.getByRole('button', { name: 'Διαγραφή λογαριασμού', exact: true }) });
    });
    await t.shot('about', 'Ρυθμίσεις › Σχετικά: έκδοση', { at: page.getByTestId('app-version') });
    await t.shot('settings-full', 'Ρυθμίσεις: ολόκληρη η σελίδα', { full: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('button', { name: /^Οδηγός/ }).click();
    await t.scroll('guide', 'Ρυθμίσεις › Οδηγός', 3);
  });
});

// ───────────────────────────── 6. Quick look
test.describe('γρήγορη ματιά', () => {
  test.use({ scenario: { boats: [boatItem(), boatItem(NO_POLAR)] } });
  test('06 γρήγορη ματιά με polar και χωρίς, χειροκίνητος άνεμος', async ({ app, context }) => {
    const { page } = app;
    const t = new Tour(page, 6, 'a');
    await context.grantPermissions(['geolocation']);
    await signedIn(app, 'e2e-astarti');
    await page.getByRole('button', { name: /Γρήγορη ματιά/ }).click();
    await expect(page.getByText('Γρήγορη ματιά: δεν καταγράφεται ίχνος, χωρίς ειδοποιήσεις.')).toBeVisible();
    await app.advance(5000, 1000);
    await t.shot('quick-polar', 'Γρήγορη ματιά (Αστάρτη, με polar), μόνο GPS: στόχοι με τα πεδία TWS/TWA (προτεινόμενα 10 kt / 42°)');
    await t.scroll('quick-polar-all', 'Γρήγορη ματιά με polar, προβολή «Απλό»: όλη η οθόνη', 4);
    await t.soft('προβολή Πλήρες', async () => {
      await page.getByRole('group', { name: 'Προβολή' }).getByRole('button', { name: 'Πλήρες' }).click();
      await t.scroll('quick-polar-full', 'Γρήγορη ματιά με polar, προβολή «Πλήρες»', 4);
      await page.getByRole('group', { name: 'Προβολή' }).getByRole('button', { name: 'Απλό' }).click();
    });
    await page.getByRole('tab', { name: 'Σύμβουλος' }).click();
    await t.shot('quick-advisor', 'Γρήγορη ματιά › καρτέλα Σύμβουλος (δεν στάλθηκε ερώτηση)');
    await page.getByRole('tab', { name: 'Live' }).click();
    await page.locator('.topbar').getByRole('button', { name: 'Πίσω' }).click();
    await selectBoat(page, 'Ναυτίλος');
    await page.getByRole('button', { name: /Γρήγορη ματιά/ }).click();
    await app.advance(5000, 1000);
    await t.shot('quick-nopolar', 'Γρήγορη ματιά (Ναυτίλος, χωρίς polar), χωρίς άνεμο');
    await page.getByRole('button', { name: /Άνεμος: κανένας/ }).click();
    await expect(page.getByTestId('wind-sheet')).toBeVisible();
    await t.shot('wind-sheet-empty', 'Φύλλο «Άνεμος»: χωρίς άνεμο ακόμα');
    await typeWind(page, /^TWD σε °M/, '220');
    await typeWind(page, /^TWS σε kt/, '12');
    await page.getByTestId('wind-use').click();
    await t.shot('wind-sheet-set', 'Φύλλο «Άνεμος»: 220°M, 12 kt, χειροκίνητα');
    await page.getByTestId('wind-sheet').getByRole('button', { name: 'Έτοιμο' }).click();
    await t.shot('quick-nopolar-manual', 'Γρήγορη ματιά χωρίς polar με χειροκίνητο άνεμο (TWA χωρίς στόχους)');
    await app.advance(5 * MIN, 30_000);
    await t.shot('quick-nopolar-manual-5', 'Ο χειροκίνητος άνεμος 5′ μετά: «χειροκίνητα · πριν από 5′»');
    await t.scroll('quick-nopolar-all', 'Γρήγορη ματιά χωρίς polar: όλη η οθόνη', 3);
  });

  test('06b γρήγορη ματιά με όργανα (προσομοίωση)', async ({ app }) => {
    const t = new Tour(app.page, 6, 'b', 30);
    await signedIn(app, 'e2e-astarti');
    await app.useSimulator();
    await app.page.getByRole('button', { name: /Γρήγορη ματιά/ }).click();
    await app.advance(MIN);
    await t.shot('quick-instruments', 'Γρήγορη ματιά με όργανα (προσομοίωση): άνεμος, ταχύτητα, στόχοι');
    await t.scroll('quick-instruments-all', 'Γρήγορη ματιά με όργανα: όλη η οθόνη', 3);
    await t.soft('φύλλο ανέμου με όργανα', async () => {
      await app.page.getByTestId('wind-reading').click({ timeout: 3000 });
      await t.shot('wind-sheet-instruments', 'Φύλλο «Άνεμος» με όργανα: «Τώρα: από τα όργανα»');
    });
  });
});

// ───────────────────────────── 7. Race (+ 11 History, 13 advisor, 14 map)
test.describe('αγώνας', () => {
  test.use({ scenario: { boats: [boatItem(), boatItem(RIVAL), courseItem()] } });

  test('07 αγώνας: στήσιμο, Live, τερματισμός, σύνοψη, ανάλυση', async ({ app }) => {
    const { page } = app;
    const t = new Tour(page, 7, 'a');
    const t11 = new Tour(page, 11, 'a', 0);
    const t13 = new Tour(page, 13, 'a', 0);
    const t14 = new Tour(page, 14, 'a', 0);
    await signedIn(app, 'e2e-astarti');
    await app.useSimulator();
    await t.shot('home-ready', 'Αρχική με σκάφος, διαδρομή και όργανα: έτοιμη για αγώνα');
    await page.getByRole('button', { name: /^Αγώνας:/ }).click();
    await expect(page.getByTestId('screen-title')).toHaveText('Νέος αγώνας');
    await t.shot('setup-empty', 'Νέος αγώνας: κενό στήσιμο (λείπει το όνομα)');
    await page.getByLabel('Όνομα', { exact: true }).fill('Κυριακάτικος Σαρωνικού');
    await page.getByLabel('Εκκίνηση', { exact: true }).fill('2026-11-14T10:05');
    await t.shot('setup-course', 'Στήσιμο: διαδρομή «Δοκιμαστική Σαρωνικού» διαλεγμένη', { at: page.getByTestId('course-card').first() });
    await t.soft('νέα διαδρομή', async () => {
      await page.getByRole('button', { name: /Νέα διαδρομή εδώ/ }).click();
      await letMapDraw(app);
      await t.shot('course-editor', 'Νέα διαδρομή: σημαδούρες στον χάρτη (χωρίς πλακίδια χάρτη στο τεστ)');
      await t.scroll('course-editor-all', 'Νέα διαδρομή: όλη η οθόνη', 3);
      await page.locator('main').getByRole('button', { name: 'Άκυρο', exact: true }).first().click();
      await expect(page.getByTestId('course-card').first()).toBeVisible();
    });
    await page.getByRole('combobox', { name: 'Πρόσθεσε σκάφος από τα σκάφη μου' }).selectOption({ label: RIVAL.name });
    await page.getByRole('button', { name: 'Προσθήκη', exact: true }).click();
    await t.shot('setup-entries', 'Στήσιμο › Συμμετοχές: λίστα PDF (AI, δεν πατήθηκε) και αντίπαλος «Ναυτίλος»', { at: page.getByRole('heading', { name: 'Συμμετοχές' }) });
    await t.scroll('setup-all', 'Νέος αγώνας: όλο το στήσιμο', 5);
    await page.getByRole('button', { name: 'Αποθήκευση και έναρξη' }).click();
    await expect(page.getByTestId('session-end')).toBeVisible();
    await app.advance(20_000);
    await t.shot('live-prestart', 'Live πριν την εκκίνηση: αντίστροφη μέτρηση');
    await t.scroll('live-prestart-all', 'Live πριν την εκκίνηση: όλη η οθόνη', 4);
    await app.advance(8 * MIN);
    await t.shot('live-race', 'Live στον αγώνα: άνεμος, ταχύτητα, στόχοι');
    await t.scroll('live-race-all', 'Live αγώνα: όλη η οθόνη (κάρτα ανέμου, laylines, επόμενη σημαδούρα, κατάταξη)', 6);
    await t.soft('κάρτα ανέμου', async () => {
      await t.shot('wind-card', 'Live › κάρτα ανέμου (όργανα)', { at: page.getByTestId('wind-reading') });
      await page.getByTestId('wind-reading').click();
      await expect(page.getByTestId('wind-sheet')).toBeVisible();
      await t.shot('wind-sheet', 'Live › φύλλο «Άνεμος» μέσα στον αγώνα');
      await page.getByTestId('wind-sheet').getByRole('button', { name: /Κλείσιμο|Έτοιμο/ }).first().click();
    });
    await t.soft('επόμενη σημαδούρα', async () => {
      await t.shot('next-mark', 'Live › επόμενη σημαδούρα', { at: page.getByText(/σημαδούρα/i) });
    });
    await t.soft('laylines', async () => {
      await t.shot('laylines', 'Live › laylines', { at: page.getByText(/layline/i) });
    });
    // Alerts: let the simulator run; whatever band appears is captured.
    await t.soft('ειδοποίηση', async () => {
      for (let i = 0; i < 12 && !(await page.locator('.alert-band').count()); i++) await app.advance(MIN, 5000);
      await expect(page.locator('.alert-band')).toBeVisible({ timeout: 1000 });
      await t.shot('alert', 'Live › ειδοποίηση αγώνα (ζώνη πάνω)', { top: true });
    });
    await app.tab('Χάρτης');
    await letMapDraw(app);
    await t14.shot('race-map', 'Χάρτης μέσα στον αγώνα (χωρίς πλακίδια χάρτη στο τεστ)');
    await t14.scroll('race-map-all', 'Χάρτης αγώνα: όλη η οθόνη', 4);
    await t14.soft('ενδεικτικό', async () => {
      await expect(page.getByText(/όχι για ναυσιπλοΐα/i).first()).toBeAttached();
      await t14.shot('race-map-note', 'Χάρτης: «ενδεικτικό, όχι για ναυσιπλοΐα»', { at: page.getByText(/όχι για ναυσιπλοΐα/i) });
    });
    await app.tab('Σύμβουλος');
    await t13.shot('race-advisor', 'Σύμβουλος μέσα στον αγώνα: άδεια συζήτηση, έτοιμες ερωτήσεις (καμία κλήση AI)');
    await t13.scroll('race-advisor-all', 'Σύμβουλος στον αγώνα: όλη η οθόνη', 3);
    await app.tab('Live');
    await page.locator('.race-live').getByRole('button', { name: 'Τερματισμός', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Τερματισμός αγώνα;' })).toBeVisible();
    await t.shot('end-confirm', 'Ερώτηση «Τερματισμός αγώνα;»');
    await page.getByRole('button', { name: 'Ναι, τερματίσαμε' }).click();
    await expect(page.getByTestId('screen-title')).toHaveText('Η έξοδος τελείωσε');
    await t.shot('ended', 'Η έξοδος τελείωσε: σύνοψη με «Αναίρεση»');
    await t.scroll('ended-all', 'Σύνοψη αγώνα: όλη η οθόνη', 5);
    await app.advance(11_000, 1000);
    await page.getByRole('button', { name: 'Στο Ιστορικό' }).click();
    await expect(page.getByTestId('screen-title')).toHaveText('Οι έξοδοί μου');
    await t11.shot('history-race', 'Ιστορικό με έναν αγώνα');
    await page.getByTestId('history-item').first().click();
    const view = page.getByTestId('race-analysis');
    await expect(view).toBeVisible();
    await t.shot('analysis', 'Ανάλυση αγώνα από το Ιστορικό');
    await t.scroll('analysis-all', 'Ανάλυση αγώνα: όλη η οθόνη', 6);
    await t.shot('analysis-ai-button', 'Ανάλυση: το «Ζήτα μαθήματα από τον σύμβουλο» (δεν πατήθηκε)', { at: view.getByRole('button', { name: 'Ζήτα μαθήματα από τον σύμβουλο' }) });
  });

  test('07b γραμμή τερματισμού «Τερματίσατε στις …;»', async ({ app, context }) => {
    const { page } = app;
    const t = new Tour(page, 7, 'b', 60);
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: COURSE.marks[0].lat, longitude: COURSE.marks[0].lon });
    await signedIn(app, 'e2e-astarti');
    await startRace(page, 'Γραμμή');
    await app.advance(3 * MIN);
    const [, A, F] = COURSE.marks;
    const near = (n: number) => {
      const k = Math.cos((F.lat * Math.PI) / 180);
      const dx = (F.lon - A.lon) * 60 * k;
      const dy = (F.lat - A.lat) * 60;
      const len = Math.hypot(dx, dy);
      return { latitude: F.lat + (n * dy) / len / 60, longitude: F.lon + (n * dx) / len / 60 / k };
    };
    const go = async (p: { latitude: number; longitude: number }, ms = 1000) => {
      await context.setGeolocation(p);
      await app.advance(ms, 1000);
    };
    await t.shot('live-gps', 'Live αγώνα μόνο με GPS κινητού (χωρίς όργανα, χωρίς άνεμο)');
    await go({ latitude: A.lat, longitude: A.lon }, 6000);
    await go(near(-0.05), 6000);
    await go(near(0.05));
    const sheet = page.getByTestId('finish-sheet');
    await expect(sheet).toBeVisible();
    await t.shot('finish-sheet', 'Πέρασμα γραμμής: «Τερματίσατε στις …;»');
    await app.advance(2 * MIN);
    await t.shot('finish-sheet-later', '«Τερματίσατε στις …;» 2′ αργότερα (πριν από 2:0x)');
    await sheet.getByTestId('finish-yes').click();
    await expect(page.getByTestId('ended-line')).toBeVisible();
    await t.shot('finish-ended', 'Τερματισμός από το πέρασμα της γραμμής: η σύνοψη');
  });
});

// ───────────────────────────── 8. Training (+ 13 advisor limit)
test.describe('προπόνηση', () => {
  test.use({ scenario: { boats: [boatItem()] } });
  test('08 προπόνηση: έναρξη, γύροι, παύση, σύνοψη', async ({ app }) => {
    const { page } = app;
    const t = new Tour(page, 8, 'a');
    await signedIn(app, 'e2e-astarti');
    await app.useSimulator();
    await page.getByRole('button', { name: /^Προπόνηση:/ }).click();
    await t.shot('setup', 'Νέα προπόνηση: στήσιμο');
    await t.scroll('setup-all', 'Νέα προπόνηση: όλο το στήσιμο', 3);
    await page.getByRole('button', { name: '● Έναρξη προπόνησης' }).click();
    await expect(page.getByTestId('session-end')).toBeVisible();
    await app.advance(MIN);
    await t.shot('live', 'Live προπόνησης: κουμπί «Γύρος 1», «Παύση»');
    await t.scroll('live-all', 'Live προπόνησης: όλη η οθόνη', 5);
    await app.advance(3 * MIN);
    await page.getByTestId('lap-button').click();
    await t.shot('lap-1', 'Γύρος 1 καταγράφηκε, με «Αναίρεση» για 5″');
    await app.advance(5 * MIN);
    await page.getByTestId('lap-button').click();
    await app.advance(6000, 1000);
    await t.shot('laps', 'Δύο γύροι: λίστα γύρων', { at: page.getByTestId('lap-list') });
    await page.getByTestId('session-pause').click();
    await app.advance(MIN);
    await t.shot('paused', 'Σε παύση: «δεν καταγράφεται»', { top: true });
    await page.getByTestId('session-resume').click();
    await app.advance(2 * MIN);
    await page.getByTestId('session-end').click();
    await expect(page.getByRole('heading', { name: 'Τέλος προπόνησης;' })).toBeVisible();
    await t.shot('end-confirm', 'Ερώτηση «Τέλος προπόνησης;»');
    await page.getByRole('button', { name: 'Ναι, τέλος' }).click();
    await expect(page.getByTestId('screen-title')).toHaveText('Η έξοδος τελείωσε');
    await t.shot('summary', 'Σύνοψη προπόνησης (χωρίς την παύση)');
    await t.scroll('summary-all', 'Σύνοψη προπόνησης: όλη η οθόνη', 6);
    await app.advance(11_000, 1000);
    await t.soft('ανάλυση', async () => {
      await t.shot('summary-ai-button', 'Σύνοψη: «Ανάλυση και μαθήματα» (δεν πατήθηκε)', { at: page.getByRole('button', { name: 'Ανάλυση και μαθήματα' }) });
    });
  });

  test.describe('σύμβουλος χωρίς άδεια AI', () => {
    test.use({ scenario: { boats: [boatItem()], user: { ...USER, ai: { allowed: false, used: 0, limit: 0 } } } });
    test('13b σύμβουλος σε αναμονή άδειας', async ({ app }) => {
      const t = new Tour(app.page, 13, 'b', 20);
      await signedIn(app, 'e2e-astarti');
      await app.startTraining();
      await app.tab('Σύμβουλος');
      await t.shot('advisor-waiting', 'Σύμβουλος όταν ο λογαριασμός δεν έχει ακόμα άδεια AI');
      await t.scroll('advisor-waiting-all', 'Σύμβουλος χωρίς άδεια: όλη η οθόνη', 3);
    });
  });

  test.describe('σύμβουλος στο όριο', () => {
    test.use({ scenario: { boats: [boatItem()], user: { ...USER, ai: { allowed: true, used: 50, limit: 50 } } } });
    test('13c σύμβουλος με εξαντλημένο όριο', async ({ app }) => {
      const t = new Tour(app.page, 13, 'c', 30);
      await signedIn(app, 'e2e-astarti');
      await app.startTraining();
      await app.tab('Σύμβουλος');
      await t.shot('advisor-limit', 'Σύμβουλος με 50 από 50 ερωτήσεις (όριο λογαριασμού)');
    });
  });
});

// ───────────────────────────── 9. Cruise (+ 14 map)
test.describe('αναψυχή', () => {
  test.use({ scenario: { boats: [courseItem()] } });
  test('09 αναψυχή: έναρξη, Live, χάρτης, τέλος', async ({ app, context }) => {
    const { page } = app;
    const t = new Tour(page, 9, 'a');
    const t14 = new Tour(page, 14, 'b', 20);
    await context.grantPermissions(['geolocation']);
    await signedIn(app);
    await skipSteps(app);
    await page.getByRole('button', { name: /^Αναψυχή:/ }).click();
    await expect(page.getByText('Πού πάμε;', { exact: true })).toBeVisible();
    await t.shot('setup', 'Νέα έξοδος αναψυχής: «Πού πάμε;» (χωρίς σκάφος)');
    await page.getByRole('button', { name: new RegExp(COURSE.name) }).click();
    await t.scroll('setup-dest', 'Αναψυχή: προορισμός η αποθηκευμένη διαδρομή', 3);
    await page.getByRole('button', { name: '● Έναρξη αναψυχής' }).click();
    await expect(page.getByTestId('session-end')).toBeVisible();
    let lat = 37.9;
    for (let i = 1; i <= 8; i++) {
      lat += 0.0006;
      await context.setGeolocation({ latitude: lat, longitude: 23.66 });
      await app.advance(15_000);
    }
    await t.shot('live', 'Live αναψυχής: προορισμός, απόσταση, ETA, βάθος');
    await t.scroll('live-all', 'Live αναψυχής: όλη η οθόνη', 4);
    await page.getByTestId('cruise-dest-tile').click();
    await t.shot('dest-sheet', 'Αλλαγή προορισμού μέσα στην έξοδο');
    await page.getByTestId('cruise-dest-sheet').getByRole('button', { name: /Κλείσιμο/ }).first().click().catch(() => page.keyboard.press('Escape'));
    await app.tab('Χάρτης');
    await letMapDraw(app);
    await t14.shot('cruise-map', 'Χάρτης αναψυχής: γραμμή προς τον προορισμό, «Βάθος εδώ», «Ενδεικτικό, όχι για ναυσιπλοΐα»');
    await t14.scroll('cruise-map-all', 'Χάρτης αναψυχής: όλη η οθόνη', 3);
    await app.tab('Live');
    await page.getByTestId('session-end').click();
    await expect(page.getByRole('heading', { name: 'Τέλος αναψυχής;' })).toBeVisible();
    await t.shot('end-confirm', 'Ερώτηση «Τέλος αναψυχής;»');
    await page.getByRole('button', { name: 'Ναι, τέλος' }).click();
    await expect(page.getByTestId('screen-title')).toHaveText('Η έξοδος τελείωσε');
    await t.shot('summary', 'Σύνοψη αναψυχής');
    await t.scroll('summary-all', 'Σύνοψη αναψυχής: όλη η οθόνη', 4);
  });
});

// ───────────────────────────── 10. Event
test.describe('διοργάνωση', () => {
  test.use({ scenario: { boats: [boatItem(), boatItem(RIVAL), courseItem()] } });
  test('10 διοργάνωση: νέα, 1η, αποτελέσματα, κάρτα 2ης, κατάταξη', async ({ app }) => {
    const { page } = app;
    const t = new Tour(page, 10, 'a');
    const t11 = new Tour(page, 11, 'b', 10);
    const EVENT = 'Διήμερος Αιγίνης';
    await signedIn(app, 'e2e-astarti');
    await app.useSimulator();
    await page.getByRole('button', { name: /^Αγώνας:/ }).click();
    await page.getByRole('radiogroup', { name: 'Μέρος διοργάνωσης' }).getByRole('radio', { name: /Νέα διοργάνωση/ }).click();
    await t.shot('new-event', 'Νέος αγώνας › «Νέα διοργάνωση»: όνομα, βαθμολογία, απορρίψεις');
    await page.getByLabel('Όνομα διοργάνωσης').fill(EVENT);
    await page.getByLabel('Όνομα ιστιοδρομίας').fill('Πειραιάς–Αίγινα');
    await page.getByLabel('Εκκίνηση', { exact: true }).fill('2026-11-14T10:02');
    await page.getByRole('combobox', { name: 'Πρόσθεσε σκάφος από τα σκάφη μου' }).selectOption({ label: RIVAL.name });
    await page.getByRole('button', { name: 'Προσθήκη', exact: true }).click();
    await t.scroll('new-event-all', 'Νέα διοργάνωση, 1η ιστιοδρομία: όλο το στήσιμο', 5);
    await page.getByRole('button', { name: 'Αποθήκευση και έναρξη' }).click();
    await expect(page.getByTestId('session-end')).toBeVisible();
    await app.advance(3 * MIN);
    await t.shot('race1-live', 'Live 1ης ιστιοδρομίας: το όνομα της διοργάνωσης στη μπάρα');
    await app.advance(3 * MIN);
    await page.getByTestId('session-end').click();
    await t.shot('race1-end-confirm', 'Ερώτηση «Τερματισμός 1ης ιστιοδρομίας;»');
    await page.getByRole('button', { name: 'Ναι, τερματίσαμε' }).click();
    await expect(page.getByTestId('screen-title')).toHaveText('Η ιστιοδρομία τελείωσε');
    await t.shot('race1-ended', 'Η ιστιοδρομία τελείωσε: «μετά την 1η»');
    await t.scroll('race1-ended-all', 'Μετά την 1η: όλη η οθόνη', 4);
    await app.advance(11_000, 1000);
    await page.getByTestId('event-after').getByTestId('after-results').click();
    const editor = page.getByTestId('results-editor');
    await expect(editor).toBeVisible();
    await t.shot('results-editor', 'Επεξεργασία αποτελεσμάτων 1ης: λίστα σκαφών');
    const sheet = page.getByTestId('result-sheet');
    await editor.getByTestId('result-row').first().click();
    await expect(sheet).toBeVisible();
    await t.shot('result-sheet-time', 'Φύλλο αποτελέσματος (εμείς): πληκτρολόγιο ώρας τερματισμού');
    await sheet.getByTestId('result-save-next').click();
    await sheet.getByRole('tab', { name: /^Χρόνος/ }).click();
    for (const k of '17500') await sheet.getByRole('group', { name: 'Πληκτρολόγιο' }).getByRole('button', { name: k, exact: true }).click();
    await t.shot('result-sheet-bad', 'Φύλλο αποτελέσματος (αντίπαλος): λάθος χρόνος 01:75:00, μήνυμα');
    await sheet.getByRole('tab', { name: /^Κωδικός/ }).click();
    await sheet.getByRole('button', { name: /^DNF/ }).click();
    await t.shot('result-sheet-code', 'Φύλλο αποτελέσματος: κωδικός DNF = 3 βαθμοί');
    await sheet.getByTestId('result-save').click();
    await t.shot('results-filled', 'Αποτελέσματα 1ης συμπληρωμένα');
    await editor.getByTestId('results-done').click();
    const screen = page.getByTestId('event-screen');
    await expect(screen).toBeVisible();
    await t.shot('event-standing', 'Οθόνη διοργάνωσης: γενική κατάταξη μετά την 1η');
    await t.scroll('event-standing-all', 'Οθόνη διοργάνωσης: όλη η σελίδα', 4);
    await app.tab('Αρχική');
    const card = page.getByTestId('home-event');
    await expect(card).toContainText('→ 2η ιστιοδρομία');
    await t.shot('home-card', 'Αρχική: κάρτα διοργάνωσης «→ 2η ιστιοδρομία»', { at: card });
    await card.getByTestId('home-event-go').click();
    await expect(page.getByTestId('setup-event-sub')).toBeVisible();
    await t.shot('race2-setup', 'Στήσιμο 2ης ιστιοδρομίας: ίδια σκάφη με την 1η');
    await t.scroll('race2-setup-all', 'Στήσιμο 2ης: όλη η οθόνη', 4);
    await page.locator('.topbar').getByRole('button', { name: 'Πίσω' }).click();
    await app.tab('Ιστορικό');
    await expect(page.getByTestId('history-event')).toHaveCount(1);
    await t11.shot('history-event', 'Ιστορικό: κάρτα διοργάνωσης «Διοργάνωση · 1 ιστιοδρομία»');
    await page.getByTestId('history-event').click();
    await t11.shot('history-event-open', 'Ιστορικό › κάρτα διοργάνωσης ανοιχτή');
  });
});

// ───────────────────────────── 11. History with several sessions
test.describe('ιστορικό', () => {
  test.use({ scenario: { boats: [boatItem()] } });
  test('11 ιστορικό: λίστα, κάρτα διοργάνωσης, προπόνηση', async ({ app }) => {
    const { page } = app;
    const t = new Tour(page, 11, 'c', 20);
    await signedIn(app, 'e2e-astarti');
    await seedEvent(page);
    await page.reload();
    await expectActiveBoat(page, 'e2e-astarti');
    await app.startTraining();
    await app.advance(4 * MIN);
    await page.getByTestId('session-end').click();
    await page.getByRole('button', { name: 'Ναι, τέλος' }).click();
    await app.advance(11_000, 1000);
    await page.getByRole('button', { name: 'Στο Ιστορικό' }).click();
    await t.shot('history-list', 'Ιστορικό: μία προπόνηση και μία διοργάνωση 5 ιστιοδρομιών');
    await t.scroll('history-list-all', 'Ιστορικό: όλη η λίστα', 3);
    await t.shot('history-event-card', 'Ιστορικό › κάρτα διοργάνωσης', { at: page.getByTestId('history-event') });
    await page.getByTestId('history-event').click();
    await t.scroll('history-event-screen', 'Ιστορικό › διοργάνωση: κατάταξη 5 ιστιοδρομιών με απορρίψεις', 5);
    await page.getByRole('button', { name: 'Οι έξοδοί μου' }).click();
    await page.getByText(/^Προπόνηση · /).first().click();
    await t.scroll('history-training', 'Ιστορικό › προπόνηση: ανάλυση', 4);
  });
});

// ───────────────────────────── 12. Crew and sharing
test.describe('πλήρωμα', () => {
  test.use({ scenario: { boats: [boatItem(), courseItem()], crew: true } });
  test('12 πλήρωμα και κοινοποίηση', async ({ app }) => {
    const { page } = app;
    const t = new Tour(page, 12, 'a');
    await signedIn(app, 'e2e-astarti');
    await app.tab('Σκάφη');
    await page.getByRole('button', { name: /^Πλήρωμα/ }).click();
    await t.shot('crew', 'Σκάφη › Πλήρωμα: το πλήρωμα του σκάφους μου (χωρίς μέλη)');
    await t.scroll('crew-all', 'Πλήρωμα: όλη η οθόνη', 3);
    await app.tab('Αρχική');
    await page.getByRole('button', { name: /^Προπόνηση:/ }).click();
    await t.soft('κοινοποίηση προπόνησης', async () => {
      const share = page.getByRole('switch', { name: /Μοιράσου με το πλήρωμα/ }).or(page.getByRole('checkbox', { name: /Μοιράσου με το πλήρωμα/ }));
      await share.first().click();
      await t.shot('training-share', 'Νέα προπόνηση: «Μοιράσου με το πλήρωμα» ανοιχτό', { at: share });
    });
    await page.locator('.topbar').getByRole('button', { name: 'Πίσω' }).click();
    await page.getByRole('button', { name: /^Αγώνας:/ }).click();
    await page.getByLabel('Όνομα', { exact: true }).fill('Αγώνας με πλήρωμα');
    await page.getByLabel('Εκκίνηση', { exact: true }).fill('2026-11-15T11:00');
    await page.getByRole('button', { name: 'Αποθήκευση για αργότερα' }).click();
    await t.soft('πλήρωμα αγώνα', async () => {
      await page.getByRole('heading', { name: 'Επόμενος αγώνας' }).waitFor();
      await t.shot('home-next-race', 'Αρχική: «Επόμενος αγώνας» αποθηκευμένος για αργότερα', { at: page.getByRole('heading', { name: 'Επόμενος αγώνας' }) });
      await page.getByRole('button', { name: 'Στήσε' }).first().click();
      await t.shot('race-crew', 'Αγώνας (αποθηκευμένος) › «Πλήρωμα αγώνα»: πρόσκληση μελών', { at: page.getByRole('heading', { name: 'Πλήρωμα αγώνα' }) });
    });
  });

  test('12b σύνδεσμος πρόσκλησης', async ({ app }) => {
    const t = new Tour(app.page, 12, 'b', 20);
    await app.open('/?invite=e2e-invite-000000000001');
    await t.shot('invite-signin', 'Σύνδεσμος πρόσκλησης χωρίς σύνδεση: πρώτα η σύνδεση');
    await app.signIn();
    await expect.poll(() => app.server.calls('/invites/*').length).toBeGreaterThanOrEqual(1);
    await app.advance(2000, 500);
    await t.shot('invite-screen', 'Πρόσκληση μετά τη σύνδεση (η δοκιμαστική πρόσκληση δεν υπάρχει)');
  });
});

// ───────────────────────────── 14. Map out of a session
test.describe('διαδρομές', () => {
  test.use({ scenario: { boats: [boatItem(), courseItem()] } });
  test('14c χάρτης «Διαδρομές μου» εκτός εξόδου', async ({ app }) => {
    const { page } = app;
    const t = new Tour(page, 14, 'c', 40);
    await signedIn(app, 'e2e-astarti');
    await app.tab('Σκάφη');
    await page.getByRole('button', { name: /^Διαδρομές μου/ }).click();
    await letMapDraw(app);
    await t.shot('plan', 'Σκάφη › Διαδρομές μου: χάρτης και σχέδιο διαδρομής (χωρίς πλακίδια στο τεστ)');
    await t.scroll('plan-all', 'Διαδρομές μου: όλη η οθόνη', 5);
    await t.soft('ενδεικτικό', async () => {
      await t.shot('plan-note', 'Χάρτης: «ενδεικτικό, όχι για ναυσιπλοΐα»', { at: page.getByText(/όχι για ναυσιπλοΐα/i) });
    });
  });
});

// ───────────────────────────── 15. Offline banner
test.describe('χωρίς ίντερνετ', () => {
  test.use({ scenario: { boats: [boatItem()] } });
  test('15 λωρίδα «Χωρίς ίντερνετ»', async ({ app, context }) => {
    const { page } = app;
    const t = new Tour(page, 15, 'a');
    await signedIn(app, 'e2e-astarti');
    await context.setOffline(true);
    await expect(page.getByTestId('net-strip')).toBeVisible();
    await t.shot('home-offline', 'Αρχική χωρίς ίντερνετ: «Μπορείς να ξεκινήσεις έξοδο κανονικά»');
    await app.tab('Ρυθμίσεις');
    await t.shot('settings-offline', 'Ρυθμίσεις χωρίς ίντερνετ: «οι αλλαγές θα σωθούν μόλις επιστρέψει»');
    await app.tab('Αρχική');
    await app.startTraining();
    await t.shot('session-offline', 'Μέσα σε έξοδο χωρίς ίντερνετ: «Η καταγραφή και το Live δουλεύουν κανονικά»');
    await app.tab('Σύμβουλος');
    await t.soft('σύμβουλος offline', async () => {
      await page.getByRole('textbox', { name: 'Ερώτηση στον σύμβουλο' }).fill('Ποια πλευρά ευνοείται;');
      await t.shot('advisor-offline', 'Σύμβουλος χωρίς ίντερνετ (ερώτηση γραμμένη, δεν στάλθηκε)');
    });
    await app.tab('Live');
    await context.setOffline(false);
    await expect(page.getByText('Συνδέθηκε ξανά ✓')).toBeVisible();
    await t.shot('back-online', '«Συνδέθηκε ξανά ✓»');
  });
});

// ───────────────────────────── 16. Update prompt (real service worker)
swTest.describe('νέα έκδοση @sw', () => {
  swTest.use({ scenario: { boats: [boatItem()] } });
  swTest('16 νέα έκδοση: κάρτα στην Αρχική και γραμμή μέσα σε έξοδο @sw', async ({ sw }) => {
    swTest.setTimeout(180_000);
    const { page } = sw;
    const t = new Tour(page, 16, 'a');
    await sw.install();
    await sw.signIn();
    await swExpect(page.getByTestId('boat-chip')).toHaveAttribute('data-boat-id', 'e2e-astarti');
    await sw.serve('b');
    await sw.checkForUpdate();
    await swExpect.poll(() => sw.waitingWorker(), { timeout: 20_000 }).toBe(true);
    const card = page.getByTestId('update-card');
    await swExpect(card).toContainText(UPDATE_TEXT.available);
    await t.shot('update-card', `Αρχική: κάρτα «${UPDATE_TEXT.available}» με «${UPDATE_TEXT.now}»`, { at: card });
    await t.shot('update-card-top', 'Αρχική με την κάρτα νέας έκδοσης (πάνω μέρος)', { top: true });
    await page.getByRole('button', { name: /^Προπόνηση:/ }).click();
    await page.getByRole('button', { name: '● Έναρξη προπόνησης' }).click();
    await swExpect(page.getByTestId('session-end')).toBeVisible();
    await t.soft('γραμμή μέσα σε έξοδο', async () => {
      await swExpect(page.getByTestId('update-line')).toBeVisible();
      await t.shot('update-line', 'Μέσα σε έξοδο: η νέα έκδοση περιμένει το τέλος', { at: page.getByTestId('update-line') });
    });
    await page.getByTestId('session-end').click();
    await page.getByRole('button', { name: 'Ναι, τέλος' }).click();
    await sw.advance(10_500, 500);
    await t.soft('ενημέρωση', async () => {
      await swExpect(page.getByText(UPDATE_TEXT.applying)).toBeVisible();
      await t.shot('applying', `Μετά το τέλος: «${UPDATE_TEXT.applying}»`);
    });
  });
});

// ───────────────────────────── 17. Variants: key screens
const VARIANTS = [
  { id: 'v320xl', label: '320 px «Πολύ μεγάλα»', size: { width: 320, height: 640 }, settings: { textSize: 'xl' }, start: 0 },
  { id: 'night', label: 'Νύχτα', size: { width: 375, height: 812 }, settings: { theme: 'night' }, start: 20 },
  { id: 'tab768', label: 'tablet 768', size: { width: 768, height: 1024 }, settings: {}, start: 40 },
] as const;

for (const v of VARIANTS) {
  test.describe(`παραλλαγή ${v.id}`, () => {
    test.use({ scenario: { boats: [boatItem(), courseItem()] }, viewport: v.size });
    test(`17 ${v.label}: Αρχική, Live αγώνα, φύλλο Ανέμου, κατάταξη, Ρυθμίσεις`, async ({ app }) => {
      const { page } = app;
      const t = new Tour(page, 17, v.id, v.start, `${v.id}-`);
      await signedIn(app, 'e2e-astarti');
      if (Object.keys(v.settings).length) await app.setSettings(v.settings);
      await expectActiveBoat(page, 'e2e-astarti');
      await app.useSimulator();
      await t.shot('home', `${v.label} · Αρχική`);
      await app.tab('Ρυθμίσεις');
      await t.shot('settings', `${v.label} · Ρυθμίσεις`);
      await t.shot('settings-appearance', `${v.label} · Ρυθμίσεις › Εμφάνιση`, { at: page.getByRole('heading', { name: 'Εμφάνιση' }) });
      await app.tab('Αρχική');
      await seedEvent(page);
      await page.reload();
      const card = page.getByTestId('home-event');
      await expect(card).toBeVisible();
      await card.getByRole('button', { name: 'Δες τη διοργάνωση' }).click();
      await expect(page.getByTestId('event-standing')).toBeVisible();
      await t.shot('event-standing', `${v.label} · Οθόνη διοργάνωσης: γενική κατάταξη`, { at: page.getByTestId('event-standing') });
      await app.tab('Αρχική');
      await startRace(page, 'Δοκιμή παραλλαγής');
      await app.advance(4 * MIN);
      await t.shot('race-live', `${v.label} · Live αγώνα`);
      await page.getByTestId('wind-reading').click();
      await expect(page.getByTestId('wind-sheet')).toBeVisible();
      await t.shot('wind-sheet', `${v.label} · φύλλο «Άνεμος» στον αγώνα`);
    });
  });
}
