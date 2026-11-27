import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTripDetailsStore } from '../stores/trip-details';
import { trip, tripStop } from '../test-journeys';
import { apiError, flushPromises, HttpResponse, mockApi, mountApp } from '../test-utils';

import RidePage from './ride-page.vue';

function time(local: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(`2026-11-27T${local}:00+01:00`),
  );
}

/** Lets the mocked network and the page finish what they started. */
async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    await flushPromises();
  }
}

async function render(route = '/ride/trip-1?from=s2') {
  const mounted = await mountApp(RidePage, { route });
  await settle();
  return mounted;
}

function timeline(wrapper: Awaited<ReturnType<typeof render>>['wrapper']) {
  return wrapper.findAll('.ride-timeline > li').map((item) => item.text());
}

describe('RidePage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date('2026-11-27T10:20:00+01:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('heads the ride with its mode, line and headsign and shows it from the boarding stop to the end', async () => {
    const requests = mockApi('get', '/trips/:id', trip());
    const { wrapper } = await render();

    expect(requests[0].url.pathname).toBe('/api/v1/trips/trip-1');
    const heading = wrapper.get('h2');
    expect(heading.text()).toBe('Train RG 2100 to Jesenice');
    expect(heading.attributes('tabindex')).toBe('-1');
    expect(wrapper.get('section').attributes('aria-labelledby')).toBe(heading.attributes('id'));
    const facts = wrapper.findAll('.ride-fact').map((fact) => fact.text());
    expect(facts[0]).toContain('Departure');
    expect(facts[0]).toContain(`Kranj${time('10:27')}`);
    expect(facts[0]).toContain('Platform not known');
    expect(facts[1]).toContain(`Jesenice${time('10:58')}`);
    expect(facts[2]).toBe('Travel time31 min');
    const stops = timeline(wrapper);
    expect(stops).toHaveLength(3);
    expect(stops[0]).toContain('Get on here');
    expect(stops[1]).toContain('Lesce-Bled');
    expect(stops[1]).toContain(`arr. ${time('10:45')}, dep. ${time('10:46')}`);
    expect(stops[2]).toContain('Get off here');
    expect(wrapper.get('.ride-timeline').attributes('aria-label')).toBe('Stops of Train RG 2100 to Jesenice');
  });

  it('ends the ride at the stop given as "to" and starts at the first stop without "from"', async () => {
    mockApi('get', '/trips/:id', trip());
    const { wrapper } = await render('/ride/trip-1?to=s3');

    const stops = timeline(wrapper);
    expect(stops).toHaveLength(3);
    expect(stops[0]).toContain('Ljubljana');
    expect(stops[2]).toContain('Lesce-Bled');
  });

  it('shows the expected time, delay, source and platform of the boarding stop', async () => {
    const ride = trip();
    ride.stops[1] = {
      ...ride.stops[1],
      expected_departure: '2026-11-27T10:31:00+01:00',
      delay_minutes: 4,
      delay_source: 'estimate',
      platform: '2',
    };
    mockApi('get', '/trips/:id', ride);
    const { wrapper } = await render();

    const departure = wrapper.findAll('.ride-fact')[0].text();
    expect(departure).toContain(`Expected ${time('10:31')}`);
    expect(departure).toContain('+4 min (estimate)');
    expect(departure).toContain('Platform 2');
  });

  it('marks passed stops in text, not only by their look', async () => {
    mockApi('get', '/trips/:id', trip());
    const { wrapper } = await render('/ride/trip-1');

    const first = wrapper.get('.ride-timeline > li');
    expect(first.classes()).toContain('ride-stop--passed');
    expect(first.text()).toContain('Passed');
    expect(timeline(wrapper)[1]).not.toContain('Passed');
  });

  it('names the known amenities with text and leaves out the unknown ones', async () => {
    mockApi('get', '/trips/:id', trip({ bikes_allowed: true, wheelchair_accessible: null }));
    const { wrapper } = await render();

    const amenities = wrapper.get('.ride-amenities');
    expect(amenities.attributes('aria-label')).toBe('On board');
    expect(amenities.findAll('li').map((item) => item.text())).toEqual(['Bicycles allowed']);
  });

  it('says when bicycles and wheelchairs are not carried', async () => {
    mockApi('get', '/trips/:id', trip({ bikes_allowed: false, wheelchair_accessible: false }));
    const { wrapper } = await render();

    expect(wrapper.findAll('.ride-amenities li').map((item) => item.text())).toEqual([
      'No bicycles',
      'Not wheelchair accessible',
    ]);
  });

  it('has no amenities list when none is known', async () => {
    mockApi('get', '/trips/:id', trip({ bikes_allowed: null, wheelchair_accessible: null }));
    const { wrapper } = await render();

    expect(wrapper.find('.ride-amenities').exists()).toBe(false);
  });

  it('names the operator with the favourite toggle and links to the ticket shop', async () => {
    mockApi('get', '/trips/:id', trip({ ticket_url: 'https://tickets.example/' }));
    const { wrapper } = await render();

    expect(wrapper.get('.ride-operator').text()).toContain('SŽ - Potniški promet, d.o.o.');
    expect(wrapper.get('.favourite-operator-button').attributes('aria-pressed')).toBe('false');
    const ticket = wrapper.get('a.ride-ticket');
    expect(ticket.attributes('href')).toBe('https://tickets.example/');
    expect(ticket.text()).toContain('Buy ticket');
  });

  it('shows a cancelled ride and cancelled stops prominently', async () => {
    const ride = trip({ cancelled: true });
    ride.stops[2] = { ...ride.stops[2], cancelled: true };
    mockApi('get', '/trips/:id', ride);
    const { wrapper } = await render();

    expect(wrapper.get('.ride-cancelled').text()).toBe('This ride is cancelled.');
    expect(timeline(wrapper)[1]).toContain('Stop cancelled');
  });

  it('says so when the ride is not in the timetable', async () => {
    mockApi('get', '/trips/:id', apiError('hopwatch.trip_not_found'), { status: 404 });
    const { wrapper } = await render();

    expect(wrapper.text()).toContain('This ride was not found in the timetable.');
    expect(wrapper.get('h2').text()).toBe('Ride');
  });

  it('says so when the ride is not available', async () => {
    mockApi('get', '/trips/:id', () => HttpResponse.error());
    const { wrapper } = await render();

    expect(wrapper.text()).toContain('The ride details are not available right now.');
  });

  it('refreshes every 30 seconds, announces a changed delay and warns when the data gets old', async () => {
    let delay = 0;
    const requests = mockApi('get', '/trips/:id', () => {
      const ride = trip();
      ride.stops[1] = { ...ride.stops[1], delay_minutes: delay };
      return HttpResponse.json(ride);
    });
    const { wrapper } = await render();
    expect(requests).toHaveLength(1);

    delay = 5;
    await vi.advanceTimersByTimeAsync(30500);
    await settle();

    expect(requests).toHaveLength(2);
    expect(wrapper.get('[aria-live="polite"].visually-hidden').text()).toBe(
      'Train RG 2100 to Jesenice at Kranj: delay now +5 min.',
    );

    mockApi('get', '/trips/:id', () => HttpResponse.error());
    await vi.advanceTimersByTimeAsync(150000);
    await settle();

    expect(wrapper.text()).toContain('Not updated since');
    expect(wrapper.text()).toContain('Kranj');
  });

  it('gives the map the ride from the boarding stop and takes it back when closed', async () => {
    mockApi('get', '/trips/:id', trip());
    const { wrapper } = await render();
    const details = useTripDetailsStore();

    expect(details.mapRoute).toMatchObject({
      id: 'ride:trip-1:1:3',
      kind: 'ride',
      start: { lat: 46.24, lon: 14.36 },
      end: { lat: 46.43, lon: 14.05 },
    });
    expect(details.mapRoute?.lines[0].points).toEqual([
      [46.24, 14.36],
      [46.3, 14.2],
      [46.36, 14.17],
      [46.43, 14.05],
    ]);

    wrapper.unmount();
    expect(details.mapRoute).toBeNull();
  });

  it('asks to go back to the list', async () => {
    mockApi('get', '/trips/:id', trip());
    const { wrapper } = await render();

    await wrapper.get('.back-to-list').trigger('click');

    expect(wrapper.emitted('back')).toHaveLength(1);
  });

  it('follows the interface language', async () => {
    mockApi(
      'get',
      '/trips/:id',
      trip({ stops: [tripStop('a', 'A', null, '10:00'), tripStop('b', 'B', '10:10', null)] }),
    );
    const { wrapper } = await mountApp(RidePage, { route: '/ride/trip-1', locale: 'sl' });
    await flushPromises();

    expect(wrapper.get('h2').text()).toBe('Vlak RG 2100 proti Jesenice');
    expect(wrapper.text()).toContain('Vstop');
    expect(wrapper.text()).toContain('Izstop');
  });
});
