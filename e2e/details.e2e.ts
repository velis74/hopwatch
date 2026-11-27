import { expect, type Locator, type Page, type Response, test } from '@playwright/test';

import {
  changeSearch,
  chooseExperience,
  departureItems,
  departuresList,
  DESTINATION,
  detailsControl,
  escapeRegExp,
  expectHeadingsInOrder,
  expectNoSeriousViolations,
  expectViewAnnounced,
  focusedHeading,
  hhmm,
  inServiceHours,
  isApiRequest,
  itineraryItems,
  journeysList,
  mapRegion,
  NEAR_LJUBLJANA,
  NEAREST_STOP,
  OTHER_STOP,
  searchStop,
  STOP_IDS,
  type Trip,
  type TripStop,
  tripResponse,
} from './support';

const JOURNEYS = '/api/v1/journeys';

interface LegStop {
  id: string;
  name: string;
  scheduled: string;
  expected: string | null;
}

interface Leg {
  mode: string;
  line: string | null;
  headsign: string | null;
  trip_id: string | null;
  from: LegStop;
  to: LegStop;
  distance_m?: number | null;
}

interface Itinerary {
  id: string;
  scheduled_departure: string;
  scheduled_arrival: string;
  duration_minutes: number;
  transfers: number;
  legs: Leg[];
}

interface Journeys {
  itineraries: Itinerary[];
}

function journeysResponse(page: Page, toStopId: string): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      isApiRequest(response.url(), JOURNEYS) &&
      response.request().method() === 'GET' &&
      new URL(response.url()).searchParams.get('to_stop_id') === toStopId,
  );
}

/** Opens the form when it is collapsed to its summary. */
async function openForm(page: Page): Promise<void> {
  const change = changeSearch(page);
  if (await change.isVisible()) await change.click();
}

/** Text patterns a duration of so many minutes may be written as ("55 min", "1 h 9 min"). */
function durationPattern(minutes: number): RegExp {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const options = [`${minutes}\\s?min`];
  if (hours > 0)
    options.push(rest === 0 ? `${hours}\\s?h(?:\\s?0\\s?min|(?!\\s?\\d))` : `${hours}\\s?h\\s?${rest}\\s?min`);
  // Not inside a longer number or word; the text of neighbouring elements follows without a space.
  return new RegExp(`(?<!\\d)(${options.join('|')})(?![a-z])`, 'u');
}

function minutesBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 60_000);
}

/** The stop timeline of the ride details. */
function stopsTimeline(page: Page): Locator {
  return page.getByRole('list', { name: /^Stops\b/u });
}

function timelineItems(timeline: Locator): Locator {
  return timeline.locator('xpath=./li');
}

/** Pairs each timeline item with the ride stop it shows, walking both in order. */
async function matchStops(timeline: Locator, stops: TripStop[]): Promise<{ text: string; stop: TripStop }[]> {
  const texts = await timelineItems(timeline).allInnerTexts();
  const matched: { text: string; stop: TripStop }[] = [];
  let next = 0;
  for (const text of texts) {
    const index = stops.findIndex((stop, i) => i >= next && text.includes(stop.name));
    expect(index, `"${text}" is a later stop of the ride`).toBeGreaterThanOrEqual(0);
    matched.push({ text, stop: stops[index] });
    next = index + 1;
  }
  return matched;
}

/** Departure of a stop, else its arrival, expected before scheduled. */
function stopTime(stop: TripStop): string | null {
  return stop.expected_departure ?? stop.scheduled_departure ?? stop.expected_arrival ?? stop.scheduled_arrival;
}

