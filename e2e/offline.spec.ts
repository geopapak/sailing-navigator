/**
 * Flow 6 @sw: the app opens without internet (criteria 52–53).
 * The layout checks (Νύχτα, «Πολύ μεγάλα», 320 px; criteria 54–56) are in layout.spec.ts:
 * they do not need the service worker, so they also run in the 320 px projects.
 */
import { test, expect } from './fixtures/sw';
import { boatItem } from './fixtures/handlers';
import { runningTrackLength } from './fixtures/session';

test.use({ scenario: { boats: [boatItem()] }, clockStart: new Date('2026-11-14T10:00:00+02:00').getTime() });

const strip = 'Χωρίς ίντερνετ. Μπορείς να ξεκινήσεις έξοδο κανονικά.';

test('52–53: offline ανοίγει από την cache, μένει συνδεδεμένος, η προπόνηση γράφει ίχνος', async ({ sw, context }) => {
  const { page } = sw;
  await sw.install();
  await sw.signIn();
  await expect(page.getByRole('combobox', { name: 'Ενεργό σκάφος' })).toHaveValue('e2e-astarti');
  await sw.useSimulator();

  // 52
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('screen-title')).toHaveText('Νέα έξοδος');
  await expect(page.getByRole('status').filter({ hasText: strip })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Email' })).toHaveCount(0);

  // 53
  await page.getByRole('button', { name: /^Προπόνηση:/ }).click();
  await page.getByRole('button', { name: '● Έναρξη προπόνησης' }).click();
  await expect(page.getByText('Χωρίς ίντερνετ. Η καταγραφή και το Live δουλεύουν κανονικά.')).toBeVisible();
  await sw.advance(60_000);
  await expect(page.getByTestId('session-strip')).toContainText(/Καταγραφή κάθε 15″/);
  expect(await runningTrackLength(page)).toBeGreaterThanOrEqual(3);
  await context.setOffline(false);
  await expect(page.getByText('Συνδέθηκε ξανά ✓')).toBeVisible();
  await sw.advance(4000, 1000);
  await expect(page.getByText('Συνδέθηκε ξανά ✓')).toHaveCount(0);
});
