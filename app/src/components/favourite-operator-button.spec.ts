import { describe, expect, it } from 'vitest';

import { usePreferencesStore } from '../stores/preferences';
import { flushPromises, mountApp } from '../test-utils';

import FavouriteOperatorButton from './favourite-operator-button.vue';

const NOMAGO = { id: '1119', name: 'Nomago d.o.o.', url: null };

describe('FavouriteOperatorButton', () => {
  it('marks the operator as favourite and removes it again', async () => {
    const { wrapper } = await mountApp(FavouriteOperatorButton, { props: { operator: NOMAGO } });
    const button = wrapper.get('button');

    expect(button.attributes('aria-label')).toBe('Favourite operator: Nomago d.o.o.');
    expect(button.attributes('aria-pressed')).toBe('false');

    await button.trigger('click');
    await flushPromises();

    expect(usePreferencesStore().favouriteOperators).toEqual(['1119']);
    expect(window.localStorage.getItem('hopwatch.favouriteOperators')).toBe('["1119"]');
    expect(button.attributes('aria-label')).toBe('Favourite operator: Nomago d.o.o.');
    expect(button.attributes('aria-pressed')).toBe('true');

    await button.trigger('click');
    await flushPromises();

    expect(usePreferencesStore().favouriteOperators).toEqual([]);
    expect(button.attributes('aria-pressed')).toBe('false');
  });

  it('names the toggle in the interface language', async () => {
    const { wrapper } = await mountApp(FavouriteOperatorButton, { props: { operator: NOMAGO }, locale: 'sl' });

    expect(wrapper.get('button').attributes('aria-label')).toBe('Priljubljen prevoznik: Nomago d.o.o.');
  });
});
