<template>
  <div class="ride-section">
    <v-alert v-if="trip.cancelled" type="error" variant="flat" prominent class="mb-3 ride-cancelled">
      {{ t('ride.cancelled') }}
    </v-alert>

    <div v-if="trip.operator" class="ride-operator text-body-2">
      <operator-name :operator="trip.operator" />
      <favourite-operator-button :operator="trip.operator" />
    </div>

    <dl class="ride-facts">
      <div class="ride-fact">
        <dt>{{ t('ride.departure') }}</dt>
        <dd>
          <strong>{{ entryStop.name }}</strong>
          <span>{{ formatTime(departureOf(entryStop)) }}</span>
          <span v-if="expectedDiffers(entryStop, 'departure')">
            {{
              t('departures.expected', {
                time: formatTime(entryStop.expected_departure as string),
              })
            }}
          </span>
          <span v-if="entryStop.delay_minutes !== null" :class="delayClass(entryStop.delay_minutes)">
            {{ delayText(entryStop.delay_minutes, entryStop.delay_source) }}
          </span>
          <span v-if="entryStop.platform">{{ t('departures.platform', { platform: entryStop.platform }) }}</span>
          <span v-else class="text-medium-emphasis">{{ t('ride.platformUnknown') }}</span>
        </dd>
      </div>
      <div class="ride-fact">
        <dt>{{ t('ride.arrival') }}</dt>
        <dd>
          <strong>{{ exitStop.name }}</strong>
          <span>{{ formatTime(arrivalOf(exitStop)) }}</span>
          <span v-if="expectedDiffers(exitStop, 'arrival')">
            {{
              t('departures.expected', {
                time: formatTime(exitStop.expected_arrival as string),
              })
            }}
          </span>
          <span v-if="exitStop.platform">{{ t('departures.platform', { platform: exitStop.platform }) }}</span>
        </dd>
      </div>
      <div class="ride-fact">
        <dt>{{ t('ride.travelTime') }}</dt>
        <dd>
          {{ duration(minutesBetween(departureOf(entryStop), arrivalOf(exitStop))) }}
        </dd>
      </div>
    </dl>

    <ul v-if="amenities.length" role="list" class="ride-amenities" :aria-label="t('ride.amenities')">
      <li v-for="amenity in amenities" :key="amenity.key" class="ride-amenity text-body-2">
        <v-icon :icon="amenity.icon" size="small" aria-hidden="true" />
        <span>{{ amenity.text }}</span>
      </li>
    </ul>

    <v-btn
      v-if="trip.ticket_url"
      :href="trip.ticket_url"
      target="_blank"
      rel="noopener"
      variant="tonal"
      color="primary"
      prepend-icon="mdi-ticket-outline"
      :aria-describedby="ticketHintId"
      class="ride-ticket mb-3"
    >
      {{ t('ride.buyTicket') }}
    </v-btn>
    <span v-if="trip.ticket_url" :id="ticketHintId" class="visually-hidden">{{ t('ride.opensNewWindow') }}</span>

    <ol role="list" class="ride-timeline" :aria-label="t('ride.stopsLabel', { ride: name })">
      <li
        v-for="(stop, index) in sectionStops"
        :key="`${stop.id}:${index}`"
        class="ride-stop"
        :class="{
          'ride-stop--passed': stop.passed,
          'ride-stop--end': index === 0 || index === sectionStops.length - 1,
          'ride-stop--cancelled': stop.cancelled,
        }"
      >
        <span class="ride-stop-dot" aria-hidden="true" />
        <div class="ride-stop-body">
          <span class="ride-stop-name">{{ stop.name }}</span>
          <span v-if="index === 0" class="ride-stop-tag">{{ t('ride.boardHere') }}</span>
          <span v-else-if="index === sectionStops.length - 1" class="ride-stop-tag">{{ t('ride.getOffHere') }}</span>
          <span class="ride-stop-details text-body-2">
            <span>{{ stopTimes(stop, index) }}</span>
            <span v-if="stopExpected(stop, index)">{{ stopExpected(stop, index) }}</span>
            <span v-if="stop.delay_minutes" :class="delayClass(stop.delay_minutes)">
              {{ delayText(stop.delay_minutes) }}
            </span>
            <span v-if="stop.platform">{{ t('departures.platform', { platform: stop.platform }) }}</span>
            <span v-if="stop.cancelled" class="text-error font-weight-bold">{{ t('ride.stopCancelled') }}</span>
            <span v-if="stop.passed" class="ride-stop-passed">{{ t('ride.passed') }}</span>
          </span>
        </div>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';
import { useI18n } from 'vue-i18n';

import type { Trip, TripStop } from '../api/hopwatch-api';
import { useRideText } from '../composables/use-ride-text';
import { useTimeFormat } from '../composables/use-time-format';

