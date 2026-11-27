<template>
  <v-container class="auth-page d-flex flex-column align-center justify-center">
    <v-card max-width="440" width="100%" elevation="12">
      <v-card-title class="auth-card-title bg-primary d-flex align-center ga-4 py-3">
        <img :src="logo" alt="" width="40" height="40" />
        <h1 class="text-h5">{{ t('app.title') }}</h1>
      </v-card-title>
      <v-card-text class="pt-4">
        <h2 class="text-h6 mb-2">{{ heading }}</h2>
        <slot />
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import logo from '../assets/logo.svg';

defineProps<{ heading: string }>();

const { t } = useI18n();
</script>

<style scoped>
.auth-page {
  min-height: calc(100vh - 64px);
  min-height: calc(100dvh - 64px);
}

.auth-card-title h1 {
  font-weight: 500;
}
</style>
