<template>
  <div @focusin="selectChosenName">
    <v-autocomplete
      ref="field"
      v-model:search="query"
      v-model:menu="menu"
      :model-value="model"
      :label="label"
      hide-details
      :aria-describedby="hintId"
      :items="results"
      item-title="name"
      item-value="id"
      :item-props="itemProps"
      return-object
      no-filter
      :clearable="clearable"
      persistent-clear
      :hide-no-data="!noResults"
      :loading="loading"
      prepend-inner-icon="mdi-magnify"
      @update:model-value="choose"
    >
      <template v-if="clearable" #clear>
        <!-- A button of its own: Vuetify's clear icon is not in the tab order. -->
        <button
          v-if="model"
          type="button"
          class="stop-search-clear"
          :aria-label="t('departures.clearStop', { field: label })"
          @click="clear"
        >
          <v-icon icon="mdi-close-circle" aria-hidden="true" />
        </button>
      </template>
      <template #no-data>
        <v-list-item :title="t('departures.noStopsFound')" disabled />
      </template>
    </v-autocomplete>
    <p :id="hintId" class="text-body-2 text-medium-emphasis mt-1">{{ t('departures.findStopHint') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { searchStops, type Stop } from '../api/hopwatch-api';
import { useDebounced } from '../composables/use-debounced';
import { useModeNames } from '../composables/use-mode-names';

const props = defineProps<{ label: string; autofocus?: boolean; clearable?: boolean }>();
const model = defineModel<Stop | null>({ default: null });

const { t } = useI18n();
const modeNames = useModeNames();
const hintId = `${useId()}-hint`;

const field = ref<{ focus: () => void } | null>(null);
const query = ref('');
const debouncedQuery = useDebounced(query, 250);
const results = ref<Stop[]>([]);
const loading = ref(false);
const searched = ref('');
const menu = ref(false);
let sequence = 0;

const noResults = computed(() => !loading.value && searched.value.length >= 2 && results.value.length === 0);
// The option's name separates the stop's name from its modes; read as one, they would run together.
function itemProps(stop: Stop) {
  const modes = modeNames(stop.modes);
  return { subtitle: modes || undefined, 'aria-label': modes ? `${stop.name}, ${modes}` : stop.name };
}

watch(debouncedQuery, async (value) => {
  const text = (value ?? '').trim();
  const current = ++sequence;
  // The field shows the chosen stop's name as its text; that is not a search.
  if (text.length < 2 || text === model.value?.name) {
    results.value = [];
    searched.value = '';
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const stops = await searchStops(text);
    if (current === sequence) results.value = stops;
  } catch {
    if (current === sequence) results.value = [];
  } finally {
    if (current === sequence) {
      loading.value = false;
      searched.value = text;
    }
  }
});

// The menu opens by itself only when items arrive; an empty answer opens it for the "no stops" line.
watch(noResults, (value) => {
  if (value) menu.value = true;
});

function choose(stop: Stop | null) {
  model.value = stop;
}

// On focus the field's text becomes the chosen stop's name; selecting it lets typing replace the name.
async function selectChosenName(event: FocusEvent) {
  if (!(event.target instanceof HTMLInputElement) || !model.value) return;
  const input = event.target;
  await nextTick();
  if (document.activeElement === input && input.value === model.value?.name) input.select();
}

function clear() {
  model.value = null;
  query.value = '';
}

onMounted(() => {
  if (props.autofocus) field.value?.focus();
});
</script>

<style scoped>
.stop-search-clear {
  display: inline-flex;
  min-width: 24px;
  min-height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.stop-search-clear:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
}
</style>
