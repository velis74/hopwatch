<template>
  <v-container class="about-page">
    <h1 class="text-h4 mb-6">{{ t('pages.about.title') }}</h1>
    <p class="text-body-1 mb-6">{{ t('about.summary') }}</p>

    <section aria-labelledby="about-sources-heading">
      <h2 id="about-sources-heading" class="text-h5 mb-4">{{ t('about.sourcesHeading') }}</h2>

      <h3 class="text-h6 mb-2">{{ t('about.timetablesHeading') }}</h3>
      <i18n-t keypath="about.timetables" tag="p" class="text-body-1 mb-6" scope="global">
        <template #dujpp>
          <a href="https://nap.si">DUJPP, nap.si</a>
        </template>
        <template #sz>SŽ – Potniški promet</template>
        <template #licence>
          <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>
        </template>
      </i18n-t>

      <h3 class="text-h6 mb-2">{{ t('about.mapHeading') }}</h3>
      <i18n-t keypath="about.mapData" tag="p" class="text-body-1 mb-2" scope="global">
        <template #osm>© OpenStreetMap contributors</template>
        <template #odbl>
          <a href="https://www.openstreetmap.org/copyright">{{ t('about.odbl') }}</a>
        </template>
      </i18n-t>
      <i18n-t keypath="about.mapTiles" tag="p" class="text-body-1 mb-6" scope="global">
        <template #openmaptiles>
          <a href="https://www.openmaptiles.org/">OpenMapTiles</a>
        </template>
        <template #openfreemap>
          <a href="https://openfreemap.org">OpenFreeMap</a>
        </template>
      </i18n-t>

      <h3 class="text-h6 mb-2">{{ t('about.appHeading') }}</h3>
      <i18n-t keypath="about.appLicence" tag="p" class="text-body-1" scope="global">
        <template #repository>
          <a href="https://github.com/velis74/hopwatch">{{ t('about.repository') }}</a>
        </template>
      </i18n-t>
    </section>
  </v-container>
</template>

<script setup lang="ts">
import { I18nT, useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>
