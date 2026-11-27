<template>
  <section :aria-labelledby="headingId" class="journey-page">
    <v-btn variant="text" prepend-icon="mdi-arrow-left" class="mb-2 back-to-list" @click="emit('back')">
      {{ t('details.backToList') }}
    </v-btn>
    <h2 :id="headingId" tabindex="-1" class="details-heading text-h5 mb-2">{{ title }}</h2>

    <p v-if="!itinerary" class="mb-4">{{ t('journeyDetails.notAvailable') }}</p>

    <template v-else>
      <dl class="journey-totals">
        <div>
          <dt>{{ t('ride.departure') }}</dt>
          <dd>
            {{ formatTime(itinerary.scheduled_departure) }}
            <span v-if="expected(itinerary.expected_departure, itinerary.scheduled_departure)">
              {{ t('departures.expected', { time: formatTime(itinerary.expected_departure as string) }) }}
            </span>
          </dd>
        </div>
        <div>
          <dt>{{ t('ride.arrival') }}</dt>
          <dd>
            {{ formatTime(itinerary.scheduled_arrival) }}
            <span v-if="expected(itinerary.expected_arrival, itinerary.scheduled_arrival)">
              {{ t('departures.expected', { time: formatTime(itinerary.expected_arrival as string) }) }}
            </span>
          </dd>
        </div>
        <div>
          <dt>{{ t('journeyDetails.duration') }}</dt>
          <dd>{{ duration(itinerary.duration_minutes) }}</dd>
        </div>
        <div>
          <dt>{{ t('journeyDetails.transfers') }}</dt>
          <dd>{{ t('journey.transfers', { count: itinerary.transfers }, itinerary.transfers) }}</dd>
        </div>
      </dl>

      <ol role="list" class="journey-steps" :aria-label="t('journey.legsLabel')">
        <template v-for="step in steps" :key="step.key">
          <li v-if="step.kind === 'transfer'" class="journey-step journey-step--transfer">
            <v-icon icon="mdi-transit-transfer" aria-hidden="true" />
            <span>{{ t('journeyDetails.transfer', { stop: step.stop, minutes: step.minutes }) }}</span>
          </li>
          <li v-else-if="step.leg.mode === 'walk'" class="journey-step journey-step--walk">
            <v-icon icon="mdi-walk" aria-hidden="true" />
            <span>{{ walkText(step.leg) }}</span>
          </li>
          <li v-else class="journey-step journey-step--ride">
            <h3 class="text-h6 mb-1">
              <v-icon :icon="MODE_ICONS[step.leg.mode]" size="small" aria-hidden="true" class="mr-1" />
              {{ rideName(step.leg.mode, step.leg.line, step.leg.headsign) }}
            </h3>
            <journey-ride-leg :leg="step.leg" />
          </li>
        </template>
      </ol>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';

import type { Leg } from '../api/hopwatch-api';
import JourneyRideLeg from '../components/journey-ride-leg.vue';
import { itineraryRoute } from '../composables/map-route';
import { MODE_ICONS, useRideText } from '../composables/use-ride-text';
import { useTimeFormat } from '../composables/use-time-format';
import { useTripDetailsStore } from '../stores/trip-details';

type Step = { kind: 'leg'; key: string; leg: Leg } | { kind: 'transfer'; key: string; stop: string; minutes: number };

const emit = defineEmits<{ back: [] }>();

const { t } = useI18n();
const route = useRoute();
const formatTime = useTimeFormat();
const { duration, rideName, minutesBetween } = useRideText();
const details = useTripDetailsStore();
const headingId = `${useId()}-heading`;

/** The open journey; the one named in the address when there is a name. */
const itinerary = computed(() => {
  const value = details.itinerary;
  const id = route.query.id;
  return value && (typeof id !== 'string' || id === value.id) ? value : null;
});

const title = computed(() => {
  const legs = itinerary.value?.legs;
  if (!legs?.length) return t('journeyDetails.title');
  return t('journeyDetails.titleFromTo', { from: legs[0].from.name, to: legs[legs.length - 1].to.name });
});

/** The legs, with a transfer before every ride that follows another ride. */
const steps = computed<Step[]>(() => {
  const list: Step[] = [];
  let previousRide: Leg | null = null;
  (itinerary.value?.legs ?? []).forEach((leg, index) => {
    if (leg.mode !== 'walk' && previousRide) {
      list.push({
        kind: 'transfer',
        key: `transfer-${index}`,
        stop: previousRide.to.name,
        minutes: minutesBetween(previousRide.to.scheduled, leg.from.scheduled),
      });
    }
    list.push({ kind: 'leg', key: `leg-${index}`, leg });
    if (leg.mode !== 'walk') previousRide = leg;
  });
  return list;
});

function expected(value: string | null, scheduled: string): boolean {
  return value !== null && formatTime(value) !== formatTime(scheduled);
}

function walkText(leg: Leg): string {
  const minutes = minutesBetween(leg.from.scheduled, leg.to.scheduled);
  return leg.distance_m === null
    ? t('journeyDetails.walkMinutes', { minutes, to: leg.to.name })
    : t('journeyDetails.walkDistanceMinutes', { distance: Math.round(leg.distance_m), minutes, to: leg.to.name });
}

watch(itinerary, (value) => details.setMapRoute(value ? itineraryRoute(value) : null), { immediate: true });

onBeforeUnmount(() => details.setMapRoute(null));
</script>

<style scoped>
.journey-totals {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8em, 1fr));
  gap: 8px 16px;
  margin: 0 0 16px;
}

.journey-totals dt {
  font-weight: 500;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.journey-totals dd {
  margin: 0;
  font-size: 1.125rem;
}

.journey-steps {
  list-style: none;
  padding: 0;
  margin: 0;
}

.journey-step {
  padding: 12px 0;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.journey-step--transfer,
.journey-step--walk {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
