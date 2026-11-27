<template>
  <div aria-live="polite" aria-atomic="true" class="stale-notice">
    <v-alert v-if="stale" type="warning" variant="tonal" density="compact" class="mb-2">
      {{ t('refresh.staleSince', { time: formatTime(new Date(updatedAt as number)) }) }}
    </v-alert>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { useTimeFormat } from '../composables/use-time-format';

/** `updatedAt` and `now` are milliseconds since the epoch. */
const props = defineProps<{ updatedAt: number | null; now: number }>();

const STALE_MS = 2 * 60 * 1000;

const { t } = useI18n();
const formatTime = useTimeFormat();

const stale = computed(() => props.updatedAt !== null && props.now - props.updatedAt > STALE_MS);
</script>
