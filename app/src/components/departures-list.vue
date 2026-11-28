<template>
  <div
    v-if="departures.length"
    ref="root"
    class="departures-list"
    :class="[`departures-list--${layout}`, { 'departures-list--stops': showStop }]"
  >
    <df-grid
      :columns="columns"
      :active-columns="layout"
      :records="rows"
      key-field="key"
      :aria-label="label"
      :recently-added="recentlyAdded"
      :estimated-row-height="layout === 'wide' ? 68 : 150"
      class="departures-grid"
    >
      <template #item="{ item, index, cellAttrs }">
        <div
          class="df-grid card departure-card"
          role="none"
          :class="[
            `departures-${layout}`,
            index % 2 === 0 ? 'even' : 'odd',
            {
              'state-adding': recentlyAdded.isPendingAdd(item.key),
              'state-updated': recentlyAdded.isPendingUpdate(item.key),
            },
          ]"
          :data-pk="item.key"
          :data-idx="index"
        />
        <div v-bind="cellAttrs" class="df-grid cell time">
          <span>{{ t('departures.scheduled', { time: formatTime(item.scheduled_departure) }) }}</span>
          <span v-if="item.expected_departure && item.delay_minutes !== 0">
            {{ t('departures.expected', { time: formatTime(item.expected_departure) }) }}
          </span>
        </div>
        <div v-bind="cellAttrs" class="df-grid cell service">
          <span :id="mainId(item)" class="departure-name">
            <v-icon :icon="MODE_ICONS[item.mode as TransportMode]" aria-hidden="true" />
            <span class="departure-mode text-body-2 text-medium-emphasis">
              {{ t(`departures.modes.${item.mode}`) }}
            </span>
            <strong class="departure-line">{{ item.line }}</strong>
            <span class="departure-headsign">{{ t('departures.toHeadsign', { headsign: item.headsign }) }}</span>
          </span>
          <span v-if="item.next_stops.length" class="departure-via text-body-2 text-medium-emphasis">
            {{ t('departures.via', { stops: item.next_stops.slice(0, VIA_STOPS).join(', ') }) }}
          </span>
        </div>
        <div v-bind="cellAttrs" class="df-grid cell delay text-body-2">
          <span v-if="item.delay_minutes !== null" :class="delayClass(item.delay_minutes)">
            <v-icon
              v-if="item.delay_source"
              icon="mdi-access-point"
              size="small"
              aria-hidden="true"
              class="decorative-pulse"
            />
            {{ delayText(item.delay_minutes) }}
            <template v-if="item.delay_source">
              {{ t('departures.delaySource', { source: t(`departures.sources.${item.delay_source}`) }) }}
            </template>
          </span>
        </div>
        <div v-bind="cellAttrs" class="df-grid cell platform text-body-2">
          <span v-if="item.platform">{{ t('departures.platform', { platform: item.platform }) }}</span>
        </div>
        <div v-bind="cellAttrs" class="df-grid cell operator text-body-2">
          <span v-if="item.operator" class="departure-operator">
            <operator-name :operator="item.operator" />
            <favourite-operator-button :operator="item.operator" />
          </span>
        </div>
        <div v-if="showStop" v-bind="cellAttrs" class="df-grid cell stop departure-stop text-body-2">
          {{ t('departures.atStop', { stop: item.stop_name }) }}
        </div>
        <div v-bind="cellAttrs" class="df-grid cell actions">
          <v-btn
            :to="rideLocation(item)"
            size="small"
            variant="tonal"
            color="primary"
            append-icon="mdi-chevron-right"
            :aria-describedby="mainId(item)"
            class="departure-link"
          >
            {{ t('journey.details') }}
          </v-btn>
        </div>
      </template>
    </df-grid>
  </div>
</template>

<script setup lang="ts">
import {
  createColumn,
  type ResponsiveColumnDefinitions,
  type RowValue,
  useRecentlyAdded,
} from '@dynamicforms/vue-grid';
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { RouteLocationRaw } from 'vue-router';

import type { Departure, TransportMode } from '../api/hopwatch-api';
import { useTimeFormat } from '../composables/use-time-format';

