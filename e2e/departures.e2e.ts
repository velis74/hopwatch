import { expect, test } from '@playwright/test';

import {
  chooseExperience,
  departureItems,
  departuresList,
  DESTINATION,
  expectHeadingsInOrder,
  expectNoSeriousViolations,
  inServiceHours,
  ljubljanaMinutesNow,
  NEAR_LJUBLJANA,
  NEAREST_STOP,
  OTHER_STOP,
  pickStop,
} from './support';

test.describe('with location', () => {
  test.use({ geolocation: NEAR_LJUBLJANA, permissions: ['geolocation'] });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await chooseExperience(page);
    await expect(page.getByRole('heading', { name: 'Departures', exact: true })).toBeVisible();
  });

  test('lists departures from the nearest stop in the next 60 minutes', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 2, name: NEAREST_STOP, exact: true })).toBeVisible();
    await expectHeadingsInOrder(page);
    test.skip(!inServiceHours(), 'no departures expected at the fixture stop at this hour');

    const list = departuresList(page);
    await expect(list).toBeVisible();
    const items = departureItems(list);
    await expect(items.first()).toBeVisible();

    const now = ljubljanaMinutesNow();
    for (const text of await items.allInnerTexts()) {
      const time = /\b(\d{1,2}):(\d{2})\b/.exec(text);
      expect(time, `scheduled time in "${text}"`).not.toBeNull();
      const minutes = Number(time![1]) * 60 + Number(time![2]);
      // A delayed departure keeps its scheduled time, which can be in the past.
      expect(minutes, text).toBeGreaterThanOrEqual(now - 60);
      expect(minutes, text).toBeLessThanOrEqual(now + 61);
      if (/[+−-]\s?\d+ min/.test(text)) expect(text, 'delay names its source').toMatch(/official/i);
    }
    await expectNoSeriousViolations(page);
  });

  test('the destination filter narrows the list and an empty field shows all', async ({ page }) => {
    test.skip(!inServiceHours(), 'no departures expected at the fixture stop at this hour');
    const list = departuresList(page);
    const items = departureItems(list);
    await expect(items.first()).toBeVisible();
    const all = await items.count();

    const destination = page.getByLabel('Destination', { exact: true });
    const filtered = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/departures') && response.url().includes(`destination=${DESTINATION}`),
    );
    await destination.fill(DESTINATION);
    await filtered;
    // Each remaining departure names the matching later stop ("Via …" or "Calls at …").
    await expect
      .poll(async () => (await items.allInnerTexts()).filter((text) => !text.includes(DESTINATION)))
      .toEqual([]);
    expect(await items.count()).toBeLessThanOrEqual(all);

    await destination.fill('Xqzwy');
    await expect(items).toHaveCount(0);

    await destination.fill('');
    // Departures can leave the 60-minute window while the test runs.
    await expect.poll(() => items.count()).toBeGreaterThanOrEqual(Math.max(1, all - 2));
  });

  test('"Change stop" opens the stop search and shows the chosen stop', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 2, name: NEAREST_STOP, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Change stop', exact: true }).click();
    await pickStop(page, OTHER_STOP);
    await expect(page.getByRole('heading', { level: 2, name: OTHER_STOP, exact: true })).toBeVisible();
    if (inServiceHours()) await expect(departuresList(page, OTHER_STOP)).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test('the map is a secondary region with OpenStreetMap attribution', async ({ page }) => {
    const map = page.getByRole('region', { name: 'Map', exact: true });
    await expect(map).toBeVisible();
    await expect(map.getByRole('link', { name: /OpenStreetMap/, includeHidden: true })).not.toHaveCount(0);

    test.skip(!inServiceHours(), 'the departures list is empty at this hour');
    const list = departuresList(page);
    await expect(list).toBeVisible();
    const listFirst = await list.evaluate(
      (element, mapElement) => !!(element.compareDocumentPosition(mapElement!) & Node.DOCUMENT_POSITION_FOLLOWING),
      await map.elementHandle(),
    );
    expect(listFirst, 'the departures list precedes the map').toBe(true);
  });

  test('delay changes have a polite live region and the list refreshes every 30 seconds', async ({ page }) => {
    test.setTimeout(90_000);
    const apiPaths = new Set<string>();
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/api/')) apiPaths.add(pathname);
    });

    await page.reload();
    await expect(page.getByRole('heading', { level: 2, name: NEAREST_STOP, exact: true })).toBeVisible();
    if (inServiceHours()) await expect(departureItems(departuresList(page)).first()).toBeVisible();

    const live = page.locator('[aria-live="polite"]:not([role="alert"])');
    await expect(live).not.toHaveCount(0);

    await page.waitForTimeout(2000);
    const loaded = [...apiPaths];
    expect(loaded.length, 'departures are loaded from /api/').toBeGreaterThan(0);
    // The 30-second refresh repeats one of the initial requests.
    await page.waitForRequest((request) => loaded.includes(new URL(request.url()).pathname), { timeout: 40_000 });
  });
});

test.describe('without location', () => {
  test.use({ permissions: [] });

  test('a stop search replaces the nearest stop', async ({ page }) => {
    await page.goto('/');
    await chooseExperience(page);
    await expect(page.getByRole('heading', { name: 'Departures', exact: true })).toBeVisible();
    await expectNoSeriousViolations(page);

    await pickStop(page, NEAREST_STOP);
    await expect(page.getByRole('heading', { level: 2, name: NEAREST_STOP, exact: true })).toBeVisible();
    if (inServiceHours()) await expect(departureItems(departuresList(page)).first()).toBeVisible();
  });
});
