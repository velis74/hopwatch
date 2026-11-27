<template>
  <auth-card :heading="t('pages.login.title')">
    <login-form :initial-error="socialError" @logged-in="done" />
    <social-login-buttons />
    <p class="mt-6 text-body-2">
      {{ t('auth.noAccount') }}
      <router-link :to="{ name: 'signup' }">{{ t('auth.createAccountLink') }}</router-link>
    </p>
  </auth-card>
</template>

<script setup lang="ts">
import { computed, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import AuthCard from '../components/auth-card.vue';
import LoginForm from '../components/login-form.vue';
import SocialLoginButtons from '../components/social-login-buttons.vue';
import { useSessionStore } from '../stores/session';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const session = useSessionStore();

/** allauth sends a failed social login back to this page with an `error` query parameter. */
const socialError = computed(() => (route.query.error ? t('auth.errors.socialFailed') : undefined));

/** A successful social login returns here with the session already logged in. */
watchEffect(() => {
  if (session.checked && session.loggedIn) router.replace({ name: 'home' });
});

async function done() {
  await router.push({ name: 'home' });
}
</script>
