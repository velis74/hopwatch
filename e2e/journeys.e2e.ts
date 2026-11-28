import { expect, type Page, type Response, test } from '@playwright/test';

import {
  chooseExperience,
  chooseStop,
  clearStop,
  departuresBoard,
  DESTINATION,
  expectNoSeriousViolations,
  expectStopShown,
  inServiceHours,
  isApiRequest,
  itineraryItems,
  journeysList,
  ljubljanaParts,
  NEAR_LJUBLJANA,
  NEAREST_STOP,
  STOP_IDS,
  stopField,
  stopFieldText,
} from './support';

const JOURNEYS = '/api/v1/journeys';

interface Itinerary {
  id: string;
  scheduled_departure: string;
  scheduled_arrival: string;
  legs: unknown[];
}

interface Journeys {
  itineraries: Itinerary[];
  earlier_cursor: string | null;
  later_cursor: string | null;
}

function journeysResponse(page: Page, match: (url: URL) => boolean = () => true): Promise<Response> {
  return page.waitForResponse((response) => {
    if (!isApiRequest(response.url(), JOURNEYS) || response.request().method() !== 'GET') return false;
    return match(new URL(response.url()));
  });
}

async function journeysFrom(response: Response): Promise<Journeys> {
  expect(response.status(), response.url()).toBe(200);
  return (await response.json()) as Journeys;
}

function isArriveBy(url: URL): boolean {
  return /^(true|1)$/i.test(url.searchParams.get('arrive_by') ?? '');
}

/** Chooses "To" and returns the first journeys answer. */
async function planToDestination(page: Page): Promise<Journeys> {
  const answer = journeysResponse(page, (url) => url.searchParams.get('to_stop_id') === STOP_IDS[DESTINATION]);
  await chooseStop(page, 'To', DESTINATION);
  const journeys = await journeysFrom(await answer);
  await expect(page.getByRole('heading', { name: 'Journeys', exact: true })).toBeVisible();
  return journeys;
}

/** Sets the time part of the "Depart at" / "Arrive by" field to the given moment's Ljubljana hour and minute. */
async function setTime(page: Page, mode: 'Depart at' | 'Arrive by', target: Date): Promise<void> {
  const field = timeInput(page, mode);
  await expect(field).toBeVisible();
  const { hour, minute } = ljubljanaParts(target);
  await field.fill(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  await field.press('Tab');
}

/** The time part of the date and time field shown for `mode`. */
function timeInput(page: Page, mode: 'Depart at' | 'Arrive by') {
  return page.getByRole('textbox', { name: `${mode} Time`, exact: true });
}

/** A moment a few hours from now on the same Ljubljana day, or null late in the evening. */
function laterToday(hours: number): Date | null {
  const target = new Date(Date.now() + hours * 3_600_000);
  target.setSeconds(0, 0);
  return ljubljanaParts(target).day === ljubljanaParts(new Date()).day ? target : null;
}

test.use({ geolocation: NEAR_LJUBLJANA, permissions: ['geolocation'] });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await chooseExperience(page);
  await expect(page.getByRole('heading', { name: 'Departures', exact: true })).toBeVisible();
});

