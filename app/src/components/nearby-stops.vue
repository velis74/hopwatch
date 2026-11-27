<template>
  <fieldset v-if="stops" class="nearby-stops">
    <legend class="text-subtitle-1">{{ t('nearby.legend') }}</legend>
    <p v-if="!stops.length" class="text-body-2 text-medium-emphasis">{{ t('nearby.none', { radius: RADIUS_M }) }}</p>
    <df-checkbox
      v-for="nearby in stops"
      :key="nearby.id"
      :model-value="model.includes(nearby.id)"
      :label="optionLabel(nearby)"
      @update:model-value="toggle(nearby.id, $event)"
    />
  </fieldset>
</template>

<script setup lang="ts">
import { DfCheckbox } from '@dynamicforms/vuetify-inputs';
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { nearbyStops, type NearbyStop, type Stop } from '../api/hopwatch-api';
import { useModeNames } from '../composables/use-mode-names';
import { usePreferencesStore } from '../stores/preferences';

const props = defineProps<{ stop: Stop }>();
/** Ids of the checked stops. */
const model = defineModel<string[]>({ required: true });

const RADIUS_M = 300;

const { t } = useI18n();
const modeNames = useModeNames();
const preferences = usePreferencesStore();
const stops = ref<NearbyStop[] | null>(null);
let sequence = 0;

function optionLabel(nearby: NearbyStop): string {
  const params = { name: nearby.name, distance: Math.round(nearby.distance_m), modes: modeNames(nearby.modes) };
  return nearby.modes.length ? t('nearby.option', params) : t('nearby.optionNoModes', params);
}

function toggle(id: string, checked: boolean): void {
  const others = model.value.filter((other) => other !== id);
  model.value = checked ? [...others, id] : others;
}

/** Loads the stops around `stop` and checks those served by a mode the user includes by default. */
async function load(stop: Stop): Promise<void> {
  const current = ++sequence;
  stops.value = null;
  try {
    const found = (await nearbyStops(stop.lat, stop.lon, RADIUS_M)).filter((nearby) => nearby.id !== stop.id);
    if (current !== sequence) return;
    stops.value = found;
    const included = found.filter((nearby) => nearby.modes.some((mode) => preferences.nearbyModes.includes(mode)));
    if (included.length) model.value = included.map((nearby) => nearby.id);
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
</style>
