<template>
  <section ref="root" :aria-labelledby="headingId" class="journey-list">
    <h2 :id="headingId" class="text-h5 mb-2">{{ t('journey.title') }}</h2>

    <v-alert v-if="error && !journeys" type="warning" variant="tonal" class="mb-4">
      {{ t('journey.unavailable') }}
    </v-alert>
    <p v-else-if="!journeys" class="mb-4">{{ t('journey.loading') }}</p>

    <template v-else>
      <v-btn variant="text" prepend-icon="mdi-chevron-up" :disabled="!journeys.earlier_cursor" @click="emit('earlier')">
        {{ t('journey.earlier') }}
      </v-btn>
      <ol v-if="journeys.itineraries.length" role="list" class="journey-items">
        <li
          v-for="itinerary in journeys.itineraries"
          :key="itinerary.id"
          tabindex="-1"
          class="journey-item"
          :class="{ 'journey-item--selected': itinerary.id === selectedId }"
        >
          <p :id="summaryId(itinerary)" class="journey-summary">
            <strong class="journey-times">
              {{
                t('journey.times', {
                  departure: formatTime(itinerary.scheduled_departure),
                  arrival: formatTime(itinerary.scheduled_arrival),
                })
              }}
            </strong>
            <span>{{ duration(itinerary.duration_minutes) }}</span>
            <span>{{ t('journey.transfers', { count: itinerary.transfers }, itinerary.transfers) }}</span>
          </p>
          <p v-if="expectedText(itinerary)" class="journey-expected text-body-2">{{ expectedText(itinerary) }}</p>
          <ul class="journey-legs" role="list" :aria-label="t('journey.legsLabel')">
            <li v-for="(leg, index) in itinerary.legs" :key="index" class="journey-leg text-body-2">
              <v-icon :icon="LEG_ICONS[leg.mode]" size="small" aria-hidden="true" class="mr-1" />
              <span class="journey-leg-name">{{ legName(leg) }}</span>
              <operator-name v-if="leg.operator" :operator="leg.operator" class="journey-leg-operator" />
              <span class="journey-leg-times text-medium-emphasis">
                {{
                  t('journey.legFromTo', {
                    departure: formatTime(leg.from.scheduled),
                    from: leg.from.name,
                    arrival: formatTime(leg.to.scheduled),
                    to: leg.to.name,
                  })
                }}
              </span>
              <span v-if="leg.from.platform">{{ t('departures.platform', { platform: leg.from.platform }) }}</span>
              <span v-if="leg.delay_minutes !== null" :class="{ 'text-error font-weight-bold': leg.delay_minutes > 0 }">
                {{ delayText(leg.delay_minutes) }}
                <template v-if="leg.delay_source">
                  {{ t('departures.delaySource', { source: t(`departures.sources.${leg.delay_source}`) }) }}
                </template>
              </span>
              <a v-if="leg.ticket_url" :href="leg.ticket_url" target="_blank" rel="noopener">
                {{ t('journey.tickets') }}
              </a>
            </li>
          </ul>
          <v-btn
            size="small"
            :variant="itinerary.id === selectedId ? 'flat' : 'outlined'"
            :prepend-icon="itinerary.id === selectedId ? 'mdi-map-check' : 'mdi-map-outline'"
            :aria-pressed="itinerary.id === selectedId ? 'true' : 'false'"
            :aria-describedby="summaryId(itinerary)"
            class="mt-1"
            @click="emit('select', itinerary.id)"
          >
            {{ t('journey.showOnMap') }}
          </v-btn>
        </li>
      </ol>
      <p v-else class="my-2">{{ t('journey.empty') }}</p>
      <v-btn variant="text" prepend-icon="mdi-chevron-down" :disabled="!journeys.later_cursor" @click="emit('later')">
        {{ t('journey.later') }}
      </v-btn>
    </template>
  </section>
</template>

<script setup lang="ts">
import { nextTick, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';

import type { Itinerary, Journeys, Leg } from '../api/hopwatch-api';
import { useTimeFormat } from '../composables/use-time-format';

import OperatorName from './operator-name.vue';

defineProps<{ journeys: Journeys | null; error?: boolean; selectedId: string | null }>();
const emit = defineEmits<{ select: [id: string]; earlier: []; later: [] }>();

const LEG_ICONS: Record<Leg['mode'], string> = {
  rail: 'mdi-train',
  bus: 'mdi-bus',
  tram: 'mdi-tram',
  other: 'mdi-transit-connection-variant',
  walk: 'mdi-walk',
};

const { t } = useI18n();
const formatTime = useTimeFormat();
const headingId = `${useId()}-heading`;
const root = ref<HTMLElement | null>(null);

function summaryId(itinerary: Itinerary): string {
  return `${headingId}-${itinerary.id}`;
}

function duration(minutes: number): string {
  if (minutes < 60) return t('journey.minutes', { minutes });
  return t('journey.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

function delayText(minutes: number): string {
  if (minutes > 0) return t('departures.delay', { minutes });
  if (minutes < 0) return t('departures.early', { minutes: -minutes });
  return t('departures.onTime');
}

function legName(leg: Leg): string {
  if (leg.mode === 'walk') {
    return leg.distance_m === null
      ? t('journey.walk')
      : t('journey.walkDistance', { distance: Math.round(leg.distance_m) });
  }
  const params = { mode: t(`departures.modes.${leg.mode}`), line: leg.line ?? '', headsign: leg.headsign };
  return (leg.headsign ? t('journey.ride', params) : t('journey.rideNoHeadsign', params)).trim();
}

/** The expected departure and arrival where they differ from the timetable. */
function expectedText(itinerary: Itinerary): string {
  const parts: string[] = [];
  const { expected_departure: departure, expected_arrival: arrival } = itinerary;
  if (departure && formatTime(departure) !== formatTime(itinerary.scheduled_departure)) {
    parts.push(t('journey.expectedDeparture', { time: formatTime(departure) }));
  }
  if (arrival && formatTime(arrival) !== formatTime(itinerary.scheduled_arrival)) {
    parts.push(t('journey.expectedArrival', { time: formatTime(arrival) }));
  }
  return parts.join('. ');
}

/** Moves the focus to the first journey, e.g. after a new page has loaded. */
async function focusFirst(): Promise<void> {
  await nextTick();
  root.value?.querySelector<HTMLElement>('.journey-item')?.focus();
}

defineExpose({ focusFirst });
</script>

<style scoped>
.journey-items {
  list-style: none;
  padding: 0;
  margin: 0;
}

.journey-item {
  padding: 12px 4px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.journey-item--selected {
  border-left: 4px solid rgb(var(--v-theme-primary));
  padding-left: 8px;
}

.journey-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  font-size: 1.125rem;
}

.journey-legs {
  list-style: none;
  padding: 0;
  margin: 4px 0;
}

.journey-leg {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 12px;
}
</style>
