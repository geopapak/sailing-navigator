/**
 * The active boat on Home (P-049 A8): since 0.19.0 a chip in the top bar that opens the sheet
 * «Ενεργό σκάφος» (it replaced the `<select aria-label="Ενεργό σκάφος">`).
 */
import { expect, type Page } from '@playwright/test';

/** The chip of the active boat (Home only). */
export const boatChip = (page: Page) => page.getByTestId('boat-chip');

/** Home shows `id` as the active boat. */
export async function expectActiveBoat(page: Page, id: string) {
  await expect(boatChip(page)).toHaveAttribute('data-boat-id', id);
}

/** Chip → «Ενεργό σκάφος» → the boat's row; the sheet closes on the tap. */
export async function selectBoat(page: Page, name: string) {
  await boatChip(page).click();
  const sheet = page.getByTestId('boat-sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByRole('radio', { name }).click();
  await expect(sheet).toHaveCount(0);
}
