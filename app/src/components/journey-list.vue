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
        :row-class="rowClass"
        :estimated-row-height="200"
        :aria-labelledby="headingId"
        class="journey-grid"
      />
      <p v-else class="my-2">{{ t('journey.empty') }}</p>
      <v-btn variant="text" prepend-icon="mdi-chevron-down" :disabled="!journeys.later_cursor" @click="emit('later')">
        {{ t('journey.later') }}
      </v-btn>
    </template>
  </section>
</template>

<script setup lang="ts">
import {
  type CellRendererTransformer,
  createColumn,
  type ResponsiveColumnDefinitions,
  type RowValue,
  useRecentlyAdded,
} from '@dynamicforms/vue-grid';
import { RenderableValue, type RenderContentNonCallable, type SimpleComponentDef } from '@dynamicforms/vuetify-inputs';
import { nextTick, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import type { Itinerary, Journeys, Leg } from '../api/hopwatch-api';
import { arrivalZone, departureZone, useTimeFormat } from '../composables/use-time-format';

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

type Child = RenderContentNonCallable | null | false | undefined;

/** An element or a globally registered component with its props and the children that are given. */
function el(
  componentName: string,
  componentProps: Record<string, unknown> = {},
  ...children: Child[]
): SimpleComponentDef {
  return {
    componentName,
    componentProps,
    children: children.filter((child): child is RenderContentNonCallable => !!child),
  };
}

/** A cell computed from the whole itinerary; the cell element is the returned element. */
function cell(content: (itinerary: Itinerary) => SimpleComponentDef): CellRendererTransformer {
  return (_value, row) => new RenderableValue(content(row as Itinerary), 'journey-cell');
}

/** One record per itinerary; the cells stack in three grid rows (see the styles). */
const columns: ResponsiveColumnDefinitions = [
  {
    name: 'stacked',
    cssClass: 'journey-grid-stacked',
    rows: 3,
    columns: [
      createColumn('journey', () => t('journey.columns.journey'), cell(summaryCell), {
        sortable: false,
        rendererOptions: {},
      }),
      createColumn('route', () => t('journey.legsLabel'), cell(routeCell), { sortable: false, rendererOptions: {} }),
      createColumn('actions', () => t('journey.columns.actions'), cell(actionsCell), {
        sortable: false,
        rendererOptions: {},
      }),
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

function rowClass(item: RowValue): Record<string, boolean> {
  return { 'journey-card': true, 'journey-card--selected': item.id === props.selectedId };
}

function summaryId(itinerary: Itinerary): string {
  return `${headingId}-${itinerary.id}`;
}

function summaryCell(itinerary: Itinerary): SimpleComponentDef {
  const times = t('journey.times', {
    departure: formatTime(itinerary.scheduled_departure, departureZone(itinerary)),
    arrival: formatTime(itinerary.scheduled_arrival, arrivalZone(itinerary)),
  });
  const expected = expectedText(itinerary);
  return el(
    'div',
    { tabindex: -1 },
    el(
      'p',
      { id: summaryId(itinerary), class: 'journey-summary' },
      el('strong', { class: 'journey-times' }, times),
      el('span', {}, duration(itinerary.duration_minutes)),
      el('span', {}, t('journey.transfers', { count: itinerary.transfers }, itinerary.transfers)),
    ),
    expected && el('p', { class: 'journey-expected text-body-2' }, expected),
  );
}

function routeCell(itinerary: Itinerary): SimpleComponentDef {
  return el(
    'div',
    {},
    el(
      'ul',
      { class: 'journey-legs', role: 'list', 'aria-label': t('journey.legsLabel') },
      ...itinerary.legs.map(legItem),
    ),
  );
}

function legItem(leg: Leg): SimpleComponentDef {
  const times = t('journey.legFromTo', {
    departure: formatTime(leg.from.scheduled, leg.from.time_zone),
    from: leg.from.name,
    arrival: formatTime(leg.to.scheduled, leg.to.time_zone),
    to: leg.to.name,
  });
  const delay =
    leg.delay_minutes === null
      ? null
      : [
          delayText(leg.delay_minutes),
          leg.delay_source && t('departures.delaySource', { source: t(`departures.sources.${leg.delay_source}`) }),
        ]
          .filter(Boolean)
          .join(' ');
  return el(
    'li',
    { class: 'journey-leg text-body-2' },
    el('VIcon', { icon: LEG_ICONS[leg.mode], size: 'small', 'aria-hidden': 'true', class: 'mr-1' }),
    el('span', { class: 'journey-leg-name' }, legName(leg)),
    leg.operator && el('OperatorName', { operator: leg.operator, class: 'journey-leg-operator' }),
    el('span', { class: 'journey-leg-times text-medium-emphasis' }, times),
    leg.from.platform && el('span', {}, t('departures.platform', { platform: leg.from.platform })),
    delay !== null && el('span', { class: { 'text-error font-weight-bold': (leg.delay_minutes ?? 0) > 0 } }, delay),
    leg.ticket_url && el('a', { href: leg.ticket_url, target: '_blank', rel: 'noopener' }, t('journey.tickets')),
  );
}

function actionsCell(itinerary: Itinerary): SimpleComponentDef {
  const selected = itinerary.id === props.selectedId;
  const describedBy = summaryId(itinerary);
  return el(
    'div',
    {},
    el(
      'VBtn',
      {
        size: 'small',
        variant: selected ? 'flat' : 'outlined',
        prependIcon: selected ? 'mdi-map-check' : 'mdi-map-outline',
        'aria-pressed': selected ? 'true' : 'false',
        'aria-describedby': describedBy,
        onClick: (event: MouseEvent) => {
          event.stopPropagation();
          emit('select', itinerary.id);
        },
      },
      t('journey.showOnMap'),
    ),
    el(
      'VBtn',
      {
        size: 'small',
        variant: 'tonal',
        color: 'primary',
        appendIcon: 'mdi-chevron-right',
        'aria-describedby': describedBy,
        class: 'ml-2 journey-details-button',
        onClick: (event: MouseEvent) => {
          event.stopPropagation();
          emit('details', itinerary.id);
        },
      },
      t('journey.details'),
    ),
  );
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
  const [fromZone, toZone] = [departureZone(itinerary), arrivalZone(itinerary)];
  if (departure && formatTime(departure, fromZone) !== formatTime(itinerary.scheduled_departure, fromZone)) {
    parts.push(t('journey.expectedDeparture', { time: formatTime(departure, fromZone) }));
  }
  if (arrival && formatTime(arrival, toZone) !== formatTime(itinerary.scheduled_arrival, toZone)) {
    parts.push(t('journey.expectedArrival', { time: formatTime(arrival, toZone) }));
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
.journey-list {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.journey-list > * {
  flex: none;
}

.journey-list > .journey-grid {
  flex: 1 1 auto;
  height: 100%;
  min-height: 15em;
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

.journey-grid :deep(.journey-cell) {
  padding: 0 4px;
}

.journey-grid :deep(.journey-cell.journey) {
  padding-top: 12px;
}

.journey-grid :deep(.journey-cell.actions) {
  padding-top: 4px;
  padding-bottom: 12px;
}

.journey-grid :deep(.journey-card) {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.journey-grid :deep(.journey-card--selected) {
  border-left: 4px solid rgb(var(--v-theme-primary));
}

.journey-grid :deep(.journey-card--selected ~ .journey-cell) {
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

.journey-grid :deep(.journey-card.state-adding),
.journey-grid :deep(.journey-card.state-updated) {
  animation: journey-card-flash 1.5s ease-in-out;
}

@media (prefers-reduced-motion: reduce) {
  .journey-grid :deep(.journey-card.state-adding),
  .journey-grid :deep(.journey-card.state-updated) {
    animation: none;
    background-color: rgba(var(--v-theme-primary), 0.08);
  }
}

.journey-grid :deep(.journey-summary) {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  font-size: 1.125rem;
}

.journey-grid :deep(.journey-legs) {
  list-style: none;
  padding: 0;
  margin: 4px 0;
}

.journey-grid :deep(.journey-leg) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 12px;
}
</style>