import FavouriteOperatorButton from './favourite-operator-button.vue';
import OperatorName from './operator-name.vue';

/** `entry` and `exit` are indices into `trip.stops`: the stops where the rider boards and gets off. */
const props = defineProps<{ trip: Trip; entry: number; exit: number }>();

const { t } = useI18n();
const ticketHintId = `${useId()}-ticket`;
const formatTime = useTimeFormat();
const { duration, delayText, rideName, minutesBetween } = useRideText();

const sectionStops = computed(() => props.trip.stops.slice(props.entry, props.exit + 1));
const entryStop = computed(() => sectionStops.value[0]);
const exitStop = computed(() => sectionStops.value[sectionStops.value.length - 1]);
const name = computed(() => rideName(props.trip.mode, props.trip.line, props.trip.headsign));

const amenities = computed(() => {
  const list: { key: string; icon: string; text: string }[] = [];
  const { bikes_allowed: bikes, wheelchair_accessible: wheelchair } = props.trip;
  if (bikes !== null) {
    list.push({
      key: 'bikes',
      icon: bikes ? 'mdi-bicycle' : 'mdi-cancel',
      text: t(bikes ? 'ride.bikes' : 'ride.noBikes'),
    });
  }
  if (wheelchair !== null) {
    list.push({
      key: 'wheelchair',
      icon: wheelchair ? 'mdi-wheelchair-accessibility' : 'mdi-cancel',
      text: t(wheelchair ? 'ride.wheelchair' : 'ride.noWheelchair'),
    });
  }
  return list;
});

function departureOf(stop: TripStop): string {
  return (stop.scheduled_departure ?? stop.scheduled_arrival) as string;
}

function arrivalOf(stop: TripStop): string {
  return (stop.scheduled_arrival ?? stop.scheduled_departure) as string;
}

function expectedDiffers(stop: TripStop, which: 'arrival' | 'departure'): boolean {
  const expected = which === 'arrival' ? stop.expected_arrival : stop.expected_departure;
  const scheduled = which === 'arrival' ? arrivalOf(stop) : departureOf(stop);
  return expected !== null && formatTime(expected) !== formatTime(scheduled);
}

/** The stop's timetable: the departure at the entry, the arrival at the exit, both where they differ. */
function stopTimes(stop: TripStop, index: number): string {
  if (index === 0) return formatTime(departureOf(stop));
  if (index === sectionStops.value.length - 1) return formatTime(arrivalOf(stop));
  const arrival = stop.scheduled_arrival && formatTime(stop.scheduled_arrival);
  const departure = stop.scheduled_departure && formatTime(stop.scheduled_departure);
  if (arrival && departure && arrival !== departure) return t('ride.arrivesDeparts', { arrival, departure });
  return (arrival || departure) ?? '';
}

function stopExpected(stop: TripStop, index: number): string {
  const which = index === sectionStops.value.length - 1 ? 'arrival' : 'departure';
  if (!expectedDiffers(stop, which)) return '';
  const expected = (which === 'arrival' ? stop.expected_arrival : stop.expected_departure) as string;
  return t('departures.expected', { time: formatTime(expected) });
}

function delayClass(minutes: number): string {
  return minutes > 0 ? 'text-error font-weight-bold' : '';
}
</script>

<style scoped>
.ride-operator {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 4px;
  margin-bottom: 8px;
}

.ride-facts {
  display: grid;
  gap: 8px;
  margin: 0 0 12px;
}

.ride-fact dt {
  font-weight: 500;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.ride-fact dd {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 12px;
  margin: 0;
}

.ride-amenities {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
}

.ride-amenity {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ride-timeline {
  list-style: none;
  padding: 0;
  margin: 0;
}

.ride-stop {
  position: relative;
  display: flex;
  gap: 12px;
  padding: 6px 0;
}

/* The line of the timeline between the dots. */
.ride-stop::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: rgba(var(--v-theme-on-surface), 0.3);
}

.ride-stop:first-child::before {
  top: 50%;
}

.ride-stop:last-child::before {
  bottom: 50%;
}

.ride-stop-dot {
  position: relative;
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  margin-top: 4px;
  border: 2px solid rgb(var(--v-theme-on-surface));
  border-radius: 50%;
  background: rgb(var(--v-theme-surface));
}

.ride-stop--end .ride-stop-dot {
  background: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
}

.ride-stop-body {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 12px;
}

.ride-stop--end .ride-stop-name {
  font-weight: 700;
}

.ride-stop-tag {
  padding: 0 8px;
  border: 1px solid rgb(var(--v-theme-primary));
  border-radius: 12px;
  font-size: 0.8125rem;
}

.ride-stop-details {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 12px;
  width: 100%;
}

.ride-stop--passed {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.ride-stop--passed .ride-stop-dot {
  border-style: dotted;
}

.ride-stop--cancelled .ride-stop-name {
  text-decoration: line-through;
}
</style>