/** Asserts the parts of the ride details every ride shows. */
async function expectRideDetails(page: Page, trip: Trip, entryId: string, exitId: string | null): Promise<void> {
  const main = page.getByRole('main');
  await expect(main).toContainText(trip.line);
  await expect(main).toContainText(trip.headsign);
  if (trip.operator) {
    await expect(main).toContainText(trip.operator.name);
    await expect(
      main.getByRole('button', {
        name: `Favourite operator: ${trip.operator.name}`,
        exact: true,
      }),
    ).toBeVisible();
  }

  const timeline = stopsTimeline(page);
  await expect(timeline).toBeVisible();
  const entry = trip.stops.findIndex((stop) => stop.id === entryId);
  expect(entry, `${entryId} is a stop of the ride`).toBeGreaterThanOrEqual(0);
  const exit = exitId === null ? trip.stops.length - 1 : trip.stops.findIndex((stop) => stop.id === exitId);
  expect(exit, `${exitId} is a later stop of the ride`).toBeGreaterThan(entry);

  const matched = await matchStops(timeline, trip.stops);
  const shown = matched.map(({ stop }) => stop.id);
  // Every stop from the entry to the exit is in the timeline, in order.
  expect(shown).toEqual(expect.arrayContaining(trip.stops.slice(entry, exit + 1).map((stop) => stop.id)));

  const entryItem = matched.find(({ stop }) => stop.id === entryId)!;
  expect(entryItem.text, 'entry stop').toMatch(/\bGet on\b/u);
  const entryStop = trip.stops[entry];
  const entryDeparture = entryStop.scheduled_departure ?? entryStop.scheduled_arrival;
  if (entryDeparture) expect(entryItem.text, 'entry time').toContain(hhmm(entryDeparture));
  if (entryStop.platform) expect(entryItem.text, 'entry platform').toContain(entryStop.platform);
  if (entryStop.delay_minutes)
    expect(entryItem.text, 'entry delay').toMatch(new RegExp(`${entryStop.delay_minutes}\\s?min`));
  if (exitId !== null) {
    const exitItem = matched.find(({ stop }) => stop.id === exitId)!;
    expect(exitItem.text, 'exit stop').toMatch(/\bGet off\b/u);
  }
  expect(matched.filter(({ text }) => /\bGet on\b/u.test(text))).toHaveLength(1);
  expect(matched.filter(({ text }) => /\bGet off\b/u.test(text)).length).toBeLessThanOrEqual(1);

  // Every intermediate stop has its time; passed stops say so in text, not only by their colour.
  for (const { text, stop } of matched) {
    // The exit stop shows when the ride arrives there.
    const time =
      stop.id === exitId
        ? (stop.scheduled_arrival ?? stop.scheduled_departure)
        : (stop.scheduled_departure ?? stop.scheduled_arrival);
    if (time) expect(text, `time of ${stop.name}`).toContain(hhmm(time));
    const moment = stopTime(stop);
    if (moment && Math.abs(Date.parse(moment) - Date.now()) > 2 * 60_000) {
      if (stop.passed) expect(text, `${stop.name} is passed`).toMatch(/\bpassed\b/iu);
      else expect(text, `${stop.name} is not passed`).not.toMatch(/\bpassed\b/iu);
    }
  }

  await expect(main.getByText(/Travel time/u).first()).toBeVisible();

  // Amenities only when known, each as text.
  const bicycles = main.getByText(/\bbicycles?\b/iu);
  if (trip.bikes_allowed === null) await expect(bicycles).toHaveCount(0);
  else
    await expect(
      main.getByText(trip.bikes_allowed ? 'Bicycles allowed' : 'Bicycles not allowed', { exact: true }),
    ).toBeVisible();
  const wheelchair = main.getByText(/\bwheelchair\b/iu);
  if (trip.wheelchair_accessible === null) await expect(wheelchair).toHaveCount(0);
  else
    await expect(
      main.getByText(trip.wheelchair_accessible ? 'Wheelchair accessible' : 'Not wheelchair accessible', {
        exact: true,
      }),
    ).toBeVisible();

  const ticket = main.getByRole('link', { name: 'Buy ticket', exact: true });
  if (trip.ticket_url) await expect(ticket).toHaveAttribute('href', trip.ticket_url);
  else await expect(ticket).toHaveCount(0);

  if (trip.cancelled) await expect(main.getByText(/\bcancelled\b/iu).first()).toBeVisible();
}

test.use({ geolocation: NEAR_LJUBLJANA, permissions: ['geolocation'] });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await chooseExperience(page);
});

test('a departure opens its ride details with the stop timeline, entry stop and amenities', async ({ page }) => {
  test.skip(!inServiceHours(), 'no departures expected at the fixture stop at this hour');
  const item = departureItems(departuresList(page)).first();
  await expect(item).toBeVisible();

  const answer = tripResponse(page);
  await detailsControl(item).first().click();
  const trip = await answer;
  await expect(page).toHaveURL(/\/ride\/[^/?]+/u);
  const heading = await focusedHeading(page);
  await expectViewAnnounced(page, heading);

  const entry = trip.stops.find((stop) => stop.name === NEAREST_STOP) ?? trip.stops[0];
  await expectRideDetails(page, trip, entry.id, null);
  await expectHeadingsInOrder(page);
  await expectNoSeriousViolations(page);
});

