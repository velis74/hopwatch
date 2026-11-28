import { expect, type Page, test } from '@playwright/test';

import {
  chooseExperience,
  departureItems,
  DESTINATION,
  departuresBoard,
  escapeRegExp,
  expectNoSeriousViolations,
  expectStopShown,
  inServiceHours,
  isApiRequest,
  navigateTo,
  NEAR_LJUBLJANA,
  NEAREST_STOP,
  STOP_IDS,
  stopNamePattern,
} from './support';

/** A bus station about 160 m from the fixture stop (MOTIS stop ijpp_1168813). */
const NEARBY_STOP = 'Ljubljana AP';
const NEARBY_STOP_ID = 'ijpp_1168813';

/** "<name>, <modes>, <distance> m" */
const NEARBY_LABEL = /^(.+?), (.*), (\d+) m$/u;

function nearbyStops(page: Page) {
  return page.getByRole('group', { name: 'Nearby stops', exact: true });
}

function nearbyCheckbox(page: Page, name: string) {
  return nearbyStops(page).getByRole('checkbox', { name: new RegExp(`^${escapeRegExp(name)}, `, 'u') });
}

async function nearbyLabels(page: Page): Promise<{ label: string; checked: boolean }[]> {
  const boxes = nearbyStops(page).getByRole('checkbox');
  await expect(boxes.first()).toBeVisible();
  const result: { label: string; checked: boolean }[] = [];
  for (const box of await boxes.all()) {
    const label = await box.evaluate((element) => {
      const input = element as HTMLInputElement;
      const byId = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
      const text = input.getAttribute('aria-label') ?? (byId ?? input.closest('label'))?.textContent ?? '';
      return text.replace(/\s+/g, ' ').trim();
    });
    result.push({ label, checked: await box.isChecked() });
  }
  return result;
}

async function openHome(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Departures', exact: true })).toBeVisible();
  await expectStopShown(page, 'From', NEAREST_STOP);
  await expect(nearbyStops(page)).toBeVisible();
}

test.use({ geolocation: NEAR_LJUBLJANA, permissions: ['geolocation'] });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await chooseExperience(page);
  await openHome(page);
});

test('"Nearby stops" lists other stops within 300 m, all unchecked by default', async ({ page }) => {
  const stops = await nearbyLabels(page);
  expect(stops.length).toBeGreaterThan(0);
  for (const { label, checked } of stops) {
    const parts = NEARBY_LABEL.exec(label);
    expect(parts, `"${label}" is "<name>, <modes>, <distance> m"`).not.toBeNull();
    expect(parts![1], 'the From stop itself is not listed').not.toBe(NEAREST_STOP);
    expect(Number(parts![3]), label).toBeLessThanOrEqual(300);
    expect(checked, label).toBe(false);
  }
  expect(stops.map(({ label }) => NEARBY_LABEL.exec(label)?.[1])).toContain(NEARBY_STOP);
  await expectNoSeriousViolations(page);
});

test('checking a nearby stop merges its departures, each named by its stop', async ({ page }) => {
  const merged = page.waitForRequest((request) => {
    if (!isApiRequest(request.url(), '/api/v1/departures')) return false;
    const ids = new URL(request.url()).searchParams.getAll('stop_id');
    return ids.includes(STOP_IDS[NEAREST_STOP]) && ids.includes(NEARBY_STOP_ID);
  });
  const box = nearbyCheckbox(page, NEARBY_STOP);
  await box.check();
  await expect(box).toBeChecked();
  const response = await (await merged).response();
  expect(response?.status()).toBe(200);
  const departures = (await response!.json()) as { stop_id: string; stop_name: string }[];

  test.skip(!inServiceHours() || departures.length === 0, 'no departures expected at this hour');
  const items = departureItems(departuresBoard(page));
  await expect(items.first()).toBeVisible();
  if (departures.some((departure) => departure.stop_id === NEARBY_STOP_ID)) {
    await expect(items.filter({ hasText: NEARBY_STOP }).first()).toBeVisible();
  }
  // With two stops in the board every departure names its stop.
  for (const text of await items.allInnerTexts()) {
    expect(text).toMatch(new RegExp(`${escapeRegExp(NEAREST_STOP)}|${escapeRegExp(NEARBY_STOP)}`, 'u'));
  }
  await expectNoSeriousViolations(page);

  const single = page.waitForRequest(
    (request) =>
      isApiRequest(request.url(), '/api/v1/departures') &&
      new URL(request.url()).searchParams.getAll('stop_id').join() === STOP_IDS[NEAREST_STOP],
  );
  await box.uncheck();
  await single;
});

test('"Include nearby stops by default" checks the stops of the chosen modes', async ({ page }) => {
  await navigateTo(page, 'Settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  const defaults = page.getByRole('group', { name: 'Include nearby stops by default', exact: true });
  await expect(defaults).toBeVisible();
  for (const mode of ['Trains', 'Buses', 'Trams', 'Other']) {
    await expect(defaults.getByRole('checkbox', { name: mode, exact: true })).not.toBeChecked();
  }
  await expectNoSeriousViolations(page);

  await defaults.getByRole('checkbox', { name: 'Buses', exact: true }).check();
  await page.reload();
  await expect(
    page.getByRole('group', { name: 'Include nearby stops by default' }).getByRole('checkbox', { name: 'Buses' }),
  ).toBeChecked();

  await page.goto('/');
  await openHome(page);
  const stops = await nearbyLabels(page);
  const busStops = stops.filter(({ label }) => /\bbus/iu.test(NEARBY_LABEL.exec(label)?.[2] ?? ''));
  expect(busStops.length, stops.map(({ label }) => label).join('; ')).toBeGreaterThan(0);
  for (const { label, checked } of stops) {
    expect(checked, label).toBe(busStops.some((stop) => stop.label === label));
  }
  await expect(nearbyCheckbox(page, NEARBY_STOP)).toBeChecked();
});

test('"Add a stop" adds a stop by name, checked, and merges its departures', async ({ page }) => {
  const merged = page.waitForRequest((request) => {
    if (!isApiRequest(request.url(), '/api/v1/departures')) return false;
    const ids = new URL(request.url()).searchParams.getAll('stop_id');
    return ids.includes(STOP_IDS[NEAREST_STOP]) && ids.includes(STOP_IDS[DESTINATION]);
  });
  const add = nearbyStops(page).getByRole('combobox', { name: 'Add a stop', exact: true });
  await add.fill(DESTINATION);
  await page
    .getByRole('option', { name: stopNamePattern(DESTINATION) })
    .first()
    .click();

  const box = nearbyCheckbox(page, DESTINATION);
  await expect(box).toBeChecked();
  await expect(nearbyStops(page).getByRole('button', { name: `Remove ${DESTINATION}`, exact: true })).toBeVisible();
  const response = await (await merged).response();
  expect(response?.status()).toBe(200);
  const departures = (await response!.json()) as { stop_id: string }[];
  await expectNoSeriousViolations(page);

  if (inServiceHours() && departures.some((departure) => departure.stop_id === STOP_IDS[DESTINATION])) {
    await expect(departureItems(departuresBoard(page)).filter({ hasText: DESTINATION }).first()).toBeVisible();
  }

  // The added stop is remembered for this From stop.
  await page.reload();
  await openHome(page);
  await expect(nearbyCheckbox(page, DESTINATION)).toBeChecked();
});
