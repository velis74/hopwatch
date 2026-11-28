<template>
  <section ref="root" :aria-labelledby="headingId" class="journey-list">
    <h2 :id="headingId" tabindex="-1" class="text-h5 mb-2">{{ t('journey.title') }}</h2>

    <v-alert v-if="error && !journeys" type="warning" variant="tonal" class="mb-4">
      {{ t('journey.unavailable') }}
    </v-alert>
    <p v-else-if="!journeys" class="mb-4">{{ t('journey.loading') }}</p>

    <template v-else>
      <v-btn variant="text" prepend-icon="mdi-chevron-up" :disabled="!journeys.earlier_cursor" @click="emit('earlier')">
        {{ t('journey.earlier') }}
      </v-btn>
      <df-grid
        v-if="records.length"
        :columns="columns"
        :records="records"
        key-field="id"
        selection-mode="non-select"
        :recently-added="recentlyAdded"
        :estimated-row-height="200"
        :aria-labelledby="headingId"
        class="journey-grid"
      >
        <template #item="{ item, index, cellAttrs }">
          <div
            class="df-grid card journey-card"
            role="none"
            :class="rowClasses(item as Itinerary, index)"
            :data-pk="item.id"
            :data-idx="index"
          />
          <div v-bind="cellAttrs" class="df-grid cell journey journey-cell" tabindex="-1">
            <p :id="summaryId(item as Itinerary)" class="journey-summary">
              <strong class="journey-times">
                {{
                  t('journey.times', {
                    departure: formatTime(item.scheduled_departure),
                    arrival: formatTime(item.scheduled_arrival),
                  })
                }}
              </strong>
              <span>{{ duration(item.duration_minutes) }}</span>
              <span>{{ t('journey.transfers', { count: item.transfers }, item.transfers) }}</span>
            </p>
            <p v-if="expectedText(item as Itinerary)" class="journey-expected text-body-2">
              {{ expectedText(item as Itinerary) }}
            </p>
          </div>
          <div v-bind="cellAttrs" class="df-grid cell route journey-cell">
            <ul class="journey-legs" role="list" :aria-label="t('journey.legsLabel')">
              <li v-for="(leg, legIndex) in (item as Itinerary).legs" :key="legIndex" class="journey-leg text-body-2">
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
                <span
                  v-if="leg.delay_minutes !== null"
                  :class="{ 'text-error font-weight-bold': leg.delay_minutes > 0 }"
                >
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
          </div>
          <div v-bind="cellAttrs" class="df-grid cell actions journey-cell">
            <v-btn
              size="small"
              :variant="item.id === selectedId ? 'flat' : 'outlined'"
              :prepend-icon="item.id === selectedId ? 'mdi-map-check' : 'mdi-map-outline'"
              :aria-pressed="item.id === selectedId ? 'true' : 'false'"
              :aria-describedby="summaryId(item as Itinerary)"
              @click="emit('select', item.id)"
            >
              {{ t('journey.showOnMap') }}
            </v-btn>
            <v-btn
              size="small"
              variant="tonal"
              color="primary"
              append-icon="mdi-chevron-right"
              :aria-describedby="summaryId(item as Itinerary)"
              class="ml-2 journey-details-button"
              @click="emit('details', item.id)"
            >
              {{ t('journey.details') }}
            </v-btn>
          </div>
        </template>
      </df-grid>
      <p v-else class="my-2">{{ t('journey.empty') }}</p>
      <v-btn variant="text" prepend-icon="mdi-chevron-down" :disabled="!journeys.later_cursor" @click="emit('later')">
        {{ t('journey.later') }}
      </v-btn>
    </template>
  </section>
</template>

