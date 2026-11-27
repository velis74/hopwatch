import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';

import type { Itinerary } from '../api/hopwatch-api';
import { useTripDetailsStore } from '../stores/trip-details';
import { itinerary, leg, legStop, trip, tripStop } from '../test-journeys';
import { flushPromises, HttpResponse, mockApi, mountApp } from '../test-utils';

import JourneyPage from './journey-page.vue';

function time(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** Ljubljana – Divača by train, a walk to Divača AP, Divača AP – Koper by bus. */
function journey(): Itinerary {
  const value = itinerary();
  value.legs[0].from.id = 'l1';
  value.legs[0].to.id = 'l2';
  return value;
}

const TRAIN = trip({
  trip_id: 'trip-1',
  line: 'IC 502',
  headsign: 'Koper',
  stops: [
    tripStop('l1', 'Ljubljana', null, '10:05', { platform: '3' }),
    tripStop('l9', 'Postojna', '10:50', '10:51'),
    tripStop('l2', 'Divača', '11:20', '11:21'),
    tripStop('l3', 'Koper', '11:55', null),
  ],
});
const BUS = trip({
  trip_id: 'trip-2',
  mode: 'bus',
  line: '1',
  headsign: 'Koper',
  bikes_allowed: null,
  wheelchair_accessible: null,
  stops: [tripStop('x1', 'Divača AP', null, '11:25'), tripStop('x2', 'Koper', '11:35', null)],
});

async function render(value: Itinerary | null = journey(), route = '/journey') {
  setActivePinia(createPinia());
  if (value) useTripDetailsStore().openItinerary(value);
  mockApi('get', '/trips/:id', ({ params }: { params: Record<string, string> }) =>
    params.id === 'trip-1' ? HttpResponse.json(TRAIN) : HttpResponse.json(BUS),
  );
  const mounted = await mountApp(JourneyPage, { route });
  await flushPromises();
  return mounted;
}

describe('JourneyPage', () => {
  it('heads the journey with its ends and shows its totals', async () => {
    const { wrapper } = await render();

    const heading = wrapper.get('h2');
    expect(heading.text()).toBe('Journey from Ljubljana to Koper');
    expect(heading.attributes('tabindex')).toBe('-1');
    const totals = wrapper.get('.journey-totals').text();
    expect(totals).toContain(`Departure${time('2026-11-27T09:05:00Z')}`);
    expect(totals).toContain(`Arrival${time('2026-11-27T10:35:00Z')}`);
    expect(totals).toContain('Duration1 h 30 min');
    expect(totals).toContain('Transfers1 transfer');
  });

  it('lists the rides with their stops, the walk with distance and time, and the transfer with its wait', async () => {
    const { wrapper } = await render();

    const steps = wrapper.findAll('.journey-steps > li');
    expect(steps.map((step) => step.classes().find((name) => name.startsWith('journey-step--')))).toEqual([
      'journey-step--ride',
      'journey-step--walk',
      'journey-step--transfer',
      'journey-step--ride',
    ]);
    expect(steps[0].get('h3').text()).toBe('Train IC 502 to Koper');
    // The train leg ends at Divača, not at the end of the ride.
    expect(steps[0].findAll('.ride-timeline > li').map((item) => item.find('.ride-stop-name').text())).toEqual([
      'Ljubljana',
      'Postojna',
      'Divača',
    ]);
    expect(steps[1].text()).toBe('Walk 240 m to Divača AP, 5 min');
    expect(steps[2].text()).toBe('Transfer at Divača, 5 min');
    expect(steps[3].get('h3').text()).toBe('Bus 1 to Koper');
    expect(steps[3].findAll('.ride-timeline > li')).toHaveLength(2);
    expect(steps[3].find('.ride-amenities').exists()).toBe(false);
  });

  it('shows the leg from the journey while its ride is not available', async () => {
    setActivePinia(createPinia());
    useTripDetailsStore().openItinerary(itinerary({ legs: [leg({ ticket_url: 'https://tickets.example/' })] }));
    mockApi('get', '/trips/:id', () => HttpResponse.error());
    const { wrapper } = await mountApp(JourneyPage, { route: '/journey' });
    await flushPromises();

    const ride = wrapper.get('.journey-step--ride');
    expect(ride.text()).toContain(`${time('2026-11-27T09:05:00Z')} Ljubljana – ${time('2026-11-27T10:20:00Z')} Divača`);
    expect(ride.text()).toContain('Platform 3');
    expect(ride.text()).toContain('The stops of this ride are not available right now.');
    expect(ride.get('a').attributes('href')).toBe('https://tickets.example/');
  });

  it('gives the map the journey', async () => {
    await render();

    expect(useTripDetailsStore().mapRoute).toMatchObject({ id: 'journey:it-1', kind: 'journey' });
  });

  it('says the journey is no longer available without one or for another one', async () => {
    const { wrapper } = await render(journey(), '/journey?id=other');

    expect(wrapper.get('h2').text()).toBe('Journey');
    expect(wrapper.text()).toContain('This journey is no longer available.');
    expect(useTripDetailsStore().mapRoute).toBeNull();
  });

  it('keeps the journey for the browser tab', async () => {
    await render();

    setActivePinia(createPinia());
    expect(useTripDetailsStore().itinerary?.id).toBe('it-1');
  });

  it('shows the walk without a distance', async () => {
    const value = journey();
    value.legs[1] = { ...value.legs[1], distance_m: null, to: legStop('Divača AP', '2026-11-27T10:25:00Z') };
    const { wrapper } = await render(value);

    expect(wrapper.get('.journey-step--walk').text()).toBe('Walk to Divača AP, 5 min');
  });

  it('asks to go back to the list', async () => {
    const { wrapper } = await render(null);

    await wrapper.get('.back-to-list').trigger('click');

    expect(wrapper.emitted('back')).toHaveLength(1);
  });
});
