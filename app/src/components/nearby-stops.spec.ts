import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';

import type { NearbyStop } from '../api/hopwatch-api';
import { usePreferencesStore } from '../stores/preferences';
import { flushPromises, HttpResponse, mockApi, mountApp } from '../test-utils';

import NearbyStops from './nearby-stops.vue';

const LJUBLJANA = { id: 'si:1', name: 'Ljubljana', lat: 46.0584, lon: 14.5127, modes: ['rail' as const] };
const KOPER = { id: 'si:2', name: 'Koper', lat: 45.548, lon: 13.7302, modes: ['rail' as const] };

const AROUND: NearbyStop[] = [
  { ...LJUBLJANA, distance_m: 21 },
  { id: 'si:3', name: 'Kolodvor', lat: 46.0575, lon: 14.5113, modes: ['bus'], distance_m: 144.4 },
  { id: 'si:4', name: 'Ljubljana AP', lat: 46.0579, lon: 14.5147, modes: ['bus', 'other'], distance_m: 162 },
  { id: 'si:5', name: 'Navje', lat: 46.0597, lon: 14.5094, modes: [], distance_m: 292 },
];

async function render(stop = LJUBLJANA, modelValue: string[] = []) {
  const { wrapper } = await mountApp(NearbyStops, {
    props: {
      stop,
      modelValue,
      'onUpdate:modelValue': (value: string[]) => wrapper.setProps({ modelValue: value }),
    },
  });
  await flushPromises();
  return wrapper;
}

function checkboxes(wrapper: Awaited<ReturnType<typeof render>>) {
  return wrapper.findAll<HTMLInputElement>('input[type="checkbox"]').map((box) => ({
    box,
    label: document.querySelector(`label[for="${box.attributes('id')}"]`)?.textContent?.trim(),
  }));
}

describe('NearbyStops', () => {
  it('lists the other stops within 300 m with their modes and distance, all unchecked', async () => {
    const requests = mockApi('get', '/stops/nearby', AROUND);
    const wrapper = await render();

    expect(Object.fromEntries(requests[0].url.searchParams)).toEqual({
      lat: '46.0584',
      lon: '14.5127',
      radius_m: '300',
    });
    expect(wrapper.get('fieldset legend').text()).toBe('Nearby stops');
    const options = checkboxes(wrapper);
    expect(options.map((option) => option.label)).toEqual([
      'Kolodvor, Bus, 144 m',
      'Ljubljana AP, Bus and Service, 162 m',
      'Navje, 292 m',
    ]);
    expect(options.map((option) => option.box.element.checked)).toEqual([false, false, false]);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('checks the stops served by a mode the user includes by default', async () => {
    setActivePinia(createPinia());
    usePreferencesStore().setNearbyModes(['other']);
    mockApi('get', '/stops/nearby', AROUND);
    const wrapper = await render();

    expect(wrapper.emitted('update:modelValue')).toEqual([[['si:4']]]);
    expect(checkboxes(wrapper).map((option) => option.box.element.checked)).toEqual([false, true, false]);
  });

  it('checks and unchecks a stop', async () => {
    mockApi('get', '/stops/nearby', AROUND);
    const wrapper = await render();

    await checkboxes(wrapper)[2].box.trigger('click');
    await checkboxes(wrapper)[0].box.trigger('click');
    expect(wrapper.props('modelValue')).toEqual(['si:5', 'si:3']);

    await checkboxes(wrapper)[2].box.trigger('click');
    expect(wrapper.props('modelValue')).toEqual(['si:3']);
  });

  it('says so when no other stop is near', async () => {
    mockApi('get', '/stops/nearby', [{ ...LJUBLJANA, distance_m: 0 }]);
    const wrapper = await render();

    expect(wrapper.get('fieldset').text()).toContain('No other stops within 300 m.');
    expect(checkboxes(wrapper)).toHaveLength(0);
  });

  it('leaves the fieldset out when the nearby stops are not available', async () => {
    mockApi('get', '/stops/nearby', () => HttpResponse.error());
    const wrapper = await render();

    expect(wrapper.find('fieldset').exists()).toBe(false);
  });

  it('loads the stops around another stop and shows only the latest answer', async () => {
    let answerFirst: () => void = () => undefined;
    mockApi('get', '/stops/nearby', async ({ request }: { request: Request }) => {
      if (new URL(request.url).searchParams.get('lat') === '46.0584') {
        await new Promise<void>((resolve) => (answerFirst = resolve));
        return HttpResponse.json(AROUND);
      }
      return HttpResponse.json([{ ...KOPER, id: 'si:9', name: 'Koper AP', modes: ['bus'], distance_m: 90 }]);
    });
    const wrapper = await render();

    await wrapper.setProps({ stop: KOPER });
    await flushPromises();
    answerFirst();
    await flushPromises();

    expect(checkboxes(wrapper).map((option) => option.label)).toEqual(['Koper AP, Bus, 90 m']);
  });
});
