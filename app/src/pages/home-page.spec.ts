import { config } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Departure } from '../api/hopwatch-api';
import { flushPromises, HttpResponse, maplibreFake, mockApi, mockGeolocation, mountApp } from '../test-utils';

import HomePage from './home-page.vue';

vi.mock('maplibre-gl', async () => (await import('../test-utils')).maplibreFake.module);

// Render the real departures list element instead of the test-utils transition stub.
config.global.stubs = { ...config.global.stubs, 'transition-group': false };

const HERE = { lat: 46.0569, lon: 14.5058 };
const LJUBLJANA = { id: 'si:1', name: 'Ljubljana', lat: 46.0569, lon: 14.5058, distance_m: 150 };
const KOPER = { id: 'si:2', name: 'Koper', lat: 45.548, lon: 13.7302 };

const REFRESH_MS = 30000;

function departure(overrides: Partial<Departure> = {}): Departure {
  return {
    trip_id: 'trip-1',
    mode: 'rail',
    line: 'IC 502',
    headsign: 'Koper',
    scheduled_departure: '2026-11-27T10:05:00+01:00',
    expected_departure: null,
    delay_minutes: 2,
    delay_source: 'official',
    platform: '3',
    next_stops: [],
    ...overrides,
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A response that waits until `release()` is called. */
function held(body: unknown) {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  return {
    answer: async () => {
      await gate;
      return HttpResponse.json(body as never);
    },
    release: () => release(),
  };
}

/** Lets the mocked network and the component finish what they started. */
async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    await wait(5);
    await flushPromises();
  }
}

async function render() {
  const mounted = await mountApp(HomePage);
  await settle();
  return mounted;
}

function liveRegion(): string {
  return document.body.querySelector('[aria-live="polite"]')?.textContent?.trim() ?? '';
}

function departureItems(): string[] {
  return [...document.body.querySelectorAll('[role="list"] li')].map((item) => item.textContent ?? '');
}

async function refresh(): Promise<void> {
  await vi.advanceTimersByTimeAsync(REFRESH_MS);
  await flushPromises();
  await wait(10);
  await flushPromises();
}