import FavouriteOperatorButton from './favourite-operator-button.vue';
import OperatorName from './operator-name.vue';

const props = defineProps<{ departures: Departure[]; label: string; showStop?: boolean }>();

const { t } = useI18n();
const formatTime = useTimeFormat();
const idPrefix = useId();

const MODE_ICONS: Record<TransportMode, string> = {
  rail: 'mdi-train',
  bus: 'mdi-bus',
  tram: 'mdi-tram',
  other: 'mdi-transit-connection-variant',
};

const VIA_STOPS = 4;
/** Width (px) of the list from which each departure is one table line. */
const WIDE_FROM = 720;
/** How long (ms) a new or changed departure keeps its row state. */
const ROW_STATE_MS = 1500;

const departureKey = (departure: Departure) => `${departure.stop_id}:${departure.trip_id}`;

const rows = computed<RowValue[]>(() =>
  props.departures.map((departure) => ({ ...departure, key: departureKey(departure) })),
);
const recentlyAdded = useRecentlyAdded(rows, 'key');

watch(
  () => props.departures,
  (next, previous) => {
    const before = new Map(previous.map((departure) => [departureKey(departure), departure]));
    const added: string[] = [];
    const updated: string[] = [];
    next.forEach((departure) => {
      const key = departureKey(departure);
      const old = before.get(key);
      if (!old) added.push(key);
      else if (old.delay_minutes !== departure.delay_minutes || old.platform !== departure.platform) updated.push(key);
    });
    if (added.length) recentlyAdded.addRecentlyAdded(added, ROW_STATE_MS);
    if (updated.length) recentlyAdded.addRecentlyUpdated(updated, ROW_STATE_MS);
  },
);

const columns = computed<ResponsiveColumnDefinitions>(() => {
  const unsorted = { sortable: false } as const;
  const list = [
    createColumn('time', () => t('departures.columns.time'), 'plain', unsorted),
    createColumn('service', () => t('departures.columns.service'), 'plain', unsorted),
    createColumn('delay', () => t('departures.columns.delay'), 'plain', unsorted),
    createColumn('platform', () => t('departures.columns.platform'), 'plain', unsorted),
    createColumn('operator', () => t('departures.columns.operator'), 'plain', unsorted),
    ...(props.showStop ? [createColumn('stop', () => t('departures.columns.stop'), 'plain', unsorted)] : []),
    createColumn('actions', () => t('journey.details'), 'plain', unsorted),
  ];
  return [
    { name: 'wide', cssClass: 'departures-wide', columns: list },
    { name: 'narrow', cssClass: 'departures-narrow', rows: props.showStop ? 5 : 4, columns: list },
  ];
});

// The layout follows the list's own width: the grid's layout measurement does not render the #item slot.
const root = ref<HTMLElement | null>(null);
const width = ref(0);
const layout = computed(() => (width.value >= WIDE_FROM ? 'wide' : 'narrow'));

let observer: ResizeObserver | null = null;
watch(root, (element) => {
  observer?.disconnect();
  observer = null;
  if (!element) return;
  width.value = element.clientWidth;
  observer = new ResizeObserver(([entry]) => {
    width.value = entry.contentRect.width;
  });
  observer.observe(element);
});
onBeforeUnmount(() => observer?.disconnect());

function mainId(row: RowValue): string {
  return `${idPrefix}-${row.stop_id}-${row.trip_id}`.replace(/[^\w-]/gu, '_');
}

/** The details of the departure's ride, boarding at its stop at the time of the departure. */
function rideLocation(row: RowValue): RouteLocationRaw {
  return {
    name: 'ride',
    params: { tripId: row.trip_id },
    query: { from: row.stop_id, at: row.scheduled_departure },
  };
}

function delayText(minutes: number): string {
  if (minutes > 0) return t('departures.delay', { minutes });
  if (minutes < 0) return t('departures.early', { minutes: -minutes });
  return t('departures.onTime');
}

function delayClass(minutes: number): string {
  return minutes > 0 ? 'text-error font-weight-bold' : '';
}
</script>

