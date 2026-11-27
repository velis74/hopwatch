<template>
  <section :aria-label="t('map.title')" class="stop-map">
    <p class="visually-hidden">{{ t('map.textEquivalent', { stop: stop.name }) }}</p>
    <div ref="container" class="stop-map-canvas" />
  </section>
</template>

<script setup lang="ts">
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import type { Stop } from '../api/hopwatch-api';
import { usePreferencesStore } from '../stores/preferences';

import 'maplibre-gl/dist/maplibre-gl.css';

const props = defineProps<{ stop: Stop }>();

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const OSM_ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>';

const { t } = useI18n();
const preferences = usePreferencesStore();
const container = ref<HTMLElement | null>(null);
let map: MapLibreMap | null = null;
let marker: Marker | null = null;

function animate(): boolean {
  return preferences.effectiveExperience === 'lively' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

onMounted(async () => {
  if (!container.value) return;
  try {
    const maplibre = await import('maplibre-gl');
    if (!container.value) return;
    // The bundler moves the library away from its worker file; the worker URL points at the copied file.
    maplibre.setWorkerUrl(maplibreWorkerUrl);
    map = new maplibre.Map({
      container: container.value,
      style: STYLE_URL,
      center: [props.stop.lon, props.stop.lat],
      zoom: 15,
      keyboard: false,
      fadeDuration: animate() ? 300 : 0,
      attributionControl: { compact: false, customAttribution: OSM_ATTRIBUTION },
    });
    // The section is the map's region; the canvas is a picture of what the departures list says.
    const canvas = map.getCanvas();
    canvas.removeAttribute('role');
    canvas.removeAttribute('aria-label');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('tabindex', '-1');

    const element = document.createElement('div');
    element.className = 'stop-map-marker';
    element.setAttribute('aria-hidden', 'true');
    marker = new maplibre.Marker({ element }).setLngLat([props.stop.lon, props.stop.lat]).addTo(map);
  } catch {
    // Without WebGL the map stays empty; the departures list carries the same information.
    map = null;
  }
});

watch(
  () => props.stop,
  (stop) => {
    if (!map) return;
    const center: [number, number] = [stop.lon, stop.lat];
    marker?.setLngLat(center);
    if (animate()) map.easeTo({ center, zoom: 15 });
    else map.jumpTo({ center, zoom: 15 });
  },
);

onBeforeUnmount(() => {
  map?.remove();
  map = null;
});
</script>

<style scoped>
.stop-map-canvas {
  height: 260px;
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
</style>
