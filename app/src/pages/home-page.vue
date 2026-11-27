<template>
  <v-container class="home-page">
    <h1 class="text-h4 mb-4">{{ t('pages.home.title') }}</h1>

    <p v-if="locating" class="mb-4">
      <v-progress-circular indeterminate size="20" width="2" class="mr-2" aria-hidden="true" />
      {{ t('departures.locating') }}
    </p>
    <p v-else-if="locationMessage" class="mb-4">{{ locationMessage }}</p>

    <stop-search v-if="searchOpen" :autofocus="searchAutofocus" class="mb-4" @select="chooseStop" />

    <template v-if="stop">
      <div class="d-flex flex-wrap align-center ga-2 mb-2">
        <h2 ref="stopHeading" tabindex="-1" class="text-h5">{{ stop.name }}</h2>
        <v-spacer />
        <v-btn variant="outlined" prepend-icon="mdi-map-marker-radius" @click="openSearch">
          {{ t('departures.changeStop') }}
        </v-btn>
      </div>

      <v-text-field
        v-model="destination"
        :label="t('departures.destination')"
        hide-details
        prepend-inner-icon="mdi-flag-checkered"
        autocomplete="off"
        aria-describedby="destination-hint"
      />
      <p id="destination-hint" class="text-body-2 text-medium-emphasis mt-1 mb-4">
        {{ t('departures.destinationHint') }}
      </p>

      <v-alert v-if="loadError && !departureList" type="warning" variant="tonal" class="mb-4">
        {{ t('departures.unavailable') }}
      </v-alert>
      <p v-else-if="!departureList" class="mb-4">{{ t('departures.loading') }}</p>

      <template v-if="departureList">
        <departures-list
          :departures="departureList"
          :destination="appliedDestination"
          :label="t('departures.listLabel', { stop: stop.name })"
        />
        <p v-if="!departureList.length" class="mt-2">
          {{
            appliedDestination
              ? t('departures.emptyFiltered', { destination: appliedDestination, minutes: WINDOW_MINUTES })
              : t('departures.empty', { minutes: WINDOW_MINUTES })
          }}
        </p>
        <p v-if="updatedAt" class="text-body-2 text-medium-emphasis mt-2">
          {{ t('departures.updatedAt', { time: formatTime(updatedAt) }) }}
        </p>
      </template>

      <stop-map :stop="stop" class="mt-6" />
    </template>

    <p class="data-attribution text-body-2 text-medium-emphasis mt-6">
      {{ t('departures.dataAttribution') }}
      <a href="https://nap.si" target="_blank" rel="noopener">DUJPP, nap.si</a>
      · SŽ – Potniški promet ·
      <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>
    </p>

    <div aria-live="polite" aria-atomic="true" class="visually-hidden">{{ announcement }}</div>
  </v-container>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { departures as fetchDepartures, type Departure, nearbyStops, type Stop } from '../api/hopwatch-api';
import DeparturesList from '../components/departures-list.vue';
import StopMap from '../components/stop-map.vue';
import StopSearch from '../components/stop-search.vue';
import { useDebounced } from '../composables/use-debounced';
import { currentPosition } from '../composables/use-geolocation';
import { useTimeFormat } from '../composables/use-time-format';

const WINDOW_MINUTES = 60;
const REFRESH_MS = 30000;

const { t } = useI18n();
const formatTime = useTimeFormat();

const locating = ref(false);
const locationMessage = ref('');
const searchOpen = ref(false);
const searchAutofocus = ref(false);
const stop = ref<Stop | null>(null);
const stopHeading = ref<HTMLElement | null>(null);

const destination = ref<string | null>('');
const debouncedDestination = useDebounced(destination, 400);
const appliedDestination = ref('');

const departureList = ref<Departure[] | null>(null);
const loadError = ref(false);
const updatedAt = ref<Date | null>(null);
const announcement = ref('');

let sequence = 0;
let refreshTimer: ReturnType<typeof setInterval> | undefined;

async function locate() {
  locating.value = true;
  const position = await currentPosition();
  if (!position) {
    locating.value = false;
    locationMessage.value = t('departures.locationUnavailable');
    searchOpen.value = true;
    return;
  }
  try {
    let stops = await nearbyStops(position.lat, position.lon, 1000);
    if (!stops.length) stops = await nearbyStops(position.lat, position.lon, 5000);
    if (stops.length) {
      stop.value = stops[0];
    } else {
      locationMessage.value = t('departures.noNearbyStop');
      searchOpen.value = true;
    }
  } catch {
    locationMessage.value = t('departures.locationUnavailable');
    searchOpen.value = true;
  } finally {
    locating.value = false;
  }
}

function openSearch() {
  searchAutofocus.value = true;
  searchOpen.value = !searchOpen.value;
}

async function chooseStop(chosen: Stop) {
  stop.value = chosen;
  searchOpen.value = false;
  locationMessage.value = '';
  await nextTick();
  stopHeading.value?.focus();
}

function delayLabel(minutes: number): string {
  if (minutes > 0) return t('departures.delay', { minutes });
  if (minutes < 0) return t('departures.early', { minutes: -minutes });
  return t('departures.onTime');
}

/** Texts for the live region: one for each departure whose delay differs from the previous refresh. */
function delayChanges(previous: Departure[], next: Departure[]): string[] {
  const before = new Map(previous.map((departure) => [departure.trip_id, departure.delay_minutes]));
  return next
    .filter((departure) => before.has(departure.trip_id) && before.get(departure.trip_id) !== departure.delay_minutes)
    .filter((departure) => departure.delay_minutes !== null)
    .map((departure) => {
      const params = {
        mode: t(`departures.modes.${departure.mode}`),
        line: departure.line,
        headsign: departure.headsign,
        delay: delayLabel(departure.delay_minutes as number),
      };
      return departure.delay_minutes === 0
        ? t('departures.announceOnTime', params)
        : t('departures.announceDelay', params);
    });
}

async function load(isRefresh: boolean) {
  if (!stop.value) return;
  const current = ++sequence;
  const filter = (debouncedDestination.value ?? '').trim();
  try {
    const result = await fetchDepartures(stop.value.id, filter || undefined, WINDOW_MINUTES);
    if (current !== sequence) return;
    if (isRefresh && departureList.value) {
      const changes = delayChanges(departureList.value, result);
      if (changes.length) announcement.value = changes.join(' ');
    }
    departureList.value = result;
    appliedDestination.value = filter;
    loadError.value = false;
    updatedAt.value = new Date();
  } catch {
    if (current === sequence) loadError.value = true;
  }
}

watch(stop, () => {
  departureList.value = null;
  announcement.value = '';
  load(false);
});

watch(debouncedDestination, () => load(false));

onMounted(() => {
  locate();
  refreshTimer = setInterval(() => {
    if (!document.hidden) load(true);
  }, REFRESH_MS);
});

onBeforeUnmount(() => clearInterval(refreshTimer));
</script>

<style scoped>
.home-page {
  max-width: 760px;
}
</style>
