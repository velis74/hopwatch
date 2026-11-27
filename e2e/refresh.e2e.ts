import { expect, type Page, test } from '@playwright/test';

import {
  chooseExperience,
  chooseStop,
  DESTINATION,
  expectNoSeriousViolations,
  expectStopShown,
  isApiRequest,
  NEAR_LJUBLJANA,
  NEAREST_STOP,
} from './support';

const DEPARTURES = '/api/v1/departures';
const JOURNEYS = '/api/v1/journeys';

/** Counts the GET requests the page sends to an API path. */
function countRequests(page: Page, pathname: string): () => number {
  let count = 0;
  page.on('request', (request) => {
    if (request.method() === 'GET' && isApiRequest(request.url(), pathname)) count += 1;
  });
  return () => count;
}

/** Makes the document report the given visibility and fires visibilitychange. */
async function setVisibility(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((isHidden) => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => isHidden,
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (isHidden ? 'hidden' : 'visible'),
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test.use({ geolocation: NEAR_LJUBLJANA, permissions: ['geolocation'] });

async function openBoard(page: Page, pathname = DEPARTURES): Promise<() => number> {
  const requests = countRequests(page, pathname);
  await page.clock.install();
  await page.goto('/');
  await chooseExperience(page);
  await expect(page.getByRole('heading', { name: 'Departures', exact: true })).toBeVisible();
  await expectStopShown(page, 'From', NEAREST_STOP);
  if (pathname === DEPARTURES) await expect.poll(requests).toBeGreaterThan(0);
  // Lets the first loads settle.
  await page.clock.runFor(1000);
  return requests;
}

test('the departures board reloads every 30 seconds', async ({ page }) => {
  const requests = await openBoard(page);
  const start = requests();
  await page.clock.runFor(25_000);
  expect(requests(), 'no reload before 30 seconds').toBe(start);
  await page.clock.runFor(6_000);
  await expect.poll(requests).toBe(start + 1);
  await page.clock.runFor(25_000);
  expect(requests()).toBe(start + 1);
  await page.clock.runFor(6_000);
  await expect.poll(requests).toBe(start + 2);
});

test('the board does not reload while hidden and reloads as soon as it is visible again', async ({ page }) => {
  const requests = await openBoard(page);
  await page.clock.runFor(10_000);
  const start = requests();

  await setVisibility(page, true);
  await page.clock.runFor(60_000);
  expect(requests(), 'no reload while hidden').toBe(start);

  await setVisibility(page, false);
  await page.clock.runFor(600);
  await expect.poll(requests).toBe(start + 1);

  // The reload starts a new 30-second count.
  await page.clock.runFor(25_000);
  expect(requests()).toBe(start + 1);
  await page.clock.runFor(6_000);
  await expect.poll(requests).toBe(start + 2);
});

test('the board reloads at once after the page was frozen for longer than 30 seconds', async ({ page }) => {
  const requests = await openBoard(page);
  await page.clock.runFor(5_000);
  const start = requests();

  // A frozen page runs no timers; on resume more than 30 seconds have passed since the last load.
  await page.clock.fastForward(40_000);
  await page.clock.runFor(600);
  await expect.poll(requests).toBe(start + 1);

  await page.clock.runFor(25_000);
  expect(requests(), 'the reload starts a new 30-second count').toBe(start + 1);
});

test('journeys reload every 30 seconds too', async ({ page }) => {
  const requests = await openBoard(page, JOURNEYS);
  await chooseStop(page, 'To', DESTINATION);
  await expect.poll(requests).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: 'Journeys', exact: true })).toBeVisible();
  await page.clock.runFor(1000);
  const start = requests();
  await page.clock.runFor(25_000);
  expect(requests()).toBe(start);
  await page.clock.runFor(6_000);
  await expect.poll(requests).toBe(start + 1);
});

test('"Not updated since" appears when reloads fail for 2 minutes and goes after a successful one', async ({
  page,
}) => {
  const requests = await openBoard(page);
  const notice = page.getByText(/^Not updated since \d{1,2}:\d{2}/u);
  await expect(notice).toHaveCount(0);

  // `unroute` finds the route by this same matcher.
  const departuresUrl = (url: URL) => isApiRequest(url.href, DEPARTURES);
  await page.route(departuresUrl, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"detail":"unavailable"}',
    }),
  );
  const failingFrom = requests();
  await page.clock.runFor(95_000);
  expect(requests()).toBeGreaterThan(failingFrom);
  await expect(notice, 'data under 2 minutes old is not stale').toHaveCount(0);

  await page.clock.runFor(40_000);
  await expect(notice).toBeVisible();
  const politeRegion = await notice.evaluate((element) => !!element.closest('[aria-live="polite"]'));
  expect(politeRegion, 'the notice is inside a polite live region').toBe(true);
  await expectNoSeriousViolations(page);

  await page.unroute(departuresUrl);
  const recovered = requests();
  await page.clock.runFor(31_000);
  await expect.poll(requests).toBeGreaterThan(recovered);
  await expect(notice).toHaveCount(0);
});
