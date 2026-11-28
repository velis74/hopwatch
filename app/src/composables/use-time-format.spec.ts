import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';

import i18n from '../i18n';
import { itinerary, legStop } from '../test-journeys';
import { mountApp } from '../test-utils';

import { arrivalZone, departureZone, formatTime, useTimeFormat } from './use-time-format';

const Clock = defineComponent({
  props: {
    value: { type: [String, Date], required: true },
    timeZone: { type: String, default: undefined },
  },
  setup(props) {
    const format = useTimeFormat();
    return () => h('time', format(props.value, props.timeZone));
  },
});

function expected(tag: string, value: Date): string {
  return new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit' }).format(value);
}

// The device is in Honolulu (UTC-10), far from the stops of the tests.
const deviceZone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Pacific/Honolulu';
});
afterAll(() => {
  if (deviceZone === undefined) delete process.env.TZ;
  else process.env.TZ = deviceZone;
});

describe('useTimeFormat', () => {
  it('shows a time as local time in the time zone of the stop', async () => {
    const { wrapper } = await mountApp(Clock, {
      props: { value: '2026-11-27T09:05:00Z', timeZone: 'Europe/Ljubljana' },
    });

    expect(wrapper.text()).toBe('10:05');
  });

  it('shows the same instant in another stop time zone by its local time', async () => {
    const { wrapper } = await mountApp(Clock, {
      props: { value: '2026-11-27T10:05:00+01:00', timeZone: 'Asia/Tokyo' },
    });

    expect(wrapper.text()).toBe('18:05');
  });

  it('shows the wall-clock time of an ISO value without a time zone', async () => {
    const { wrapper } = await mountApp(Clock, { props: { value: '2026-11-27T09:05:00' } });

    expect(wrapper.text()).toBe('09:05');
  });

  it('shows the wall-clock time an ISO value with an offset is written in when the zone is unknown', async () => {
    const { wrapper } = await mountApp(Clock, { props: { value: '2026-11-27T08:30:00+01:00' } });
    expect(wrapper.text()).toBe('08:30');

    await wrapper.setProps({ value: '2026-11-27T08:30:00Z', timeZone: 'Nowhere/Atlantis' });

    expect(wrapper.text()).toBe('08:30');
  });

  it('shows a time given as a date in the device time zone', async () => {
    const { wrapper } = await mountApp(Clock, { props: { value: new Date(2026, 10, 27, 17, 42) } });

    expect(wrapper.text()).toBe('17:42');
  });

  it('formats in the interface language and follows a change of it', async () => {
    const value = new Date(2026, 10, 27, 7, 3);
    const { wrapper } = await mountApp(Clock, { props: { value }, locale: 'sl' });
    expect(wrapper.text()).toBe(expected('sl-SI', value));

    i18n.global.locale.value = 'en';
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toBe(expected('en-GB', value));
  });

  it.each([
    ['de', 'de'],
    ['hr', 'hr'],
    ['sr-Cyrl', 'sr-Cyrl'],
    ['sr-Latn', 'sr-Latn'],
  ] as const)('formats in %s with the language tag %s', async (locale, tag) => {
    const value = new Date(2026, 10, 27, 7, 3);
    const { wrapper } = await mountApp(Clock, { props: { value }, locale });

    expect(wrapper.text()).toBe(expected(tag, value));
  });
});

describe('formatTime', () => {
  it('adds the day of the week on request, in the stop time zone or by the wall clock', () => {
    const weekday = { weekday: true };

    const inLjubljana = formatTime('en-GB', '2026-11-27T23:30:00Z', 'Europe/Ljubljana', weekday);
    expect(inLjubljana).toContain('Sat');
    expect(inLjubljana).toContain('00:30');
    const wallClock = formatTime('en-GB', '2026-11-27T23:30', null, weekday);
    expect(wallClock).toContain('Fri');
    expect(wallClock).toContain('23:30');
  });
});

describe('departureZone and arrivalZone', () => {
  it('are the time zones of the start of the first leg and of the end of the last leg', () => {
    const value = itinerary();
    value.legs[0].from = legStop('Ljubljana', '2026-11-27T09:05:00Z', { time_zone: 'Europe/Ljubljana' });
    value.legs[2].to = legStop('Trieste', '2026-11-27T10:35:00Z', { time_zone: 'Europe/Rome' });

    expect(departureZone(value)).toBe('Europe/Ljubljana');
    expect(arrivalZone(value)).toBe('Europe/Rome');
    expect(departureZone(itinerary({ legs: [] }))).toBeUndefined();
  });
});
