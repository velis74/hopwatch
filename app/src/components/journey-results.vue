<template>
  <div class="journey-results">
    <stale-notice :updated-at="updatedAt" :now="scheduler.now.value" />
    <journey-list
      ref="list"
      :journeys="result"
      :error="loadError"
      :selected-id="itinerary?.id ?? null"
      @select="select"
      @earlier="turnPage(result?.earlier_cursor)"
      @later="turnPage(result?.later_cursor)"
    />
    <p v-if="result && updatedAt" class="text-body-2 text-medium-emphasis mt-2">
      {{ t('departures.updatedAt', { time: formatTime(new Date(updatedAt)) }) }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { type Itinerary, type Journeys, journeys as fetchJourneys, type Stop } from '../api/hopwatch-api';
import { toOffsetIso } from '../composables/local-time';
import { useRefreshScheduler } from '../composables/use-refresh-scheduler';
import { useTimeFormat } from '../composables/use-time-format';

import type { TimeMode } from './journey-form.vue';
import JourneyList from './journey-list.vue';
import StaleNotice from './stale-notice.vue';

const props = defineProps<{ from: Stop; to: Stop; timeMode: TimeMode; time: string }>();
/** The itinerary shown on the map: the one the user selected, else the first. */
const itinerary = defineModel<Itinerary | null>('itinerary', { required: true });

const { t } = useI18n();
const formatTime = useTimeFormat();
const list = ref<InstanceType<typeof JourneyList> | null>(null);

const result = ref<Journeys | null>(null);
const loadError = ref(false);
const updatedAt = ref<number | null>(null);
const selectedId = ref<string | null>(null);
/** The page cursor, valid only for the query it was given for. */
const page = ref<{ query: string; cursor: string } | null>(null);
let sequence = 0;

const query = computed(() => {
  const time = props.timeMode === 'now' ? undefined : (toOffsetIso(props.time) ?? undefined);
  return { fromStopId: props.from.id, toStopId: props.to.id, time, arriveBy: props.timeMode === 'arrive' };
});
const queryKey = computed(() => JSON.stringify(query.value));
const pageCursor = computed(() => (page.value?.query === queryKey.value ? page.value.cursor : undefined));
const requestKey = computed(() => `${queryKey.value}|${pageCursor.value ?? ''}`);

function pick(journeys: Journeys | null): Itinerary | null {
  const itineraries = journeys?.itineraries ?? [];
  return itineraries.find((candidate) => candidate.id === selectedId.value) ?? itineraries[0] ?? null;
}

let focusAfterLoad = false;

async function load(): Promise<void> {
  const current = ++sequence;
  const focus = focusAfterLoad;
  focusAfterLoad = false;
  try {
    const answer = await fetchJourneys({ ...query.value, pageCursor: pageCursor.value });
    if (current !== sequence) return;
    result.value = answer;
    loadError.value = false;
    updatedAt.value = scheduler.now.value;
    itinerary.value = pick(answer);
    if (focus) await list.value?.focusFirst();
  } catch {
    if (current === sequence) loadError.value = true;
  }
}

const scheduler = useRefreshScheduler(load);

function select(id: string): void {
  selectedId.value = id;
  itinerary.value = pick(result.value);
}

function turnPage(cursor: string | null | undefined): void {
  if (!cursor) return;
  focusAfterLoad = true;
  page.value = { query: queryKey.value, cursor };
}

watch(queryKey, () => {
  result.value = null;
  updatedAt.value = null;
  selectedId.value = null;
  itinerary.value = null;
});

watch(requestKey, () => scheduler.loadNow(), { immediate: true });
</script>
