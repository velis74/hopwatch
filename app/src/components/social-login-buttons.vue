<template>
  <div v-if="session.providers.length" class="mt-4">
    <div class="d-flex align-center ga-3 my-4">
      <v-divider aria-hidden="true" />
      <span class="text-body-2 text-medium-emphasis">{{ t('auth.or') }}</span>
      <v-divider aria-hidden="true" />
    </div>
    <div class="d-flex flex-column ga-3">
      <v-btn
        v-for="provider in session.providers"
        :key="provider"
        block
        :class="`social-button social-button--${provider}`"
        :prepend-icon="`mdi-${provider}`"
        :loading="pending === provider"
        variant="flat"
        @click="start(provider)"
      >
        {{ t('auth.continueWith', { provider: t(`auth.providers.${provider}`) }) }}
      </v-btn>
    </div>
    <v-alert v-if="failed" type="error" variant="tonal" class="mt-2" role="alert">
      {{ t('auth.errors.socialFailed') }}
    </v-alert>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { type SocialProvider, useSessionStore } from '../stores/session';

const { t } = useI18n();
const session = useSessionStore();
const pending = ref<SocialProvider | null>(null);
const failed = ref(false);

/** A page restored from the back/forward cache keeps the pending state of the redirect. */
function reset() {
  pending.value = null;
}

onMounted(() => window.addEventListener('pageshow', reset));
onBeforeUnmount(() => window.removeEventListener('pageshow', reset));

async function start(provider: SocialProvider) {
  failed.value = false;
  pending.value = provider;
  try {
    await session.loginWith(provider);
  } catch {
    pending.value = null;
    failed.value = true;
  }
}
</script>

<style scoped>
.social-button {
  text-transform: none;
  letter-spacing: normal;
}

/* Google's neutral button: white with a grey outline. */
.social-button--google {
  background: #ffffff !important;
  color: #1f1f1f !important;
  border: 1px solid #747775;
}

/* Apple's guidelines: a black button with white text and logo. */
.social-button--apple {
  background: #000000 !important;
  color: #ffffff !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.6);
}
</style>