<style scoped>
/*
 * The grid is as tall as its rows and scrolls with the page: its body is no scroller, so every row is inside the
 * body's viewport and mounted.
 */
.departures-list :deep(.df-grid-body) {
  flex: none;
}

.departures-list :deep(.df-grid-body .body-grid) {
  height: auto;
  overflow-y: hidden;
}

.departures-list :deep(.df-record-grid) {
  display: grid;
  column-gap: 16px;
  row-gap: 0;
}

.departures-list :deep(.df-record-grid.departures-wide) {
  grid-template-columns: max-content minmax(12em, 2fr) max-content max-content minmax(8em, 1fr) max-content;
}

.departures-list--stops :deep(.df-record-grid.departures-wide) {
  grid-template-columns:
    max-content minmax(12em, 2fr) max-content max-content minmax(8em, 1fr) minmax(7em, 1fr)
    max-content;
}

.departures-list :deep(.df-record-grid.departures-narrow) {
  grid-template-columns: minmax(0, 1fr) max-content;
}

.departures-list :deep(.df-grid.cell) {
  min-width: 0;
  overflow-wrap: anywhere;
}

/* Wide: one line per departure under a visible header. */
.departures-list--wide :deep(.df-grid.cell) {
  align-self: center;
  padding: 10px 0;
}

.departures-list--wide :deep(.df-grid.card.header .df-grid.cell) {
  padding: 6px 0;
  font-size: 0.875rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.departures-list--wide :deep(.df-grid.header-container) {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

/* Narrow: each departure is a card of several lines; the header is there for assistive technology only. */
.departures-list--narrow :deep(.df-grid.header-container) {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.departures-list--narrow :deep(.df-grid.cell) {
  padding-bottom: 4px;
}

.departures-list--narrow :deep(.df-grid.cell:empty) {
  padding: 0;
}

/* Visual order of focusable cells follows the DOM: the operator's favourite button before Details. */
.departures-list--narrow :deep(.df-grid.cell.service) {
  grid-column: 1 / -1;
  grid-row: calc(var(--row-base) + 1);
  padding-top: 12px;
  font-size: 1.125rem;
}

.departures-list--narrow :deep(.df-grid.cell.time) {
  grid-column: 1 / -1;
  grid-row: calc(var(--row-base) + 2);
}

.departures-list--narrow :deep(.df-grid.cell.delay) {
  grid-column: 1;
  grid-row: calc(var(--row-base) + 3);
}

.departures-list--narrow :deep(.df-grid.cell.platform) {
  grid-column: 2;
  grid-row: calc(var(--row-base) + 3);
  text-align: end;
}

.departures-list--narrow :deep(.df-grid.cell.operator) {
  grid-column: 1;
  grid-row: calc(var(--row-base) + 4);
}

.departures-list--narrow :deep(.df-grid.cell.stop) {
  grid-column: 1;
  grid-row: calc(var(--row-base) + 5);
}

.departures-list--narrow :deep(.df-grid.cell.actions) {
  grid-column: 2;
  grid-row: calc(var(--row-base) + 4) / span 2;
  align-self: center;
}

.departures-list--narrow:not(.departures-list--stops) :deep(.df-grid.cell.actions) {
  grid-row: calc(var(--row-base) + 4);
}

.departure-card {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.time,
.service {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.departures-list--narrow .time {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 0 16px;
}

.departure-name {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}

.departure-operator {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 4px;
}
</style>

<style>
/* New and changed departures flash: only in the lively experience and only when the system allows motion. */
@media (prefers-reduced-motion: no-preference) {
  html.experience-lively .departures-list .departure-card.state-adding {
    animation: hopwatch-departure-added 1.2s ease-out;
  }

  html.experience-lively .departures-list .departure-card.state-updated {
    animation: hopwatch-departure-updated 1.2s ease-in-out;
  }
}

@keyframes hopwatch-departure-added {
  from {
    background: rgba(var(--v-theme-primary), 0.24);
  }

  to {
    background: transparent;
  }
}

@keyframes hopwatch-departure-updated {
  0%,
  100% {
    background: transparent;
  }

  30% {
    background: rgba(var(--v-theme-warning), 0.24);
  }
}
</style>
