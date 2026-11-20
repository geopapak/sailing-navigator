/**
 * P-040 (Φ5) «Διοργάνωση»: a two-race event from setup to the standing, the results editor with
 * a code, the finish line from the phone's GPS (Playwright geolocation), and the event screen at
 * 320 px with 5 races and long Greek names. Made-up boats, fake clock, no network beyond the fixtures.
 */
import { test, expect, noHorizontalOverflow, type AppFixture } from './fixtures/app';
import { boatItem, courseItem } from './fixtures/handlers';
import { NO_POLAR } from './fixtures/data/boat-no-polar';
import { COURSE } from './fixtures/data/course-saronic';
import type { Page } from '@playwright/test';
import { expectActiveBoat } from './fixtures/boat';

const MIN = 60_000;
const EVENT = 'Διήμερος Δοκιμής';
/** An opponent from «Πρόσθεσε από τα σκάφη μου» (same ratings as ours, no polar). */
const RIVAL = { ...NO_POLAR, isOwn: false };

test.use({ scenario: { boats: [boatItem(), boatItem(RIVAL), courseItem()] } });

async function ready(app: AppFixture) {
  await app.open();
  await app.signIn();
  await expectActiveBoat(app.page, 'e2e-astarti');
}

/** The stored races (IndexedDB), as the app wrote them. */
function stored(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('sailing-navigator');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const get = <T>(store: string) =>
      new Promise<T[]>((res) => {
        const g = db.transaction(store).objectStore(store).getAll();
        g.onsuccess = () => res(g.result as T[]);
      });
    type R = {
      id: string;
      name: string;
      status: string;
      start: number;
      finish?: number;
      eventId?: string;
      entries: { id: string }[];
      finishCross?: { t: number; answered?: string };
    };
    const races = await get<R>('races');
    const events = await get<{ id: string; name: string; status: string }>('events');
    db.close();
    return { races, events };
  });
}

async function endRace(page: Page, title: RegExp) {
  await page.getByTestId('session-end').click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: 'Ναι, τερματίσαμε' }).click();
}

