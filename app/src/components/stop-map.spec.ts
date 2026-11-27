import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, onMounted, ref } from 'vue';

import type { Itinerary, Leg } from '../api/hopwatch-api';
import { usePreferencesStore } from '../stores/preferences';
import { flushPromises, maplibreFake, mountApp } from '../test-utils';

import StopMap from './stop-map.vue';

vi.mock('maplibre-gl', async () => (await import('../test-utils')).maplibreFake.module);

const LJUBLJANA = { id: 'si:1', name: 'Ljubljana', lat: 46.0569, lon: 14.5058, modes: [] };
const KOPER = { id: 'si:2', name: 'Koper', lat: 45.548, lon: 13.7302, modes: [] };

function legStop(name: string, lat: number, lon: number) {
  return { id: name, name, lat, lon, scheduled: '2026-11-27T10:00:00Z', expected: null, platform: null };
}

function leg(overrides: Partial<Leg> = {}): Leg {
  return {
    mode: 'rail',
    line: 'IC 502',
    headsign: 'Koper',
    trip_id: 't1',
    from: legStop('Ljubljana', 46.0569, 14.5058),
    to: legStop('Divača', 45.68, 13.97),
    delay_minutes: null,
    delay_source: null,
    intermediate_stops: [],
    geometry: [
      [46.0569, 14.5058],
      [45.9, 14.2],
      [45.68, 13.97],
    ],
    distance_m: null,
    ticket_url: null,
    ...overrides,
  };
}

const ITINERARY: Itinerary = {
  id: 'i1',
  scheduled_departure: '2026-11-27T10:00:00Z',
  expected_departure: null,
  scheduled_arrival: '2026-11-27T11:30:00Z',
  expected_arrival: null,
  duration_minutes: 90,
  transfers: 0,
  legs: [
    leg(),
    leg({
      mode: 'walk',
      line: null,
      headsign: null,
      trip_id: null,
      from: legStop('Divača', 45.68, 13.97),
      to: legStop('Koper', 45.548, 13.7302),
      geometry: [],
      distance_m: 300,
    }),
  ],
};

type Feature = { properties: { mode: string; walk: boolean }; geometry: { coordinates: number[][] } };

function journeyFeatures(): Feature[] {
  return (maplibreFake.maps[0].getSource('journey')!.data as { features: Feature[] }).features;
}

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

  it('draws the legs of an itinerary as lines coloured by mode, walks dashed, with markers at both ends', async () => {
    const { wrapper } = await render();

    await wrapper.setProps({ itinerary: ITINERARY });

    const [map] = maplibreFake.maps;
    expect(journeyFeatures().map((feature) => feature.properties)).toEqual([
      { mode: 'rail', walk: false },
      { mode: 'walk', walk: true },
    ]);
    expect(journeyFeatures()[0].geometry.coordinates).toEqual([
      [14.5058, 46.0569],
      [14.2, 45.9],
      [13.97, 45.68],
    ]);
    // A leg without a path is drawn straight from its start to its end.
    expect(journeyFeatures()[1].geometry.coordinates).toEqual([
      [13.97, 45.68],
      [13.7302, 45.548],
    ]);
    const ride = map.layers.find((layer) => layer.id === 'journey-ride')!;
    const walk = map.layers.find((layer) => layer.id === 'journey-walk')!;
    expect(ride.paint['line-color']).toEqual(expect.arrayContaining(['rail', 'bus', 'tram']));
    expect(ride.paint['line-dasharray']).toBeUndefined();
    expect(walk.paint['line-dasharray']).toBeTruthy();
    expect(maplibreFake.markers.map((marker) => marker.lngLat)).toEqual([
      [14.5058, 46.0569],
      [13.7302, 45.548],
    ]);
    expect(maplibreFake.markers.every((marker) => marker.options.element?.getAttribute('aria-hidden') === 'true')).toBe(
      true,
    );
    expect(map.fits.at(-1)).toEqual({
      bounds: [
        [13.7302, 45.548],
        [14.5058, 46.0569],
      ],
      options: { padding: 40, animate: true },
    });
    expect(wrapper.text()).toBe('Map of the selected journey. The list of journeys is the text version of this map.');
  });

  it('fits the itinerary without animation with reduced motion', async () => {
    reducedMotion(true);
    const { wrapper } = await render();

    await wrapper.setProps({ itinerary: ITINERARY });

    expect(maplibreFake.maps[0].fits.at(-1)?.options.animate).toBe(false);
  });

  it('shows an itinerary given before the map loaded, once its style has loaded', async () => {
    maplibreFake.styleLoading = true;
    await mountApp(StopMap, { props: { stop: null, itinerary: ITINERARY } });
    await flushPromises();
    const [map] = maplibreFake.maps;
    expect(map.options.center).toEqual([14.5058, 46.0569]);
    expect(map.getSource('journey')).toBeUndefined();

    map.loadStyle();

    expect(journeyFeatures()).toHaveLength(2);
    expect(maplibreFake.markers).toHaveLength(2);
  });

  it('draws another itinerary while map tiles are still loading', async () => {
    const { wrapper } = await render();
    await wrapper.setProps({ itinerary: ITINERARY });
    const [map] = maplibreFake.maps;
    // The real map reports its style as not loaded while it fetches tiles, and fires no second `load`.
    map.styleLoaded = false;

    await wrapper.setProps({ itinerary: { ...ITINERARY, id: 'other', legs: [ITINERARY.legs[0]] } });

    expect(journeyFeatures()).toHaveLength(1);
  });

  it('keeps the view when a refresh brings the same itinerary again', async () => {
    const { wrapper } = await render();
    await wrapper.setProps({ itinerary: ITINERARY });
    const [map] = maplibreFake.maps;
    const fits = map.fits.length;

    await wrapper.setProps({ itinerary: { ...ITINERARY, legs: [ITINERARY.legs[0]] } });

    expect(map.fits).toHaveLength(fits);
    expect(journeyFeatures()).toHaveLength(1);
  });

  it('goes back to the stop and removes the journey when the itinerary is cleared', async () => {
    const { wrapper } = await render();
    await wrapper.setProps({ itinerary: ITINERARY });

    await wrapper.setProps({ itinerary: null });

    expect(journeyFeatures()).toEqual([]);
    expect(maplibreFake.markers[1].map).toBeNull();
    expect(maplibreFake.markers[0].lngLat).toEqual([14.5058, 46.0569]);
    expect(maplibreFake.maps[0].moves.at(-1)).toEqual({ kind: 'easeTo', center: [14.5058, 46.0569], zoom: 15 });
    expect(wrapper.text()).toContain('Map of the stop Ljubljana.');
  });

  it('has no text without a stop or an itinerary', async () => {
    const { wrapper } = await mountApp(StopMap, { props: { stop: null } });
    await flushPromises();

    await wrapper.setProps({ itinerary: null });

    expect(wrapper.text()).toBe('');
    expect(maplibreFake.maps[0].moves).toEqual([]);
  });
});
