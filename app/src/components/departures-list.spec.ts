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

async function render(departures: Departure[], destination?: string) {
  const { wrapper } = await mountApp(DeparturesList, {
    props: { departures, label: 'Departures from Ljubljana', destination },
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

  it('names a later stop matching the destination when "Via" does not show it', async () => {
    const stops = ['Brezovica', 'Preserje', 'Borovnica', 'Logatec', 'Postojna', 'Divača', 'Koper'];
    const wrapper = await render([departure({ next_stops: stops })], 'divac');

    expect(wrapper.get('li').text()).toContain('Calls at Divača');
  });

  it('does not repeat a matching stop already shown in "Via"', async () => {
    const stops = ['Brezovica', 'Preserje', 'Borovnica', 'Logatec', 'Postojna'];
    const wrapper = await render([departure({ next_stops: stops })], 'Logatec');

    expect(wrapper.get('li').text()).not.toContain('Calls at');
  });

  it('matches every word of the destination at the start of a word, ignoring case and accents', async () => {
    const stops = ['A', 'B', 'C', 'D', 'Ljubljana Tivoli', 'Novo Mesto Center', 'Đakovo Łódź'];

    expect((await render([departure({ next_stops: stops })], 'mesto NOVO')).text()).toContain(
      'Calls at Novo Mesto Center',
    );
    expect((await render([departure({ next_stops: stops })], 'dakovo lodz')).text()).toContain('Calls at Đakovo Łódź');
    expect((await render([departure({ next_stops: stops })], 'esto')).text()).not.toContain('Calls at');
    expect((await render([departure({ next_stops: stops })], ' , ')).text()).not.toContain('Calls at');
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