test('διήμερος: νέα διοργάνωση → 1η → αποτελέσματα με DNF → 2η από την αρχική → γενική κατάταξη', async ({ app }) => {
  test.setTimeout(120_000);
  const { page } = app;
  await ready(app);
  await app.useSimulator();

  // AC 1–4: «Μέρος διοργάνωσης» → «Νέα διοργάνωση»
  await page.getByRole('button', { name: /^Αγώνας:/ }).click();
  const part = page.getByRole('radiogroup', { name: 'Μέρος διοργάνωσης' });
  await expect(part.getByRole('radio', { name: /Όχι/ })).toHaveAttribute('aria-checked', 'true');
  await part.getByRole('radio', { name: /Νέα διοργάνωση/ }).click();
  await expect(page.locator('.race-setup')).toContainText('Δώσε όνομα στη διοργάνωση');
  await expect(page.getByRole('button', { name: 'Αποθήκευση και έναρξη' })).toBeDisabled();
  await page.getByLabel('Όνομα διοργάνωσης').fill(EVENT);
  // Discards: D = 2 with K = 2 makes K = 3; «Άθροισμα χρόνων» hides them.
  await page.getByRole('group', { name: 'Απορρίψεις', exact: true }).getByRole('button', { name: '1', exact: true }).click();
  await page.getByRole('combobox', { name: 'Απορρίψεις από' }).selectOption('2');
  await page.getByRole('group', { name: 'Απορρίψεις', exact: true }).getByRole('button', { name: '2', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Απορρίψεις από' })).toHaveValue('3');
  await page.getByRole('button', { name: 'Άθροισμα διορθωμένων χρόνων' }).click();
  await expect(page.getByRole('group', { name: 'Απορρίψεις', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Παράρτημα A (θέσεις)' }).click();
  await page.getByRole('group', { name: 'Απορρίψεις', exact: true }).getByRole('button', { name: '0', exact: true }).click();
  await page.getByLabel('Όνομα ιστιοδρομίας').fill('Πειραιάς–Αίγινα');
  await expect(page.getByTestId('course-card').filter({ hasText: COURSE.name })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Εκκίνηση', { exact: true }).fill('2026-11-14T10:02');
  await page.getByRole('combobox', { name: 'Πρόσθεσε σκάφος από τα σκάφη μου' }).selectOption({ label: RIVAL.name });
  await page.getByRole('button', { name: 'Προσθήκη', exact: true }).click();
  await expect(page.getByText('Βάλε μόνο τα σκάφη της κλάσης σου.')).toBeVisible();
  await expect(page.getByText(/Στον τερματισμό η εφαρμογή ρωτά «Τερματίσατε στις …;»/)).toBeVisible();
  await page.getByRole('button', { name: 'Αποθήκευση και έναρξη' }).click();

  // AC 6, 12: the event is stored with its first race; the bar and the Live name it.
  await expect(page.getByTestId('session-end')).toBeVisible();
  await expect(page.locator('.sbar .modeb')).toContainText('1η ιστιοδρομία · Πειραιάς–Αίγινα');
  await expect(page.getByTestId('event-live')).toContainText(EVENT);
  let db = await stored(page);
  expect(db.events.map((e) => e.name)).toEqual([EVENT]);
  expect(db.races[0].eventId).toBe(db.events[0].id);

  await app.advance(6 * MIN);
  await endRace(page, /^Τερματισμός 1ης ιστιοδρομίας;$/);
  await expect(page.getByTestId('screen-title')).toHaveText('Η ιστιοδρομία τελείωσε');
  const after = page.getByTestId('event-after');
  await expect(after).toContainText(`${EVENT} · μετά την 1η`);
  await app.advance(11_000, 1000);

  // AC 29: the results editor: a list, one sheet per boat with its own keypad.
  await after.getByTestId('after-results').click();
  const editor = page.getByTestId('results-editor');
  await expect(editor.getByRole('heading', { name: 'Αποτελέσματα · 1η ιστιοδρομία' })).toBeVisible();
  const ownRow = editor.getByTestId('result-row').first();
  const rival = editor.getByTestId('result-row').filter({ hasText: RIVAL.name });
  await expect(ownRow).toContainText('εμείς · χειροκίνητα');
  const sheet = page.getByTestId('result-sheet');
  const keys = sheet.getByRole('group', { name: 'Πληκτρολόγιο' });
  const type = async (digits: string) => {
    for (const k of digits) await keys.getByRole('button', { name: k, exact: true }).click();
  };
  // «Καμία αλλαγή» closes without a change.
  await ownRow.click();
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('input, select, textarea')).toHaveCount(0);
  await expect(sheet.getByRole('tab', { name: /^Ώρα/ })).toHaveAttribute('aria-selected', 'true');
  await expect(sheet.getByTestId('result-readout')).toContainText(/^10:0\d:\d\d/);
  const keyH = await keys.getByRole('button', { name: '5', exact: true }).evaluate((el) => el.getBoundingClientRect().height);
  expect(keyH).toBeGreaterThanOrEqual(50);
  await sheet.getByRole('button', { name: 'Καμία αλλαγή' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(ownRow).toContainText('εμείς · χειροκίνητα');
  // «Αποθήκευση · επόμενο ›»: our time as it is (now «επίσημο»), and on to the opponent.
  await ownRow.click();
  await sheet.getByTestId('result-save-next').click();
  await expect(sheet.getByRole('heading', { name: RIVAL.name })).toBeVisible();
  await expect(ownRow).toContainText('εμείς · επίσημο');
  // A wrong time blocks the save; the digits fill from the right.
  await sheet.getByRole('tab', { name: /^Χρόνος/ }).click();
  await type('17500');
  await expect(sheet.getByTestId('result-readout')).toContainText('01:75:00');
  await expect(sheet.getByTestId('result-calc')).toHaveText('Λεπτά και δευτερόλεπτα έως 59.');
  await expect(sheet.getByTestId('result-save')).toBeDisabled();
  await keys.getByRole('button', { name: 'Σβήσε το τελευταίο ψηφίο' }).click();
  await expect(sheet.getByTestId('result-readout')).toContainText('00:17:50');
  await expect(sheet.getByTestId('result-calc')).toContainText('Τερματισμός ');
  // A code instead of the time (they exclude each other).
  await sheet.getByRole('tab', { name: /^Κωδικός/ }).click();
  await sheet.getByRole('button', { name: /^DNF/ }).click();
  await expect(sheet.getByTestId('result-calc')).toHaveText('DNF = 3 βαθμοί');
  await sheet.getByTestId('result-save').click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('.snack')).toContainText(`${RIVAL.name}: DNF · 3 βαθμοί`);
  await expect(rival).toContainText('DNF');
  await expect(rival).toContainText('επίσημο');
  await editor.getByTestId('results-done').click();

  // The event screen: the standing with the code (N = 2 → 3 points).
  const screen = page.getByTestId('event-screen');
  await expect(screen).toBeVisible();
  const table = screen.getByTestId('event-standing');
  await expect(table.getByTestId('standing-own')).toContainText('1');
  await expect(table.getByTestId('standing-own')).toContainText('◂');
  await expect(table.getByRole('row', { name: new RegExp(RIVAL.name) })).toContainText('DNF 3');
  await expect(screen).toContainText('DNC, DNS, OCS, DNF, RET, DSQ, DNE: 3 βαθμοί (σκάφη στην κλάση + 1). Το DNE δεν απορρίπτεται.');
  await expect(screen).toContainText('Παράρτημα A (θέσεις) · ισοβαθμία: Παράρτημα A8 · χωρίς απορρίψεις.');

  // AC 10: the home card proposes the 2nd race with the same boats.
  await app.tab('Αρχική');
  const card = page.getByTestId('home-event');
  await expect(card).toContainText(`${EVENT} · μετά την 1η: 1ος στη γενική`);
  await expect(card).toContainText('→ 2η ιστιοδρομία');
  await expect(card).toContainText('δεν έχει στηθεί · ίδιο σκάφος και αντίπαλοι');
  await card.getByTestId('home-event-go').click();
  await expect(page.getByTestId('setup-event-sub')).toHaveText(`${EVENT} · 2η ιστιοδρομία`);
  await expect(page.getByTestId('same-entries')).toHaveText('ίδιοι 2 με την 1η ιστιοδρομία');
  await expect(page.locator('.race-setup .entries')).toContainText(RIVAL.name);
  await page.getByLabel('Όνομα ιστιοδρομίας').fill('Αίγινα–Πειραιάς');
  await page.getByLabel('Εκκίνηση', { exact: true }).fill('2026-11-14T10:20');

  // AC 11: saved for later, it shows only in the event card.
  await page.getByRole('button', { name: 'Αποθήκευση για αργότερα' }).click();
  await expect(card).toContainText('→ 2η ιστιοδρομία: Αίγινα–Πειραιάς');
  await expect(page.getByRole('heading', { name: 'Επόμενος αγώνας' })).toHaveCount(0);
  await card.getByTestId('home-event-go').click();
  await page.getByRole('button', { name: 'Αποθήκευση και έναρξη' }).click();
  await expect(page.getByTestId('session-end')).toBeVisible();
  db = await stored(page);
  const [r1, r2] = db.races.sort((a, b) => a.start - b.start);
  expect(r2.entries.map((e) => e.id)).toEqual(r1.entries.map((e) => e.id));
  // Our race 2 lasts ~6′ (start 10:20); the opponent's 5′ makes it 1st there.
  await app.advance(20 * MIN);
  await expect(page.locator('.sbar .modeb')).toContainText('2η ιστιοδρομία · Αίγινα–Πειραιάς');
  await endRace(page, /^Τερματισμός 2ης ιστιοδρομίας;$/);
  await app.advance(11_000, 1000);

  // The opponent gets a finish time of day for race 2: 1st there; overall we stay 1st (1 + 2 vs 3 + 1).
  await page.getByTestId('event-after').getByTestId('after-results').click();
  const rival2 = page.getByTestId('result-row').filter({ hasText: RIVAL.name });
  await rival2.click();
  await sheet.getByRole('tab', { name: /^Ώρα/ }).click();
  await type('102500');
  await expect(sheet.getByTestId('result-readout')).toContainText('10:25:00');
  await expect(sheet.getByTestId('result-calc')).toContainText('Πραγματικός 0:05:00');
  await expect(sheet.getByTestId('result-calc')).toContainText('1η θέση');
  await sheet.getByTestId('result-save').click();
  await expect(rival2).toContainText('τερμ. 10:25:00');
  await page.getByTestId('results-done').click();
  await expect(screen.getByTestId('event-header')).toHaveText('2 ιστιοδρομίες · Παράρτημα A (θέσεις) · απορρίψεις 0 από 3 · σε εξέλιξη');
  await expect(table.locator('thead th')).toHaveText(['#', 'σκάφος', '1η', '2η', 'σύνολο']);
  await expect(table.getByTestId('standing-own')).toContainText(/^1.*1.*2.*3$/);
  await expect(table.getByRole('row', { name: new RegExp(RIVAL.name) })).toContainText(/^2.*DNF 3.*1.*4$/);

  // AC 35: one card in the History.
  await app.tab('Ιστορικό');
  await expect(page.getByTestId('history-event')).toHaveCount(1);
  await expect(page.getByTestId('history-event')).toContainText('Διοργάνωση · 2 ιστιοδρομίες · σε εξέλιξη');
  await expect(page.getByTestId('history-item')).toHaveCount(0);
});

/** A position `n` NM along the last leg past F (negative: before it, on P's side). */
function nearFinish(n: number) {
  const [, A, F] = COURSE.marks;
  const k = Math.cos((F.lat * Math.PI) / 180);
  const dx = (F.lon - A.lon) * 60 * k;
  const dy = (F.lat - A.lat) * 60;
  const len = Math.hypot(dx, dy);
  return { latitude: F.lat + (n * dy) / len / 60, longitude: F.lon + (n * dx) / len / 60 / k };
}

test('γραμμή τερματισμού: πέρασμα → «Όχι» → ξανά πέρασμα → «Ναι» 2′ αργότερα', async ({ app, context }) => {
  test.setTimeout(120_000);
  const { page } = app;
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: COURSE.marks[0].lat, longitude: COURSE.marks[0].lon });
  await ready(app);
  await page.getByRole('button', { name: /^Αγώνας:/ }).click();
  await page.getByLabel('Όνομα', { exact: true }).fill('Γραμμή');
  await page.getByLabel('Εκκίνηση', { exact: true }).fill('2026-11-14T10:02');
  await page.getByRole('button', { name: 'Αποθήκευση και έναρξη' }).click();
  await expect(page.getByTestId('session-end')).toBeVisible();
  await app.advance(3 * MIN);

  const go = async (p: { latitude: number; longitude: number }, ms = 1000) => {
    await context.setGeolocation(p);
    await app.advance(ms, 1000);
  };
  // Crossing near the start (S = F's side, not armed: the next mark is the upper one): nothing.
  await go(nearFinish(-0.05));
  await go(nearFinish(0.05));
  await expect(page.getByTestId('finish-sheet')).toHaveCount(0);
  // Round the upper mark: armed (AC 15).
  await go({ latitude: COURSE.marks[1].lat, longitude: COURSE.marks[1].lon }, 6000);
  await go(nearFinish(-0.05), 6000);
  await go(nearFinish(0.05));
  const sheet = page.getByTestId('finish-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading')).toHaveText(/^Τερματίσατε στις \d\d:\d\d:\d\d;$/);
  await expect(page.getByTestId('session-end')).toHaveCount(0);
  // AC 21: «Όχι»: going on; noise at the line does not ask again.
  await sheet.getByTestId('finish-no').click();
  await expect(page.getByTestId('session-strip')).toContainText('Συνεχίζουμε · η καταγραφή συνεχίζει');
  await go(nearFinish(-0.02));
  await go(nearFinish(0.02));
  await expect(sheet).toHaveCount(0);
  // Back on P's side > 0,1 NM, then across again.
  await go(nearFinish(-0.2), 6000);
  await go(nearFinish(-0.03), 6000);
  await go(nearFinish(0.03));
  await expect(sheet).toBeVisible();
  const title = await sheet.getByRole('heading').innerText();
  const crossAt = title.match(/(\d\d:\d\d:\d\d)/)![1];
  // AC 20: «Ναι» 2′ later keeps the time of the crossing.
  await app.advance(2 * MIN);
  await expect(sheet).toContainText(/πριν από 2:0\d/);
  await sheet.getByTestId('finish-yes').click();
  await expect(page.getByTestId('ended-line')).toHaveText(`Τερματισμός ${crossAt} · από το πέρασμα της γραμμής, για τον διορθωμένο χρόνο`);
  const r = (await stored(page)).races.find((x) => x.name === 'Γραμμή')!;
  expect(r.finishCross?.answered).toBe('yes');
  expect(r.finish).toBe(r.finishCross!.t);
});

/** Five races of an event with long Greek names, written straight into the device database. */
async function seedEvent(page: Page) {
  await page.evaluate(async () => {
    const DAY = 86_400_000;
    const t0 = new Date('2026-11-01T11:00:00+02:00').getTime();
    const sc = [{ id: 'coastal', label: 'Coastal', tod: 600, tot: 1 }];
    const names = ['Αστάρτη ΙΙ της Αιγίνης', 'Μελτέμι του Σαρωνικού', 'Γαλήνη Τρίτη', 'Ζέφυρος ο Αργοναύτης', 'Ναυσικά'];
    const entries = names.map((n, i) => ({
      id: i ? `o${i}` : 'own',
      name: n,
      sailNo: `GRE-${100 + i}`,
      own: i === 0,
      source: i ? 'boats' : 'own',
      boat: { scoring: sc },
    }));
    const races = [0, 1, 2, 3, 4].map((d) => ({
      id: `ev-r${d}`,
      name: `Ιστιοδρομία ανοιχτής θαλάσσης ${d + 1}`,
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
    const event = {
      id: 'ev-long',
      name: 'Χειμερινό Πρωτάθλημα Ανοιχτής Θαλάσσης Σαρωνικού 2026',
      scoring: 'points',
      discards: 1,
      discardFrom: 4,
      status: 'open',
      createdAt: t0,
      updatedAt: t0,
    };
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

test('@narrow διοργάνωση 5 ιστιοδρομιών: Νύχτα, «Πολύ μεγάλα», χωρίς οριζόντια κύλιση της σελίδας', async ({ app }) => {
  test.setTimeout(90_000);
  const { page } = app;
  await ready(app);
  await seedEvent(page);
  await app.setSettings({ theme: 'night', textSize: 'xl' });
  await expect(page.locator('html')).toHaveAttribute('data-size', 'xl');
  const card = page.getByTestId('home-event');
  await expect(card).toContainText('μετά την 5η');
  expect(await noHorizontalOverflow(page), 'αρχική').toEqual([]);
  await card.getByRole('button', { name: 'Δες τη διοργάνωση' }).click();
  const screen = page.getByTestId('event-screen');
  await expect(screen.getByTestId('event-standing')).toBeVisible();
  await expect(screen).toContainText('απορρίψεις: 1 από 4 ολοκληρωμένες ιστιοδρομίες, σε παρένθεση.');
  await expect(screen).toContainText('Περιέχει εκτιμήσεις (εκτ.).');
  // The full name stays in the title; the table scrolls inside its card only.
  await expect(screen.locator('.c-boat[title="Μελτέμι του Σαρωνικού"]')).toHaveCount(1);
  // B1: whole names, wrapped, never cut with «…».
  await expect(screen.locator('tbody .c-boat[title="Μελτέμι του Σαρωνικού"]')).toContainText('Μελτέμι του Σαρωνικού');
  const cut = await screen.locator('tbody .c-boat').evaluateAll((els) =>
    els.filter((el) => el.scrollWidth > el.clientWidth + 1 || getComputedStyle(el.querySelector('.nm') ?? el).textOverflow === 'ellipsis').map((el) => el.textContent),
  );
  expect(cut).toEqual([]);
  expect(await noHorizontalOverflow(page), 'διοργάνωση').toEqual([]);
  const region = screen.getByRole('region', { name: /Γενική κατάταξη/ });
  const w = await region.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  if (w.scroll > w.client) await expect(screen.getByText('⇆ Σύρε τον πίνακα για όλες τις ιστιοδρομίες')).toBeVisible();
  await test.info().attach('event-night-xl.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  // Only the last race is open; the older ones fold to one line and open on a tap.
  await expect(screen.getByTestId('race-toggle')).toHaveCount(5);
  await expect(screen.getByTestId('open-results')).toHaveCount(1);
  await expect(screen.getByTestId('race-toggle').first()).toHaveAttribute('aria-expanded', 'false');
  await screen.getByTestId('race-toggle').first().click();
  await expect(screen.getByTestId('open-results')).toHaveCount(2);
  await screen.getByTestId('race-toggle').first().click();
  // The results editor of the 5th race: the estimate is marked, the sheet fits without page overflow.
  await screen.getByTestId('open-results').last().click();
  await expect(page.getByTestId('results-editor')).toBeVisible();
  await expect(page.getByTestId('result-row').filter({ hasText: 'Ζέφυρος' })).toContainText('εκτίμηση');
  expect(await noHorizontalOverflow(page), 'αποτελέσματα').toEqual([]);
  await test.info().attach('results-night-xl.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.getByTestId('result-row').filter({ hasText: 'Ζέφυρος' }).click();
  const sheet = page.getByTestId('result-sheet');
  await expect(sheet).toBeVisible();
  expect(await noHorizontalOverflow(page), 'φύλλο αποτελέσματος').toEqual([]);
  // B2: the tab words and the boat name stay whole (one line box per word).
  const split = await sheet.locator('[role="tab"], h3').evaluateAll((els) =>
    els.flatMap((el) => {
      const t = el.firstChild;
      if (!t || t.nodeType !== Node.TEXT_NODE) return [];
      const out: string[] = [];
      const text = t.textContent ?? '';
      for (const m of text.matchAll(/\S+/g)) {
        const r = document.createRange();
        r.setStart(t, m.index!);
        r.setEnd(t, m.index! + m[0].length);
        const tops = new Set([...r.getClientRects()].map((x) => Math.round(x.top)));
        if (tops.size > 1) out.push(m[0]);
      }
      return out;
    }),
  );
  expect(split).toEqual([]);
  const box = await sheet.evaluate((el) => ({ w: el.scrollWidth, cw: el.clientWidth }));
  expect(box.w).toBeLessThanOrEqual(box.cw + 1);
  await test.info().attach('result-sheet-night-xl.png', { body: await page.screenshot(), contentType: 'image/png' });
});
