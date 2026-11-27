<template>
  <v-radio-group v-model="model" :label="t('experience.label')" hide-details>
    <div v-for="experience in EXPERIENCES" :key="experience" class="mb-2">
      <v-radio
        :value="experience"
        :label="t(`experience.${experience}`)"
        :aria-describedby="descriptionId(experience)"
      />
      <p :id="descriptionId(experience)" class="text-body-2 text-medium-emphasis ml-10">
        {{ t(`experience.${experience}Description`) }}
      </p>
    </div>
  </v-radio-group>
</template>

<script setup lang="ts">
import { useId } from 'vue';
import { useI18n } from 'vue-i18n';

import { EXPERIENCES, type Experience } from '../stores/preferences';

const model = defineModel<Experience | null>({ required: true });
const { t } = useI18n();
const idPrefix = useId();

function descriptionId(experience: Experience): string {
  return `${idPrefix}-${experience}-description`;
}
</script>
