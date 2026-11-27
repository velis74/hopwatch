<template>
  <fieldset v-if="stops" ref="root" class="nearby-stops">
    <legend class="text-subtitle-1">{{ t('nearby.legend') }}</legend>
    <p v-if="!stops.length" class="text-body-2 text-medium-emphasis">{{ t('nearby.none', { radius: RADIUS_M }) }}</p>
    <div v-if="chips.length" class="nearby-chips">
      <span
        v-for="chip in chips"
        :key="chip.stop.id"
        class="nearby-chip"
        :class="{
          'nearby-chip--checked': isChecked(chip.stop.id),
          'nearby-chip--disabled': isDisabled(chip.stop.id),
        }"
      >
        <span
          role="checkbox"
          tabindex="0"
          class="nearby-chip__toggle"
          :aria-checked="isChecked(chip.stop.id)"
          :aria-disabled="isDisabled(chip.stop.id) || undefined"
          :aria-describedby="isDisabled(chip.stop.id) ? limitHintId : undefined"
          :aria-label="chipLabel(chip)"
          @click="toggle(chip.stop.id)"
          @keydown="onKeydown($event, chip.stop.id)"
        >
          <v-icon v-if="isChecked(chip.stop.id)" icon="mdi-check" size="small" aria-hidden="true" />
          <v-icon v-for="icon in modeIcons(chip.stop.modes)" :key="icon" :icon="icon" size="small" aria-hidden="true" />
          <span>{{ chip.stop.name }}</span>
          <span v-if="chip.distance !== null" class="nearby-chip__distance">{{ chip.distance }} m</span>
        </span>
        <button
          v-if="chip.added"
          type="button"
          class="nearby-chip__remove"
          :aria-label="t('nearby.remove', { name: chip.stop.name })"
          @click="remove(chip.stop.id)"
        >
          <v-icon icon="mdi-close" size="small" aria-hidden="true" />
        </button>
      </span>
    </div>
    <p v-if="atLimit" :id="limitHintId" class="text-body-2 text-medium-emphasis mt-2">
      {{ t('nearby.limit', { max: MAX_BOARD_STOPS }) }}
    </p>
    <df-select
      :model-value="null"
      class="nearby-add mt-3"
      :label="t('nearby.add')"
      :hint="t('departures.findStopHint')"
      :fetch-choices="fetchAddChoices"
      :passthrough-attrs="{ 'no-filter': true, 'prepend-inner-icon': 'mdi-plus', 'no-data-text': noDataText }"
      @update:model-value="add"
    />
    <p class="d-sr-only" role="status">{{ announcement }}</p>
  </fieldset>
</template>

<script setup lang="ts">
import { lookupChoices } from '@dynamicforms/fastapi-viewsets';
import { DfSelect } from '@dynamicforms/vuetify-inputs';
import { computed, nextTick, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { nearbyStops, type NearbyStop, searchStops, type Stop, type TransportMode } from '../api/hopwatch-api';
import { useModeNames } from '../composables/use-mode-names';
import { usePreferencesStore } from '../stores/preferences';

const props = defineProps<{ stop: Stop }>();
/** Ids of the checked stops. */
const model = defineModel<string[]>({ required: true });

const RADIUS_M = 300;
/** The departures board takes at most this many stops: From and the checked ones. */
const MAX_BOARD_STOPS = 10;
const SEARCH_DEBOUNCE_MS = 250;

const MODE_ICONS: Record<TransportMode, string> = {
  rail: 'mdi-train',
  bus: 'mdi-bus',
  tram: 'mdi-tram',
  other: 'mdi-transit-connection-variant',
};

interface Chip {
  stop: Stop;
  /** Rounded metres from From; null for an added stop. */
  distance: number | null;
  added: boolean;
}

const { t } = useI18n();
const modeNames = useModeNames();
const preferences = usePreferencesStore();
const limitHintId = `${useId()}-limit`;
const root = ref<HTMLElement | null>(null);
const stops = ref<NearbyStop[] | null>(null);
const announcement = ref('');
let sequence = 0;

const addedStops = computed(() => preferences.addedStops[props.stop.id] ?? []);

/** Nearby stops by distance, then the added ones. */
const chips = computed<Chip[]>(() => {
  const nearby = [...(stops.value ?? [])].sort((a, b) => a.distance_m - b.distance_m);
  const ids = new Set(nearby.map((stop) => stop.id));
  return [
    ...nearby.map((stop) => ({ stop, distance: Math.round(stop.distance_m), added: false })),
    ...addedStops.value.filter((stop) => !ids.has(stop.id)).map((stop) => ({ stop, distance: null, added: true })),
  ];
});

const atLimit = computed(() => model.value.length + 1 >= MAX_BOARD_STOPS);

function isChecked(id: string): boolean {
  return model.value.includes(id);
}

function isDisabled(id: string): boolean {
  return atLimit.value && !isChecked(id);
}

function modeIcons(modes: readonly TransportMode[]): string[] {
  return modes.length ? modes.map((mode) => MODE_ICONS[mode]) : [MODE_ICONS.other];
}

function chipLabel({ stop, distance }: Chip): string {
  const params = { name: stop.name, distance: distance ?? 0, modes: modeNames(stop.modes) };
  if (distance === null) return stop.modes.length ? t('nearby.addedOption', params) : stop.name;
  return stop.modes.length ? t('nearby.option', params) : t('nearby.optionNoModes', params);
}

function setChecked(id: string, checked: boolean): void {
  const others = model.value.filter((other) => other !== id);
  model.value = checked ? [...others, id] : others;
}

function toggle(id: string): void {
  if (isDisabled(id)) return;
  setChecked(id, !isChecked(id));
}

function onKeydown(event: KeyboardEvent, id: string): void {
  if (event.key !== ' ' && event.key !== 'Enter') return;
  event.preventDefault();
  if (!event.repeat) toggle(id);
}

const searchResults = new Map<string, Stop>();
let searchSequence = 0;
const searchText = ref('');
const noDataText = computed(() =>
  searchText.value.length < 2 ? t('departures.findStopHint') : t('departures.noStopsFound'),
);

/** Stops named like `q` (at least two letters), without From and the stops shown. */
async function findStops({ q }: { q?: string }): Promise<Stop[]> {
  const text = (q ?? '').trim();
  const current = ++searchSequence;
  searchText.value = text;
  if (text.length < 2) return [];
  await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS));
  // A newer search replaces this one; the select drops the stale answer.
  if (current !== searchSequence) return [];
  const shown = new Set([props.stop.id, ...chips.value.map((chip) => chip.stop.id)]);
  return (await searchStops(text)).filter((stop) => !shown.has(stop.id));
}

