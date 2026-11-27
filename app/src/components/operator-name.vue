<template>
  <span class="operator-name">
    <span>{{ operator.name }}</span>
    <span v-if="favourite" class="favourite-tag">
      <v-icon icon="mdi-star" size="x-small" aria-hidden="true" />
      {{ t('operators.favourite') }}
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import type { Operator } from '../api/hopwatch-api';
import { usePreferencesStore } from '../stores/preferences';

const props = defineProps<{ operator: Operator }>();

const { t } = useI18n();
const preferences = usePreferencesStore();
const favourite = computed(() => preferences.isFavouriteOperator(props.operator.id));
</script>

<style scoped>
.operator-name {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}

.favourite-tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  border: 1px solid rgb(var(--v-theme-primary));
  border-radius: 12px;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-on-surface));
  font-weight: 500;
}
</style>
