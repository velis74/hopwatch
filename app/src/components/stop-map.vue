<template>
  <section :aria-label="t('map.title')" class="stop-map">
    <p class="visually-hidden">{{ textEquivalent }}</p>
    <div ref="container" class="stop-map-canvas" />
  </section>
</template>

<script setup lang="ts">
import type { FeatureCollection } from 'geojson';
import type { GeoJSONSource, LngLatBoundsLike, Map as MapLibreMap, Marker, TransformStyleFunction } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import type { Itinerary, Stop } from '../api/hopwatch-api';
import { itineraryRoute, type MapRoute } from '../composables/map-route';
import { usePreferencesStore } from '../stores/preferences';

import 'maplibre-gl/dist/maplibre-gl.css';

/** `route` (a ride or journey of the open details) takes precedence over `itinerary`, which takes it over `stop`. */
const props = defineProps<{ stop: Stop | null; itinerary?: Itinerary | null; route?: MapRoute | null }>();

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
/** The map's attribution, in place of the sources' own. */
const MAP_ATTRIBUTION =
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> · ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>';
const JOURNEY_SOURCE = 'journey';
const STOPS_SOURCE = 'route-stops';
/** Line colours by mode; the list of journeys names every mode, so colour is not the only carrier. */
const MODE_COLOURS = ['match', ['get', 'mode'], 'rail', '#1565c0', 'bus', '#2e7d32', 'tram', '#c62828', '#6a1b9a'];
const WALK_COLOUR = '#424242';

/** The style with an empty attribution on every source: a source's own attribution overrides its TileJSON's. */
const withoutSourceAttributions: TransformStyleFunction = (_previous, next) => ({
  ...next,
  sources: Object.fromEntries(Object.entries(next.sources).map(([id, source]) => [id, { ...source, attribution: '' }])),
});

const { t } = useI18n();
const preferences = usePreferencesStore();
const container = ref<HTMLElement | null>(null);
let maplibre: typeof import('maplibre-gl') | null = null;
let map: MapLibreMap | null = null;
let startMarker: Marker | null = null;
let endMarker: Marker | null = null;
/** The journey layers exist; `isStyleLoaded()` turns false again while tiles load, so it cannot tell. */
let layersAdded = false;
/** The route the view was last fitted to; a refresh of the same journey keeps the user's view. */
let fittedId: string | null = null;

const shown = computed<MapRoute | null>(
  () => props.route ?? (props.itinerary ? itineraryRoute(props.itinerary) : null),
);

const textEquivalent = computed(() => {
  if (props.route)
    return t(props.route.kind === 'ride' ? 'map.rideTextEquivalent' : 'map.journeyDetailsTextEquivalent');
  if (props.itinerary) return t('map.journeyTextEquivalent');
  return props.stop ? t('map.textEquivalent', { stop: props.stop.name }) : '';
});

function animate(): boolean {
  return preferences.effectiveExperience === 'lively' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function markerElement(kind: 'start' | 'end'): HTMLElement {
  const element = document.createElement('div');
  element.className = `stop-map-marker stop-map-marker--${kind}`;
  element.setAttribute('aria-hidden', 'true');
  if (kind === 'end') element.innerHTML = '<span class="mdi mdi-flag-checkered"></span>';
  return element;
}

/** The route's lines as GeoJSON in `[lon, lat]` order. */
function journeyFeatures(route: MapRoute | null): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: (route?.lines ?? []).map((line) => ({
      type: 'Feature',
      properties: { mode: line.mode, walk: line.mode === 'walk' },
      geometry: { type: 'LineString', coordinates: line.points.map(([lat, lon]) => [lon, lat]) },
    })),
  };
}

function stopFeatures(route: MapRoute | null): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: (route?.stops ?? []).map((stop) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
    })),
  };
}

