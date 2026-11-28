<template>
  <v-container class="home-page" :class="{ 'home-page--wide': wide }">
    <h1 ref="pageHeading" tabindex="-1" class="text-h4 mb-4" :class="{ 'visually-hidden': !showFilter }">
      {{ t('pages.home.title') }}
    </h1>

    <template v-if="showFilter">
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
    </template>

    <journey-form
      v-show="showFilter"
      v-model:from="from"
      v-model:to="to"
      v-model:time-mode="timeMode"
      v-model:time="time"
      :submit-label="wide ? undefined : submitLabel"
      class="mb-4"
      @submit="showList"
    />

    <div v-if="step === 'list' && !wide" class="search-summary mb-4">
      <p class="search-summary-text">{{ summary }}</p>
      <v-btn variant="outlined" prepend-icon="mdi-pencil" @click="showFilterStep">{{ t('home.change') }}</v-btn>
    </div>

    <div class="home-columns">
      <div ref="listColumn" class="home-list-column">
        <div v-show="step !== 'details'">
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
        </div>
        <div ref="detailsContainer">
          <router-view v-slot="{ Component }">
            <component :is="Component" @back="backToList" />
          </router-view>
        </div>
      </div>

      <div v-if="from || details.mapRoute" class="home-map-column">
        <stop-map :stop="from" :itinerary="to ? itinerary : null" :route="details.mapRoute" class="home-map" />
      </div>
    </div>

    <div aria-live="polite" aria-atomic="true" class="visually-hidden">
      {{ viewAnnouncement }}
    </div>

    <p class="data-attribution text-body-2 mt-6">
      <router-link to="/about">{{ t('about.sourcesHeading') }}</router-link>
    </p>
  </v-container>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { type RouteLocationRaw, useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';

import { type Itinerary, nearbyStops as fetchNearbyStops, type Stop } from '../api/hopwatch-api';
import DeparturesBoard from '../components/departures-board.vue';
import JourneyForm, { type TimeMode } from '../components/journey-form.vue';
import JourneyResults from '../components/journey-results.vue';
import NearbyStops from '../components/nearby-stops.vue';
import StopMap from '../components/stop-map.vue';
import { currentPosition } from '../composables/use-geolocation';
import { formatTime } from '../composables/use-time-format';
import { readDeviceValue, writeDeviceValue } from '../device-storage';
import { LOCALE_TAGS, type SupportedLocale } from '../i18n';
import { useTripDetailsStore } from '../stores/trip-details';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const display = useDisplay();
const details = useTripDetailsStore();

/** Wide screens show the form, the list (or the details) and the map at once. */
const wide = computed(() => display.mdAndUp.value);

/**
 * The view on narrow screens: the form, the list with the form collapsed to a summary, or the details. Wide screens
 * show the form in every view and the details in place of the list.
 */
const step = computed<'filter' | 'list' | 'details'>(() => {
  if (route.name === 'ride' || route.name === 'journey') return 'details';
  return route.query.view === 'list' && from.value ? 'list' : 'filter';
});
const showFilter = computed(() => wide.value || step.value === 'filter');

const pageHeading = ref<HTMLElement | null>(null);
const listColumn = ref<HTMLElement | null>(null);
const detailsContainer = ref<HTMLElement | null>(null);
const viewAnnouncement = ref('');

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
      JSON.stringify({
        id: from.value.id,
        name: from.value.name,
        lat: from.value.lat,
        lon: from.value.lon,
        modes: from.value.modes,
      }),
    );
    if (from.value.id !== restoredFromId) locationMessage.value = '';
    restoredFromId = null;
  },
);

watch(to, (value) => {
  if (!value) itinerary.value = null;
});

const LIST_LOCATION: RouteLocationRaw = {
  name: 'home',
  query: { view: 'list' },
};
const FILTER_LOCATION: RouteLocationRaw = { name: 'home' };

/** The location each location this page pushed was pushed from, for histories that do not keep it. */
const pushedFrom = new Map<string, string>();

function push(location: RouteLocationRaw): void {
  const target = router.resolve(location).fullPath;
  if (target === route.fullPath) return;
  pushedFrom.set(target, route.fullPath);
  void router.push(location);
}

/** The location the current one was opened from, when it is in this tab's history. */
function previousLocation(): string | null {
  const back = router.options.history.state.back;
  return typeof back === 'string' ? back : (pushedFrom.get(route.fullPath) ?? null);
}

/**
 * Goes back in the history when the current view was opened from `location` (or, with `anyHomeView`, from any view of
 * this page), else replaces the view with `location`.
 */
function returnTo(location: RouteLocationRaw, anyHomeView = false): void {
  const target = router.resolve(location).fullPath;
  const previous = previousLocation();
  const isHomeView = previous !== null && anyHomeView && router.resolve(previous).name === 'home';
  if (previous === target || isHomeView) router.back();
  else void router.replace(location);
}

function showList(): void {
  if (!from.value) return;
  push(LIST_LOCATION);
}

function showFilterStep(): void {
  returnTo(FILTER_LOCATION);
}

function backToList(): void {
  returnTo(wide.value ? FILTER_LOCATION : LIST_LOCATION, true);
}

