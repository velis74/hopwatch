import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toOffsetIso } from '../composables/local-time';
import { useTripDetailsStore } from '../stores/trip-details';
import { itinerary, journeysPage } from '../test-journeys';
import { flushPromises, HttpResponse, mockApi, mountApp } from '../test-utils';

import JourneyResults from './journey-results.vue';

const LJUBLJANA = { id: 'si:1', name: 'Ljubljana', lat: 46.0584, lon: 14.5127, modes: [] };
const KOPER = { id: 'si:2', name: 'Koper', lat: 45.548, lon: 13.7302, modes: [] };
const KRANJ = { id: 'si:4', name: 'Kranj', lat: 46.24, lon: 14.35, modes: [] };

const REFRESH_MS = 30000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    await wait(5);
    await flushPromises();
  }
}

async function render(props: Record<string, unknown> = {}) {
  const { wrapper } = await mountApp(JourneyResults, {
    props: {
      from: LJUBLJANA,
      to: KOPER,
      timeMode: 'now',
      time: '',
      ...props,
    },
    models: { itinerary: null },
  });
  await settle();
  return wrapper;
}

function params(request: { url: URL }) {
  return Object.fromEntries(request.url.searchParams);
}

function button(wrapper: Awaited<ReturnType<typeof render>>, text: string) {
  return wrapper.findAll('button').filter((candidate) => candidate.text() === text);
}