test('a ride opened with its entry and exit stop shows both, the travel time and the ride on the map', async ({
  page,
  isMobile,
}) => {
  const response = await page.request.get(
    `${JOURNEYS}?from_stop_id=${STOP_IDS[NEAREST_STOP]}&to_stop_id=${STOP_IDS[DESTINATION]}`,
  );
  expect(response.status()).toBe(200);
  const journeys = (await response.json()) as Journeys;
  const leg = journeys.itineraries
    .flatMap((itinerary) => itinerary.legs)
    .find(
      (candidate) =>
        candidate.trip_id && candidate.from.id === STOP_IDS[NEAREST_STOP] && candidate.to.id === STOP_IDS[DESTINATION],
    );
  test.skip(!leg, `no direct ride from ${NEAREST_STOP} to ${DESTINATION} in the journeys`);

  const answer = tripResponse(page);
  await page.goto(
    `/ride/${encodeURIComponent(leg!.trip_id!)}?from=${STOP_IDS[NEAREST_STOP]}&to=${STOP_IDS[DESTINATION]}`,
  );
  const trip = await answer;
  expect(trip.trip_id).toBe(leg!.trip_id);
  await focusedHeading(page);
  await expectRideDetails(page, trip, STOP_IDS[NEAREST_STOP], STOP_IDS[DESTINATION]);

  const travel = minutesBetween(leg!.from.scheduled, leg!.to.scheduled);
  await expect(
    // The label and its value, e.g. a term and its definition.
    page
      .getByRole('main')
      .getByText(/Travel time/u)
      .first()
      .locator('xpath=..'),
  ).toContainText(durationPattern(travel));
  if (!isMobile) {
    const map = mapRegion(page);
    await expect(map).toBeVisible();
    await expect(map.getByText('Map of the selected ride.', { exact: false })).toBeAttached();
  }
  await expectNoSeriousViolations(page);
});

test('an unknown ride says that it was not found', async ({ page }) => {
  await page.goto('/ride/no-such-ride');
  await expect(
    page
      .getByRole('main')
      .getByText(/not found/iu)
      .first(),
  ).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('journey details show each ride, the transfers with their waiting time, walks and the totals', async ({
  page,
}) => {
  await openForm(page);
  const answer = journeysResponse(page, STOP_IDS[OTHER_STOP]);
  await searchStop(page, 'To', OTHER_STOP);
  const response = await answer;
  expect(response.status()).toBe(200);
  const journeys = (await response.json()) as Journeys;
  const index = journeys.itineraries.findIndex((itinerary) => itinerary.transfers > 0);
  test.skip(index < 0, `no journey to ${OTHER_STOP} with a transfer at this hour`);
  const itinerary = journeys.itineraries[index];

  const items = itineraryItems(journeysList(page));
  await expect(items).toHaveCount(journeys.itineraries.length);
  await detailsControl(items.nth(index)).first().click();
  await expect(page).toHaveURL(/\/journey\b/u);
  const heading = await focusedHeading(page);
  await expectViewAnnounced(page, heading);

  const main = page.getByRole('main');
  // Totals: departure, arrival, duration and transfers.
  await expect(main).toContainText(hhmm(itinerary.scheduled_departure));
  await expect(main).toContainText(hhmm(itinerary.scheduled_arrival));
  await expect(main).toContainText(durationPattern(itinerary.duration_minutes));
  await expect(main).toContainText(new RegExp(`(?<!\\d)${itinerary.transfers}\\s+transfers?(?![a-z])`, 'u'));

  const rides = itinerary.legs.filter((leg) => leg.mode !== 'walk');
  for (const ride of rides) {
    if (ride.line) await expect(main).toContainText(ride.line);
    if (ride.headsign) await expect(main).toContainText(ride.headsign);
    await expect(main).toContainText(hhmm(ride.from.scheduled));
  }

  // Between two rides: "Transfer at <stop>, <n> min", counting from the arrival or from the end of the walk.
  for (let i = 1; i < rides.length; i += 1) {
    const arrived = rides[i - 1].to;
    const departs = rides[i].from;
    const walkEnd = itinerary.legs.find((leg) => leg.mode === 'walk' && leg.from.id === arrived.id)?.to.scheduled;
    const waits = new Set([minutesBetween(arrived.scheduled, departs.scheduled)]);
    if (walkEnd) waits.add(minutesBetween(walkEnd, departs.scheduled));
    await expect(main).toContainText(
      new RegExp(`Transfer at ${escapeRegExp(arrived.name)}, (${[...waits].join('|')}) min`, 'u'),
    );
  }

  for (const walk of itinerary.legs.filter((leg) => leg.mode === 'walk')) {
    const minutes = minutesBetween(walk.from.scheduled, walk.to.scheduled);
    // Each leg and transfer is an item of the journey's timeline.
    const walkText = main
      .getByRole('listitem')
      .filter({ hasText: /\bWalk\b/u })
      .filter({ hasText: durationPattern(minutes) });
    await expect(walkText.first()).toBeVisible();
    if (walk.distance_m) await expect(walkText.first()).toContainText(/\b\d+(?:[.,]\d+)?\s?k?m\b/u);
  }

  await expectHeadingsInOrder(page);
  await expectNoSeriousViolations(page);
});
