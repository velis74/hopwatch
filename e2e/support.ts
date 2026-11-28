import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

/** Ljubljana railway station, ~20 m from this position (MOTIS stop ijpp_1122804). */
export const NEAR_LJUBLJANA = { latitude: 46.0584, longitude: 14.5127 };
export const NEAREST_STOP = 'Ljubljana';
export const DESTINATION = 'Kranj';
export const OTHER_STOP = 'Lesce-Bled';

export type Experience = 'Simple and large' | 'Lively';

/** The table of departures from `stop`. */
export function departuresList(page: Page, stop: string = NEAREST_STOP): Locator {
  return page.getByRole('table', {
    name: `Departures from ${stop}`,
    exact: true,
  });
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

/**
 * Waits until the page's running finite animations and transitions (e.g. list items fading in) have finished. A paused
 * animation (e.g. a hidden progress bar) does not finish until it plays.
 */
export async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === 'running' && animation.effect?.getComputedTiming().endTime !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

/**
 * Asserts that axe finds no serious or critical WCAG 2.2 A/AA violations on the page. Finite animations finish first:
 * text half faded in fails the contrast check.
 */
export async function expectNoSeriousViolations(page: Page): Promise<void> {
  await settleAnimations(page);
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
  // click goes to the field's position, as a pointer user's does. A click outside the viewport reaches nothing.
  await expect(field).toBeVisible();
  await expect(field).toBeEnabled();
  await field.scrollIntoViewIfNeeded();
  const box = await field.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  const choice = page.getByRole('option', { name: option });
  await expect(choice).toBeVisible();
  // The menu has finished opening, as a user sees it before choosing.
  await settleAnimations(page);
  await choice.click();
}

/** Searches for a stop through the "From" field and chooses it. */
export async function pickStop(page: Page, name: string): Promise<void> {
  await chooseStop(page, 'From', name);
}

export type StopField = 'From' | 'To';

export const STOP_IDS: Record<string, string> = {
  [NEAREST_STOP]: 'ijpp_1122804',
  [DESTINATION]: 'ijpp_1122811',
  [OTHER_STOP]: 'ijpp_1122816',
};

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Matches an accessible name that is the stop name, optionally followed by details after a comma or a line break. */
export function stopNamePattern(name: string): RegExp {
  return new RegExp(`^${escapeRegExp(name)}(?![\\p{L}\\p{N} ])`, 'u');
}

export function stopField(page: Page, label: StopField): Locator {
  return page.getByRole('combobox', { name: label, exact: true });
}

/** Types into a stop search field and chooses the stop with exactly that name. */
export async function chooseStop(page: Page, label: StopField, name: string): Promise<void> {
  await searchStop(page, label, name);
  await expectStopShown(page, label, name);
}

/** Types into a stop search field and chooses the stop, without reading the field back (it may collapse). */
export async function searchStop(page: Page, label: StopField, name: string): Promise<void> {
  const field = stopField(page, label);
  await expect(field).toBeVisible();
  await expect(field).toBeEnabled();
  await field.fill(name);
  await page
    .getByRole('option', { name: stopNamePattern(name) })
    .first()
    .click();
}

/** Text a stop field shows: its own value, or the selection drawn next to it inside the same field. */
export async function stopFieldText(field: Locator): Promise<string> {
  return field.evaluate((element) => {
    const input = element as HTMLInputElement;
    if (input.value) return input.value;
    const others = (node: Element) =>
      Array.from(node.querySelectorAll('[role="combobox"], input')).some(
        (other) => other !== element && !element.contains(other),
      );
    let container: Element = element;
    for (let i = 0; i < 6 && container.parentElement && !others(container.parentElement); i += 1) {
      container = container.parentElement;
    }
    return (container as HTMLElement).innerText ?? container.textContent ?? '';
  });
}

export async function expectStopShown(page: Page, label: StopField, name: string): Promise<void> {
  const field = stopField(page, label);
  await expect
    .poll(() => stopFieldText(field), { message: `${label} shows ${name}` })
    .toMatch(new RegExp(`(^|\\n)\\s*${escapeRegExp(name)}\\s*($|\\n|,)`));
}

/** Empties a stop field with its clear button, or by deleting its text when it has none. */
export async function clearStop(page: Page, label: StopField): Promise<void> {
  const field = stopField(page, label);
  const clear = page.getByRole('button', {
    name: new RegExp(`^clear\\b.*\\b${label}$`, 'i'),
  });
  if ((await clear.count()) > 0) {
    await clear.first().click();
  } else {
    await field.fill('');
    await field.press('Backspace');
    await field.press('Escape');
  }
}

/** The departures board; its name names the From stop. */
export function departuresBoard(page: Page): Locator {
  return page.getByRole('table', { name: /^Departures from /u });
}

/** The table of itineraries, named by the "Journeys" heading. */
export function journeysList(page: Page): Locator {
  return page.getByRole('table', { name: 'Journeys', exact: true });
}

/** Rendered itinerary rows of the journey table (not its header row). */
export function itineraryItems(list: Locator): Locator {
  return list.locator('[role="row"].df-anchored');
}

export function isApiRequest(url: string, pathname: string): boolean {
  return new URL(url).pathname === pathname;
}

/** Calendar day (YYYY-MM-DD), hour and minute of a moment in Europe/Ljubljana. */
export function ljubljanaParts(date: Date): {
  day: string;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Ljubljana',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    day: `${value('year')}-${value('month')}-${value('day')}`,
    hour: Number(value('hour')),
    minute: Number(value('minute')),
  };
}

