import { config } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import type { Departure } from '../api/hopwatch-api';
import i18n from '../i18n';
import { mountApp } from '../test-utils';

import DeparturesList from './departures-list.vue';

// Render the real list element instead of the test-utils transition stub.
config.global.stubs = { ...config.global.stubs, 'transition-group': false };

function departure(overrides: Partial<Departure> = {}): Departure {
  return {
    trip_id: 'trip-1',
    stop_id: 'si:1',
    stop_name: 'Ljubljana',
    mode: 'rail',
    line: 'IC 502',
    headsign: 'Koper',
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
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

async function render(departures: Departure[], showStop?: boolean) {
  const { wrapper } = await mountApp(DeparturesList, {
    props: { departures, label: 'Departures from Ljubljana', showStop },
  });
  return wrapper;
}

describe('DeparturesList', () => {
  it('is a labelled list with one item per departure', async () => {
    const wrapper = await render([departure(), departure({ trip_id: 'trip-2', mode: 'bus', line: '6' })]);

    const list = wrapper.get('ul');
    expect(list.attributes('role')).toBe('list');
    expect(list.attributes('aria-label')).toBe('Departures from Ljubljana');
    expect(list.findAll('li')).toHaveLength(2);
  });

  it('shows mode, line, headsign and scheduled time', async () => {
    const wrapper = await render([departure()]);

    const text = wrapper.get('li').text();
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

    expect(wrapper.get('li').text()).toContain(name);
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

    const text = wrapper.get('li').text();
    expect(text).toContain(`Expected ${time('2026-11-27T10:12:00+01:00')}`);
    expect(text).toContain('+7 min (official)');
    expect(text).toContain('Platform 3');
    expect(wrapper.find('.text-error').text()).toContain('+7 min');
  });

  it('shows an early departure reported by riders', async () => {
    const wrapper = await render([
      departure({ expected_departure: '2026-11-27T10:03:00+01:00', delay_minutes: -2, delay_source: 'riders' }),
    ]);

    const text = wrapper.get('li').text();
    expect(text).toContain('2 min early (riders)');
    expect(wrapper.find('.text-error').exists()).toBe(false);
  });

  it('shows "on time" without an expected time when there is no delay', async () => {
    const wrapper = await render([
      departure({ expected_departure: '2026-11-27T10:05:00+01:00', delay_minutes: 0, delay_source: 'estimate' }),
    ]);

    const text = wrapper.get('li').text();
    expect(text).toContain('On time (estimate)');
    expect(text).not.toContain('Expected');
  });

  it('shows a delay without a source', async () => {
    const wrapper = await render([departure({ delay_minutes: 4 })]);

    const text = wrapper.get('li').text();
    expect(text).toContain('+4 min');
    expect(text).not.toContain('(');
  });

  it('lists at most four later stops', async () => {
    const wrapper = await render([
      departure({ next_stops: ['Brezovica', 'Preserje', 'Borovnica', 'Logatec', 'Postojna'] }),
    ]);

    const text = wrapper.get('li').text();
    expect(text).toContain('Via Brezovica, Preserje, Borovnica, Logatec');
    expect(text).not.toContain('Postojna');
  });

  it('names the stop of each departure when asked to', async () => {
    const wrapper = await render(
      [departure(), departure({ stop_id: 'si:3', stop_name: 'Ljubljana AP', mode: 'bus', line: '6' })],
      true,
    );

    expect(wrapper.findAll('li').map((item) => item.get('.departure-stop').text())).toEqual([
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

    expect(wrapper.findAll('li')).toHaveLength(2);
  });

  it('follows the interface language', async () => {
    const wrapper = await render([departure({ delay_minutes: 3 })]);

    i18n.global.locale.value = 'sl';
    await wrapper.vm.$nextTick();

    const text = wrapper.get('li').text();
    expect(text).toContain('Vlak');
    expect(text).not.toContain('Train');
  });
});
