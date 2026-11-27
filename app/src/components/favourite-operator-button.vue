<template>
  <v-btn
    :icon="favourite ? 'mdi-star' : 'mdi-star-outline'"
    variant="text"
    size="small"
    :color="favourite ? 'primary' : undefined"
    :aria-label="label"
    :title="label"
    :aria-pressed="favourite ? 'true' : 'false'"
    class="favourite-operator-button"
    @click="preferences.setFavouriteOperator(operator.id, !favourite, operator.name)"
  />
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
// A toggle keeps its name; its state is aria-pressed.
const label = computed(() => t('operators.favouriteToggle', { operator: props.operator.name }));
</script>
