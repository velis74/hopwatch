<template>
  <v-container class="home-page">
    <h1 class="text-h4 mb-4">{{ t('pages.home.title') }}</h1>

    <p v-if="locating" class="mb-4">
      <v-progress-circular indeterminate size="20" width="2" class="mr-2" aria-hidden="true" />
      {{ t('departures.locating') }}
    </p>
    <div v-else-if="locationMessage" class="d-flex flex-wrap align-center ga-2 mb-4">
      <p>{{ locationMessage }}</p>
      <v-btn v-if="locationRetry" variant="outlined" prepend-icon="mdi-crosshairs-gps" @click="locate">
        {{ t('departures.locateAgain') }}
      </v-btn>
    </div>

    <journey-form v-model:from="from" v-model:to="to" v-model:time-mode="timeMode" v-model:time="time" class="mb-4" />

    <template v-if="from && !to">
      <nearby-stops v-model="nearbySelected" :stop="from" class="mb-4" />
      <departures-board :stop="from" :stop-ids="boardStopIds" />
    </template>
    <template v-else-if="to">
      <journey-results
        v-if="from"
        v-model:itinerary="itinerary"
        :from="from"
        :to="to"
        :time-mode="timeMode"
        :time="time"
      />
      <p v-else class="mb-4">{{ t('journey.chooseFrom') }}</p>
    </template>

    <stop-map v-if="from" :stop="from" :itinerary="to ? itinerary : null" class="mt-6" />

    <p class="data-attribution text-body-2 text-medium-emphasis mt-6">
      {{ t('departures.dataAttribution') }}
      <a href="https://nap.si" target="_blank" rel="noopener">DUJPP, nap.si</a>
      · SŽ – Potniški promet ·
      <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>
    </p>
  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { type Itinerary, nearbyStops as fetchNearbyStops, type Stop } from '../api/hopwatch-api';
import DeparturesBoard from '../components/departures-board.vue';
import JourneyForm, { type TimeMode } from '../components/journey-form.vue';
import JourneyResults from '../components/journey-results.vue';
import NearbyStops from '../components/nearby-stops.vue';
import StopMap from '../components/stop-map.vue';
import { currentPosition } from '../composables/use-geolocation';
import { readDeviceValue, writeDeviceValue } from '../device-storage';

const { t } = useI18n();

const locating = ref(false);
const locationMessage = ref('');
const locationRetry = ref(false);

const LAST_FROM_KEY = 'hopwatch.lastFrom';

const from = ref<Stop | null>(null);

/** The From stop last chosen on this device. */
function lastFrom(): Stop | null {
  try {
    const stop = JSON.parse(readDeviceValue(LAST_FROM_KEY) ?? 'null');
    if (!stop || typeof stop.id !== 'string' || typeof stop.name !== 'string') return null;
    return { ...stop, modes: Array.isArray(stop.modes) ? stop.modes : [] };
  } catch {
    return null;
  }
}

// The location message stays while From is the stop restored from the last visit.
let restoredFromId: string | null = null;

function useLastFrom(): void {
  if (from.value) return;
  from.value = lastFrom();
  restoredFromId = from.value?.id ?? null;
}
const to = ref<Stop | null>(null);
const timeMode = ref<TimeMode>('now');
const time = ref('');
const nearbySelected = ref<string[]>([]);
const itinerary = ref<Itinerary | null>(null);

const boardStopIds = computed(() => (from.value ? [from.value.id, ...nearbySelected.value] : []));

async function locate(): Promise<void> {
  locating.value = true;
  locationMessage.value = '';
  const result = await currentPosition();
  if ('failure' in result) {
    locating.value = false;
    locationMessage.value = t(`departures.locationFailure.${result.failure}`);
    locationRetry.value = result.failure === 'unavailable' || result.failure === 'timeout';
    useLastFrom();
    return;
  }
  locationRetry.value = false;
  const { lat, lon } = result.coords;
  try {
    let stops = await fetchNearbyStops(lat, lon, 1000);
    if (!stops.length) stops = await fetchNearbyStops(lat, lon, 5000);
    if (!stops.length) {
      locationMessage.value = t('departures.noNearbyStop');
      useLastFrom();
    } else if (!from.value) from.value = stops[0];
  } catch {
    locationMessage.value = t('departures.locationFailure.stops');
    locationRetry.value = true;
    useLastFrom();
  } finally {
    locating.value = false;
  }
}

watch(
  () => from.value?.id,
  () => {
    nearbySelected.value = [];
    if (!from.value) return;
    writeDeviceValue(
      LAST_FROM_KEY,
      JSON.stringify({ id: from.value.id, name: from.value.name, lat: from.value.lat, lon: from.value.lon, modes: from.value.modes }),
    );
    if (from.value.id !== restoredFromId) locationMessage.value = '';
    restoredFromId = null;
  },
);

watch(to, (value) => {
  if (!value) itinerary.value = null;
});

onMounted(locate);
</script>

<style scoped>
.home-page {
  max-width: 760px;
}
</style>
