<template>
  <section :aria-labelledby="headingId" class="ride-page">
    <v-btn variant="text" prepend-icon="mdi-arrow-left" class="mb-2 back-to-list" @click="emit('back')">
      {{ t('details.backToList') }}
    </v-btn>
    <h2 :id="headingId" tabindex="-1" class="details-heading text-h5 mb-2">
      <v-icon v-if="trip" :icon="MODE_ICONS[trip.mode]" size="small" aria-hidden="true" class="mr-1" />
      {{ title }}
    </h2>

    <stale-notice :updated-at="updatedAt" :now="scheduler.now.value" />

    <v-alert v-if="notFound" type="warning" variant="tonal" class="mb-4">{{ t('ride.notFound') }}</v-alert>
    <v-alert v-else-if="error && !trip" type="warning" variant="tonal" class="mb-4">
      {{ t('ride.unavailable') }}
    </v-alert>
    <p v-else-if="!trip" class="mb-4">{{ t('ride.loading') }}</p>

    <template v-if="trip">
      <ride-section :trip="trip" :entry="entry" :exit="exit" />
      <p v-if="updatedAt" class="text-body-2 text-medium-emphasis mt-2">
        {{ t('departures.updatedAt', { time: formatTime(new Date(updatedAt)) }) }}
      </p>
    </template>

    <div aria-live="polite" aria-atomic="true" class="visually-hidden">{{ announcement }}</div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';

import type { Trip } from '../api/hopwatch-api';
import RideSection from '../components/ride-section.vue';
import StaleNotice from '../components/stale-notice.vue';
import { rideRoute, stopIndex } from '../composables/map-route';
import { MODE_ICONS, useRideText } from '../composables/use-ride-text';
import { useTimeFormat } from '../composables/use-time-format';
import { useTrip } from '../composables/use-trip';
import { useTripDetailsStore } from '../stores/trip-details';

const emit = defineEmits<{ back: [] }>();

const { t } = useI18n();
const route = useRoute();
const formatTime = useTimeFormat();
const { delayText, rideName } = useRideText();
const details = useTripDetailsStore();
const headingId = `${useId()}-heading`;
const announcement = ref('');

const tripId = computed(() => (typeof route.params.tripId === 'string' ? route.params.tripId : null));
const queryValue = (name: 'from' | 'to' | 'at') => (typeof route.query[name] === 'string' ? route.query[name] : null);

/** The boarding stop: `from`, at the departure time `at` when the ride calls there more than once. */
function entryOf(value: Trip): number {
  return stopIndex(value, queryValue('from'), null, 0, { time: queryValue('at') });
}

function exitOf(value: Trip, start: number): number {
  const index = stopIndex(value, queryValue('to'), null, value.stops.length - 1, { after: start });
  return index > start ? index : value.stops.length - 1;
}

/** Announces a changed delay at the entry stop. */
function announce(previous: Trip | null, next: Trip): void {
  if (!previous || previous.trip_id !== next.trip_id) return;
  const before = previous.stops[entryOf(previous)];
  const after = next.stops[entryOf(next)];
  if (!after || after.delay_minutes === null || after.delay_minutes === before?.delay_minutes) return;
  announcement.value = t('ride.announceDelay', {
    ride: rideName(next.mode, next.line, next.headsign),
    stop: after.name,
    delay: delayText(after.delay_minutes),
  });
}

const { trip, error, notFound, updatedAt, scheduler } = useTrip(tripId, announce);

const entry = computed(() => (trip.value ? entryOf(trip.value) : 0));
const exit = computed(() => (trip.value ? exitOf(trip.value, entry.value) : 0));
const title = computed(() =>
  trip.value ? rideName(trip.value.mode, trip.value.line, trip.value.headsign) : t('ride.title'),
);

watch(
  [trip, entry, exit],
  () => details.setMapRoute(trip.value ? rideRoute(trip.value, entry.value, exit.value) : null),
  {
    immediate: true,
  },
);

onBeforeUnmount(() => details.setMapRoute(null));
</script>
