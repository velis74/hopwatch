<template>
  <div>
    <v-autocomplete
      ref="field"
      v-model:search="query"
      :model-value="null"
      :label="t('departures.findStop')"
      hide-details
      aria-describedby="stop-search-hint"
      :items="results"
      item-title="name"
      item-value="id"
      return-object
      no-filter
      hide-no-data
      :loading="loading"
      prepend-inner-icon="mdi-magnify"
      @update:model-value="choose"
    >
      <template #append-item>
        <v-list-item v-if="noResults" :title="t('departures.noStopsFound')" disabled />
      </template>
    </v-autocomplete>
    <p id="stop-search-hint" class="text-body-2 text-medium-emphasis mt-1">{{ t('departures.findStopHint') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { searchStops, type Stop } from '../api/hopwatch-api';
import { useDebounced } from '../composables/use-debounced';

const props = defineProps<{ autofocus?: boolean }>();
const emit = defineEmits<{ select: [stop: Stop] }>();

const { t } = useI18n();

const field = ref<{ focus: () => void } | null>(null);
const query = ref('');
const debouncedQuery = useDebounced(query, 250);
const results = ref<Stop[]>([]);
const loading = ref(false);
const searched = ref('');
let sequence = 0;

const noResults = computed(() => !loading.value && searched.value.length >= 2 && results.value.length === 0);

watch(debouncedQuery, async (value) => {
  const text = (value ?? '').trim();
  const current = ++sequence;
  if (text.length < 2) {
    results.value = [];
    searched.value = '';
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

function choose(stop: Stop | null) {
  if (stop) emit('select', stop);
}

onMounted(() => {
  if (props.autofocus) field.value?.focus();
});
</script>
