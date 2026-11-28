<template>
  <div
    v-if="departures.length"
    class="departures-list"
    :class="[`departures-list--${layout}`, { 'departures-list--stops': showStop }]"
    :style="{ '--departures-list-content-height': `${contentHeight}px` }"
  >
    <df-grid
      v-model:active-columns="layout"
      :columns="columns"
      :records="rows"
      key-field="key"
      :aria-label="label"
      :recently-added="recentlyAdded"
      :estimated-row-height="estimatedRowHeight"
      class="departures-grid"
    />
  </div>
</template>

<script setup lang="ts">
import {
  createColumn,
  type ResponsiveColumnDefinitions,
  type RowValue,
  useRecentlyAdded,
} from '@dynamicforms/vue-grid';
import { RenderableValue, type RenderContentNonCallable, type SimpleComponentDef } from '@dynamicforms/vuetify-inputs';
import { computed, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { type RouteLocationRaw } from 'vue-router';

import type { Departure, TransportMode } from '../api/hopwatch-api';
import { useTimeFormat } from '../composables/use-time-format';

const props = defineProps<{ departures: Departure[]; label: string; showStop?: boolean }>();

const { t } = useI18n();
const formatTime = useTimeFormat();
const idPrefix = useId();

// Cell content names its components; the application registers them globally.
const OPERATOR_NAME = 'OperatorName';
const FAVOURITE_OPERATOR_BUTTON = 'FavouriteOperatorButton';

const MODE_ICONS: Record<TransportMode, string> = {
  rail: 'mdi-train',
  bus: 'mdi-bus',
  tram: 'mdi-tram',
  other: 'mdi-transit-connection-variant',
};

const VIA_STOPS = 4;
/** How long (ms) a new or changed departure keeps its row state. */
const ROW_STATE_MS = 1500;

const departureKey = (departure: Departure) => `${departure.stop_id}:${departure.trip_id}`;

const rows = computed<RowValue[]>(() =>
  props.departures.map((departure) => ({ ...departure, key: departureKey(departure) })),
);
const recentlyAdded = useRecentlyAdded(rows, 'key');

/** The responsive layout the grid chose for its width. */
const layout = ref('wide');

const estimatedRowHeight = computed(() => (layout.value === 'wide' ? 68 : 150));
/** Estimated height (px) of the header and every row; a parent may size the list by it. */
const contentHeight = computed(() => (layout.value === 'wide' ? 40 : 0) + rows.value.length * estimatedRowHeight.value);

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

type Content = RenderContentNonCallable | null | false | undefined;

function element(componentName: string, componentProps: SimpleComponentDef['componentProps'], ...children: Content[]) {
  return {
    componentName,
    componentProps,
    children: children.filter((child): child is RenderContentNonCallable => !!child),
  } satisfies SimpleComponentDef;
}

/** A cell: a `div` with `children`. */
function cell(...children: Content[]): RenderableValue {
  return new RenderableValue(element('div', {}, ...children));
}

function icon(name: string, componentProps: SimpleComponentDef['componentProps'] = {}): SimpleComponentDef {
  return element('VIcon', { icon: name, 'aria-hidden': 'true', ...componentProps });
}

/** Keeps a click on a control of a row from also being a click on the row. */
const stopPropagation = (event: Event) => event.stopPropagation();

function renderTime(_value: unknown, row: RowValue): RenderableValue {
  return cell(
    element('span', {}, t('departures.scheduled', { time: formatTime(row.scheduled_departure, row.time_zone) })),
    row.expected_departure &&
      row.delay_minutes !== 0 &&
      element('span', {}, t('departures.expected', { time: formatTime(row.expected_departure, row.time_zone) })),
  );
}

function renderService(_value: unknown, row: RowValue): RenderableValue {
  return cell(
    element(
      'span',
      { id: mainId(row), class: 'departure-name' },
      icon(MODE_ICONS[row.mode as TransportMode]),
      element('span', { class: 'departure-mode text-body-2 text-medium-emphasis' }, t(`departures.modes.${row.mode}`)),
      element('strong', { class: 'departure-line' }, row.line),
      element('span', { class: 'departure-headsign' }, t('departures.toHeadsign', { headsign: row.headsign })),
    ),
    row.next_stops.length > 0 &&
      element(
        'span',
        { class: 'departure-via text-body-2 text-medium-emphasis' },
        t('departures.via', { stops: row.next_stops.slice(0, VIA_STOPS).join(', ') }),
      ),
  );
}

function renderDelay(_value: unknown, row: RowValue): RenderableValue {
  const minutes: number | null = row.delay_minutes;
  if (minutes === null) return cell();
  const source = row.delay_source
    ? ` ${t('departures.delaySource', { source: t(`departures.sources.${row.delay_source}`) })}`
    : '';
  return cell(
    element(
      'span',
      { class: delayClass(minutes) },
      row.delay_source && icon('mdi-access-point', { size: 'small', class: 'decorative-pulse' }),
      `${delayText(minutes)}${source}`,
    ),
  );
}

function renderOperator(_value: unknown, row: RowValue): RenderableValue {
  if (!row.operator) return cell();
  return cell(
    element(
      'span',
      { class: 'departure-operator' },
      element(OPERATOR_NAME, { operator: row.operator }),
      element(FAVOURITE_OPERATOR_BUTTON, { operator: row.operator, onClick: stopPropagation }),
    ),
  );
}

function renderDetails(_value: unknown, row: RowValue): RenderableValue {
  return cell(
    element(
      'VBtn',
      {
        to: rideLocation(row),
        size: 'small',
        variant: 'tonal',
        color: 'primary',
        appendIcon: 'mdi-chevron-right',
        'aria-describedby': mainId(row),
        class: 'departure-link',
        onClick: stopPropagation,
      },
      t('journey.details'),
    ),
  );
}

const columns = computed<ResponsiveColumnDefinitions>(() => {
  const unsorted = { sortable: false } as const;
  const secondary = { ...unsorted, cssClass: 'text-body-2' } as const;
  // A column rendered from the whole record has rendererOptions, so that its renderer also gets the records whose
  // field of the column's name is empty.
  const list = [
    createColumn('time', () => t('departures.columns.time'), renderTime, { ...unsorted, rendererOptions: {} }),
    createColumn('service', () => t('departures.columns.service'), renderService, { ...unsorted, rendererOptions: {} }),
    createColumn('delay', () => t('departures.columns.delay'), renderDelay, { ...secondary, rendererOptions: {} }),
    createColumn('platform', () => t('departures.columns.platform'), 'plain', {
      ...secondary,
      rendererOptions: {
        nullHandler: 'null-empty',
        transform: (platform: string) => (platform ? t('departures.platform', { platform }) : ''),
      },
    }),
    createColumn('operator', () => t('departures.columns.operator'), renderOperator, {
      ...secondary,
      rendererOptions: {},
    }),
    ...(props.showStop
      ? [
          createColumn('stop_name', () => t('departures.columns.stop'), 'plain', {
            ...unsorted,
            cssClass: 'departure-stop text-body-2',
            rendererOptions: { transform: (stop: string) => t('departures.atStop', { stop }) },
          }),
        ]
      : []),
    createColumn('actions', () => t('journey.details'), renderDetails, { ...unsorted, rendererOptions: {} }),
  ];
  return [
    { name: 'wide', cssClass: 'departures-wide', columns: list },
    { name: 'narrow', cssClass: 'departures-narrow', rows: props.showStop ? 5 : 4, columns: list },
  ];
});

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
/* The grid scrolls its rows inside itself; its parent gives it a definite height. */
.departures-list {
  display: flex;
  flex-direction: column;
}

.departures-grid {
  height: 100%;
  min-height: 15em;
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

.departures-list :deep(.body-grid .df-grid.card) {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

/* Wide: one line per departure under a visible header. */
.departures-list :deep(.df-record-grid.departures-wide .df-grid.cell) {
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

.departures-list :deep(.body-grid.departures-narrow .df-grid.cell) {
  padding-bottom: 4px;
}

.departures-list :deep(.body-grid.departures-narrow .df-grid.cell:empty) {
  padding: 0;
}

/* Visual order of focusable cells follows the DOM: the operator's favourite button before Details. */
.departures-list :deep(.body-grid.departures-narrow .df-grid.cell.service) {
  grid-column: 1 / -1;
  grid-row: calc(var(--row-base) + 1);
  padding-top: 12px;
  font-size: 1.125rem;
}

.departures-list :deep(.body-grid.departures-narrow .df-grid.cell.time) {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 0 16px;
  grid-column: 1 / -1;
  grid-row: calc(var(--row-base) + 2);
}

.departures-list :deep(.body-grid.departures-narrow .df-grid.cell.delay) {
  grid-column: 1;
  grid-row: calc(var(--row-base) + 3);
}

.departures-list :deep(.body-grid.departures-narrow .df-grid.cell.platform) {
  grid-column: 2;
  grid-row: calc(var(--row-base) + 3);
  text-align: end;
}

.departures-list :deep(.body-grid.departures-narrow .df-grid.cell.operator) {
  grid-column: 1;
  grid-row: calc(var(--row-base) + 4);
}

.departures-list :deep(.body-grid.departures-narrow .df-grid.cell.departure-stop) {
  grid-column: 1;
  grid-row: calc(var(--row-base) + 5);
}

.departures-list :deep(.body-grid.departures-narrow .df-grid.cell.actions) {
  grid-column: 2;
  grid-row: calc(var(--row-base) + 4) / span 2;
  align-self: center;
}

.departures-list:not(.departures-list--stops) :deep(.body-grid.departures-narrow .df-grid.cell.actions) {
  grid-row: calc(var(--row-base) + 4);
}

.departures-list :deep(.df-grid.cell.time),
.departures-list :deep(.df-grid.cell.service) {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.departures-list :deep(.departure-name) {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}

.departures-list :deep(.departure-operator) {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 4px;
}
</style>

<style>
/* New and changed departures flash: only in the lively experience and only when the system allows motion. */
@media (prefers-reduced-motion: no-preference) {
  html.experience-lively .departures-list .df-grid.card.state-adding {
    animation: hopwatch-departure-added 1.2s ease-out;
  }

  html.experience-lively .departures-list .df-grid.card.state-updated {
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
