import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Departure } from '../api/hopwatch-api';
import i18n from '../i18n';
import { mountApp } from '../test-utils';

import DeparturesList from './departures-list.vue';

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
    delay_minutes: null,
    delay_source: null,
    platform: null,
    next_stops: [],
    ...overrides,
  };
}

function time(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

async function render(departures: Departure[], showStop?: boolean) {
  const { wrapper } = await mountApp(DeparturesList, {
    props: { departures, label: 'Departures from Ljubljana', showStop },
  });
  return wrapper;
}

/** The record rows of the grid, without its header row. */
function items(wrapper: VueWrapper) {
  return wrapper.findAll('[role="row"].df-anchored');
}

describe('DeparturesList', () => {
  it('is a labelled table with one row per departure', async () => {
    const wrapper = await render([departure(), departure({ trip_id: 'trip-2', mode: 'bus', line: '6' })]);

    const table = wrapper.get('[role="table"]');
    expect(table.attributes('aria-label')).toBe('Departures from Ljubljana');
    expect(items(wrapper)).toHaveLength(2);
    expect(items(wrapper)[0].findAll('[role="cell"]').length).toBeGreaterThan(0);
  });

  it('shows mode, line, headsign and scheduled time', async () => {
    const wrapper = await render([departure()]);

    const text = items(wrapper)[0].text();
    expect(text).toContain('Train');
    expect(text).toContain('IC 502');
    expect(text).toContain('to Koper');
    expect(text).toContain(`Scheduled ${time('2026-11-27T10:05:00+01:00')}`);
    expect(text).not.toContain('Expected');
    expect(text).not.toContain('Platform');
    expect(text).not.toContain('Via');
  });

  it.each([
    ['bus', 'Bus'],
    ['tram', 'Tram'],
    ['other', 'Service'],
  ] as const)('names the %s mode', async (mode, name) => {
    const wrapper = await render([departure({ mode })]);

    expect(items(wrapper)[0].text()).toContain(name);
  });

  it('shows a delay with its source, the expected time and the platform', async () => {
    const wrapper = await render([
      departure({
        expected_departure: '2026-11-27T10:12:00+01:00',
        delay_minutes: 7,
        delay_source: 'official',
        platform: '3',
      }),
    ]);

    const text = items(wrapper)[0].text();
    expect(text).toContain(`Expected ${time('2026-11-27T10:12:00+01:00')}`);
    expect(text).toContain('+7 min (official)');
    expect(text).toContain('Platform 3');
    expect(wrapper.find('.text-error').text()).toContain('+7 min');
  });

  it('shows an early departure reported by riders', async () => {
    const wrapper = await render([
      departure({
        expected_departure: '2026-11-27T10:03:00+01:00',
        delay_minutes: -2,
        delay_source: 'riders',
      }),
    ]);

    const text = items(wrapper)[0].text();
    expect(text).toContain('2 min early (riders)');
    expect(wrapper.find('.text-error').exists()).toBe(false);
  });

  it('shows "on time" without an expected time when there is no delay', async () => {
    const wrapper = await render([
      departure({
        expected_departure: '2026-11-27T10:05:00+01:00',
        delay_minutes: 0,
        delay_source: 'estimate',
      }),
    ]);

    const text = items(wrapper)[0].text();
    expect(text).toContain('On time (estimate)');
    expect(text).not.toContain('Expected');
  });

  it('shows a delay without a source', async () => {
    const wrapper = await render([departure({ delay_minutes: 4 })]);

    const text = items(wrapper)[0].text();
    expect(text).toContain('+4 min');
    expect(text).not.toContain('(');
  });

  it('lists at most four later stops', async () => {
    const wrapper = await render([
      departure({
        next_stops: ['Brezovica', 'Preserje', 'Borovnica', 'Logatec', 'Postojna'],
      }),
    ]);

    const text = items(wrapper)[0].text();
    expect(text).toContain('Via Brezovica, Preserje, Borovnica, Logatec');
    expect(text).not.toContain('Postojna');
  });

  it('names the stop of each departure when asked to', async () => {
    const wrapper = await render(
      [
        departure(),
        departure({
          stop_id: 'si:3',
          stop_name: 'Ljubljana AP',
          mode: 'bus',
          line: '6',
        }),
      ],
      true,
    );

    expect(items(wrapper).map((item) => item.get('.departure-stop').text())).toEqual([
      'From Ljubljana',
      'From Ljubljana AP',
    ]);
  });

  it('does not name the stop by default', async () => {
    const wrapper = await render([departure()]);

    expect(wrapper.find('.departure-stop').exists()).toBe(false);
  });

  it('lists the same trip at two stops as two departures', async () => {
    const wrapper = await render([departure(), departure({ stop_id: 'si:3', stop_name: 'Ljubljana AP' })], true);

    expect(items(wrapper)).toHaveLength(2);
  });

  it('follows the interface language', async () => {
    const wrapper = await render([departure({ delay_minutes: 3 })]);

    i18n.global.locale.value = 'sl';
    await wrapper.vm.$nextTick();

    const text = items(wrapper)[0].text();
    expect(text).toContain('Vlak');
    expect(text).not.toContain('Train');
  });

  it('names the operator and tags a favourite one', async () => {
    window.localStorage.setItem('hopwatch.favouriteOperators', '["1161"]');
    const wrapper = await render([
      departure({
        operator: {
          id: '1161',
          name: 'SŽ - Potniški promet, d.o.o.',
          url: null,
        },
      }),
      departure({
        trip_id: 'trip-2',
        mode: 'bus',
        operator: { id: '1123', name: 'Arriva d.o.o.', url: null },
      }),
    ]);

    const [train, bus] = items(wrapper);
    expect(train.get('.departure-operator').text()).toContain('SŽ - Potniški promet, d.o.o.');
    expect(train.get('.favourite-tag').text()).toBe('Favourite');
    expect(bus.get('.departure-operator').text()).toContain('Arriva d.o.o.');
    expect(bus.find('.favourite-tag').exists()).toBe(false);
  });

  it('marks an operator as favourite from a departure, tagging all its departures', async () => {
    const arriva = { id: '1123', name: 'Arriva d.o.o.', url: null };
    const wrapper = await render([departure({ operator: arriva }), departure({ trip_id: 'trip-2', operator: arriva })]);

    const first = items(wrapper)[0].get('button');
    expect(first.attributes('aria-label')).toBe('Favourite operator: Arriva d.o.o.');
    expect(first.attributes('aria-pressed')).toBe('false');
    await first.trigger('click');

    expect(wrapper.findAll('.favourite-tag')).toHaveLength(2);
    const buttons = items(wrapper).flatMap((item) => item.findAll('button'));
    expect(buttons.map((button) => button.attributes('aria-pressed'))).toEqual(['true', 'true']);
    expect(buttons[1].attributes('aria-label')).toBe('Favourite operator: Arriva d.o.o.');
  });

  it('shows no operator and no favourite button when the timetable names none', async () => {
    const wrapper = await render([departure()]);

    expect(wrapper.find('.departure-operator').exists()).toBe(false);
    expect(items(wrapper)[0].find('button').exists()).toBe(false);
  });

  it('links each departure to the details of its ride, boarding at its stop at the time of the departure', async () => {
    const wrapper = await render([departure({ trip_id: '20261127_14:42_ijpp/1', stop_id: 'si:3' })]);

    const link = items(wrapper)[0].get('a.departure-link');
    expect(link.text()).toBe('Details');
    const main = wrapper.get(`#${link.attributes('aria-describedby')}`);
    expect(main.text()).toContain('IC 502');
    const href = new URL(link.attributes('href')!, 'http://localhost');
    expect(href.pathname).toBe('/ride/20261127_14:42_ijpp%2F1');
    expect(Object.fromEntries(href.searchParams)).toEqual({
      from: 'si:3',
      at: departure().scheduled_departure,
    });
  });
  it('names its columns in the interface language', async () => {
    const wrapper = await render([departure()], true);

    const headers = () => wrapper.findAll('.df-grid.card.header [role="columnheader"]').map((header) => header.text());
    expect(headers()).toEqual(['Time', 'Line', 'Delay', 'Platform', 'Operator', 'Stop', 'Details']);

    i18n.global.locale.value = 'sl';
    await wrapper.vm.$nextTick();

    expect(headers()).toContain('Zamuda');
  });

  it('renders no table without departures', async () => {
    const wrapper = await render([]);

    expect(wrapper.find('[role="table"]').exists()).toBe(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks new departures as added and changed ones as updated on refresh', async () => {
    const wrapper = await render([departure(), departure({ trip_id: 'trip-2', line: '6' })]);
    const card = (key: string) => wrapper.get(`.df-grid.card[data-pk="${key}"]`);
    expect(card('si:1:trip-1').classes()).not.toContain('state-adding');
    vi.useFakeTimers();

    await wrapper.setProps({
      departures: [
        departure({ delay_minutes: 5 }),
        departure({ trip_id: 'trip-2', line: '6' }),
        departure({ trip_id: 'trip-3', line: '11' }),
      ],
    });
    // The grid renders an added record once its windowing throttle (100 ms) has passed.
    await vi.waitFor(() => card('si:1:trip-3'));

    expect(card('si:1:trip-3').classes()).toContain('state-adding');
    expect(card('si:1:trip-1').classes()).toContain('state-updated');
    expect(card('si:1:trip-2').classes()).not.toContain('state-updated');
    expect(card('si:1:trip-2').classes()).not.toContain('state-adding');

    vi.advanceTimersByTime(1500);
    await wrapper.vm.$nextTick();
    expect(card('si:1:trip-1').classes()).not.toContain('state-updated');

    await wrapper.setProps({
      departures: [
        departure({ delay_minutes: 5, platform: '2' }),
        departure({ trip_id: 'trip-2', line: '6' }),
        departure({ trip_id: 'trip-3', line: '11' }),
      ],
    });

    expect(card('si:1:trip-1').classes()).toContain('state-updated');
  });
});
