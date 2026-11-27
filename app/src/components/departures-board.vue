<template>
  <section :aria-labelledby="headingId" class="departures-board">
    <h2 :id="headingId" tabindex="-1" class="text-h5 mb-2">{{ stop.name }}</h2>

    <v-alert v-if="loadError && !departureList" type="warning" variant="tonal" class="mb-4">
      {{ t('departures.unavailable') }}
    </v-alert>
    <p v-else-if="!departureList" class="mb-4">{{ t('departures.loading') }}</p>

    <stale-notice :updated-at="updatedAt" :now="scheduler.now.value" />

    <template v-if="departureList">
      <departures-list :departures="departureList" :label="listLabel" :show-stop="stopIds.length > 1" />
      <p v-if="!departureList.length" class="mt-2">{{ t('departures.empty', { minutes: WINDOW_MINUTES }) }}</p>
      <p v-if="updatedAt" class="text-body-2 text-medium-emphasis mt-2">
        {{ t('departures.updatedAt', { time: formatTime(new Date(updatedAt)) }) }}
      </p>
    </template>

    <div aria-live="polite" aria-atomic="true" class="visually-hidden">{{ announcement }}</div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { type Departure, departures as fetchDepartures, type Stop } from '../api/hopwatch-api';
import { useRefreshScheduler } from '../composables/use-refresh-scheduler';
import { useTimeFormat } from '../composables/use-time-format';

import DeparturesList from './departures-list.vue';
import StaleNotice from './stale-notice.vue';

/** `stopIds` are the stops whose departures the board merges, `stop` first. */
const props = defineProps<{ stop: Stop; stopIds: string[] }>();

const WINDOW_MINUTES = 60;

const { t } = useI18n();
const formatTime = useTimeFormat();
const headingId = `${useId()}-heading`;

const departureList = ref<Departure[] | null>(null);
const loadError = ref(false);
const updatedAt = ref<number | null>(null);
const announcement = ref('');
let shownKey = '';
let sequence = 0;

const stopKey = computed(() => props.stopIds.join(','));
const listLabel = computed(() =>
  props.stopIds.length > 1
    ? t('departures.listLabelNearby', { stop: props.stop.name })
    : t('departures.listLabel', { stop: props.stop.name }),
);

const departureKey = (departure: Departure) => `${departure.stop_id}:${departure.trip_id}`;

function delayLabel(minutes: number): string {
  if (minutes > 0) return t('departures.delay', { minutes });
  if (minutes < 0) return t('departures.early', { minutes: -minutes });
  return t('departures.onTime');
}

/** Texts for the live region: one for each departure whose delay differs from the previous load. */
function delayChanges(previous: Departure[], next: Departure[]): string[] {
  const before = new Map(previous.map((departure) => [departureKey(departure), departure.delay_minutes]));
  return next
    .filter((departure) => {
      const key = departureKey(departure);
      return before.has(key) && before.get(key) !== departure.delay_minutes && departure.delay_minutes !== null;
    })
    .map((departure) => {
      const params = {
        mode: t(`departures.modes.${departure.mode}`),
        line: departure.line,
        headsign: departure.headsign,
        delay: delayLabel(departure.delay_minutes as number),
      };
      return departure.delay_minutes === 0
        ? t('departures.announceOnTime', params)
        : t('departures.announceDelay', params);
    });
}

async function load(): Promise<void> {
  const key = stopKey.value;
  const current = ++sequence;
  try {
    const result = await fetchDepartures(props.stopIds, WINDOW_MINUTES);
    if (current !== sequence) return;
    if (key === shownKey && departureList.value) {
      const changes = delayChanges(departureList.value, result);
      if (changes.length) announcement.value = changes.join(' ');
    }
    departureList.value = result;
    shownKey = key;
    loadError.value = false;
    updatedAt.value = scheduler.now.value;
  } catch {
    if (current === sequence) loadError.value = true;
  }
}

const scheduler = useRefreshScheduler(load);

watch(
  () => props.stop.id,
  () => {
    departureList.value = null;
    updatedAt.value = null;
    announcement.value = '';
  },
);

watch(stopKey, () => scheduler.loadNow(), { immediate: true });
</script>
