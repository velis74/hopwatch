<template>
  <v-container class="settings-page">
    <h1 class="text-h4 mb-6">{{ t('pages.settings.title') }}</h1>
    <experience-choice v-model="experience" />
    <v-select
      v-model="locale"
      class="mt-6"
      :label="t('settings.language')"
      :items="languageItems"
      item-title="title"
      item-value="value"
    >
      <template #item="{ item, props: itemProps }">
        <v-list-item v-bind="itemProps">
          <template #title>
            <span :lang="LOCALE_TAGS[item.raw.value]">{{ item.title }}</span>
          </template>
        </v-list-item>
      </template>
      <template #selection="{ item }">
        <span :lang="LOCALE_TAGS[item.raw.value]">{{ item.title }}</span>
      </template>
    </v-select>
    <p class="text-body-2 text-medium-emphasis">{{ t('settings.saved') }}</p>
  </v-container>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import ExperienceChoice from '../components/experience-choice.vue';
import { LOCALE_TAGS, setLocale, SUPPORTED_LOCALES, type SupportedLocale } from '../i18n';
import { type Experience, usePreferencesStore } from '../stores/preferences';

const { t, locale: currentLocale } = useI18n();
const preferences = usePreferencesStore();

const experience = computed<Experience | null>({
  get: () => preferences.effectiveExperience,
  set: (value) => {
    if (value) preferences.setExperience(value);
  },
});

const locale = computed<SupportedLocale>({
  get: () => currentLocale.value as SupportedLocale,
  set: (value) => setLocale(value),
});

const languageItems = computed(() =>
  SUPPORTED_LOCALES.map((value) => ({ value, title: t(`settings.languages.${value}`) })),
);
</script>

<style scoped>
.settings-page {
  max-width: 640px;
}
</style>
