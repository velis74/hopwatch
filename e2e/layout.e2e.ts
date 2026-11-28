import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  changeSearch,
  chooseExperience,
  chooseStop,
  departureItems,
  departuresBoard,
  departuresList,
  DESTINATION,
  detailsControl,
  expectNoSeriousViolations,
  expectViewAnnounced,
  focusedHeading,
  inServiceHours,
  itineraryItems,
  journeysList,
  mainNavigation,
  mapRegion,
  NEAR_LJUBLJANA,
  NEAREST_STOP,
  searchStop,
  stopField,
  tripResponse,
} from './support';

type Box = { x: number; y: number; width: number; height: number };

async function boxOf(locator: Locator): Promise<Box> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, locator.toString()).not.toBeNull();
  return box!;
}

/** Bottom edge of the app bar in the viewport, 0 without one. */
async function appBarBottom(page: Page): Promise<number> {
  const banner = page.getByRole('banner').first();
  if ((await banner.count()) === 0 || !(await banner.isVisible())) return 0;
  const box = await banner.boundingBox();
  return box ? box.y + box.height : 0;
}

/** Asserts that the list and the map are side by side: the map right of the list, their heights overlapping. */
async function expectSideBySide(list: Locator, map: Locator): Promise<void> {
  const listBox = await boxOf(list);
  const mapBox = await boxOf(map);
  expect(mapBox.x, 'the map starts right of the list').toBeGreaterThanOrEqual(listBox.x + listBox.width - 1);
  expect(mapBox.y, 'the map is beside the list, not below it').toBeLessThan(listBox.y + listBox.height);
}

/** The form's submit button opens the list on narrow screens. */
async function submitSearch(page: Page, label: 'Show departures' | 'Find journeys'): Promise<void> {
  await page.getByRole('button', { name: label, exact: true }).click();
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0);
}

test.use({ geolocation: NEAR_LJUBLJANA, permissions: ['geolocation'] });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await chooseExperience(page);
});

test.describe('wide screen', () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, 'two columns only on wide screens');
  });

  test('the form is on top, the departures board and the map below it side by side', async ({ page }) => {
    test.skip(!inServiceHours(), 'the departures list is empty at this hour');
    const list = departuresList(page);
    const map = mapRegion(page);
    await expectSideBySide(list, map);

    const from = await boxOf(stopField(page, 'From'));
    const listBox = await boxOf(list);
    const mapBox = await boxOf(map);
    expect(listBox.y, 'the list is below the form').toBeGreaterThanOrEqual(from.y + from.height);
    expect(mapBox.y, 'the map is below the form').toBeGreaterThanOrEqual(from.y + from.height);
    await expectNoHorizontalScroll(page);
    await expectNoSeriousViolations(page);
  });

  test('the map stays in view at the full height below the app bar while the list scrolls', async ({ page }) => {
    test.skip(!inServiceHours(), 'the departures list is empty at this hour');
    await expect(departureItems(departuresList(page)).first()).toBeVisible();
    const map = mapRegion(page);
    await expect(map).toBeVisible();
    // Scrolled while the list still reaches below the viewport: past the end of the list the map leaves with it.
    const viewport = page.viewportSize()!;
    const listBox = await boxOf(departuresList(page));
    const distance = Math.min(2000, Math.floor(listBox.y + listBox.height - viewport.height - 20));
    test.skip(distance < 200, 'the list is too short to scroll');

    // The wheel over the map zooms the map; the page scrolls with the wheel over the list.
    await page.mouse.move(listBox.x + listBox.width / 2, Math.min(listBox.y + 20, viewport.height - 20));
    await page.mouse.wheel(0, distance);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    const top = await appBarBottom(page);
    await expect
      .poll(async () => Math.round((await boxOf(map)).y), {
        message: 'map sticks below the app bar',
      })
      .toBeLessThanOrEqual(Math.round(top) + 2);
    const box = await boxOf(map);
    expect(box.y + box.height, 'the map reaches the bottom of the viewport').toBeGreaterThanOrEqual(
      viewport.height - 2,
    );
    expect(box.y, 'the map is not under the app bar').toBeGreaterThanOrEqual(top - 2);
  });

  test('journeys and the map are side by side', async ({ page }) => {
    await chooseStop(page, 'To', DESTINATION);
    const list = journeysList(page);
    await expect(itineraryItems(list).first()).toBeVisible();
    await expectSideBySide(list, mapRegion(page));
    const rail = await boxOf(mainNavigation(page));
    const listBox = await boxOf(list);
    expect(listBox.x, 'the list starts right of the navigation rail').toBeGreaterThanOrEqual(rail.x + rail.width - 1);
    await expectNoHorizontalScroll(page);
    await expectNoSeriousViolations(page);
  });

  test('ride details open in the list column, the map draws the ride, "Back to the list" returns', async ({ page }) => {
    test.skip(!inServiceHours(), 'no departures expected at the fixture stop at this hour');
    const item = departureItems(departuresList(page)).first();
    await expect(item).toBeVisible();
    const listBox = await boxOf(departuresList(page));

    const answer = tripResponse(page);
    await detailsControl(item).first().click();
    await answer;
    const heading = await focusedHeading(page);
    await expectViewAnnounced(page, heading);

    const back = page.getByRole('button', {
      name: 'Back to the list',
      exact: true,
    });
    await expect(back).toBeVisible();
    const timeline = page.getByRole('list', { name: /^Stops\b/u });
    const timelineBox = await boxOf(timeline);
    expect(Math.abs(timelineBox.x - listBox.x), 'details are in the list column').toBeLessThanOrEqual(24);
    const map = mapRegion(page);
    await expectSideBySide(timeline, map);
    await expect(map.getByText('Map of the selected ride.', { exact: false })).toBeAttached();
    await expectNoSeriousViolations(page);

    await back.click();
    await expect(departuresList(page)).toBeVisible();
    await expect(back).toHaveCount(0);
    const listHeading = await focusedHeading(page);
    expect(listHeading).toContain(NEAREST_STOP);
    await expectViewAnnounced(page, listHeading);
  });

  test('journey details open in the list column with "Back to the list"', async ({ page }) => {
    await chooseStop(page, 'To', DESTINATION);
    const items = itineraryItems(journeysList(page));
    await expect(items.first()).toBeVisible();
    await detailsControl(items.first()).first().click();
    await expect(page).toHaveURL(/\/journey\b/u);
    await focusedHeading(page);
    await expect(
      mapRegion(page).getByText('Map of the selected journey.', {
        exact: false,
      }),
    ).toBeAttached();
    await expectNoSeriousViolations(page);

    await page.getByRole('button', { name: 'Back to the list', exact: true }).click();
    await expect(itineraryItems(journeysList(page)).first()).toBeVisible();
    expect(await focusedHeading(page)).toBe('Journeys');
  });
});