/** Rendered departure rows of a departures table (not its header row). */
export function departureItems(list: Locator): Locator {
  return list.locator('[role="row"].df-anchored');
}

export function randomEmail(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export function randomPassword(): string {
  return `Hw-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** A stop of a ride as GET /api/v1/trips/{trip_id} answers it. */
export interface TripStop {
  id: string;
  name: string;
  scheduled_arrival: string | null;
  expected_arrival: string | null;
  scheduled_departure: string | null;
  expected_departure: string | null;
  delay_minutes: number | null;
  platform: string | null;
  cancelled: boolean;
  passed: boolean;
}

/** One ride as GET /api/v1/trips/{trip_id} answers it. */
export interface Trip {
  trip_id: string;
  mode: string;
  line: string;
  headsign: string;
  operator: { id: string; name: string; url: string | null } | null;
  cancelled: boolean;
  bikes_allowed: boolean | null;
  wheelchair_accessible: boolean | null;
  ticket_url: string | null;
  stops: TripStop[];
}

export const TRIPS = '/api/v1/trips/';

/** Waits for the ride answer the details view loads. */
export async function tripResponse(page: Page): Promise<Trip> {
  const response = await page.waitForResponse(
    (candidate) => new URL(candidate.url()).pathname.startsWith(TRIPS) && candidate.request().method() === 'GET',
  );
  expect(response.status(), response.url()).toBe(200);
  return (await response.json()) as Trip;
}

/** The control of a list item (departure or itinerary) that opens its details. */
export function detailsControl(item: Locator): Locator {
  return item.getByRole('link', { name: /\bdetails\b/i }).or(item.getByRole('button', { name: /\bdetails\b/i }));
}

/** Hours and minutes of an ISO time in Europe/Ljubljana, as the app shows them (en-GB, 24 h). */
export function hhmm(iso: string): string {
  const { hour, minute } = ljubljanaParts(new Date(iso));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Waits until a visible heading has focus and returns its text. */
export async function focusedHeading(page: Page): Promise<string> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const element = document.activeElement;
          if (!element || !element.checkVisibility()) return false;
          return /^H[1-6]$/.test(element.tagName) || element.getAttribute('role') === 'heading';
        }),
      { message: 'a visible heading has focus' },
    )
    .toBe(true);
  return page.evaluate(() => (document.activeElement as HTMLElement).innerText.trim());
}

/** Asserts that a live region names the view whose heading has focus. */
export async function expectViewAnnounced(page: Page, heading: string): Promise<void> {
  const normalise = (text: string) => text.replace(/\s+/g, ' ').trim();
  const expected = normalise(heading);
  await expect
    .poll(
      async () =>
        (
          await page
            .locator('[aria-live="polite"], [aria-live="assertive"], [role="status"], [role="alert"]')
            .allTextContents()
        ).some((text) => normalise(text).includes(expected)),
      { message: `a live region announces "${expected}"` },
    )
    .toBe(true);
}

/** The map region. */
export function mapRegion(page: Page): Locator {
  return page.getByRole('region', { name: 'Map', exact: true });
}

/** The one-line summary of the collapsed form and its "Change" button. */
export function changeSearch(page: Page): Locator {
  return page.getByRole('button', { name: 'Change', exact: true });
}
