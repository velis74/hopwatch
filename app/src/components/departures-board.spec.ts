import { config } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Departure } from '../api/hopwatch-api';
import { flushPromises, HttpResponse, mockApi, mountApp } from '../test-utils';

import DeparturesBoard from './departures-board.vue';

// Render the real departures list element instead of the test-utils transition stub.
config.global.stubs = { ...config.global.stubs, 'transition-group': false };

const LJUBLJANA = { id: 'si:1', name: 'Ljubljana', lat: 46.0569, lon: 14.5058, modes: ['rail' as const] };
const KOPER = { id: 'si:2', name: 'Koper', lat: 45.548, lon: 13.7302, modes: ['rail' as const] };

const REFRESH_MS = 30000;

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

async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    await wait(5);
    await flushPromises();
  }
}

async function render(props: { stop?: typeof LJUBLJANA; stopIds?: string[] } = {}) {
  const mounted = await mountApp(DeparturesBoard, { props: { stop: LJUBLJANA, stopIds: ['si:1'], ...props } });
  await settle();
  return mounted;
}

function announcements(): string {
  return document.body.querySelector('.visually-hidden[aria-live="polite"]')?.textContent?.trim() ?? '';
}

function departureItems(): string[] {
  return [...document.body.querySelectorAll('[role="table"] [role="row"].df-anchored')].map(
    (item) => item.textContent ?? '',
  );
}

async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await settle();
}