function addJourneyLayers(target: MapLibreMap): void {
  target.addSource(JOURNEY_SOURCE, { type: 'geojson', data: journeyFeatures(shown.value) });
  target.addSource(STOPS_SOURCE, { type: 'geojson', data: stopFeatures(shown.value) });
  const layout = { 'line-cap': 'round', 'line-join': 'round' } as const;
  target.addLayer({
    id: 'journey-ride',
    type: 'line',
    source: JOURNEY_SOURCE,
    filter: ['!', ['get', 'walk']],
    layout,
    paint: { 'line-color': MODE_COLOURS as never, 'line-width': 5 },
  });
  target.addLayer({
    id: 'journey-walk',
    type: 'line',
    source: JOURNEY_SOURCE,
    filter: ['get', 'walk'],
    layout: { 'line-join': 'round' },
    paint: { 'line-color': WALK_COLOUR, 'line-width': 4, 'line-dasharray': [1, 1.5] },
  });
  target.addLayer({
    id: 'route-stops',
    type: 'circle',
    source: STOPS_SOURCE,
    paint: {
      'circle-radius': 4,
      'circle-color': '#ffffff',
      'circle-stroke-color': '#424242',
      'circle-stroke-width': 2,
    },
  });
}

function move(options: { center: [number, number]; zoom: number }): void {
  if (!map) return;
  if (animate()) map.easeTo(options);
  else map.jumpTo(options);
}

/** Shows the route when there is one, otherwise the stop. */
function show(): void {
  if (!map || !maplibre) return;
  const target = map;
  const route = shown.value;
  if (layersAdded) {
    (target.getSource(JOURNEY_SOURCE) as GeoJSONSource | undefined)?.setData(journeyFeatures(route));
    (target.getSource(STOPS_SOURCE) as GeoJSONSource | undefined)?.setData(stopFeatures(route));
  }
  if (route) {
    startMarker?.setLngLat([route.start.lon, route.start.lat]);
    endMarker ??= new maplibre.Marker({ element: markerElement('end') });
    endMarker.setLngLat([route.end.lon, route.end.lat]).addTo(target);
    if (route.id === fittedId) return;
    fittedId = route.id;
    const points = [
      [route.start.lon, route.start.lat],
      ...route.lines.flatMap((line) => line.points.map(([lat, lon]) => [lon, lat])),
      [route.end.lon, route.end.lat],
    ];
    const lons = points.map(([lon]) => lon);
    const lats = points.map(([, lat]) => lat);
    const bounds: LngLatBoundsLike = [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ];
    target.fitBounds(bounds, { padding: 40, animate: animate() });
    return;
  }
  endMarker?.remove();
  endMarker = null;
  fittedId = null;
  if (props.stop) {
    const center: [number, number] = [props.stop.lon, props.stop.lat];
    startMarker?.setLngLat(center);
    move({ center, zoom: 15 });
  }
}

onMounted(async () => {
  if (!container.value) return;
  try {
    const library = await import('maplibre-gl');
    if (!container.value) return;
    // The bundler moves the library away from its worker file; the worker URL points at the copied file.
    library.setWorkerUrl(maplibreWorkerUrl);
    const start = props.route?.start ?? props.stop ?? props.itinerary?.legs[0]?.from;
    // Ljubljana until a stop is known.
    const center: [number, number] = start ? [start.lon, start.lat] : [14.5058, 46.0569];
    const created = new library.Map({
      container: container.value,
      style: STYLE_URL,
      transformStyle: withoutSourceAttributions,
      center,
      zoom: 15,
      keyboard: false,
      fadeDuration: animate() ? 300 : 0,
      attributionControl: { compact: false, customAttribution: MAP_ATTRIBUTION },
    });
    // The section is the map's region; the canvas is a picture of what the lists say.
    const canvas = created.getCanvas();
    canvas.removeAttribute('role');
    canvas.removeAttribute('aria-label');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('tabindex', '-1');

    startMarker = new library.Marker({ element: markerElement('start') }).setLngLat(center).addTo(created);
    maplibre = library;
    map = created;
    const addLayers = () => {
      addJourneyLayers(created);
      layersAdded = true;
    };
    if (created.isStyleLoaded()) addLayers();
    else created.once('load', addLayers);
    if (shown.value) show();
  } catch {
    // Without WebGL the map stays empty; the lists carry the same information.
    map = null;
  }
});

watch(() => [props.stop, shown.value], show);

onBeforeUnmount(() => {
  map?.remove();
  map = null;
});
</script>

<style scoped>
.stop-map {
  display: flex;
  flex-direction: column;
}

.stop-map-canvas {
  flex: 1 1 auto;
  min-height: 260px;
  border-radius: 8px;
  overflow: hidden;
}

:deep(.stop-map-marker) {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  border: 3px solid #ffffff;
  box-shadow: 0 0 0 2px rgb(var(--v-theme-primary));
}

:deep(.stop-map-marker--end) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: #ffffff;
  font-size: 16px;
}
</style>
