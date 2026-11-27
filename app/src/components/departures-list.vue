<template>
  <transition-group tag="ul" name="departure" role="list" :aria-label="label" class="departures-list">
    <li v-for="departure in departures" :key="departure.trip_id" class="departure">
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
            v-if="departure.delay_source === 'official'"
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
      <div v-if="hiddenMatch(departure)" class="departure-via text-body-2 text-medium-emphasis">
        {{ t('departures.callsAt', { stop: hiddenMatch(departure) }) }}
      </div>
    </li>
  </transition-group>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import type { Departure, TransportMode } from '../api/hopwatch-api';
import { useTimeFormat } from '../composables/use-time-format';

const props = defineProps<{ departures: Departure[]; label: string; destination?: string }>();

const { t } = useI18n();
const formatTime = useTimeFormat();

const MODE_ICONS: Record<TransportMode, string> = {
  rail: 'mdi-train',
  bus: 'mdi-bus',
  tram: 'mdi-tram',
  other: 'mdi-transit-connection-variant',
};

const VIA_STOPS = 4;

/** Case-folded words without accents; mirrors `hopwatch.api.stops.matching.words`. */
function words(text: string): string[] {
  const folded = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[đłøħı]/g, (char) => ({ đ: 'd', ł: 'l', ø: 'o', ħ: 'h', ı: 'i' })[char] ?? char);
  return folded.match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** The first later stop matching the destination filter when the "Via" line does not show it. */
function hiddenMatch(departure: Departure): string | null {
  const query = words(props.destination ?? '');
  if (!query.length) return null;
  const index = departure.next_stops.findIndex((name) => {
    const nameWords = words(name);
    return query.every((prefix) => nameWords.some((word) => word.startsWith(prefix)));
  });
  return index >= VIA_STOPS ? departure.next_stops[index] : null;
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
</style>