describe('JourneyResults', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  });
  afterEach(() => vi.useRealTimers());

  it('plans journeys leaving now and shows the first on the map', async () => {
    const requests = mockApi('get', '/journeys', journeysPage([itinerary(), itinerary({ id: 'it-2' })]));
    const wrapper = await render();

    expect(requests.map(params)).toEqual([{ from_stop_id: 'si:1', to_stop_id: 'si:2' }]);
    expect(wrapper.findAll('[role="row"].df-anchored')).toHaveLength(2);
    expect((wrapper.props('itinerary') as { id: string }).id).toBe('it-1');
    expect(wrapper.text()).toMatch(/Updated at \d\d:\d\d\. Refreshes every 30 seconds\./u);
  });

  it.each([
    ['depart', {}],
    ['arrive', { arrive_by: 'true' }],
  ])('sends the chosen time for %s', async (timeMode, extra) => {
    const requests = mockApi('get', '/journeys', journeysPage([itinerary()]));
    await render({ timeMode, time: '2026-11-27T18:30' });

    expect(requests.map(params)).toEqual([
      { from_stop_id: 'si:1', to_stop_id: 'si:2', time: toOffsetIso('2026-11-27T18:30'), ...extra },
    ]);
  });

  it('leaves an unusable time to the server', async () => {
    const requests = mockApi('get', '/journeys', journeysPage([itinerary()]));
    await render({ timeMode: 'depart', time: '' });

    expect(requests.map(params)).toEqual([{ from_stop_id: 'si:1', to_stop_id: 'si:2' }]);
  });

  it('shows the selected itinerary on the map and keeps it after a refresh', async () => {
    const requests = mockApi('get', '/journeys', journeysPage([itinerary(), itinerary({ id: 'it-2' })]));
    const wrapper = await render();

    await button(wrapper, 'Show on map')[1].trigger('click');
    expect((wrapper.props('itinerary') as { id: string }).id).toBe('it-2');

    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    await settle();

    expect(requests).toHaveLength(2);
    expect((wrapper.props('itinerary') as { id: string }).id).toBe('it-2');
    expect(button(wrapper, 'Show on map').map((entry) => entry.attributes('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('turns pages by cursor, refreshes the page shown and moves the focus to its first journey', async () => {
    const requests = mockApi('get', '/journeys', ({ request }: { request: Request }) => {
      const cursor = new URL(request.url).searchParams.get('page_cursor');
      return HttpResponse.json(
        cursor === 'later-1'
          ? journeysPage([itinerary({ id: 'later' })], { later_cursor: 'later-2' })
          : journeysPage([itinerary()]),
      );
    });
    const wrapper = await render();

    await button(wrapper, 'Later')[0].trigger('click');
    await settle();

    expect(requests.map((request) => request.url.searchParams.get('page_cursor'))).toEqual([null, 'later-1']);
    const items = wrapper.findAll('[role="row"].df-anchored');
    expect(items).toHaveLength(1);
    expect(document.activeElement).toBe(items[0].get('.journey-cell.journey').element);
    expect((wrapper.props('itinerary') as { id: string }).id).toBe('later');

    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    await settle();
    expect(requests.at(-1)?.url.searchParams.get('page_cursor')).toBe('later-1');

    await button(wrapper, 'Earlier')[0].trigger('click');
    await settle();
    expect(requests.at(-1)?.url.searchParams.get('page_cursor')).toBe('earlier-1');
  });

  it('starts from the first page for another destination', async () => {
    const requests = mockApi('get', '/journeys', journeysPage([itinerary()]));
    const wrapper = await render();
    await button(wrapper, 'Later')[0].trigger('click');
    await settle();

    await wrapper.setProps({ to: KRANJ });
    await settle();

    expect(requests.map(params).at(-1)).toEqual({ from_stop_id: 'si:1', to_stop_id: 'si:4' });
  });

  it('clears the journeys shown while another destination loads', async () => {
    mockApi('get', '/journeys', ({ request }: { request: Request }) =>
      new URL(request.url).searchParams.get('to_stop_id') === 'si:4'
        ? new Promise<Response>(() => undefined)
        : HttpResponse.json(journeysPage([itinerary()])),
    );
    const wrapper = await render();

    await wrapper.setProps({ to: KRANJ });
    await settle();

    expect(wrapper.text()).toContain('Finding journeys…');
    expect(wrapper.props('itinerary')).toBeNull();
  });

  it('shows only the answer for the latest destination', async () => {
    let answerFirst: () => void = () => undefined;
    mockApi('get', '/journeys', async ({ request }: { request: Request }) => {
      if (new URL(request.url).searchParams.get('to_stop_id') === 'si:2') {
        await new Promise<void>((resolve) => (answerFirst = resolve));
        return HttpResponse.json(journeysPage([itinerary({ id: 'old' })]));
      }
      return HttpResponse.json(journeysPage([itinerary({ id: 'new' })]));
    });
    const wrapper = await render();

    await wrapper.setProps({ to: KRANJ });
    await settle();
    answerFirst();
    await settle();

    expect((wrapper.props('itinerary') as { id: string }).id).toBe('new');
  });

  it('warns when journeys are not available, and when the journeys shown get old', async () => {
    mockApi('get', '/journeys', { detail: 'down' }, { status: 503 });
    const wrapper = await render();
    expect(wrapper.get('[role="alert"]').text()).toContain('Journeys are not available right now.');

    mockApi('get', '/journeys', journeysPage([itinerary()]));
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    await settle();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);

    mockApi('get', '/journeys', () => HttpResponse.error());
    await vi.advanceTimersByTimeAsync(REFRESH_MS * 5);
    await settle();

    expect(wrapper.findAll('[role="row"].df-anchored')).toHaveLength(1);
    expect(wrapper.get('.stale-notice [role="alert"]').text()).toMatch(/^Not updated since \d\d:\d\d$/u);
  });

  it('opens the details of a journey and keeps them up to date with the refreshes', async () => {
    let transfers = 1;
    mockApi('get', '/journeys', () => HttpResponse.json(journeysPage([itinerary({ transfers })])));
    const { wrapper, router } = await mountApp(JourneyResults, {
      props: { from: LJUBLJANA, to: KOPER, timeMode: 'now', time: '' },
      models: { itinerary: null },
    });
    await settle();
    const details = useTripDetailsStore();

    await button(wrapper, 'Details')[0].trigger('click');
    await settle();

    expect(router.currentRoute.value.fullPath).toBe('/journey?id=it-1');
    expect(details.itinerary?.transfers).toBe(1);

    transfers = 2;
    await vi.advanceTimersByTimeAsync(REFRESH_MS + 500);
    await settle();

    expect(details.itinerary?.transfers).toBe(2);
  });
});
