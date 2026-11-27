<template>
  <div class="journey-ride-leg">
    <stale-notice :updated-at="updatedAt" :now="scheduler.now.value" />
    <ride-section v-if="trip" :trip="trip" :entry="entry" :exit="exit" />
    <template v-else>
      <p class="journey-ride-leg-fallback">
        {{
          t('journey.legFromTo', {
            departure: formatTime(leg.from.scheduled),
            from: leg.from.name,
            arrival: formatTime(leg.to.scheduled),
            to: leg.to.name,
          })
        }}
        <template v-if="leg.from.platform">· {{ t('departures.platform', { platform: leg.from.platform }) }}</template>
      </p>
      <p v-if="error" class="text-body-2 text-medium-emphasis">
        {{ t('ride.stopsUnavailable') }}
      </p>
      <p v-else-if="leg.trip_id" class="text-body-2">{{ t('ride.loading') }}</p>
      <v-btn
        v-if="leg.ticket_url"
        :href="leg.ticket_url"
        target="_blank"
        rel="noopener"
        variant="tonal"
        color="primary"
        prepend-icon="mdi-ticket-outline"
        :aria-describedby="ticketHintId"
      >
        {{ t('ride.buyTicket') }}
      </v-btn>
      <span v-if="leg.ticket_url" :id="ticketHintId" class="visually-hidden">{{ t('ride.opensNewWindow') }}</span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef, useId } from 'vue';
import { useI18n } from 'vue-i18n';

import type { Leg, Trip } from '../api/hopwatch-api';
import { stopIndex } from '../composables/map-route';
import { useTimeFormat } from '../composables/use-time-format';
import { useTrip } from '../composables/use-trip';

import RideSection from './ride-section.vue';
import StaleNotice from './stale-notice.vue';

/** A ride leg of a journey: its stops from the ride, the leg's own data until the ride has loaded. */
const props = defineProps<{ leg: Leg }>();

const { t } = useI18n();
const ticketHintId = `${useId()}-ticket`;
const formatTime = useTimeFormat();
const { trip, error, updatedAt, scheduler } = useTrip(toRef(() => props.leg.trip_id));

function entryOf(value: Trip): number {
  return stopIndex(value, props.leg.from.id, props.leg.from.name, 0, {
    time: props.leg.from.scheduled,
  });
}

const entry = computed(() => (trip.value ? entryOf(trip.value) : 0));
const exit = computed(() => {
  if (!trip.value) return 0;
  const last = trip.value.stops.length - 1;
  const index = stopIndex(trip.value, props.leg.to.id, props.leg.to.name, last, {
    time: props.leg.to.scheduled,
    which: 'arrival',
    after: entry.value,
  });
  return index > entry.value ? index : last;
});
</script>