const fetchAddChoices = lookupChoices(findStops, (stop) => {
  searchResults.set(stop.id, stop);
  const modes = modeNames(stop.modes);
  return { id: stop.id, text: modes ? t('nearby.addedOption', { name: stop.name, modes }) : stop.name };
});

/** Adds the chosen stop for this From stop and checks it while the board has room. */
function add(id: string | null): void {
  const stop = id ? searchResults.get(id) : undefined;
  if (!stop) return;
  preferences.addStop(props.stop.id, stop);
  const checked = !atLimit.value;
  if (checked) setChecked(stop.id, true);
  announcement.value = t(checked ? 'nearby.addedChecked' : 'nearby.added', { name: stop.name });
}

async function remove(id: string): Promise<void> {
  const stop = addedStops.value.find((added) => added.id === id);
  preferences.removeStop(props.stop.id, id);
  setChecked(id, false);
  if (stop) announcement.value = t('nearby.removed', { name: stop.name });
  await nextTick();
  root.value?.querySelector<HTMLElement>('.nearby-add input')?.focus();
}

/** Loads the stops around `stop`; checks the added ones and those served by a mode the user includes by default. */
async function load(stop: Stop): Promise<void> {
  const current = ++sequence;
  stops.value = null;
  announcement.value = '';
  try {
    const found = (await nearbyStops(stop.lat, stop.lon, RADIUS_M)).filter((nearby) => nearby.id !== stop.id);
    if (current !== sequence) return;
    stops.value = found;
    const included = chips.value.filter(
      (chip) => chip.added || chip.stop.modes.some((mode) => preferences.nearbyModes.includes(mode)),
    );
    if (included.length) model.value = included.slice(0, MAX_BOARD_STOPS - 1).map((chip) => chip.stop.id);
  } catch {
    // Without nearby stops the board shows the chosen stop only.
  }
}

watch(
  () => props.stop.id,
  () => load(props.stop),
  { immediate: true },
);
</script>

<style scoped>
.nearby-stops {
  border: none;
  padding: 0;
}

.nearby-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.nearby-chip {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid rgb(var(--v-theme-primary));
  border-radius: 16px;
  color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-surface));
}

/* A tinted fill keeps on-surface text readable in both themes; white on the dark theme's primary is too faint. */
.nearby-chip--checked {
  border-width: 2px;
  color: rgb(var(--v-theme-on-surface));
  background: rgba(var(--v-theme-primary), 0.2);
}

/* Dashed as well as greyed: the state does not rest on colour. */
.nearby-chip--disabled {
  border-style: dashed;
  border-color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.nearby-chip__toggle {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  border-radius: 16px;
  cursor: pointer;
  user-select: none;
}

.nearby-chip--disabled .nearby-chip__toggle {
  cursor: not-allowed;
}

.nearby-chip__remove {
  display: inline-flex;
  min-width: 32px;
  align-items: center;
  justify-content: center;
  border-left: 1px solid currentColor;
  border-radius: 0 16px 16px 0;
}

.nearby-chip:has(.nearby-chip__remove) .nearby-chip__toggle {
  padding-right: 8px;
}

.nearby-chip__toggle:focus-visible,
.nearby-chip__remove:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
</style>