test('"From" is the nearest stop and "To" is empty, with "Leave now" chosen', async ({ page }) => {
  await expectStopShown(page, 'From', NEAREST_STOP);
  const to = stopField(page, 'To');
  await expect(to).toBeVisible();
  await expect(to).toHaveValue('');
  expect(await stopFieldText(to)).not.toMatch(new RegExp(`${NEAREST_STOP}|${DESTINATION}`));

  const when = page.getByRole('radiogroup', { name: 'When', exact: true });
  await expect(when.getByRole('radio', { name: 'Leave now', exact: true })).toBeChecked();
  await expect(when.getByRole('radio', { name: 'Depart at', exact: true })).not.toBeChecked();
  await expect(when.getByRole('radio', { name: 'Arrive by', exact: true })).not.toBeChecked();
  await expect(page.locator('.journey-form-time')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Swap from and to', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change stop', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Destination', { exact: true })).toHaveCount(0);
  await expectNoSeriousViolations(page);
});

test('choosing "To" lists journeys, each with times, duration, legs and "Show on map"', async ({ page }) => {
  await expectStopShown(page, 'From', NEAREST_STOP);
  const journeys = await planToDestination(page);
  expect(journeys.itineraries.length).toBeGreaterThan(0);

  const list = journeysList(page);
  await expect(list).toBeVisible();
  const items = itineraryItems(list);
  await expect(items.first()).toBeVisible();
  await expect(items).toHaveCount(journeys.itineraries.length);
  for (const text of await items.allInnerTexts()) {
    expect(text.match(/\b\d{1,2}:\d{2}\b/g)?.length ?? 0, `departure and arrival in "${text}"`).toBeGreaterThanOrEqual(
      2,
    );
    expect(text, 'duration').toMatch(/\d+\s*(min|h)/);
  }
  await expect(items.first().getByRole('button', { name: 'Show on map', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Earlier', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Later', exact: true })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('"Later" and "Earlier" load the next and the previous page of journeys', async ({ page }) => {
  const first = await planToDestination(page);
  const list = journeysList(page);
  await expect(itineraryItems(list).first()).toBeVisible();
  const shown = await list.innerText();

  expect(first.later_cursor).not.toBeNull();
  const laterAnswer = journeysResponse(page, (url) => url.searchParams.get('page_cursor') === first.later_cursor);
  await page.getByRole('button', { name: 'Later', exact: true }).click();
  const later = await journeysFrom(await laterAnswer);
  expect(later.itineraries.length).toBeGreaterThan(0);
  expect(later.itineraries.map((itinerary) => itinerary.id)).not.toEqual(
    first.itineraries.map((itinerary) => itinerary.id),
  );
  await expect.poll(() => list.innerText()).not.toBe(shown);
  const laterShown = await list.innerText();

  expect(later.earlier_cursor).not.toBeNull();
  const earlierAnswer = journeysResponse(page, (url) => url.searchParams.get('page_cursor') === later.earlier_cursor);
  await page.getByRole('button', { name: 'Earlier', exact: true }).click();
  const earlier = await journeysFrom(await earlierAnswer);
  expect(earlier.itineraries.length).toBeGreaterThan(0);
  await expect.poll(() => list.innerText()).not.toBe(laterShown);
  const firstLaterDeparture = Math.min(...later.itineraries.map((it) => Date.parse(it.scheduled_departure)));
  for (const itinerary of earlier.itineraries) {
    expect(Date.parse(itinerary.scheduled_departure), itinerary.id).toBeLessThanOrEqual(firstLaterDeparture);
  }
});

test('"Arrive by" with a time lists journeys arriving no later than that time', async ({ page }) => {
  const target = laterToday(3);
  test.skip(target === null, 'three hours from now is tomorrow');
  await planToDestination(page);

  await page.getByRole('radiogroup', { name: 'When', exact: true }).getByRole('radio', { name: 'Arrive by' }).check();
  const time = timeInput(page, 'Arrive by');
  await expect(time).toBeVisible();
  // The field starts at the current time.
  const shown = /^(\d{1,2}):(\d{2})/.exec(await time.inputValue());
  expect(shown, 'Time shows hours and minutes').not.toBeNull();
  const now = ljubljanaParts(new Date());
  expect(Math.abs(Number(shown![1]) * 60 + Number(shown![2]) - (now.hour * 60 + now.minute))).toBeLessThanOrEqual(2);
  await expectNoSeriousViolations(page);

  const { hour, minute } = ljubljanaParts(target!);
  const answer = journeysResponse(page, (url) => {
    const value = url.searchParams.get('time');
    return isArriveBy(url) && !!value && ljubljanaParts(new Date(value)).hour === hour;
  });
  await setTime(page, 'Arrive by', target!);
  const response = await answer;
  const requested = new Date(new URL(response.url()).searchParams.get('time')!);
  expect(ljubljanaParts(requested)).toEqual({
    day: ljubljanaParts(target!).day,
    hour,
    minute,
  });

  const journeys = await journeysFrom(response);
  expect(journeys.itineraries.length).toBeGreaterThan(0);
  for (const itinerary of journeys.itineraries) {
    expect(Date.parse(itinerary.scheduled_arrival), itinerary.id).toBeLessThanOrEqual(target!.getTime() + 59_000);
  }
  await expect(itineraryItems(journeysList(page))).toHaveCount(journeys.itineraries.length);
});

test('"Depart at" with a time lists journeys leaving from that time', async ({ page }) => {
  const target = laterToday(2);
  test.skip(target === null, 'two hours from now is tomorrow');
  await planToDestination(page);

  await page.getByRole('radiogroup', { name: 'When', exact: true }).getByRole('radio', { name: 'Depart at' }).check();
  const { hour } = ljubljanaParts(target!);
  const answer = journeysResponse(page, (url) => {
    const value = url.searchParams.get('time');
    return !isArriveBy(url) && !!value && ljubljanaParts(new Date(value)).hour === hour;
  });
  await setTime(page, 'Depart at', target!);
  const journeys = await journeysFrom(await answer);
  expect(journeys.itineraries.length).toBeGreaterThan(0);
  for (const itinerary of journeys.itineraries) {
    expect(Date.parse(itinerary.scheduled_departure), itinerary.id).toBeGreaterThanOrEqual(target!.getTime() - 60_000);
  }

  // "Leave now" plans from the current time again, without a time field.
  const nowAnswer = journeysResponse(page, (url) => {
    const value = url.searchParams.get('time');
    return !isArriveBy(url) && (!value || Math.abs(Date.parse(value) - Date.now()) < 5 * 60_000);
  });
  await page.getByRole('radiogroup', { name: 'When', exact: true }).getByRole('radio', { name: 'Leave now' }).check();
  await expect(page.locator('.journey-form-time')).toHaveCount(0);
  const current = await journeysFrom(await nowAnswer);
  for (const itinerary of current.itineraries) {
    expect(Date.parse(itinerary.scheduled_departure)).toBeLessThan(target!.getTime());
  }
});

test('"Swap from and to" swaps the stops and plans the way back', async ({ page }) => {
  await planToDestination(page);
  const back = journeysResponse(
    page,
    (url) =>
      url.searchParams.get('from_stop_id') === STOP_IDS[DESTINATION] &&
      url.searchParams.get('to_stop_id') === STOP_IDS[NEAREST_STOP],
  );
  await page.getByRole('button', { name: 'Swap from and to', exact: true }).click();
  await expectStopShown(page, 'From', DESTINATION);
  await expectStopShown(page, 'To', NEAREST_STOP);
  const journeys = await journeysFrom(await back);
  expect(journeys.itineraries.length).toBeGreaterThan(0);
  await expect(itineraryItems(journeysList(page)).first()).toBeVisible();
});

test('"Show on map" draws the chosen journey on the map', async ({ page }) => {
  await planToDestination(page);
  const items = itineraryItems(journeysList(page));
  await expect(items.first()).toBeVisible();
  const map = page.getByRole('region', { name: 'Map', exact: true });
  await expect(map).toBeVisible();
  // The map draws on a WebGL canvas; its text equivalent and the marker at the journey's end are in the DOM.
  const journeyShown = map.getByText('Map of the selected journey.', { exact: false });
  const endMarker = map.locator('.stop-map-marker--end');
  const showOnMap = (item: typeof items) => item.getByRole('button', { name: 'Show on map', exact: true });
  // The first journey is drawn without a choice.
  await expect(journeyShown).toBeAttached();
  await expect(endMarker).toBeVisible();
  await expect(showOnMap(items.first())).toHaveAttribute('aria-pressed', 'true');

  const chosen = (await items.count()) > 1 ? items.nth(1) : items.first();
  await showOnMap(chosen).click();
  await expect(showOnMap(chosen)).toHaveAttribute('aria-pressed', 'true');
  await expect(showOnMap(items).and(page.locator('[aria-pressed="true"]'))).toHaveCount(1);
  await expect(journeyShown).toBeAttached();
  await expect(endMarker).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('clearing "To" returns to the departures board', async ({ page }) => {
  await planToDestination(page);
  await expect(page.getByRole('group', { name: 'Nearby stops', exact: true })).toHaveCount(0);

  await clearStop(page, 'To');
  await expect(page.getByRole('heading', { name: 'Journeys', exact: true })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Nearby stops', exact: true })).toBeVisible();
  await expectStopShown(page, 'From', NEAREST_STOP);
  if (inServiceHours()) await expect(departuresBoard(page)).toBeVisible();
});
