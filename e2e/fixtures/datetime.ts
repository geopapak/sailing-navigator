/**
 * P-056 §Κ: date and time are two text fields (DateTimeField, «ηη/μμ/εεεε» + «ΩΩ:ΛΛ»), not a
 * `datetime-local`. Types them as digits, the way a phone's numeric keyboard does («/» and «:» come by themselves).
 */
import type { Page } from '@playwright/test';

/** Fills the field group `label` (e.g. «Εκκίνηση») with a local time written as «2026-11-14T10:02». */
export async function fillDateTime(page: Page, label: string, local: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error(`fillDateTime: ${local}`);
  const g = page.getByRole('group', { name: label, exact: true });
  const d = g.getByLabel(`${label}, ημερομηνία`);
  const t = g.getByLabel(`${label}, ώρα`);
  await d.fill('');
  await d.pressSequentially(`${m[3]}${m[2]}${m[1]}`);
  await t.fill('');
  await t.pressSequentially(`${m[4]}${m[5]}`);
  await t.blur();
}