test.describe('narrow screen', () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(!isMobile, 'the succession of views is for narrow screens');
  });

  test('one column: the map is below the list and nothing scrolls sideways', async ({ page }) => {
    test.skip(!inServiceHours(), 'the departures list is empty at this hour');
    const list = departuresBoard(page);
    const listBox = await boxOf(list);
    const map = mapRegion(page);
    if ((await map.count()) > 0 && (await map.isVisible())) {
      const mapBox = (await map.boundingBox())!;
      expect(mapBox.y, 'the map is below the list').toBeGreaterThanOrEqual(listBox.y + listBox.height - 1);
    }
    await expectNoHorizontalScroll(page);
    await expectNoSeriousViolations(page);
  });

  test('filter, departures, ride details and back: the browser Back returns view by view', async ({ page }) => {
    test.skip(!inServiceHours(), 'no departures expected at this hour');
    if (await changeSearch(page).isVisible()) await changeSearch(page).click();

    // Filter → list: the form collapses to a summary, the list starts at the top.
    await searchStop(page, 'From', DESTINATION);
    await submitSearch(page, 'Show departures');
    const change = changeSearch(page);
    await expect(change).toBeVisible();
    // Departures are always those of the next 60 minutes; the summary names the stop.
    await expect(page.getByText(`Departures from ${DESTINATION}`, { exact: true }).first()).toBeVisible();
    await expect(stopField(page, 'From')).toBeHidden();
    const listHeading = await focusedHeading(page);
    expect(listHeading).toContain(DESTINATION);
    await expectViewAnnounced(page, listHeading);
    const list = departuresList(page, DESTINATION);
    const item = departureItems(list).first();
    await expect(item).toBeVisible();
    const viewport = page.viewportSize()!;
    expect((await boxOf(list)).y, 'the list starts near the top').toBeLessThan(viewport.height / 2);
    await expectNoSeriousViolations(page);

    // List → ride details.
    const answer = tripResponse(page);
    await detailsControl(item).first().click();
    await answer;
    await expect(page).toHaveURL(/\/ride\//u);
    const rideHeading = await focusedHeading(page);
    await expectViewAnnounced(page, rideHeading);
    await expect(page.getByRole('list', { name: /^Stops\b/u })).toBeVisible();
    await expect(list).toBeHidden();
    await expectNoHorizontalScroll(page);
    await expectNoSeriousViolations(page);

    // Back → list.
    await page.goBack();
    await expect(departuresList(page, DESTINATION)).toBeVisible();
    await expect(change).toBeVisible();
    expect(await focusedHeading(page)).toContain(DESTINATION);

    // Back → filter.
    await page.goBack();
    await expect(stopField(page, 'From')).toBeVisible();
    await expect(change).toBeHidden();
    await focusedHeading(page);
    await expectNoSeriousViolations(page);
  });

  test('filter, journeys, journey details and back', async ({ page }) => {
    if (await changeSearch(page).isVisible()) await changeSearch(page).click();
    await searchStop(page, 'To', DESTINATION);
    await submitSearch(page, 'Find journeys');

    await expect(
      page.getByText(new RegExp(`${NEAREST_STOP}\\s*→\\s*${DESTINATION}, leave now`, 'iu')).first(),
    ).toBeVisible();
    const change = changeSearch(page);
    await expect(change).toBeVisible();
    await expect(stopField(page, 'To')).toBeHidden();
    expect(await focusedHeading(page)).toBe('Journeys');
    const items = itineraryItems(journeysList(page));
    await expect(items.first()).toBeVisible();
    await expectNoSeriousViolations(page);

    await detailsControl(items.first()).first().click();
    await expect(page).toHaveURL(/\/journey\b/u);
    const heading = await focusedHeading(page);
    await expectViewAnnounced(page, heading);
    await expect(journeysList(page)).toBeHidden();
    await expectNoHorizontalScroll(page);
    await expectNoSeriousViolations(page);

    await page.goBack();
    await expect(itineraryItems(journeysList(page)).first()).toBeVisible();
    expect(await focusedHeading(page)).toBe('Journeys');

    await page.goBack();
    await expect(stopField(page, 'To')).toBeVisible();
    await expect(change).toBeHidden();
  });

  test('"Change" opens the form again with the chosen stops', async ({ page }) => {
    if (await changeSearch(page).isVisible()) await changeSearch(page).click();
    await searchStop(page, 'To', DESTINATION);
    await submitSearch(page, 'Find journeys');
    await changeSearch(page).click();
    await expect(stopField(page, 'From')).toBeVisible();
    await expect(stopField(page, 'To')).toBeVisible();
    await expectNoSeriousViolations(page);
  });
});
