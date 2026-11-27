<template>
  <transition-group tag="ul" name="departure" role="list" :aria-label="label" class="departures-list">
    <li v-for="departure in departures" :key="`${departure.stop_id}:${departure.trip_id}`" class="departure">
      <div class="departure-main">
        <v-icon :icon="MODE_ICONS[departure.mode]" aria-hidden="true" class="mr-2" />
        <span class="departure-mode text-body-2 text-medium-emphasis">
          {{ t(`departures.modes.${departure.mode}`) }}
        </span>
        <strong class="departure-line">{{ departure.line }}</strong>
        <span class="departure-headsign">{{ t('departures.toHeadsign', { headsign: departure.headsign }) }}</span>
      </div>
      <div class="departure-details text-body-2">
        <span>{{ t('departures.scheduled', { time: formatTime(departure.scheduled_departure) }) }}</span>
        <span v-if="departure.expected_departure && departure.delay_minutes !== 0">
          {{ t('departures.expected', { time: formatTime(departure.expected_departure) }) }}
        </span>
        <span v-if="departure.delay_minutes !== null" :class="delayClass(departure.delay_minutes)">
          <v-icon
            v-if="departure.delay_source"
            icon="mdi-access-point"
            size="small"
            aria-hidden="true"
            class="decorative-pulse"
          />
          {{ delayText(departure.delay_minutes) }}
          <template v-if="departure.delay_source">
            {{ t('departures.delaySource', { source: t(`departures.sources.${departure.delay_source}`) }) }}
          </template>
        </span>
        <span v-if="departure.platform">{{ t('departures.platform', { platform: departure.platform }) }}</span>
      </div>
      <div v-if="departure.next_stops.length" class="departure-via text-body-2 text-medium-emphasis">
        {{ t('departures.via', { stops: departure.next_stops.slice(0, VIA_STOPS).join(', ') }) }}
      </div>
      <div v-if="departure.operator" class="departure-operator text-body-2">
        <operator-name :operator="departure.operator" />
        <favourite-operator-button :operator="departure.operator" />
      </div>
      <div v-if="showStop" class="departure-stop text-body-2">
        {{ t('departures.atStop', { stop: departure.stop_name }) }}
      </div>
    </li>
  </transition-group>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import type { Departure, TransportMode } from '../api/hopwatch-api';
import { useTimeFormat } from '../composables/use-time-format';

import FavouriteOperatorButton from './favourite-operator-button.vue';
import OperatorName from './operator-name.vue';

defineProps<{ departures: Departure[]; label: string; showStop?: boolean }>();

const { t } = useI18n();
const formatTime = useTimeFormat();

const MODE_ICONS: Record<TransportMode, string> = {
  rail: 'mdi-train',
  bus: 'mdi-bus',
  tram: 'mdi-tram',
  other: 'mdi-transit-connection-variant',
};

const VIA_STOPS = 4;

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
.departures-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.departure {
  padding: 12px 4px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.departure-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  font-size: 1.125rem;
}

.departure-details {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-top: 4px;
}

.departure-via {
  margin-top: 2px;
}

.departure-operator {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 4px;
}
</style>
