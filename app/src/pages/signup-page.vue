<template>
  <auth-card :heading="t('pages.signup.title')">
    <signup-form @signed-up="done" />
    <social-login-buttons />
    <p class="mt-6 text-body-2">
      {{ t('auth.haveAccount') }}
      <router-link :to="{ name: 'login' }">{{ t('auth.loginLink') }}</router-link>
    </p>
  </auth-card>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

import AuthCard from '../components/auth-card.vue';
import SignupForm from '../components/signup-form.vue';
import SocialLoginButtons from '../components/social-login-buttons.vue';

const { t } = useI18n();
const router = useRouter();

async function done() {
  await router.push({ name: 'home' });
}
</script>
