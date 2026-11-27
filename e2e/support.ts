import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

/** Ljubljana railway station, ~20 m from this position (MOTIS stop ijpp_1122804). */
export const NEAR_LJUBLJANA = { latitude: 46.0584, longitude: 14.5127 };
export const NEAREST_STOP = 'Ljubljana';
export const DESTINATION = 'Kranj';
export const OTHER_STOP = 'Lesce-Bled';

export type Experience = 'Simple and large' | 'Lively';

export function departuresList(page: Page, stop: string = NEAREST_STOP): Locator {
  return page.getByRole('list', { name: `Departures from ${stop}`, exact: true });
}

/** Minutes since midnight in Europe/Ljubljana. */
export function ljubljanaMinutesNow(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Ljubljana',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return value('hour') * 60 + value('minute');
}

/**
 * True while the fixture stop has departures in the next 60 minutes. Outside these hours the departure
 * assertions are skipped.
 */
export function inServiceHours(): boolean {
  const minutes = ljubljanaMinutesNow();
  return minutes >= 5 * 60 + 30 && minutes <= 21 * 60;
}

/** Answers the first-start dialog. */
export async function chooseExperience(page: Page, option: Experience = 'Lively'): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Choose your experience' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: option, exact: true }).check();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(dialog).toBeHidden();
}

/** Asserts that axe finds no serious or critical WCAG 2.2 A/AA violations on the page. */
export async function expectNoSeriousViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => {
      const targets = violation.nodes.map((node) => node.target.join(' ')).join(', ');
      return `${violation.id}: ${violation.help} [${targets}]`;
    });
  expect(serious).toEqual([]);
}

/** Asserts that the visible headings start at level 1 and never skip a level going down. */
export async function expectHeadingsInOrder(page: Page): Promise<void> {
  const levels = await page
    .locator('h1, h2, h3, h4, h5, h6, [role="heading"]')
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.checkVisibility() && !element.closest('[aria-hidden="true"]'))
        .map((element) => Number(element.getAttribute('aria-level') ?? element.tagName.slice(1))),
    );
  expect(levels.length).toBeGreaterThan(0);
  expect(levels[0]).toBe(1);
  for (let i = 1; i < levels.length; i += 1) {
    expect(levels[i], `heading ${i + 1} of ${levels.join(', ')}`).toBeLessThanOrEqual(levels[i - 1] + 1);
  }
}

/** Presses Tab until the target, or one of the elements it matches, has focus. */
export async function tabTo(page: Page, target: Locator, maxPresses = 60): Promise<void> {
  for (let i = 0; i < maxPresses; i += 1) {
    await page.keyboard.press('Tab');
    const focused = await target.evaluateAll((elements) =>
      elements.some((element) => element === document.activeElement || element.contains(document.activeElement)),
    );
    if (focused) return;
  }
  throw new Error(`Tab did not reach ${target.toString()} in ${maxPresses} presses`);
}

/** Chooses an option of a labelled select, native or ARIA combobox. */
export async function chooseOption(page: Page, field: Locator, option: RegExp): Promise<void> {
  if (await field.evaluate((element) => element.tagName === 'SELECT')) {
    const labels = await field.locator('option').allTextContents();
    const label = labels.find((text) => option.test(text.trim()));
    expect(label, `option ${option.toString()} in ${labels.join(', ')}`).toBeDefined();
    await field.selectOption({ label: label!.trim() });
    return;
  }
  // A combobox input may sit under its field's decoration (Vuetify sets `pointer-events: none` on it), so the
  // click goes to the field's position, as a pointer user's does.
  await expect(field).toBeVisible();
  await expect(field).toBeEnabled();
  const box = await field.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.getByRole('option', { name: option }).click();
}

/** Searches for a stop through the "Find a stop" field and chooses it. */
export async function pickStop(page: Page, name: string): Promise<void> {
  const search = page.getByLabel('Find a stop', { exact: true });
  await expect(search).toBeVisible();
  await search.fill(name);
  const choice = page
    .getByRole('option', { name, exact: true })
    .or(page.getByRole('button', { name, exact: true }))
    .or(page.getByRole('link', { name, exact: true }));
  await choice.first().click();
}

/** Visible departure items of a list. */
export function departureItems(list: Locator): Locator {
  return list.getByRole('listitem');
}

export function randomEmail(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export function randomPassword(): string {
  return `Hw-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