<script setup lang="ts">
import {
  createColumn,
  type ResponsiveColumnDefinitions,
  type RowValue,
  useRecentlyAdded,
} from '@dynamicforms/vue-grid';
import { nextTick, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import type { Itinerary, Journeys, Leg } from '../api/hopwatch-api';
import { useTimeFormat } from '../composables/use-time-format';

import OperatorName from './operator-name.vue';

const props = defineProps<{ journeys: Journeys | null; error?: boolean; selectedId: string | null }>();
const emit = defineEmits<{ select: [id: string]; details: [id: string]; earlier: []; later: [] }>();

const LEG_ICONS: Record<Leg['mode'], string> = {
  rail: 'mdi-train',
  bus: 'mdi-bus',
  tram: 'mdi-tram',
  other: 'mdi-transit-connection-variant',
  walk: 'mdi-walk',
};

/** How long a new or changed journey keeps its highlight, in ms. */
const HIGHLIGHT_MS = 1500;

const { t } = useI18n();
const formatTime = useTimeFormat();
const headingId = `${useId()}-heading`;
const root = ref<HTMLElement | null>(null);

/** One record per itinerary; the cells stack in three grid rows (see the styles). */
const columns: ResponsiveColumnDefinitions = [
  {
    name: 'stacked',
    cssClass: 'journey-grid-stacked',
    rows: 3,
    columns: [
      createColumn('journey', () => t('journey.columns.journey'), 'plain', { sortable: false }),
      createColumn('route', () => t('journey.legsLabel'), 'plain', { sortable: false }),
      createColumn('actions', () => t('journey.columns.actions'), 'plain', { sortable: false }),
    ],
  },
];

const records = ref<RowValue[]>([]);
const recentlyAdded = useRecentlyAdded(records, 'id');

/** Highlights the journeys a refresh of the same page added or changed; a new page or query highlights nothing. */
watch(
  () => props.journeys,
  (current, previous) => {
    const itineraries = current?.itineraries ?? [];
    records.value = itineraries;
    if (!previous) return;
    const before = new Map(previous.itineraries.map((entry) => [entry.id, JSON.stringify(entry)]));
    if (!itineraries.some((entry) => before.has(entry.id))) return;
    const added = itineraries.filter((entry) => !before.has(entry.id)).map((entry) => entry.id);
    const changed = itineraries
      .filter((entry) => before.has(entry.id) && before.get(entry.id) !== JSON.stringify(entry))
      .map((entry) => entry.id);
    if (added.length) recentlyAdded.addRecentlyAdded(added, HIGHLIGHT_MS);
    if (changed.length) recentlyAdded.addRecentlyUpdated(changed, HIGHLIGHT_MS);
  },
  { immediate: true },
);

/** The classes of a row anchor: the ones the grid sets on its own rows, and the selected state. */
function rowClasses(itinerary: Itinerary, index: number): Record<string, boolean> {
  return {
    'journey-grid-stacked': true,
    even: index % 2 === 0,
    odd: index % 2 === 1,
    'state-adding': recentlyAdded.isPendingAdd(itinerary.id),
    'state-updated': recentlyAdded.isPendingUpdate(itinerary.id),
    'journey-card--selected': itinerary.id === props.selectedId,
  };
}

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

/** Moves the focus to the first journey's summary cell, e.g. after a new page has loaded. */
async function focusFirst(): Promise<void> {
  await nextTick();
  root.value?.querySelector<HTMLElement>('.journey-cell.journey')?.focus();
}

defineExpose({ focusFirst });
</script>

<style scoped>
.journey-grid {
  height: min(36rem, 70dvh);
}

/* The column headers name the cells for assistive technology; the list shows no header row. */
.journey-grid :deep(.df-grid.header-container) {
  position: absolute !important;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.journey-grid :deep(.df-record-grid) {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}

.journey-grid :deep(.df-grid.cell.route) {
  grid-row: calc(var(--row-base) + 2);
}

.journey-grid :deep(.df-grid.cell.actions) {
  grid-row: calc(var(--row-base) + 3);
}

.journey-grid :deep(.df-anchored .journey-cell) {
  padding: 0 4px;
}

.journey-grid :deep(.df-anchored .journey-cell.journey) {
  padding-top: 12px;
}

.journey-grid :deep(.df-anchored .journey-cell.actions) {
  padding-top: 4px;
  padding-bottom: 12px;
}

.journey-card {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.journey-card--selected {
  border-left: 4px solid rgb(var(--v-theme-primary));
}

.journey-card--selected ~ .journey-cell {
  padding-left: 12px;
}

@keyframes journey-card-flash {
  0%,
  100% {
    background-color: transparent;
  }

  30% {
    background-color: rgba(var(--v-theme-primary), 0.16);
  }
}

.journey-card.state-adding,
.journey-card.state-updated {
  animation: journey-card-flash 1.5s ease-in-out;
}

@media (prefers-reduced-motion: reduce) {
  .journey-card.state-adding,
  .journey-card.state-updated {
    animation: none;
    background-color: rgba(var(--v-theme-primary), 0.08);
  }
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
