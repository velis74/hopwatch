import { describe, expect, it } from 'vitest';
import { defineComponent, h, type PropType } from 'vue';

import type { TransportMode } from '../api/hopwatch-api';
import type { SupportedLocale } from '../i18n';
import { mountApp } from '../test-utils';

import { useModeNames } from './use-mode-names';

const ModeNames = defineComponent({
  props: { modes: { type: Array as PropType<TransportMode[]>, required: true } },
  setup(props) {
    const names = useModeNames();
    return () => h('p', names(props.modes));
  },
});

describe('useModeNames', () => {
  it.each([
    ['en', 'Train and Bus'],
    ['sl', 'Vlak in Avtobus'],
    ['de', 'Zug und Bus'],
    ['hr', 'Vlak i Autobus'],
    ['sr-Cyrl', 'Воз и Аутобус'],
    ['sr-Latn', 'Voz i Autobus'],
  ] as [SupportedLocale, string][])('names modes as one phrase in %s', async (locale, text) => {
    const { wrapper } = await mountApp(ModeNames, { props: { modes: ['rail', 'bus'] }, locale });

    expect(wrapper.text()).toBe(text);
  });

  it('names no modes as an empty phrase', async () => {
    const { wrapper } = await mountApp(ModeNames, { props: { modes: [] } });

    expect(wrapper.text()).toBe('');
  });
});
