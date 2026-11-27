<template>
  <form class="journey-form" :aria-label="t('journey.formLabel')" @submit.prevent>
    <div class="journey-form-stops">
      <stop-search v-model="from" :label="t('journey.from')" />
      <v-btn
        class="journey-form-swap"
        variant="outlined"
        prepend-icon="mdi-swap-vertical"
        :disabled="!from && !to"
        @click="swap"
      >
        {{ t('journey.swap') }}
      </v-btn>
      <stop-search v-model="to" :label="t('journey.to')" clearable />
    </div>
    <v-radio-group v-model="timeMode" :label="t('journey.when')" inline hide-details class="mt-2">
      <v-radio v-for="mode in TIME_MODES" :key="mode" :value="mode" :label="t(TIME_MODE_LABELS[mode])" />
    </v-radio-group>
    <v-text-field
      v-if="timeMode !== 'now'"
      v-model="time"
      type="datetime-local"
      :label="t('journey.time')"
      hide-details
      class="journey-form-time mt-2"
    />
  </form>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';

import type { Stop } from '../api/hopwatch-api';
import { toLocalInput } from '../composables/local-time';

import StopSearch from './stop-search.vue';

export type TimeMode = 'now' | 'depart' | 'arrive';

const TIME_MODES: readonly TimeMode[] = ['now', 'depart', 'arrive'];
const TIME_MODE_LABELS: Record<TimeMode, string> = {
  now: 'journey.leaveNow',
  depart: 'journey.departAt',
  arrive: 'journey.arriveBy',
};

const from = defineModel<Stop | null>('from', { required: true });
const to = defineModel<Stop | null>('to', { required: true });
const timeMode = defineModel<TimeMode>('timeMode', { required: true });
/** A `datetime-local` value. */
const time = defineModel<string>('time', { required: true });

const { t } = useI18n();

function swap(): void {
  [from.value, to.value] = [to.value, from.value];
}

// A chosen departure or arrival time starts at the current time.
watch(timeMode, (mode) => {
  if (mode !== 'now' && !time.value) time.value = toLocalInput(new Date());
});
</script>

<style scoped>
.journey-form-stops {
  display: grid;
  gap: 8px;
}

.journey-form-swap {
  justify-self: start;
}

.journey-form-time {
  max-width: 320px;
}
</style>
