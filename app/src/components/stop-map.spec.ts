import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, onMounted, ref } from 'vue';

import { usePreferencesStore } from '../stores/preferences';
import { flushPromises, maplibreFake, mountApp } from '../test-utils';

import StopMap from './stop-map.vue';

vi.mock('maplibre-gl', async () => (await import('../test-utils')).maplibreFake.module);

const LJUBLJANA = { id: 'si:1', name: 'Ljubljana', lat: 46.0569, lon: 14.5058 };
const KOPER = { id: 'si:2', name: 'Koper', lat: 45.548, lon: 13.7302 };

function reducedMotion(reduce: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) => ({ matches: reduce && query.includes('reduce'), media: query }) as MediaQueryList,
  );
}

async function render(stop = LJUBLJANA) {
  const mounted = await mountApp(StopMap, { props: { stop } });
  await flushPromises();
  return mounted;
}

describe('StopMap', () => {
  it('is a map region with a text equivalent naming the stop', async () => {
    const { wrapper } = await render();

    const region = wrapper.get('section');
    expect(region.attributes('aria-label')).toBe('Map');
    expect(region.text()).toBe('Map of the stop Ljubljana. The list of departures is the text version of this map.');
  });

  it('shows the stop at the centre with a marker, attributing OpenStreetMap', async () => {
    const { wrapper } = await render();

    const [map] = maplibreFake.maps;
    expect(map.options).toMatchObject({
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [14.5058, 46.0569],
      zoom: 15,
      keyboard: false,
    });
    expect(map.options.container).toBe(wrapper.get('.stop-map-canvas').element);
    expect(String((map.options.attributionControl as { customAttribution: string }).customAttribution)).toContain(
      'OpenStreetMap',
    );
    const [marker] = maplibreFake.markers;
    expect(marker.lngLat).toEqual([14.5058, 46.0569]);
    expect(marker.map).toBe(map);
    expect(marker.options.element?.getAttribute('aria-hidden')).toBe('true');
    expect(wrapper.find('.stop-map-marker').exists()).toBe(true);
    expect(maplibreFake.workerUrl).toBeTruthy();
  });

  it('hides the map picture from assistive technology and from the tab order', async () => {
    const { wrapper } = await render();

    const canvas = wrapper.get('canvas');
    expect(canvas.attributes('role')).toBeUndefined();
    expect(canvas.attributes('aria-label')).toBeUndefined();
    expect(canvas.attributes('aria-hidden')).toBe('true');
    expect(canvas.attributes('tabindex')).toBe('-1');
    expect(wrapper.findAll('[role="region"]')).toHaveLength(0);
  });

  it('fades tiles in the lively experience', async () => {
    await render();

    expect(maplibreFake.maps[0].options.fadeDuration).toBe(300);
  });

  it('does not fade tiles in the simple experience', async () => {
    // The choice is kept on the device, so the next page load starts with it.
    setActivePinia(createPinia());
    usePreferencesStore().setExperience('simple');
    await render();

    expect(maplibreFake.maps[0].options.fadeDuration).toBe(0);
  });

  it('does not fade tiles when the device asks for reduced motion', async () => {
    reducedMotion(true);
    await render();

    expect(maplibreFake.maps[0].options.fadeDuration).toBe(0);
  });

  it('glides to another stop in the lively experience', async () => {
    const { wrapper } = await render();

    await wrapper.setProps({ stop: KOPER });

    const [map] = maplibreFake.maps;
    expect(map.moves).toEqual([{ kind: 'easeTo', center: [13.7302, 45.548], zoom: 15 }]);
    expect(maplibreFake.markers[0].lngLat).toEqual([13.7302, 45.548]);
    expect(wrapper.text()).toContain('Map of the stop Koper.');
  });

  it('jumps to another stop with reduced motion', async () => {
    reducedMotion(true);
    const { wrapper } = await render();

    await wrapper.setProps({ stop: KOPER });

    expect(maplibreFake.maps[0].moves).toEqual([{ kind: 'jumpTo', center: [13.7302, 45.548], zoom: 15 }]);
  });

  it('keeps only the text equivalent without WebGL', async () => {
    maplibreFake.failure = new Error('no WebGL');
    const { wrapper } = await render();

    await wrapper.setProps({ stop: KOPER });

    expect(maplibreFake.maps).toHaveLength(0);
    expect(wrapper.find('canvas').exists()).toBe(false);
    expect(wrapper.text()).toContain('Map of the stop Koper.');
  });

  it('releases the map when it leaves the page', async () => {
    const { wrapper } = await render();
    const [map] = maplibreFake.maps;

    wrapper.unmount();

    expect(map.removed).toBe(true);
  });

  it('does not create a map when it leaves the page before the map library has loaded', async () => {
    // The parent removes the map right after it is mounted, while the library is still loading.
    const Parent = defineComponent(() => {
      const shown = ref(true);
      onMounted(() => (shown.value = false));
      return () => (shown.value ? h(StopMap, { stop: LJUBLJANA }) : null);
    });
    await mountApp(Parent);
    await flushPromises();

    expect(maplibreFake.maps).toHaveLength(0);
  });
});