describe('DeparturesBoard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the departures of the stop under its name', async () => {
    const departures = mockApi('get', '/departures', [departure()]);
    const { wrapper } = await render();

    expect(wrapper.get('h2').text()).toBe('Ljubljana');
    expect(wrapper.get('section').attributes('aria-labelledby')).toBe(wrapper.get('h2').attributes('id'));
    expect([...departures[0].url.searchParams]).toEqual([
      ['stop_id', 'si:1'],
      ['window_minutes', '60'],
    ]);
    expect(wrapper.get('[role="table"]').attributes('aria-label')).toBe('Departures from Ljubljana');
    expect(departureItems()).toHaveLength(1);
    expect(departureItems()[0]).toContain('IC 502');
    expect(departureItems()[0]).not.toContain('From Ljubljana');
    expect(wrapper.text()).toMatch(/Updated at \d\d:\d\d\. Refreshes every 30 seconds\./u);
  });

  it('merges the departures of nearby stops and names the stop of each', async () => {
    const departures = mockApi('get', '/departures', [
      departure(),
      departure({ trip_id: 'b', stop_id: 'si:3', stop_name: 'Ljubljana AP', mode: 'bus', line: '6' }),
    ]);
    const { wrapper } = await render({ stopIds: ['si:1', 'si:3'] });

    expect(departures[0].url.searchParams.getAll('stop_id')).toEqual(['si:1', 'si:3']);
    expect(wrapper.get('[role="table"]').attributes('aria-label')).toBe('Departures from Ljubljana and nearby stops');
    expect(departureItems()[0]).toContain('From Ljubljana');
    expect(departureItems()[1]).toContain('From Ljubljana AP');
  });

  it('loads again when the stops change, keeping the list shown meanwhile', async () => {
    const departures = mockApi('get', '/departures', [departure()]);
    const { wrapper } = await render();

    await wrapper.setProps({ stopIds: ['si:1', 'si:3'] });
    expect(departureItems()).toHaveLength(1);
    await settle();

    expect(departures.map((request) => request.url.searchParams.getAll('stop_id'))).toEqual([
      ['si:1'],
      ['si:1', 'si:3'],
    ]);
  });

  it('starts over for another stop', async () => {
    const response = held([departure({ stop_id: 'si:2', stop_name: 'Koper', headsign: 'Ljubljana' })]);
    mockApi('get', '/departures', ({ request }: { request: Request }) =>
      new URL(request.url).searchParams.get('stop_id') === 'si:2'
        ? response.answer()
        : HttpResponse.json([departure()]),
    );
    const { wrapper } = await render();

    await wrapper.setProps({ stop: KOPER, stopIds: ['si:2'] });

    expect(wrapper.get('h2').text()).toBe('Koper');
    expect(wrapper.text()).toContain('Loading departures…');
    expect(wrapper.text()).not.toContain('Updated at');
    response.release();
    await settle();
    expect(departureItems()[0]).toContain('to Ljubljana');
  });

  it('says departures are loading until they arrive', async () => {
    const response = held([]);
    mockApi('get', '/departures', response.answer);
    const { wrapper } = await render();

    expect(wrapper.text()).toContain('Loading departures…');

    response.release();
    await settle();

    expect(wrapper.text()).not.toContain('Loading departures…');
    expect(wrapper.text()).toContain('No departures in the next 60 minutes.');
  });

  it('warns when departures are not available', async () => {
    mockApi('get', '/departures', { detail: 'down' }, { status: 503 });
    const { wrapper } = await render();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Departures are not available right now. Please try again later.',
    );
    expect(wrapper.text()).not.toContain('Loading departures…');
  });

  it('shows only the answer for the latest stops', async () => {
    const first = held([departure({ line: 'first' })]);
    mockApi('get', '/departures', ({ request }: { request: Request }) =>
      new URL(request.url).searchParams.getAll('stop_id').length === 2
        ? HttpResponse.json([departure({ line: 'latest' })])
        : first.answer(),
    );
    const { wrapper } = await render();

    await wrapper.setProps({ stopIds: ['si:1', 'si:3'] });
    await settle();
    first.release();
    await settle();

    expect(departureItems()).toHaveLength(1);
    expect(departureItems()[0]).toContain('latest');
  });

  it('ignores a failure of an outdated request', async () => {
    let failFirst: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (failFirst = resolve));
    mockApi('get', '/departures', async ({ request }: { request: Request }) => {
      if (new URL(request.url).searchParams.getAll('stop_id').length === 2) return HttpResponse.json([departure()]);
      await gate;
      return HttpResponse.json({ detail: 'down' }, { status: 503 });
    });
    const { wrapper } = await render();

    await wrapper.setProps({ stopIds: ['si:1', 'si:3'] });
    await settle();
    failFirst();
    await settle();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(departureItems()).toHaveLength(1);
  });

  it('refreshes every 30 seconds and announces changed delays', async () => {
    const before = [
      departure({ trip_id: 'a', delay_minutes: 2 }),
      departure({ trip_id: 'b', mode: 'bus', line: '6', headsign: 'Črnuče', delay_minutes: 4 }),
      departure({ trip_id: 'c', line: 'LP 2', delay_minutes: 1 }),
      departure({ trip_id: 'd', line: 'LP 3', delay_minutes: 3 }),
      departure({ trip_id: 'a', stop_id: 'si:3', stop_name: 'Ljubljana AP', line: 'other stop', delay_minutes: 1 }),
    ];
    const after = [
      departure({ trip_id: 'a', delay_minutes: 5 }),
      departure({ trip_id: 'b', mode: 'bus', line: '6', headsign: 'Črnuče', delay_minutes: 0 }),
      departure({ trip_id: 'c', line: 'LP 2', delay_minutes: null }),
      departure({ trip_id: 'd', line: 'LP 3', delay_minutes: -1 }),
      departure({ trip_id: 'e', line: 'new', delay_minutes: 9 }),
      departure({ trip_id: 'a', stop_id: 'si:3', stop_name: 'Ljubljana AP', line: 'other stop', delay_minutes: 1 }),
    ];
    let answer = before;
    const departures = mockApi('get', '/departures', () => HttpResponse.json(answer));
    await render({ stopIds: ['si:1', 'si:3'] });
    expect(announcements()).toBe('');

    answer = after;
    await advance(REFRESH_MS - 500);
    expect(departures).toHaveLength(1);
    await advance(500);

    expect(departures).toHaveLength(2);
    expect(departureItems()).toHaveLength(6);
    expect(announcements()).toBe(
      [
        'Train IC 502 to Koper: delay now +5 min.',
        'Bus 6 to Črnuče: now on time.',
        'Train LP 3 to Koper: delay now 1 min early.',
      ].join(' '),
    );
  });

  it('does not announce anything when no delay changed', async () => {
    const departures = mockApi('get', '/departures', [departure()]);
    await render();

    await advance(REFRESH_MS);

    expect(departures).toHaveLength(2);
    expect(announcements()).toBe('');
  });

  it('does not announce the departures of other stops as changes', async () => {
    mockApi('get', '/departures', ({ request }: { request: Request }) =>
      HttpResponse.json([
        departure({ delay_minutes: new URL(request.url).searchParams.getAll('stop_id').length === 2 ? 9 : 2 }),
      ]),
    );
    const { wrapper } = await render();

    await wrapper.setProps({ stopIds: ['si:1', 'si:3'] });
    await settle();

    expect(departureItems()[0]).toContain('+9 min');
    expect(announcements()).toBe('');
  });

  it('keeps the departures shown when a refresh fails and warns once they are two minutes old', async () => {
    mockApi('get', '/departures', [departure()]);
    const { wrapper } = await render();
    const updated = wrapper.text().match(/Updated at (\d\d:\d\d)/u)![1];
    mockApi('get', '/departures', () => HttpResponse.error());

    await advance(REFRESH_MS * 4);

    expect(departureItems()).toHaveLength(1);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);

    await advance(REFRESH_MS);

    const notice = wrapper.get('.stale-notice');
    expect(notice.attributes('aria-live')).toBe('polite');
    expect(notice.get('[role="alert"]').text()).toBe(`Not updated since ${updated}`);

    mockApi('get', '/departures', [departure()]);
    await advance(REFRESH_MS);

    expect(wrapper.find('.stale-notice [role="alert"]').exists()).toBe(false);
  });

  it('does not refresh while the page is hidden and refreshes on the first tick after it is shown', async () => {
    const departures = mockApi('get', '/departures', [departure()]);
    await render();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);

    await advance(REFRESH_MS * 2);
    expect(departures).toHaveLength(1);

    hidden.mockReturnValue(false);
    await advance(500);

    expect(departures).toHaveLength(2);
  });

  it('stops refreshing when it leaves the page', async () => {
    const departures = mockApi('get', '/departures', [departure()]);
    const { wrapper } = await render();

    wrapper.unmount();
    await advance(REFRESH_MS);

    expect(departures).toHaveLength(1);
  });
});
