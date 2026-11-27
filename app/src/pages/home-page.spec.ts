import { config } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Departure } from '../api/hopwatch-api';
import { usePreferencesStore } from '../stores/preferences';
import { itinerary, journeysPage } from '../test-journeys';
import { flushPromises, HttpResponse, maplibreFake, mockApi, mockGeolocation, mountApp } from '../test-utils';

import HomePage from './home-page.vue';

vi.mock('maplibre-gl', async () => (await import('../test-utils')).maplibreFake.module);

// Render the real departures list element instead of the test-utils transition stub.
config.global.stubs = { ...config.global.stubs, 'transition-group': false };

const HERE = { lat: 46.0569, lon: 14.5058 };
const LJUBLJANA = { id: 'si:1', name: 'Ljubljana', lat: 46.0569, lon: 14.5058, modes: ['rail'], distance_m: 150 };
const LJUBLJANA_AP = { id: 'si:3', name: 'Ljubljana AP', lat: 46.058, lon: 14.5147, modes: ['bus'], distance_m: 162 };
const KOPER = { id: 'si:2', name: 'Koper', lat: 45.548, lon: 13.7302, modes: ['rail'] };

function departure(overrides: Partial<Departure> = {}): Departure {
  return {
    trip_id: 'trip-1',
    stop_id: 'si:1',
    stop_name: 'Ljubljana',
    mode: 'rail',
    line: 'IC 502',
    headsign: 'Koper',
    operator: null,
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

/** Lets the mocked network and the component finish what they started. */
async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    await wait(5);
    await flushPromises();
  }
}

/** Answers `/stops/nearby` with the stop closest to the user, and the stops within 300 m of it. */
function mockNearby(closest: unknown[] = [LJUBLJANA], around: unknown[] = [LJUBLJANA]) {
  return mockApi('get', '/stops/nearby', ({ request }: { request: Request }) =>
    HttpResponse.json(new URL(request.url).searchParams.get('radius_m') === '300' ? around : closest),
  );
}

async function render() {
  const mounted = await mountApp(HomePage);
  await settle();
  return mounted;
}

function departureItems(): string[] {
  return [...document.body.querySelectorAll('[role="list"] li')].map((item) => item.textContent ?? '');
}

function stopField(label: string): HTMLInputElement {
  const field = [...document.body.querySelectorAll('.v-autocomplete')].find(
    (candidate) => candidate.querySelector('label')?.textContent?.trim() === label,
  );
  if (!field) throw new Error(`No field ${label}`);
  return field.querySelector('input')!;
}