const whenText = computed(() => {
  if (timeMode.value === 'now' || !time.value) return t('home.whenNow');
  const formatted = formatTime(LOCALE_TAGS[locale.value as SupportedLocale], time.value, null, { weekday: true });
  return t(timeMode.value === 'arrive' ? 'home.whenArrive' : 'home.whenDepart', { time: formatted });
});

const summary = computed(() => {
  if (!from.value) return '';
  if (!to.value) return t('home.summaryDepartures', { from: from.value.name });
  return t('home.summaryJourney', {
    from: from.value.name,
    to: to.value.name,
    when: whenText.value,
  });
});

const submitLabel = computed(() => t(to.value ? 'home.showJourneys' : 'home.showDepartures'));

/** Pushed into an announcement so that the same text is read again. */
function announce(text: string): void {
  viewAnnouncement.value = '';
  void nextTick(() => {
    viewAnnouncement.value = text;
  });
}

/** Moves focus to the heading of the view that is now shown and announces the view. */
async function focusView(): Promise<void> {
  await nextTick();
  let heading: HTMLElement | null | undefined;
  if (step.value === 'details') {
    // The details page loads lazily; it is there after the router has rendered it.
    for (let attempt = 0; attempt < 20 && !heading; attempt += 1) {
      heading = detailsContainer.value?.querySelector<HTMLElement>('h2');
      if (!heading) await new Promise((resolve) => setTimeout(resolve, 25));
    }
  } else if (step.value === 'list' || wide.value) {
    heading = listColumn.value?.querySelector<HTMLElement>('h2');
  }
  heading ??= pageHeading.value;
  if (!heading) return;
  heading.focus();
  headingObserver?.disconnect();
  headingObserver = null;
  if (step.value === 'details') {
    const detailsHeading = heading;
    announce(headingText(detailsHeading));
    // The heading names the ride once it has loaded; the new name is announced.
    headingObserver = new MutationObserver(() => announce(headingText(detailsHeading)));
    headingObserver.observe(detailsHeading, {
      characterData: true,
      childList: true,
      subtree: true,
    });
  } else {
    // Wide screens show the form with every view; the form's view announces the list beside it.
    const view = wide.value ? 'list' : step.value;
    announce(t(`home.views.${view}`, { heading: headingText(heading) }));
  }
}

let headingObserver: MutationObserver | null = null;

function headingText(heading: HTMLElement): string {
  return heading.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
}

watch(step, () => void focusView());
onBeforeUnmount(() => headingObserver?.disconnect());

// A changed search closes the details shown beside it; From filled in automatically (location, last visit) does not.
watch([() => from.value?.id, () => to.value?.id, timeMode, time], (next, previous) => {
  const filledFrom = previous[0] === undefined && next.slice(1).every((value, index) => value === previous[index + 1]);
  if (step.value === 'details' && !filledFrom) void router.replace(FILTER_LOCATION);
});

onMounted(() => {
  void locate();
  // Details opened directly (a link, a reload) get focus like details opened from the list.
  if (step.value === 'details') void focusView();
});
</script>

<style scoped>
.home-page {
  max-width: 760px;
}

.home-page--wide {
  max-width: 1400px;
}

/* A link alone on its line is a touch target of at least 24px (WCAG 2.5.8). */
.data-attribution a {
  display: inline-block;
  padding-block: 4px;
}

.search-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.search-summary-text {
  font-size: 1.125rem;
  font-weight: 500;
}

.home-columns {
  display: grid;
  gap: 24px;
}

.home-map :deep(.stop-map-canvas) {
  height: 260px;
}

/* Wide: a departures table fills the list column below the app bar and scrolls its rows inside itself. */
.home-page--wide .home-list-column > :first-child:has(> .departures-board > .departures-list) {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - var(--v-layout-top, 64px));
  overflow-y: auto;
}

.home-page--wide .home-list-column > :first-child:has(> .departures-board > .departures-list) > * {
  flex: none;
}

.home-page--wide .home-list-column > :first-child > .departures-board:has(> .departures-list) {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-height: 0;
}

.home-page--wide .home-list-column > :first-child > .departures-board:has(> .departures-list) > :deep(*) {
  flex: none;
}

.home-page--wide .home-list-column > :first-child > .departures-board > :deep(.departures-list) {
  flex: 1 1 0;
  min-height: 15em;
}

/* Narrow: a departures table is as high as its rows, at most the viewport below the app bar. */
.home-page:not(.home-page--wide) .home-list-column > :first-child > .departures-board > :deep(.departures-list) {
  height: min(var(--departures-list-content-height), calc(100dvh - var(--v-layout-top, 64px)));
  min-height: 15em;
}

/* The journeys fill the viewport below the app bar; their table scrolls its rows inside itself. */
.home-list-column > :first-child > .journey-results {
  height: calc(100dvh - var(--v-layout-top, 64px));
}

.home-page--wide .home-columns {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
}

/* The map stays in view beside the list, as high as the viewport below the app bar. */
.home-page--wide .home-map-column {
  position: sticky;
  top: var(--v-layout-top, 64px);
  height: calc(100dvh - var(--v-layout-top, 64px));
}

.home-page--wide .home-map {
  height: 100%;
}

.home-page--wide .home-map :deep(.stop-map-canvas) {
  height: auto;
}
</style>
