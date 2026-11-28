<template>
  <form class="journey-form" :aria-label="t('journey.formLabel')" @submit.prevent="submit">
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
    <df-date-time
      v-if="timeMode !== 'now'"
      :control="timeField"
      :label="t(TIME_MODE_LABELS[timeMode])"
      :locale="dateLocale"
      :clearable="false"
      class="journey-form-time mt-2"
    />
    <v-btn
      v-if="submitLabel"
      type="submit"
      color="primary"
      prepend-icon="mdi-magnify"
      :disabled="!from"
      class="journey-form-submit mt-4"
    >
      {{ submitLabel }}
    </v-btn>
  </form>
</template>

<script setup lang="ts">
import { Field } from '@dynamicforms/vue-forms';
import { DfDateTime } from '@dynamicforms/vuetify-inputs';
import type { Locale } from 'date-fns';
import { de, enGB, hr, sl, sr, srLatn } from 'date-fns/locale';
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import type { Stop } from '../api/hopwatch-api';
import { toLocalInput, toOffsetIso } from '../composables/local-time';
import type { SupportedLocale } from '../i18n';

import StopSearch from './stop-search.vue';

export type TimeMode = 'now' | 'depart' | 'arrive';

const TIME_MODES: readonly TimeMode[] = ['now', 'depart', 'arrive'];
/** date-fns locale of each interface language, for the display and reading of the time. */
const DATE_FNS_LOCALES: Record<SupportedLocale, Locale> = {
  en: enGB,
  sl,
  de,
  hr,
  'sr-Cyrl': sr,
  'sr-Latn': srLatn,
};
const TIME_MODE_LABELS: Record<TimeMode, string> = {
  now: 'journey.leaveNow',
  depart: 'journey.departAt',
  arrive: 'journey.arriveBy',
};

/** `submitLabel` adds a submit button with that text; without it the form has none. */
const props = defineProps<{ submitLabel?: string }>();
const emit = defineEmits<{ submit: [] }>();

const from = defineModel<Stop | null>('from', { required: true });
const to = defineModel<Stop | null>('to', { required: true });
const timeMode = defineModel<TimeMode>('timeMode', { required: true });
/** A `datetime-local` value. */
const time = defineModel<string>('time', { required: true });

const { t, locale } = useI18n();
const dateLocale = computed(() => DATE_FNS_LOCALES[locale.value as SupportedLocale]);

/** The time as ISO 8601 with the local offset, as `df-date-time` holds it; null while `time` is empty or invalid. */
const timeField = new Field<string | null>({ value: toOffsetIso(time.value) });

function sameTime(iso: string | null, localInput: string): boolean {
  return (iso ? toLocalInput(new Date(iso)) : '') === localInput;
}

watch(time, (value) => {
  if (!sameTime(timeField.value, value)) timeField.value = toOffsetIso(value);
});
watch(
  () => timeField.value,
  (value) => {
    if (!sameTime(value, time.value)) time.value = value ? toLocalInput(new Date(value)) : '';
  },
);

function submit(): void {
  if (props.submitLabel && from.value) emit('submit');
}

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