async function pickStop(label: string, name: string): Promise<void> {
  const input = stopField(label);
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

function button(text: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!found) throw new Error(`No button ${text}`);
  return found;
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fills From with the nearest stop and shows its departures', async () => {
    mockGeolocation(HERE);
    const nearby = mockNearby();
    const departures = mockApi('get', '/departures', [departure()]);
    const { wrapper } = await render();

    expect(wrapper.get('h1').text()).toBe('Departures');
    expect(Object.fromEntries(nearby[0].url.searchParams)).toEqual({
      lat: '46.0569',
      lon: '14.5058',
      radius_m: '1000',
    });
    expect(stopField('From').closest('.v-autocomplete')?.textContent).toContain('Ljubljana');
    expect(stopField('To').value).toBe('');
    expect(wrapper.get('h2').text()).toBe('Ljubljana');
    expect(departures[0].url.searchParams.getAll('stop_id')).toEqual(['si:1']);
    expect(wrapper.get('[role="list"]').attributes('aria-label')).toBe('Departures from Ljubljana');
    expect(departureItems()[0]).toContain('IC 502');
    expect(wrapper.findAll('button').some((entry) => entry.text() === 'Change stop')).toBe(false);
    expect(maplibreFake.maps[0].options.center).toEqual([14.5058, 46.0569]);
  });

  it('says it is finding the location while the device answers', async () => {
    const geolocation = mockGeolocation('pending');
    mockNearby();
    mockApi('get', '/departures', []);
    const { wrapper } = await render();

    expect(wrapper.text()).toContain('Finding your location…');

    geolocation.resolve(HERE);
    await settle();

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

    expect(nearby.map((request) => request.url.searchParams.get('radius_m')).slice(0, 2)).toEqual(['1000', '5000']);
    expect(wrapper.get('h2').text()).toBe('Ljubljana');
  });

  it('asks for a stop by name when no stop is near', async () => {
    mockGeolocation(HERE);
    mockApi('get', '/stops/nearby', []);
    const { wrapper } = await render();

    expect(wrapper.text()).toContain('There is no stop near you. Find a stop by name.');
    expect(wrapper.find('h2').exists()).toBe(false);
    expect(maplibreFake.maps).toHaveLength(0);
  });

  it('asks for a stop by name when the nearby stops are not available', async () => {
    mockGeolocation(HERE);
    mockApi('get', '/stops/nearby', () => HttpResponse.error());
    const { wrapper } = await render();

    expect(wrapper.text()).toContain('Stops near you are not available right now. Find a stop by name.');
    expect(wrapper.text()).toContain('Try my location again');
  });

  it.each([
    ['unavailable', 'The device could not find your location.', true],
    ['timeout', 'Finding your location took too long.', true],
    ['denied', 'Location access is turned off for this page.', false],
  ] as const)('names the reason when the position is %s', async (failure, text, retry) => {
    mockGeolocation(failure);
    const { wrapper } = await render();

    expect(wrapper.text()).toContain(text);
    expect(wrapper.text().includes('Try my location again')).toBe(retry);
  });

  it('tries the location again on request', async () => {
    mockGeolocation('timeout');
    mockApi('get', '/stops/nearby', [LJUBLJANA]);
    mockApi('get', '/departures', [departure()]);
    const { wrapper } = await render();

    mockGeolocation(HERE);
    const retry = wrapper.findAll('button').find((button) => button.text() === 'Try my location again')!;
    await retry.trigger('click');
    await settle();

    expect(wrapper.text()).not.toContain('Finding your location took too long.');
    expect(wrapper.get('h2').text()).toBe('Ljubljana');
  });

  it('starts from the stop chosen last on this device when there is no location', async () => {
    mockGeolocation('denied');
    mockApi('get', '/stops', [KOPER]);
    mockApi('get', '/stops/nearby', []);
    const departures = mockApi('get', '/departures', [departure({ stop_id: 'si:2', headsign: 'Ljubljana' })]);
    const first = await render();
    await pickStop('From', 'Koper');
    first.wrapper.unmount();

    const { wrapper } = await render();

    expect(wrapper.get('h2').text()).toBe('Koper');
    expect(wrapper.text()).toContain('Location access is turned off for this page.');
    expect(departures.at(-1)!.url.searchParams.getAll('stop_id')).toEqual(['si:2']);
  });

  it('ignores a damaged last stop', async () => {
    localStorage.setItem('hopwatch.lastFrom', '{not json');
    mockGeolocation('denied');
    mockApi('get', '/stops/nearby', []);
    const { wrapper } = await render();

    expect(wrapper.find('h2').exists()).toBe(false);
  });

  it('lets the user choose From by name without a location', async () => {
    mockGeolocation('denied');
    mockApi('get', '/stops', [KOPER]);
    mockApi('get', '/stops/nearby', []);
    const departures = mockApi('get', '/departures', [departure({ stop_id: 'si:2', headsign: 'Ljubljana' })]);
    const { wrapper } = await render();
    expect(wrapper.text()).toContain('Location access is turned off for this page.');

    await pickStop('From', 'Koper');

    expect(wrapper.get('h2').text()).toBe('Koper');
    expect(wrapper.text()).not.toContain('Location access is turned off');
    expect(departures[0].url.searchParams.getAll('stop_id')).toEqual(['si:2']);
    expect(departureItems()[0]).toContain('to Ljubljana');
  });

  it('merges the departures of the nearby stops the user checks and names their stops', async () => {
    mockGeolocation(HERE);
    mockNearby([LJUBLJANA], [LJUBLJANA, LJUBLJANA_AP]);
    const departures = mockApi('get', '/departures', ({ request }: { request: Request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.getAll('stop_id').length > 1
          ? [departure(), departure({ trip_id: 'b', stop_id: 'si:3', stop_name: 'Ljubljana AP', mode: 'bus' })]
          : [departure()],
      ),
    );
    const { wrapper } = await render();

    const fieldset = wrapper.get('fieldset');
    expect(fieldset.get('legend').text()).toBe('Nearby stops');
    const box = fieldset.get('[role="checkbox"]');
    expect(box.attributes('aria-label')).toBe('Ljubljana AP, Bus, 162 m');
    expect(box.attributes('aria-checked')).toBe('false');
    expect(departureItems()[0]).not.toContain('From Ljubljana');

    await box.trigger('click');
    await settle();

    expect(departures.at(-1)?.url.searchParams.getAll('stop_id')).toEqual(['si:1', 'si:3']);
    expect(departureItems()[0]).toContain('From Ljubljana');
    expect(departureItems()[1]).toContain('From Ljubljana AP');
  });

  it('includes the nearby stops of the modes chosen in the settings', async () => {
    setActivePinia(createPinia());
    usePreferencesStore().setNearbyModes(['bus']);
    mockGeolocation(HERE);
    mockNearby([LJUBLJANA], [LJUBLJANA, LJUBLJANA_AP]);
    const departures = mockApi('get', '/departures', [departure()]);
    const { wrapper } = await render();

    expect(wrapper.get('fieldset [role="checkbox"]').attributes('aria-checked')).toBe('true');
    expect(departures.at(-1)?.url.searchParams.getAll('stop_id')).toEqual(['si:1', 'si:3']);
  });

  it('plans journeys when To is set, draws the first on the map and shows departures again without To', async () => {
    mockGeolocation(HERE);
    mockNearby();
    mockApi('get', '/departures', [departure()]);
    mockApi('get', '/stops', [KOPER]);
    const journeys = mockApi('get', '/journeys', journeysPage([itinerary(), itinerary({ id: 'it-2' })]));
    const { wrapper } = await render();

    await pickStop('To', 'Koper');

    expect(journeys.map((request) => Object.fromEntries(request.url.searchParams))).toEqual([
      { from_stop_id: 'si:1', to_stop_id: 'si:2' },
    ]);
    expect(wrapper.find('fieldset').exists()).toBe(false);
    expect(wrapper.find('[role="list"][aria-label^="Departures"]').exists()).toBe(false);
    expect(wrapper.get('h2').text()).toBe('Journeys');
    expect(wrapper.findAll('ol > li')).toHaveLength(2);
    const [map] = maplibreFake.maps;
    expect(map.getSource('journey')).toBeTruthy();
    expect(maplibreFake.markers).toHaveLength(2);
    expect(wrapper.get('section[aria-label="Map"]').text()).toContain('Map of the selected journey.');

    await wrapper.get('button[aria-label="Clear To"]').trigger('click');
    await settle();

    expect(wrapper.get('h2').text()).toBe('Ljubljana');
    expect(wrapper.get('section[aria-label="Map"]').text()).toContain('Map of the stop Ljubljana.');
  });

  it('asks where the journey starts when only To is set', async () => {
    mockGeolocation(HERE);
    mockNearby();
    mockApi('get', '/departures', [departure()]);
    const { wrapper } = await render();

    button('Swap from and to').click();
    await settle();

    expect(wrapper.text()).toContain('Choose where the journey starts.');
    expect(stopField('To').closest('.v-autocomplete')?.textContent).toContain('Ljubljana');
    expect(maplibreFake.maps[0].removed).toBe(true);
  });

  it('swaps From and To and plans the other way', async () => {
    mockGeolocation(HERE);
    mockNearby();
    mockApi('get', '/departures', [departure()]);
    mockApi('get', '/stops', [KOPER]);
    const journeys = mockApi('get', '/journeys', journeysPage([itinerary()]));
    await render();
    await pickStop('To', 'Koper');

    button('Swap from and to').click();
    await settle();

    expect(journeys.map((request) => request.url.searchParams.get('from_stop_id'))).toEqual(['si:1', 'si:2']);
    expect(journeys.at(-1)?.url.searchParams.get('to_stop_id')).toBe('si:1');
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