async function pickStop(name: string): Promise<void> {
  const input = document.body.querySelector<HTMLInputElement>('.v-autocomplete input')!;
  input.focus();
  await settle();
  input.value = name;
  input.dispatchEvent(new Event('input'));
  await wait(300);
  await settle();
  const option = [...document.body.querySelectorAll<HTMLElement>('.v-overlay-container .v-list-item')].find((item) =>
    item.textContent?.includes(name),
  );
  if (!option) throw new Error(`No option ${name} in: ${document.body.innerHTML}`);
  option.click();
  await settle();
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows departures of the nearest stop', async () => {
    mockGeolocation(HERE);
    const nearby = mockApi('get', '/stops/nearby', [LJUBLJANA]);
    const departures = mockApi('get', '/departures', [departure()]);
    const { wrapper } = await render();

    expect(wrapper.get('h1').text()).toBe('Departures');
    expect(wrapper.get('h2').text()).toBe('Ljubljana');
    expect(Object.fromEntries(nearby[0].url.searchParams)).toEqual({
      lat: '46.0569',
      lon: '14.5058',
      radius_m: '1000',
    });
    expect(Object.fromEntries(departures[0].url.searchParams)).toEqual({ stop_id: 'si:1', window_minutes: '60' });
    expect(wrapper.get('[role="list"]').attributes('aria-label')).toBe('Departures from Ljubljana');
    expect(departureItems()).toHaveLength(1);
    expect(departureItems()[0]).toContain('IC 502');
    expect(wrapper.text()).toMatch(/Updated at \d\d:\d\d\. Refreshes every 30 seconds\./u);
    expect(wrapper.find('.v-autocomplete').exists()).toBe(false);
    expect(maplibreFake.maps[0].options.center).toEqual([14.5058, 46.0569]);
  });

  it('says it is finding the location while the device answers', async () => {
    const geolocation = mockGeolocation('pending');
    mockApi('get', '/stops/nearby', [LJUBLJANA]);
    mockApi('get', '/departures', []);
    const { wrapper } = await render();

    expect(wrapper.text()).toContain('Finding your location…');

    geolocation.resolve(HERE);
    await flushPromises();
    await wait(10);
    await flushPromises();

    expect(wrapper.text()).not.toContain('Finding your location…');
    expect(wrapper.get('h2').text()).toBe('Ljubljana');
  });

  it('looks further away when no stop is within a kilometre', async () => {
    mockGeolocation(HERE);
    const nearby = mockApi('get', '/stops/nearby', ({ request }: { request: Request }) =>
      HttpResponse.json(new URL(request.url).searchParams.get('radius_m') === '1000' ? [] : [LJUBLJANA]),
    );
    mockApi('get', '/departures', []);
    const { wrapper } = await render();

    expect(nearby.map((request) => request.url.searchParams.get('radius_m'))).toEqual(['1000', '5000']);
    expect(wrapper.get('h2').text()).toBe('Ljubljana');
  });

  it('offers the search when no stop is near', async () => {
    mockGeolocation(HERE);
    mockApi('get', '/stops/nearby', []);
    const { wrapper } = await render();

    expect(wrapper.text()).toContain('There is no stop near you. Find a stop by name.');
    expect(wrapper.find('.v-autocomplete').exists()).toBe(true);
    expect(wrapper.find('h2').exists()).toBe(false);
  });

  it('offers the search when the nearby stops are not available', async () => {
    mockGeolocation(HERE);
    mockApi('get', '/stops/nearby', () => HttpResponse.error());
    const { wrapper } = await render();

    expect(wrapper.text()).toContain('Your location is not available. Find a stop by name.');
    expect(wrapper.find('.v-autocomplete').exists()).toBe(true);
  });

  it('lets the user find a stop by name without a location and moves focus to it', async () => {
    mockGeolocation('denied');
    mockApi('get', '/stops', [KOPER]);
    const departures = mockApi('get', '/departures', [departure({ headsign: 'Ljubljana' })]);
    const { wrapper } = await render();
    expect(wrapper.text()).toContain('Your location is not available. Find a stop by name.');

    await pickStop('Koper');

    const heading = wrapper.get('h2');
    expect(heading.text()).toBe('Koper');
    expect(document.activeElement).toBe(heading.element);
    expect(wrapper.text()).not.toContain('Your location is not available.');
    expect(wrapper.find('.v-autocomplete').exists()).toBe(false);
    expect(departures[0].url.searchParams.get('stop_id')).toBe('si:2');
    expect(departureItems()[0]).toContain('to Ljubljana');
  });

  it('changes the stop', async () => {
    mockGeolocation(HERE);
    mockApi('get', '/stops/nearby', [LJUBLJANA]);
    mockApi('get', '/stops', [KOPER]);
    const departures = mockApi('get', '/departures', [departure()]);
    const { wrapper } = await render();

    const change = wrapper.findAll('button').find((button) => button.text() === 'Change stop')!;
    await change.trigger('click');
    await flushPromises();
    expect(document.activeElement).toBe(document.body.querySelector('.v-autocomplete input'));

    await pickStop('Koper');

    expect(wrapper.get('h2').text()).toBe('Koper');
    expect(departures.map((request) => request.url.searchParams.get('stop_id'))).toEqual(['si:1', 'si:2']);
    expect(maplibreFake.maps[0].moves.at(-1)?.center).toEqual([13.7302, 45.548]);
  });

  it('closes the search again with the same button', async () => {
    mockGeolocation(HERE);
    mockApi('get', '/stops/nearby', [LJUBLJANA]);
    mockApi('get', '/departures', []);
    const { wrapper } = await render();
    const change = wrapper.findAll('button').find((button) => button.text() === 'Change stop')!;

    await change.trigger('click');
    expect(wrapper.find('.v-autocomplete').exists()).toBe(true);
    await change.trigger('click');

    expect(wrapper.find('.v-autocomplete').exists()).toBe(false);
  });

  it('says departures are loading until they arrive', async () => {
    mockGeolocation(HERE);
    mockApi('get', '/stops/nearby', [LJUBLJANA]);
    const response = held([]);
    mockApi('get', '/departures', response.answer);
    const { wrapper } = await render();

    expect(wrapper.text()).toContain('Loading departures…');

    response.release();
    await wait(10);
    await flushPromises();

    expect(wrapper.text()).not.toContain('Loading departures…');
    expect(wrapper.text()).toContain('No departures in the next 60 minutes.');
  });

  it('warns when departures are not available', async () => {
    mockGeolocation(HERE);
    mockApi('get', '/stops/nearby', [LJUBLJANA]);
    mockApi('get', '/departures', { detail: 'down' }, { status: 503 });
    const { wrapper } = await render();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Departures are not available right now. Please try again later.',
    );
    expect(wrapper.text()).not.toContain('Loading departures…');
  });

  it('filters by destination once the user stops typing', async () => {
    mockGeolocation(HERE);
    mockApi('get', '/stops/nearby', [LJUBLJANA]);
    const stops = ['A', 'B', 'C', 'D', 'Divača', 'Koper'];
    const departures = mockApi('get', '/departures', ({ request }: { request: Request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.get('destination') === 'Postojna' ? [] : [departure({ next_stops: stops })],
      ),
    );
    const { wrapper } = await render();
    const field = wrapper.get('input[aria-describedby="destination-hint"]');
    expect(wrapper.get('#destination-hint').text()).toBe('Shows only departures that stop at a matching later stop.');

    await field.setValue('  Divač ');
    await wait(450);
    await flushPromises();

    expect(departures.map((request) => request.url.searchParams.get('destination'))).toEqual([null, 'Divač']);
    expect(departureItems()[0]).toContain('Calls at Divača');

    await field.setValue('Postojna');
    await wait(450);
    await flushPromises();

    expect(wrapper.text()).toContain('No departures to Postojna in the next 60 minutes.');
  });

  it('shows only the answer to the latest filter', async () => {
    mockGeolocation(HERE);
    mockApi('get', '/stops/nearby', [LJUBLJANA]);
    const first = held([departure({ line: 'first' })]);
    mockApi('get', '/departures', ({ request }: { request: Request }) =>
      new URL(request.url).searchParams.get('destination') === 'Koper'
        ? HttpResponse.json([departure({ line: 'latest' })])
        : first.answer(),
    );
    const { wrapper } = await render();

    await wrapper.get('input[aria-describedby="destination-hint"]').setValue('Koper');
    await wait(450);
    await flushPromises();
    first.release();
    await wait(10);
    await flushPromises();

    expect(departureItems()).toHaveLength(1);
    expect(departureItems()[0]).toContain('latest');
  });

  it('ignores a failure of an outdated request', async () => {
    mockGeolocation(HERE);
    mockApi('get', '/stops/nearby', [LJUBLJANA]);
    let failFirst: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (failFirst = resolve));
    mockApi('get', '/departures', async ({ request }: { request: Request }) => {
      if (new URL(request.url).searchParams.get('destination') === 'Koper') return HttpResponse.json([departure()]);
      await gate;
      return HttpResponse.json({ detail: 'down' }, { status: 503 });
    });
    const { wrapper } = await render();

    await wrapper.get('input[aria-describedby="destination-hint"]').setValue('Koper');
    await wait(450);
    await flushPromises();
    failFirst();
    await wait(10);
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(departureItems()).toHaveLength(1);
  });

  it('refreshes every 30 seconds and announces changed delays', async () => {
    mockGeolocation(HERE);
    mockApi('get', '/stops/nearby', [LJUBLJANA]);
    const before = [
      departure({ trip_id: 'a', delay_minutes: 2 }),
      departure({ trip_id: 'b', mode: 'bus', line: '6', headsign: 'Črnuče', delay_minutes: 4 }),
      departure({ trip_id: 'c', line: 'LP 2', delay_minutes: 1 }),
      departure({ trip_id: 'd', line: 'LP 3', delay_minutes: 3 }),
    ];
    const after = [
      departure({ trip_id: 'a', delay_minutes: 5 }),
      departure({ trip_id: 'b', mode: 'bus', line: '6', headsign: 'Črnuče', delay_minutes: 0 }),
      departure({ trip_id: 'c', line: 'LP 2', delay_minutes: null }),
      departure({ trip_id: 'd', line: 'LP 3', delay_minutes: -1 }),
      departure({ trip_id: 'e', line: 'new', delay_minutes: 9 }),
    ];
    let answer = before;
    const departures = mockApi('get', '/departures', () => HttpResponse.json(answer));
    await render();
    expect(liveRegion()).toBe('');

    answer = after;
    await refresh();

    expect(departures).toHaveLength(2);
    expect(departureItems()).toHaveLength(5);
    expect(liveRegion()).toBe(
      [
        'Train IC 502 to Koper: delay now +5 min.',
        'Bus 6 to Črnuče: now on time.',
        'Train LP 3 to Koper: delay now 1 min early.',
      ].join(' '),
    );
  });

  it('does not announce anything when no delay changed', async () => {
    mockGeolocation(HERE);
    mockApi('get', '/stops/nearby', [LJUBLJANA]);
    const departures = mockApi('get', '/departures', [departure()]);
    await render();

    await refresh();

    expect(departures).toHaveLength(2);
    expect(liveRegion()).toBe('');
  });

  it('keeps the departures shown when a refresh fails', async () => {
    mockGeolocation(HERE);
    mockApi('get', '/stops/nearby', [LJUBLJANA]);
    mockApi('get', '/departures', [departure()]);
    const { wrapper } = await render();
    mockApi('get', '/departures', () => HttpResponse.error());

    await refresh();

    expect(departureItems()).toHaveLength(1);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('does not refresh while the page is hidden', async () => {
    mockGeolocation(HERE);
    mockApi('get', '/stops/nearby', [LJUBLJANA]);
    const departures = mockApi('get', '/departures', [departure()]);
    await render();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);

    await refresh();

    expect(departures).toHaveLength(1);
  });

  it('does not refresh without a stop', async () => {
    await render();

    await refresh();
    // A request here would have no mocked answer and fail the test.
  });

  it('stops refreshing when the page is left', async () => {
    mockGeolocation(HERE);
    mockApi('get', '/stops/nearby', [LJUBLJANA]);
    const departures = mockApi('get', '/departures', [departure()]);
    const { wrapper } = await render();

    wrapper.unmount();
    await refresh();

    expect(departures).toHaveLength(1);
  });

  it('credits the timetable data and its licence', async () => {
    const { wrapper } = await render();

    const attribution = wrapper.get('.data-attribution');
    expect(attribution.text()).toContain('Timetable data:');
    expect(attribution.text()).toContain('SŽ – Potniški promet');
    expect(attribution.findAll('a').map((link) => link.attributes('href'))).toEqual([
      'https://nap.si',
      'https://creativecommons.org/licenses/by-sa/4.0/',
    ]);
  });
});
