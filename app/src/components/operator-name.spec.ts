import { describe, expect, it } from 'vitest';

import { usePreferencesStore } from '../stores/preferences';
import { flushPromises, mountApp } from '../test-utils';

import OperatorName from './operator-name.vue';

const ARRIVA = { id: '1123', name: 'Arriva d.o.o.', url: 'https://arriva.si/' };

describe('OperatorName', () => {
  it('shows the operator name without a tag when it is not a favourite', async () => {
    const { wrapper } = await mountApp(OperatorName, { props: { operator: ARRIVA } });

    expect(wrapper.text()).toBe('Arriva d.o.o.');
    expect(wrapper.find('.favourite-tag').exists()).toBe(false);
  });

  it('tags a favourite operator with the word "Favourite" and a decorative star', async () => {
    const { wrapper } = await mountApp(OperatorName, { props: { operator: ARRIVA } });

    usePreferencesStore().setFavouriteOperator('1123', true);
    await flushPromises();

    const tag = wrapper.get('.favourite-tag');
    expect(tag.text()).toBe('Favourite');
    expect(tag.get('.v-icon').attributes('aria-hidden')).toBe('true');
    expect(wrapper.text()).toBe('Arriva d.o.o. Favourite');
  });

  it('tags in the interface language', async () => {
    window.localStorage.setItem('hopwatch.favouriteOperators', '["1123"]');
    const { wrapper } = await mountApp(OperatorName, { props: { operator: ARRIVA }, locale: 'sl' });

    expect(wrapper.get('.favourite-tag').text()).toBe('Priljubljen');
  });
});
