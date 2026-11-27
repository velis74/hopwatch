import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';

import i18n from '../i18n';
import { mountApp } from '../test-utils';

import { useTimeFormat } from './use-time-format';

const Clock = defineComponent({
  props: { value: { type: [String, Date], required: true } },
  setup(props) {
    const format = useTimeFormat();
    return () => h('time', format(props.value));
  },
});

function expected(tag: string, value: Date): string {
  return new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit' }).format(value);
}

describe('useTimeFormat', () => {
  it('shows an ISO time as hours and minutes', async () => {
    const { wrapper } = await mountApp(Clock, { props: { value: '2026-11-27T09:05:00' } });

    expect(wrapper.text()).toBe('09:05');
  });

  it('shows a time given as a date', async () => {
    const { wrapper } = await mountApp(Clock, { props: { value: new Date(2026, 10, 27, 17, 42) } });

    expect(wrapper.text()).toBe('17:42');
  });

  it('shows the time of an ISO value with an offset in local time', async () => {
    const value = '2026-11-27T08:30:00Z';
    const { wrapper } = await mountApp(Clock, { props: { value } });

    expect(wrapper.text()).toBe(expected('en-GB', new Date(value)));
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
